import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// =============================================
// TOOL DEFINITIONS — formato Anthropic (Tool Use)
// =============================================
const tools = [
  {
    name: "consultar_documentos",
    description: "Busca info no acervo de documentos do profissional. CHAME ESTA TOOL SEMPRE QUE O LEAD PERGUNTAR ALGO ESPECÍFICO sobre serviços, métodos, preços, planos, conformidade, casos de uso, identidade da plataforma — qualquer coisa que NÃO está EXPLICITAMENTE na bio. NUNCA diga 'não tenho material' sem chamar esta tool primeiro. REGRA CRÍTICA: use queries CURTAS de 1-3 palavras-chave (não frases completas) — o motor de busca é sensível à formulação. Ex: 'LGPD', 'preço plano', 'avatar IA', 'agendamento', 'CFP'. NÃO use queries longas como 'como funciona a conformidade com a LGPD?'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "1-3 palavras-chave. Bons exemplos: 'LGPD', 'preço', 'avatar', 'CFP', 'plano mensal', 'casos uso'. Ruins: 'como funciona', 'me conta sobre'." }
      },
      required: ["query"]
    }
  },
  {
    name: "iniciar_agendamento",
    description: "Aciona o SISTEMA DE AGENDA (determinístico) para marcar, remarcar ou cancelar consulta. Chame assim que o lead demonstrar que QUER agendar/marcar/ver horários (ex: 'quero marcar', 'como faço pra agendar?', 'tem horário essa semana?', 'pode ser amanhã?'), OU se ele clicou em 'Agendar um horário'/'Conferir agenda'. IMPORTANTE: você NÃO oferece dias nem horários você mesmo, NÃO pergunta data por texto — esta tool entrega o controle pro sistema de agenda, que mostra os dias/horários livres em botões e conduz até a confirmação. Depois de chamá-la, NÃO escreva mais nada neste turno (o sistema de agenda já respondeu ao lead).",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "salvar_info_lead",
    description: "Salva uma informação descoberta sobre o lead durante a conversa. Use SEMPRE que o lead revelar algo relevante: motivo da busca, modalidade preferida (online/presencial), se é particular ou convênio, primeira vez ou retorno, urgência, idade do paciente, restrições. Pode chamar várias vezes na mesma resposta. NÃO mostre essa ação ao lead — é registro interno.",
    input_schema: {
      type: "object",
      properties: {
        chave: {
          type: "string",
          description: "Nome da variável em snake_case. Chaves comuns: motivo_principal, modalidade, tipo_atendimento, primeira_vez, urgencia, idade_paciente, observacoes. Pode criar novas chaves quando o contexto pedir."
        },
        valor: {
          type: "string",
          description: "Valor descoberto. Use texto curto e padronizado quando possível (ex: 'online', 'particular', 'ansiedade', 'alta'). Para observações livres pode ser mais longo."
        }
      },
      required: ["chave", "valor"]
    }
  }
]

// =============================================
// CONTEXTO POR CATEGORIA (vocabulário coerente)
// =============================================
function categoryContext(category: string | null, custom: string | null): { area: string; publico: string; oferta: string } {
  const c = (category || 'psicologo').toLowerCase()
  if (c === 'terapeuta')  return { area: 'terapia',                 publico: 'paciente', oferta: 'trabalho terapêutico' }
  if (c === 'psicologo')  return { area: 'psicologia clínica',      publico: 'paciente', oferta: 'psicoterapia' }
  if (c === 'psiquiatra') return { area: 'psiquiatria',             publico: 'paciente', oferta: 'tratamento psiquiátrico' }
  if (c === 'psicologia') return { area: 'psicologia clínica',      publico: 'paciente', oferta: 'psicoterapia' }
  if (c === 'medicina')   return { area: 'medicina',                publico: 'paciente', oferta: 'atendimento médico' }
  // outro + texto livre
  const area = (custom || '').trim() || 'área de atuação'
  return { area, publico: 'cliente', oferta: 'trabalho' }
}

// =============================================
// SYSTEM PROMPT — 3 CAMADAS (por volatilidade)
//   Camada 1 (CORE_RULES): estática — igual p/ todo profissional e todo lead.
//   Camada 2 (buildProfileLayer): por profissional — estável dentro da conversa.
//   Camada 3 (buildTurnLayer): por turno — lead, data e estado da agenda.
// O compositor buildSystemPrompt() junta as 3 (e respeita o override total).
// =============================================

// ── Camada 1: regras universais do agente. NÃO cita nomes próprios de propósito
// (lead/profissional entram na Camada 3), pra ser um bloco fixo e auditável num só lugar.
const CORE_RULES = `Você é o ASSISTENTE VIRTUAL de atendimento de um profissional/negócio. Você NÃO é o profissional — você é o primeiro contato que ajuda o lead a tirar dúvidas e marcar atendimento. A profissão, a área e o vocabulário que você usa são EXATAMENTE os da seção "SOBRE O PROFISSIONAL" abaixo (definidos pelo próprio profissional no perfil). NUNCA presuma um setor diferente do que está lá — ex.: não fale como se fosse da saúde se o perfil não indicar isso.

━━━ SEU PAPEL (NÃO PULE ETAPAS) ━━━
1. Acolha o lead com calor humano em 1-2 frases.
2. Pergunte o motivo da busca ANTES de qualquer outra ação. Espere a resposta.
3. Reconheça o motivo + apresente brevemente como o profissional ajuda nesse caso.
4. Quando o lead quiser marcar/agendar/ver horários, chame \`iniciar_agendamento\` e PARE — o sistema de agenda assume daqui.

━━━ AGENDAMENTO É DO SISTEMA, NÃO SEU ━━━
Você NUNCA oferece dias ou horários, NUNCA pergunta data/hora por texto, NUNCA confirma agendamento você mesmo — isso é tudo do SISTEMA DE AGENDA.
Assim que o lead sinalizar intenção de marcar ("quero agendar", "tem horário?", "pode ser amanhã?", "como marco?") OU pedir pra remarcar/cancelar, chame \`iniciar_agendamento\`. Depois de chamar, NÃO escreva texto neste turno — o sistema já respondeu.
Se o lead já estiver escolhendo dia/horário, você nem é chamado: o sistema cuida sozinho e você só volta a falar quando ele trouxer uma dúvida nova.

━━━ COLETA DE INFORMAÇÕES (tool salvar_info_lead) ━━━
Sempre que o lead revelar algo relevante, chame \`salvar_info_lead\` SEM mencionar isso a ele (é registro interno pro profissional ver antes da consulta). Exemplos:
• "Tô com muita ansiedade" → salvar_info_lead("motivo_principal", "ansiedade")
• "Preciso ser online" → salvar_info_lead("modalidade", "online")
• "Não tenho convênio" → salvar_info_lead("tipo_atendimento", "particular")
• "Nunca fiz terapia" → salvar_info_lead("primeira_vez", "sim")
• "Tô em crise, preciso urgente" → salvar_info_lead("urgencia", "alta")
• "Pra meu filho de 14 anos" → salvar_info_lead("idade_paciente", "14") + salvar_info_lead("para_quem", "filho adolescente")
Você pode chamar várias vezes na mesma resposta. Crie novas chaves quando o contexto pedir, em snake_case.

━━━ REGRAS ABSOLUTAS ━━━
• BREVIDADE: 1-3 frases por mensagem. WhatsApp não é e-mail.
• HUMANIDADE: sem jargão técnico, sem corporativês. Empatia primeiro.
• TOM FIRME: NUNCA use "Hmm, parece que...", "Olhando aqui...", "Acho que...". Você consulta o sistema, não chuta. Fale direto: "O horário das 14h está livre" / "Esse horário não está disponível".
• NÃO INVENTE: datas/horários só do calendário e da tool. Valores só os listados na seção SOBRE O PROFISSIONAL.
• NÃO DECIDA PELO PROFISSIONAL: você não é ele. Não dê parecer técnico nem se comprometa por ele em questões que dependem da avaliação dele — encaminhe. (Regras específicas do setor, quando houver, vêm na seção SOBRE O PROFISSIONAL.)
• PREÇO POR ÚLTIMO: foque no benefício antes de falar valor. Só cite valor se o lead perguntar OU no momento de fechar.
• NÃO ASSUMA: se o motivo não está claro, pergunte. Não invente dor que o lead não disse.

━━━ CONSULTAR DOCUMENTOS DO PROFISSIONAL (tool consultar_documentos) ━━━
Use \`consultar_documentos\` quando o lead perguntar algo ESPECÍFICO sobre métodos, abordagens, materiais ou serviços do profissional que NÃO está na bio principal.
Bons gatilhos: "vocês fazem X?", "como funciona Y?", "tem material sobre Z?", "atende [especialidade]?".
NÃO use pra perguntas gerais ("vocês são bons?") nem pra agendamento.
Os trechos retornados são MATERIAL DE APOIO — reformule com naturalidade, não cole texto cru.

━━━ DETECTAR ENCERRAMENTO DA CONVERSA ━━━
Se a mensagem do lead é claramente um AGRADECIMENTO ou ENCERRAMENTO (e não pergunta nova), responda com 1 frase curta e gentil, SEM repetir info.
Gatilhos: "obrigado", "valeu", "perfeito", "tá bom", "entendi", "ok", "show", "beleza", "até logo", "tchau", "abraço", emoji 🙏 sozinho.
Respostas adequadas (varie):
✅ "Tranquilo! Qualquer coisa é só chamar. 🙌"
✅ "Por nada! 😊"
✅ "Combinado! Bom dia/tarde/noite."
❌ NÃO faça nova pergunta nem proposta — encerre com cordialidade.

━━━ NÃO REPETIR INFO JÁ DADA ━━━
Olhe os últimos 3 turnos seus no histórico. Se a info que você está prestes a enviar JÁ foi dita literalmente, NÃO repita. Reformule ou apenas reconheça brevemente o que o lead disse.
NÃO abra a resposta com fórmula de validação genérica — "Entendido!", "Ótima observação!", "Com certeza!", "Perfeito!", "Faz todo sentido!", "Ótima sugestão!", "Anotado!" e parecidas estão TODAS proibidas como abertura. Trocar uma pela outra NÃO resolve: o problema é validar em vez de responder. Reconhecer o que o lead disse é ok só quando é ESPECÍFICO ("Sobre o atraso pras 15:20…"), nunca com elogio vazio.
NÃO repita o mesmo bordão em turnos seguidos — nem de fechamento ("Posso te ajudar com mais alguma coisa?") nem de encaminhamento ("leve isso ao time / ao profissional"). Se disse algo parecido no turno anterior, diga de outro jeito ou simplesmente omita.
Você NÃO tem como "registrar feedback" nem acionar o time — não prometa isso. Se for elogio/sugestão sobre o serviço, reconheça em no máximo meia frase e siga; não invente ação que você não executa.

━━━ ORDEM DE BUSCA DE INFORMAÇÃO ━━━
1. **PRIMEIRO** — olhe o que JÁ está neste prompt (seção "SOBRE O PROFISSIONAL": área, abordagens, bio, preços). Se a resposta está aqui, responda **DIRETO**, com naturalidade, SEM hedge.
2. **SÓ SE** a pergunta for sobre tópico NÃO coberto neste prompt (LGPD/conformidade, casos específicos do trabalho do profissional, métodos detalhados, identidade da plataforma, planos com features), chame \`consultar_documentos\` com 1-3 keywords.
3. **SÓ DEPOIS** de \`consultar_documentos\` retornar vazio em 2 queries diferentes, use o fallback educado: "Sobre isso especificamente, prefiro confirmar com o profissional pra te passar a info correta."

━━━ PROIBIDO: HEDGE DEFENSIVO ━━━
NUNCA prefixe sua resposta com fórmulas que sinalizam dúvida quando você TEM a info:
❌ "Os documentos não trazem detalhes, mas posso adiantar que..."
❌ "Vou confirmar com o profissional, mas pelo que sei..."
❌ "Não tenho material detalhado, porém o que sei é..."
❌ "Os documentos não especificam, mas..."
Se você está prestes a dar a resposta, DÊ A RESPOSTA. Direto. Sem desculpa nem ressalva preventiva.

✅ Pergunta: "Quanto custa?" → "A primeira sessão sai R$ 100. Os planos mensais ficam entre R$ 250 e R$ 300, depende do que você precisa. Quer ver isso de perto com ela?"
✅ Pergunta: "Funciona online?" → (use bio/approaches) "Sim, atende online via vídeo." (sem hedge)

Use o fallback "vou confirmar com o profissional" SOMENTE quando a info GENUINAMENTE não está aqui nem nos documentos. Não como prefixo defensivo antes de dar uma resposta que você JÁ tem.

━━━ EVITE INICIAR COM ━━━
"Olá, sou...", "Você sabia que...", "Imagine...", "Que bom que entrou em contato..." (genérico demais).
Comece reconhecendo o que o lead trouxe, com naturalidade humana.`

// ── Camada 2: quem é o profissional (estável dentro da conversa) ──
function buildProfileLayer(professional: any, ctx: { area: string; publico: string; oferta: string }): string {
  const priceFirst = professional.price_first_session ? `R$ ${professional.price_first_session}` : 'sob consulta'
  const priceMin   = professional.price_min ? `R$ ${professional.price_min}` : null
  const priceMax   = professional.price_max ? `R$ ${professional.price_max}` : null
  const priceRange = (priceMin && priceMax) ? `${priceMin} a ${priceMax}` : (priceMin || priceMax || 'não informado')
  const approaches = Array.isArray(professional.approaches) && professional.approaches.length > 0
    ? professional.approaches.join(', ')
    : null
  const bio        = professional.bio ? professional.bio.slice(0, 400) : null

  // Diretriz de setor: regra clínica só faz sentido pra saúde (publico = paciente).
  // Para "outro"/serviços, fica neutro — o campo do perfil é a fonte de verdade.
  const isSaude = ctx.publico === 'paciente'
  const labelValor = isSaude
    ? `Valor da primeira ${ctx.oferta === 'psicoterapia' ? 'sessão' : 'consulta'}`
    : 'Valor inicial'
  const limiteSetor = isSaude
    ? `\n\n━━━ LIMITES DO SEU PAPEL ━━━\nVocê NÃO é o profissional: não diagnostique, não dê parecer clínico nem sugira tratamento — encaminhe isso pra ele.`
    : ``

  // Preferências de estilo definidas pelo profissional (Configurações → Agente de Atendimento)
  const prefs: any = professional.agent_preferences || {}
  const tone = (prefs.tone || '').toString().trim()
  const phrasesRaw = (prefs.preferred_phrases || '').toString().trim()
  const phrasesList = phrasesRaw
    ? phrasesRaw.split('\n').map((p: string) => p.trim()).filter(Boolean).map((p: string) => `  – ${p}`).join('\n')
    : ''
  const estilo = (tone || phrasesList)
    ? `\n\n━━━ ESTILO DESTE PROFISSIONAL ━━━${tone ? `\n• Tom de voz: ${tone}.` : ''}${phrasesList ? `\n• Frases que ${professional.full_name ? professional.full_name.split(' ')[0] : 'o profissional'} gosta de usar (encaixe com naturalidade quando fizer sentido — NÃO repita todas nem force):\n${phrasesList}` : ''}`
    : ''

  return `━━━ SOBRE O PROFISSIONAL ━━━
• Área: ${ctx.area}
${approaches ? `• Abordagens: ${approaches}` : ''}
${bio ? `• Bio: ${bio}` : ''}
• ${labelValor}: ${priceFirst}
${priceMin || priceMax ? `• Faixa de valor: ${priceRange}` : ''}${limiteSetor}${estilo}`
}

// ── Camada 3: contexto do turno atual (lead, data, estado da agenda) ──
function buildTurnLayer(opts: {
  professional: any
  leadName: string
  now: string
  bookingState: any
  ctx: { area: string; publico: string; oferta: string }
}): string {
  const { professional, leadName, now, bookingState, ctx } = opts
  const proName = professional.full_name || 'o profissional'

  // Consciência do estado de agendamento — pro agente NÃO contradizer o sistema de agenda
  const bs: any = bookingState || {}
  let agendaStatus = ''
  if (bs.stage === 'done' && bs.appointment_id) {
    const quando = `${bs.selected_day_label || bs.selected_date} às ${bs.selected_time}`
    agendaStatus = `

━━━ ⚠️ ${leadName.toUpperCase()} JÁ TEM AGENDAMENTO CONFIRMADO ━━━
FATO do sistema: ${leadName} JÁ está agendado para **${quando}** — está FINALIZADO.
• Se ele perguntar "foi agendado?", "tá certo?", "confirmou?", "será que marcou?" → confirme que SIM, ${quando}, com naturalidade. NUNCA diga "está sendo confirmado" nem "quer finalizar" — já está pronto.
• NÃO chame \`iniciar_agendamento\` aqui. Só chame se ${leadName} pedir EXPLICITAMENTE para REMARCAR, CANCELAR ou marcar OUTRO horário.`
  } else if (bs.stage === 'cancelled') {
    agendaStatus = `

━━━ AGENDA: ${leadName} cancelou o último horário ━━━
Se ${leadName} quiser marcar de novo, aí sim chame \`iniciar_agendamento\`.`
  }

  return `━━━ PARTES DA CONVERSA ━━━
• PROFISSIONAL (a quem você serve): **${proName}** — é a marca/nome OFICIAL. Refira-se sempre como "${proName}" ou "${proName.split(' ')[0]}". TERCEIRA pessoa.
• ${ctx.publico.toUpperCase()} (com quem você está falando AGORA): **${leadName}** — SEGUNDA pessoa ("você").
NUNCA assuma a voz do profissional. Você é o assistente externo que organiza o contato.

ATENÇÃO ESPECIAL: A bio do profissional pode mencionar nomes de pessoas (donos, fundadores, etc) que NÃO substituem "${proName}". Mesmo se o nome do owner mencionado na bio for IGUAL ao nome do ${ctx.publico} (${leadName}), são pessoas/entidades DIFERENTES. Sempre use **"${proName}"** para se referir ao profissional, NUNCA o nome mencionado dentro da bio.

━━━ HOJE: ${now} ━━━${agendaStatus}`
}

// =============================================
// COMPOSITOR
// =============================================
function buildSystemPrompt(professional: any, leadName: string, leadPhone: string, bookingState: any = {}): string {
  const nowObj = new Date()
  const now = nowObj.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  // Override total: profissional definiu prompt customizado no perfil
  if (professional.agent_system_prompt) {
    return professional.agent_system_prompt
      .replace('{{LEAD_NAME}}', leadName)
      .replace('{{LEAD_PHONE}}', leadPhone)
      .replace('{{NOW}}', now)
      .replace('{{PROFESSIONAL_NAME}}', professional.full_name || 'o profissional')
      .replace('{{BIO}}', professional.bio || '')
      .replace('{{PRICE_FIRST}}', professional.price_first_session || 'a combinar')
      .replace('{{PRICE_MIN}}', professional.price_min || 'não informado')
      .replace('{{PRICE_MAX}}', professional.price_max || 'não informado')
  }

  const ctx = categoryContext(professional.category, professional.category_custom)

  return [
    CORE_RULES,
    buildProfileLayer(professional, ctx),
    buildTurnLayer({ professional, leadName, now, bookingState, ctx }),
  ].join('\n\n')
}

// =============================================
// TOOL HANDLERS
// =============================================
async function handleToolCall(
  toolName: string,
  args: any,
  supabaseAdmin: any,
  professionalId: string,
  leadId: string,
  instanceName: string,
  remoteJid: string,
): Promise<any> {
  // HANDOFF: entrega o agendamento pro motor determinístico (whatsapp-scheduler).
  // O scheduler relê booking_state do banco, oferece dias/horários e responde direto
  // ao lead via Evolution. O agente não escreve nada neste turno.
  if (toolName === 'iniciar_agendamento') {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || ''
    const schedulerUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-scheduler`
    try {
      await fetch(schedulerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({
          lead_id: leadId,
          professional_id: professionalId,
          instance_name: instanceName,
          remote_jid: remoteJid,
          lead_name: '',
          message: '',
          click_id: null,
          parsed_intent: null,
          action: 'start',
        }),
      })
    } catch (e: any) {
      console.error('[iniciar_agendamento] erro ao chamar scheduler:', e.message)
      return { erro: 'scheduler_indisponivel', instrucao: 'Não consegui abrir a agenda agora. Peça desculpa em 1 frase e diga que já já retorna com os horários.' }
    }
    return { handoff: true, instrucao: 'O sistema de agenda assumiu e JÁ enviou as opções ao lead. NÃO escreva mais nada neste turno.' }
  }

  if (toolName === 'consultar_documentos') {
    const query = (args.query || '').toString().trim()
    if (!query) return { erro: 'query obrigatório' }

    const workerUrl = Deno.env.get('WORKER_RAG_URL') || Deno.env.get('WORKER_URL')
    if (!workerUrl) {
      console.log('[consultar_documentos] WORKER_RAG_URL não configurado')
      return {
        chunks: [],
        instrucao: 'O profissional ainda não cadastrou documentos consultáveis. Responda com base no que você já sabe da bio dele OU diga que vai verificar com ele e retornar.',
      }
    }

    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, '')}/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professional_id: professionalId,
          query,
          match_count: 6,  // 6 em vez de 4 — mais chance de incluir chunk relevante
        }),
      })
      if (!res.ok) {
        console.error('[consultar_documentos] status', res.status)
        return { chunks: [], instrucao: 'Não consegui consultar o acervo agora. Responda com base na bio do profissional.' }
      }
      const data = await res.json()
      const rawChunks = (data.chunks || []) as Array<string | { content?: string; similarity?: number }>
      // Worker pode retornar string[] OU array de objetos. Normaliza.
      const chunks = rawChunks.map((c: any) =>
        typeof c === 'string' ? { content: c } : { content: c.content || '', similarity: c.similarity }
      )
      if (chunks.length === 0) {
        return {
          chunks: [],
          instrucao: 'Acervo retornou vazio. Responda com base na bio do profissional. NÃO afirme que NÃO há material — diga que vai confirmar com o profissional pra detalhes precisos.',
        }
      }
      return {
        chunks: chunks.map((c: any) => ({ content: (c.content || '').slice(0, 800), similarity: c.similarity })),
        instrucao: 'IMPORTANTE: USE OS TRECHOS pra construir sua resposta. Reformule com naturalidade — não cole texto cru. Mesmo se o tópico EXATO não aparecer, sintetize a partir de tópicos relacionados que apareceram. NUNCA diga "não tenho material" se há chunks aqui. Se a pergunta era específica e os chunks não cobrem, diga que vai confirmar com o profissional os detalhes finos.',
      }
    } catch (e: any) {
      console.error('[consultar_documentos] erro:', e.message)
      return { chunks: [], instrucao: 'Erro técnico ao buscar. Responda com base na bio.' }
    }
  }

  if (toolName === 'salvar_info_lead') {
    const chave = (args.chave || '').trim()
    const valor = (args.valor ?? '').toString().trim()
    if (!chave || !valor) {
      return { erro: 'chave e valor são obrigatórios' }
    }

    // Mescla com collected_info existente — merge no nível JSON
    // Usa raw SQL via rpc seria mais elegante, mas read-modify-write é seguro aqui
    // porque o agente é single-threaded por lead (anti-flood garante).
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('collected_info')
      .eq('id', leadId)
      .maybeSingle()

    const current = (lead?.collected_info && typeof lead.collected_info === 'object') ? lead.collected_info : {}
    const merged  = { ...current, [chave]: valor }

    const { error } = await supabaseAdmin
      .from('leads')
      .update({ collected_info: merged })
      .eq('id', leadId)

    if (error) {
      console.error('[salvar_info_lead] Erro:', error.message)
      return { erro: error.message }
    }

    console.log(`[salvar_info_lead] ${chave}=${valor}`)
    return { sucesso: true, chave, valor }
  }

  return { erro: 'Ferramenta desconhecida' }
}

// =============================================
// CLAUDE SONNET 4.6 CALL (Anthropic Messages API + Tool Use)
// =============================================
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const CLAUDE_URL   = 'https://api.anthropic.com/v1/messages'

async function callClaude(
  systemPrompt: string,
  chatHistory: any[],
  userMessage: string,
  supabaseAdmin: any,
  professionalId: string,
  leadId: string,
  instanceName: string,
  remoteJid: string,
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  // Constrói histórico no formato Anthropic: { role: "user"|"assistant", content: string }
  // Mescla mensagens consecutivas do mesmo papel para evitar erro de "alternating roles"
  const messages: any[] = []
  let lastRole = ''

  for (const msg of chatHistory) {
    if (!msg.content) continue
    const currentRole = msg.role === 'assistant' ? 'assistant' : 'user'
    if (currentRole === lastRole) {
      const last = messages[messages.length - 1]
      last.content = `${last.content}\n${msg.content}`
    } else {
      messages.push({ role: currentRole, content: msg.content })
      lastRole = currentRole
    }
  }

  // Garante que a última mensagem é do user (acrescenta a mensagem atual)
  if (lastRole === 'user') {
    const last = messages[messages.length - 1]
    last.content = `${last.content}\n${userMessage || 'Oi'}`
  } else {
    messages.push({ role: 'user', content: userMessage || 'Oi' })
  }

  console.log(`--- Agente WhatsApp (Sonnet): Interação com Lead ${leadId} ---`)

  try {
    let maxIterations = 5

    while (maxIterations-- > 0) {
      const payload = {
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        temperature: 0.7,
        system: systemPrompt,
        messages,
        tools,
      }

      const response = await fetch(CLAUDE_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`[Claude Error] Status: ${response.status}`, errText)
        throw new Error(`Claude API Error: ${response.status} - ${errText}`)
      }

      const result = await response.json()
      const content = result.content || []
      const stopReason = result.stop_reason

      // Sem tool use → resposta final
      if (stopReason !== 'tool_use') {
        const textBlock = content.find((b: any) => b.type === 'text')
        if (textBlock?.text && textBlock.text.trim()) return textBlock.text
        // Resposta sem texto e sem tool (raro) — loga p/ diagnóstico e usa fallback natural
        console.error('[callClaude] RESPOSTA SEM TEXTO:', JSON.stringify({ stopReason, content }).slice(0, 800))
        return 'Pode repetir sua última mensagem, por favor? Acho que não chegou completa aqui. 🙂'
      }

      // Tem tool_use → executa ferramentas e devolve resultados
      const toolUseBlocks = content.filter((b: any) => b.type === 'tool_use')
      const toolResults = []
      let sentDirect = false  // alguma tool já RESPONDEU o lead direto (handoff de agenda)?
      for (const tu of toolUseBlocks) {
        const out = await handleToolCall(tu.name, tu.input, supabaseAdmin, professionalId, leadId, instanceName, remoteJid)
        if (tu.name === 'iniciar_agendamento' && (out as any)?.handoff) {
          sentDirect = true
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(out),
        })
      }

      // Quando o agente já mandou a mensagem (botões enviados via Evolution),
      // não pedimos texto extra do Sonnet — retorna string vazia pra o caller
      // não enviar mensagem duplicada via sendWhatsAppMessage.
      if (sentDirect) {
        console.log('[callClaude] Mensagem enviada via tool — retornando vazio pra evitar dupla')
        return ''
      }

      // Histórico do turno: append do assistant (com tool_use) + user (com tool_result)
      messages.push({ role: 'assistant', content })
      messages.push({ role: 'user', content: toolResults })
    }

    return 'Desculpe, tive um problema ao processar. Tente novamente.'
  } catch (err: any) {
    console.error('Erro fatal:', err)
    return `Erro técnico: ${err.message}`
  }
}

// =============================================
// SEND PRESENCE (DIGITANDO)
// =============================================
async function sendWhatsAppPresence(instanceName: string, remoteJid: string, presence: 'composing' | 'recording' | 'paused') {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey || !instanceName) return

  console.log(`[Presence] Setting ${presence} for ${instanceName}`)
  await fetch(`${evoUrl}/chat/sendPresence/${instanceName}`, {
    method: 'POST',
    headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: remoteJid, presence })
  }).catch(e => console.error('[Presence Error]', e.message))
}

// =============================================
// SEND MESSAGE
// =============================================
// =============================================
// SANITIZADOR WhatsApp — limpa markdown que polui no app.
// O agente fica LIVRE de formatar (ver dossiê 2026-06-08, caso B). Baseado no
// node "FormatarTexto v4.0" do fluxo modelo, adaptado: aqui ** vira *negrito*
// nativo (não remove), e tratamos — / --- que o node não cobria.
// =============================================
function formatarParaWhatsApp(texto: string): string {
  if (!texto) return texto
  return texto
    // **negrito** / __negrito__ -> *negrito* (negrito nativo do WhatsApp)
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '*$1*')
    // títulos markdown (#, ##, …) -> remove o marcador, mantém o texto
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // linha separadora (---, ***, ___) -> remove
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
    // travessão — -> hífen simples
    .replace(/—/g, '-')
    // lista numerada "1. " -> "1- "
    .replace(/^(\s*\d+)\.\s+/gm, '$1- ')
    // caracteres invisíveis (zero-width)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // colapsa quebras de linha excessivas
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function sendWhatsAppMessage(instanceName: string, remoteJid: string, text: string) {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey || !instanceName) {
    console.error('[WhatsApp] Missing Evo config or instance name')
    return
  }

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  for (const paragraph of paragraphs) {
    console.log(`[WhatsApp] Sending to ${remoteJid} via ${instanceName}...`)

    try {
      const response = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': evoKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: remoteJid,
          text: paragraph.trim(),
          options: {
            delay: 1200,
            presence: 'composing'
          }
        })
      })

      const resText = await response.text()
      console.log(`[WhatsApp Status] ${response.status}`)
      console.log(`[WhatsApp Response] ${resText}`)

      if (!response.ok) {
        console.error('[WhatsApp Error] Failed to send message:', resText)
      }
    } catch (e: any) {
      console.error('[WhatsApp Fetch Error]', e.message)
    }

    if (paragraphs.length > 1) await new Promise(r => setTimeout(r, 1000))
  }
}

// =============================================
// MAIN HANDLER
// =============================================
serve(async (req) => {
  console.log(`[Agent] Request received: ${req.method}`)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { lead_id, lead_name, lead_phone, message, remote_jid, professional_id, instance_name } = body
    console.log(`[Request] Incoming from ${lead_name} (${lead_phone}). Message: ${message}`)
    console.log(`[Data] lead_id: ${lead_id}, prof_id: ${professional_id}, instance: ${instance_name}`)

    if (!professional_id || !lead_id) {
      console.error("[Error] Missing professional_id or lead_id")
      throw new Error("Missing IDs")
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      console.error("[Error] Supabase env vars missing")
      throw new Error("Supabase config missing")
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    console.log(`[DB] Fetching professional ${professional_id}`)
    const { data: professional, error: profError } = await supabaseAdmin.from('professionals').select('*').eq('id', professional_id).single()
    if (profError || !professional) {
      console.error("[Error] Professional not found:", profError)
      return new Response('Pro not found', { status: 200 })
    }

    console.log(`[DB] Fetching history for lead ${lead_id}`)
    const { data: history, error: histError } = await supabaseAdmin.from('chat_messages').select('role, content').eq('lead_id', lead_id).order('created_at', { ascending: true }).limit(20)
    if (histError) console.error("[Error] History fetch error:", histError)

    const chatHistory = (history || []).slice(0, -1)

    // Estado do agendamento — pro prompt não contradizer o sistema de agenda
    const { data: leadRow } = await supabaseAdmin.from('leads').select('booking_state').eq('id', lead_id).maybeSingle()
    const bookingState = (leadRow?.booking_state) || {}

    // Mostrar "digitando..." enquanto a IA pensa
    await sendWhatsAppPresence(instance_name, remote_jid, 'composing')

    console.log(`[AI] Calling Claude Sonnet 4.6...`)
    const systemPrompt = buildSystemPrompt(professional, lead_name, lead_phone, bookingState)
    let agentReply: string
    try {
      agentReply = await callClaude(systemPrompt, chatHistory, message, supabaseAdmin, professional_id, lead_id, instance_name, remote_jid)
      console.log(`[AI] Reply: ${agentReply}`)
    } catch (aiError: any) {
      console.error(`[AI Error]`, aiError.message)
      agentReply = `Erro na IA (${aiError.message}). Por favor, verifique as chaves e o modelo.`
    }

    // Caso B: limpa markdown que polui no WhatsApp ANTES de salvar/enviar — o agente
    // não se preocupa com formatação (system prompt não pede markdown).
    agentReply = formatarParaWhatsApp(agentReply)

    // Quando agentReply é vazio, significa que o agente já mandou a mensagem
    // via tool (enviar_botoes envia direto pra Evolution). Nesse caso pulamos
    // o sendWhatsAppMessage e o insert no chat_messages (já gravado pela tool).
    if (agentReply && agentReply.trim()) {
      console.log(`[DB] Saving reply and updating lead`)
      await supabaseAdmin.from('chat_messages').insert({ lead_id, role: 'assistant', content: agentReply })
      await supabaseAdmin.from('leads').update({ last_message_at: new Date().toISOString() }).eq('id', lead_id)

      console.log(`[WhatsApp] Sending message via Evolution...`)
      await sendWhatsAppMessage(instance_name, remote_jid, agentReply)
    } else {
      console.log(`[AI] Resposta vazia (tool já enviou). Atualizando só last_message_at.`)
      await supabaseAdmin.from('leads').update({ last_message_at: new Date().toISOString() }).eq('id', lead_id)
    }
    console.log(`[Success] Flow completed for ${lead_name}`)

    return new Response(JSON.stringify({ success: true, reply: agentReply || '(via tool)' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error: any) {
    console.error(`[Fatal Error]`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

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
    name: "buscar_horarios_disponiveis",
    description: "Busca horários LIVRES do profissional num intervalo de datas. Retorna `dias_com_horarios_livres` (array de { data, dia_semana, horarios_livres }) já calculados a partir da agenda semanal do profissional menos os agendamentos existentes. Slots de 60 minutos. Use intervalo de 5-7 dias para oferecer variedade. Se `observacao` indicar que é fallback (sem agenda cadastrada), avise o lead que os horários precisam de confirmação.",
    input_schema: {
      type: "object",
      properties: {
        data_inicio: {
          type: "string",
          description: "Data de início no formato YYYY-MM-DD"
        },
        data_fim: {
          type: "string",
          description: "Data final no formato YYYY-MM-DD"
        }
      },
      required: ["data_inicio", "data_fim"]
    }
  },
  {
    name: "criar_agendamento",
    description: "Cria um novo agendamento para o lead com o profissional. Use somente após o lead confirmar explicitamente data e horário.",
    input_schema: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: "Data do agendamento no formato YYYY-MM-DD"
        },
        hora_inicio: {
          type: "string",
          description: "Horário de início no formato HH:MM"
        },
        hora_fim: {
          type: "string",
          description: "Horário de fim no formato HH:MM"
        },
        observacoes: {
          type: "string",
          description: "Observações do paciente sobre o motivo da consulta"
        }
      },
      required: ["data", "hora_inicio", "hora_fim"]
    }
  },
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
    name: "atualizar_agendamento",
    description: "Move um agendamento existente para outra data e/ou horário. Use quando o lead já confirmou um agendamento E pediu pra mudar (ex: 'pode ser 9:30 em vez de 9:00?', 'na verdade prefiro quarta'). NÃO crie um novo agendamento — atualize o existente. O appointment_id vem do booking_state.appointment_id ou do retorno anterior de criar_agendamento.",
    input_schema: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "UUID do agendamento existente." },
        nova_data: { type: "string", description: "Nova data YYYY-MM-DD." },
        nova_hora_inicio: { type: "string", description: "Novo horário HH:MM." },
        nova_hora_fim: { type: "string", description: "Novo horário de término HH:MM (geralmente +60min)." }
      },
      required: ["appointment_id", "nova_data", "nova_hora_inicio", "nova_hora_fim"]
    }
  },
  {
    name: "cancelar_agendamento",
    description: "Cancela um agendamento existente (marca status='cancelled' e libera o slot). Use APENAS após confirmação clara do lead — pergunte antes ('Tem certeza que quer cancelar?').",
    input_schema: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "UUID do agendamento." },
        motivo: { type: "string", description: "Motivo curto opcional ('lead desistiu', 'conflito de agenda', etc)." }
      },
      required: ["appointment_id"]
    }
  },
  {
    name: "consultar_meus_agendamentos",
    description: "Consulta agendamentos existentes deste lead com este profissional. Use quando o lead perguntar 'tem agendamento pra mim?', 'qual meu próximo horário?', 'esqueci quando marquei'.",
    input_schema: {
      type: "object",
      properties: {
        incluir_passados: { type: "boolean", description: "Se true, traz também consultas passadas. Default false (só futuros)." }
      }
    }
  },
  {
    name: "enviar_botoes",
    description: "Envia botões de resposta rápida ao lead via WhatsApp. Use SOMENTE quando há 2-4 opções discretas E a resposta define o próximo passo concreto. Casos típicos: (1) oferecer DIAS disponíveis (ex: 'Segunda', 'Terça', 'Quarta'); (2) oferecer HORÁRIOS de um dia escolhido (ex: '09:00', '14:00', '16:30'); (3) confirmação SIM/REMARCAR/CANCELAR; (4) escolha de modalidade ONLINE/PRESENCIAL. NÃO use em perguntas qualitativas (motivo da busca, expectativa, sentimento). Os botões SUBSTITUEM sua mensagem de texto neste turno — não responda também por texto livre. O lead fica bloqueado aguardando o clique até o timeout (10 min). Se o lead responder com texto livre que não bate com nenhuma opção, ele é silenciado e recebe lembrete automático.",
    input_schema: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description: "Pergunta principal do botão (max 60 chars). Ex: 'Qual dia fica melhor?', 'Confirma agendamento?'."
        },
        descricao: {
          type: "string",
          description: "Texto auxiliar curto opcional. Ex: 'Veja as opções disponíveis:'."
        },
        opcoes: {
          type: "array",
          description: "2-4 opções. Cada label máx 20 chars (limite Evolution).",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Texto visível do botão (max 20 chars)" },
              id:    { type: "string", description: "Identificador interno em snake_case (ex: dia_seg_18_05, hora_14_00, confirmar_sim)" }
            },
            required: ["label", "id"]
          },
          minItems: 2,
          maxItems: 4
        },
        form_id: {
          type: "string",
          description: "Identificador do formulário pra rastreamento. Valores comuns: 'escolha_dia', 'escolha_horario', 'confirmacao_agendamento', 'escolha_modalidade'."
        },
        expira_em_minutos: {
          type: "number",
          description: "Timeout do bloqueio. Padrão 10 minutos."
        }
      },
      required: ["titulo", "opcoes", "form_id"]
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
// SYSTEM PROMPT
// =============================================
function buildSystemPrompt(professional: any, leadName: string, leadPhone: string): string {
  const nowObj = new Date()
  const now = nowObj.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

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

  // Calendário dos próximos 14 dias
  let calendarStr = ''
  for (let i = 0; i < 14; i++) {
    const d = new Date(nowObj)
    d.setDate(d.getDate() + i)
    calendarStr += `- ${d.toLocaleDateString('pt-BR')}: ${dayNames[d.getDay()]}\n`
  }

  const proName    = professional.full_name || 'o profissional'
  const ctx        = categoryContext(professional.category, professional.category_custom)
  const priceFirst = professional.price_first_session ? `R$ ${professional.price_first_session}` : 'sob consulta'
  const priceMin   = professional.price_min ? `R$ ${professional.price_min}` : null
  const priceMax   = professional.price_max ? `R$ ${professional.price_max}` : null
  const priceRange = (priceMin && priceMax) ? `${priceMin} a ${priceMax}` : (priceMin || priceMax || 'não informado')
  const approaches = Array.isArray(professional.approaches) && professional.approaches.length > 0
    ? professional.approaches.join(', ')
    : null
  const bio        = professional.bio ? professional.bio.slice(0, 400) : null

  return `Você é o ASSISTENTE VIRTUAL do(a) profissional ${proName}, que atua em ${ctx.area}. Você NÃO é o(a) profissional — você é o atendimento de primeiro contato que ajuda ${ctx.publico}s a tirar dúvidas e marcar consulta.

━━━ PARTES DA CONVERSA ━━━
• PROFISSIONAL (a quem você serve): **${proName}** — é a marca/nome OFICIAL. Refira-se sempre como "${proName}" ou "${proName.split(' ')[0]}". TERCEIRA pessoa.
• ${ctx.publico.toUpperCase()} (com quem você está falando AGORA): **${leadName}** — SEGUNDA pessoa ("você").
NUNCA assuma a voz do profissional. Você é o assistente externo que organiza o contato.

ATENÇÃO ESPECIAL: A bio do profissional pode mencionar nomes de pessoas (donos, fundadores, etc) que NÃO substituem "${proName}". Mesmo se o nome do owner mencionado na bio for IGUAL ao nome do ${ctx.publico} (${leadName}), são pessoas/entidades DIFERENTES. Sempre use **"${proName}"** para se referir ao profissional, NUNCA o nome mencionado dentro da bio.

━━━ SOBRE ${proName.toUpperCase()} ━━━
• Área: ${ctx.area}
${approaches ? `• Abordagens: ${approaches}` : ''}
${bio ? `• Bio: ${bio}` : ''}
• Valor da primeira ${ctx.oferta === 'psicoterapia' ? 'sessão' : 'consulta'}: ${priceFirst}
${priceMin || priceMax ? `• Faixa de valor: ${priceRange}` : ''}

━━━ HOJE: ${now} ━━━
${calendarStr}
━━━ FLUXO OBRIGATÓRIO (NÃO PULE ETAPAS) ━━━
1. Acolha ${leadName} com calor humano em 1-2 frases.
2. Pergunte o motivo da busca ANTES de qualquer outra ação. Espere a resposta.
3. Reconheça o motivo + apresente brevemente como ${proName.split(' ')[0]} ajuda nesse caso.
4. SÓ ENTÃO chame \`buscar_horarios_disponiveis\` (consultando um INTERVALO de 5-7 dias, não 1 dia só).
5. Ofereça 2-3 opções de horário em datas variadas. Confirme com ${leadName} qual escolhe.
6. Use \`criar_agendamento\` SOMENTE depois da confirmação explícita ("sim", "pode confirmar", "fechado").

EXCEÇÃO: se ${leadName} clicou em "Conferir agenda" no menu inicial, pode pular direto pro passo 4 — mas ainda colete o motivo na sequência usando \`salvar_info_lead\`.

━━━ COLETA DE INFORMAÇÕES (tool salvar_info_lead) ━━━
Sempre que ${leadName} revelar algo relevante, chame \`salvar_info_lead\` SEM mencionar isso a ${leadName} (é registro interno pro profissional ver antes da consulta). Exemplos:
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
• NÃO INVENTE: datas/horários só do calendário e da tool. Valores só os listados acima.
• NÃO DIAGNOSTIQUE: você não é o profissional. Não dê parecer clínico, não sugira tratamento.
• PREÇO POR ÚLTIMO: foque no benefício antes de falar valor. Só cite valor se ${leadName} perguntar OU no momento de fechar agendamento.
• ESCASSEZ NATURAL: ofereça 2-3 horários, nunca lista enorme.
• NÃO ASSUMA: se o motivo não está claro, pergunte. Não invente dor que ${leadName} não disse.

━━━ COERÊNCIA SOBRE DISPONIBILIDADE (CRÍTICO) ━━━
Se você JÁ listou um horário como disponível e na próxima mensagem precisa dizer que está ocupado:
1. ANTES de afirmar que está ocupado, chame \`buscar_horarios_disponiveis\` DE NOVO para o mesmo dia.
2. NÃO assuma que está ocupado só porque \`criar_agendamento\` retornou erro — pode ser bug temporário.
3. Se a re-consulta confirma que está livre, tente \`criar_agendamento\` novamente.
4. Só anuncie "ocupado" se a re-consulta confirmar. Caso contrário, é melhor pedir um momento e tentar de novo do que contradizer o que acabou de dizer.

━━━ MUDANÇA DE DECISÃO DO LEAD ━━━
Se ${leadName} diz "quero mudar para X" ou "na verdade prefiro Y" ANTES de você ter chamado \`criar_agendamento\`:
- ABANDONE a opção anterior sem criar nada.
- Trate a nova preferência como a única opção em pauta.
- NUNCA crie 2 agendamentos no mesmo turno por confusão de versões.

Se já tinha criado um agendamento e ${leadName} pede pra mudar:
- Confirme PRIMEIRO se quer cancelar o anterior antes de criar o novo.
- Diga claramente: "Vou cancelar o de 14h e marcar pra 16:30, fechado?"

━━━ NEGOCIAÇÃO FLEXÍVEL DE HORÁRIO ━━━
Quando ${leadName} pede um horário que não está na grade (ex: "16:00 em ponto" e só há 16:30):
1. PRIMEIRO tente oferecer o MESMO horário em OUTRO dia ("16:00 não está disponível segunda, mas terça às 16:00 cabe").
2. SÓ se não houver alternativa em outro dia, ofereça o slot mais próximo no mesmo dia ("o mais perto seria 16:30").
3. Reconheça o pedido com empatia: "Entendo, 16h é melhor pro seu fluxo".

━━━ MÚLTIPLOS DIAS NA CONSULTA ━━━
Por padrão, \`buscar_horarios_disponiveis\` cobre 5-7 dias úteis a partir de hoje (não 1 dia só). Quando oferecer horários, varie entre 2-3 dias DIFERENTES para dar mais opções. Ex:
✅ "Segunda 14h, terça 10h ou quarta 16h?"
❌ "Segunda 09h, segunda 10h30 ou segunda 14h?"

━━━ USO DA TOOL enviar_botoes — REGRA OURO ━━━
USE botões SOMENTE em decisões discretas onde a resposta define o próximo passo:
✅ Escolher DIA disponível (2-4 dias):  form_id="escolha_dia",      labels: "Seg 18/05", "Ter 19/05", "Qua 20/05"
✅ Escolher HORÁRIO do dia (2-4):         form_id="escolha_horario",  labels: "09:00", "14:00", "16:30"
✅ Confirmar agendamento:                  form_id="confirmacao_agendamento", labels: "Confirmar", "Remarcar", "Cancelar"
✅ Modalidade quando o profissional oferece ambos: form_id="modalidade", labels: "Online", "Presencial"

❌ NÃO use botões em perguntas qualitativas: motivo da busca, expectativa, idade, sentimento.

IMPORTANTE — botões NÃO bloqueiam o lead. Ele pode clicar OU digitar livre. Você precisa ler o histórico pra entender o estado e decidir o próximo passo.

━━━ LEITURA DAS RESPOSTAS DE TOOL (IMPORTANTE — EVITE LOOP) ━━━
Toda resposta de \`buscar_horarios_disponiveis\` traz dois campos críticos:
- \`estado_atual\`: estado da sessão de agendamento do lead (aguardando_dia | aguardando_horario | aguardando_confirmacao)
- \`instrucao\`: o que VOCÊ DEVE FAZER em seguida. SEMPRE siga essa instrução literalmente.

Se a instrução diz "ofereça horários DESSE DIA", você NÃO oferece outros dias.
Se a instrução diz "chame enviar_botoes com form_id=confirmacao_agendamento", você FAZ ISSO — não volta a oferecer dias ou horários.
A \`instrucao\` é a fonte da verdade do estado atual. Se há conflito entre o que você "acha" e o que está na instrução, SIGA a instrução.

━━━ TEXTO LIVRE TEM PRIORIDADE SOBRE BOTÃO (ANTI-LOOP DURO) ━━━
Quando o lead responder em texto livre contendo data/hora (ex: "hoje 18h", "dia 19 às 17", "amanhã 14:00"), o sistema JÁ extraiu essa intenção e ela vem dentro da \`instrucao\` da tool. Você NÃO precisa adivinhar. Apenas siga a instrução.

REGRA DE OURO: **NUNCA envie o mesmo \`form_id\` que você enviou no turno anterior**. Olhe seu último \`[Botões enviar_botoes form_id=X ...]\` no histórico. Se você ia mandar o mesmo X de novo, PARE.
- Se a tool retornou instrução nova → siga ela (provavelmente é outro form_id ou texto direto).
- Se a tool não retornou instrução clara → responda em TEXTO LIVRE perguntando o que o lead quer, SEM botões. Ex: "Não consegui te entender — você quer marcar pra QUAL dia e QUE horário?".

Casos de NÃO repetir o mesmo botão:
❌ Último turno seu: \`form_id=escolha_dia [Ter 19 · Qua 20 · Qui 21]\` e lead disse "hoje 18h" → NUNCA reenvie escolha_dia. A instrucao da tool vai dizer o que fazer.
❌ Último turno seu: \`form_id=escolha_horario [09:00 · 10:00 · 11:00]\` e lead disse "às 14h" → NUNCA reenvie escolha_horario com os mesmos slots. A tool já recalculou pra você.
❌ Último turno seu: \`form_id=confirmacao_agendamento\` e lead disse "podemos mudar pra 19h?" → NÃO reenvie confirmacao. Trate como pedido de remarcação.

━━━ MÁQUINA DE ESTADOS DO AGENDAMENTO (SIGA À RISCA, SEM LOOP) ━━━
O fluxo é UMA DIREÇÃO. Cada vez que você recebe uma resposta válida, AVANÇA para a próxima etapa. NUNCA volte etapas.

Estado 1: AINDA NÃO COLETEI MOTIVO
  Ação: pergunte o motivo em texto livre. NÃO use botões aqui.

Estado 2: MOTIVO COLETADO, PRECISO DEFINIR DIA
  Ação: \`buscar_horarios_disponiveis\` (5-7 dias) → \`enviar_botoes\` com form_id="escolha_dia" e 2-4 dias.

Estado 3: DIA ESCOLHIDO (lead respondeu uma label de dia, ex "Seg 18/05")
  Ação: \`enviar_botoes\` com form_id="escolha_horario" e 2-4 horários DAQUELE dia.
  NUNCA volte a perguntar dia. Você JÁ tem o dia.

Estado 4: HORÁRIO ESCOLHIDO (lead respondeu uma label de horário, ex "10:00")
  Ação: \`enviar_botoes\` com form_id="confirmacao_agendamento" sobre data+hora escolhidos.
  Pergunta: "Confirma agendamento dia X às Y?"
  Opções: "Confirmar", "Remarcar", "Cancelar"
  NUNCA volte a perguntar dia nem horário. Você JÁ tem ambos.

Estado 5: LEAD RESPONDEU AO BOTÃO DE CONFIRMAÇÃO
  - Se "Confirmar" (ou similar como "sim", "fechado"): chame \`criar_agendamento\` com data+hora.
  - Se "Remarcar": volte para o Estado 2 (escolha de dia).
  - Se "Cancelar": encerre com gentileza.
  - SE o lead digitou OUTRA COISA (não bate com botão), pergunte com naturalidade se quer confirmar, remarcar ou cancelar.

━━━ LEITURA DO HISTÓRICO (PRA NÃO SE PERDER) ━━━
Antes de cada resposta, olhe os últimos turnos:
- Se a última msg sua foi \`[Botões enviar_botoes form_id=escolha_dia ...]\` e a próxima msg do lead bate com uma das labels → você está indo pro Estado 3.
- Se a última msg sua foi \`[Botões enviar_botoes form_id=escolha_horario ...]\` e a próxima msg do lead bate com uma label → Estado 4.
- Se a última msg sua foi \`[Botões enviar_botoes form_id=confirmacao_agendamento ...]\` e o lead respondeu "Confirmar" → CRIE o agendamento.

━━━ HORÁRIOS FORA DA GRADE PADRÃO ━━━
Se o lead pedir um horário quebrado (ex: "10:15") que NÃO está na grade que você ofereceu MAS está dentro da janela de disponibilidade do profissional:
1. Tente diretamente \`criar_agendamento\` no horário pedido pelo lead (com data e hora_inicio dele, hora_fim = +60min). A tool verifica conflito.
2. Se a tool aceitar, ÓTIMO. Confirme com o lead.
3. Se a tool retornar conflito, explique e ofereça os slots adjacentes mais próximos.

NUNCA ignore um pedido de horário quebrado. NUNCA silencie a pergunta do lead.

━━━ CONSULTAR DOCUMENTOS DO PROFISSIONAL (tool consultar_documentos) ━━━
Use \`consultar_documentos\` quando ${leadName} perguntar algo ESPECÍFICO sobre métodos, abordagens, materiais ou serviços do profissional que NÃO está na bio principal.
Bons gatilhos: "vocês fazem X?", "como funciona Y?", "tem material sobre Z?", "atende [especialidade]?".
NÃO use pra perguntas gerais ("vocês são bons?") nem pra agendamento.
Os trechos retornados são MATERIAL DE APOIO — reformule com naturalidade, não cole texto cru.

━━━ NUNCA crie agendamento sem confirmação explícita ━━━
\`criar_agendamento\` só roda DEPOIS do clique "Confirmar" ou de texto equivalente do lead ("sim", "pode confirmar", "fechado"). Antes disso, NUNCA chame essa tool.

━━━ NUNCA crie DUPLICATA ━━━
Se você JÁ criou um agendamento nesta sessão (você verá pela tool retornando "agendamento_ja_concluido" ou pelo histórico recente mostrando criar_agendamento bem-sucedido), NUNCA chame criar_agendamento de novo. Mesmo se o lead disser "confirma de novo?" ou "tá certo?" — apenas confirme em texto que ele já está marcado.
Se o lead quiser MUDAR data/hora, use \`atualizar_agendamento\` (NÃO crie outro).
Se o lead quiser CANCELAR, peça confirmação clara e use \`cancelar_agendamento\`.

━━━ MENSAGEM PÓS-AGENDAMENTO — VARIE ━━━
Não repita a mesma frase robótica ("Agendamento confirmado! ✅") em todas as mensagens depois de criar. Varie:
- 1ª confirmação: "Marcado! Te espero ${'${date}'} às ${'${time}'} 🙌"
- Se lead perguntar "tá certo?": "Tá sim, ${'${date}'} às ${'${time}'}. Tudo certo por aqui."
- Se lead perguntar outra coisa não-agenda: foque na nova pergunta, não repita confirmação.

━━━ DETECTAR ENCERRAMENTO DA CONVERSA ━━━
Se a mensagem do lead é claramente um AGRADECIMENTO ou ENCERRAMENTO (e não pergunta nova), responda com 1 frase curta e gentil, SEM repetir info de agendamento ou listagem.
Gatilhos: "obrigado", "valeu", "perfeito", "tá bom", "entendi", "ok", "show", "beleza", "até logo", "tchau", "abraço", "que isso eu que agradeço", emoji 🙏 sozinho.
Respostas adequadas (varie):
✅ "Tranquilo, ${leadName}! Qualquer coisa é só chamar. 🙌"
✅ "Por nada! Até ${'${date}'}. 😊"
✅ "Combinado! Bom dia/tarde/noite."
❌ NÃO chame consultar_meus_agendamentos de novo
❌ NÃO repita data/hora se já foi mencionada nos últimos 2 turnos
❌ NÃO faça nova pergunta nem proposta — encerre com cordialidade.

━━━ NÃO REPETIR INFO JÁ DADA ━━━
Olhe os últimos 3 turnos seus no histórico. Se a info que você está prestes a enviar JÁ foi dita literalmente, NÃO repita. Reformule ou apenas reconheça brevemente o que o lead disse.

━━━ ORDEM DE BUSCA DE INFORMAÇÃO ━━━
1. **PRIMEIRO** — olhe o que JÁ está neste prompt (seção "SOBRE ${proName.toUpperCase()}": área, abordagens, bio, preços). Se a resposta está aqui, responda **DIRETO**, com naturalidade, SEM hedge.
2. **SÓ SE** a pergunta for sobre tópico NÃO coberto neste prompt (LGPD/conformidade, casos clínicos específicos, métodos detalhados, identidade da plataforma, planos com features), chame \`consultar_documentos\` com 1-3 keywords.
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
Comece reconhecendo o que ${leadName} trouxe, com naturalidade humana.`
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
  if (toolName === 'buscar_horarios_disponiveis') {
    // ANTES de tudo: lê estado de agendamento do lead e retorna direcionado
    const { data: leadStateRow } = await supabaseAdmin
      .from('leads')
      .select('booking_state')
      .eq('id', leadId)
      .maybeSingle()
    const bs: any = (leadStateRow?.booking_state) || {}

    // Estado 5 (final) → agendamento JÁ existe, NÃO crie outro
    if (bs.stage === 'done' && bs.appointment_id) {
      console.log(`[buscar_horarios] Lead já tem agendamento ${bs.appointment_id}. Nada a fazer.`)
      return {
        estado_atual: 'agendamento_ja_concluido',
        instrucao: `Lead já tem agendamento confirmado em ${bs.selected_date} às ${bs.selected_time}. NÃO chame criar_agendamento. Responda de forma humana confirmando que está marcado e oferecendo ajuda se ele tiver outra dúvida. Se ele quiser mudar de horário, use atualizar_agendamento. Se ele quiser cancelar, peça confirmação antes.`,
        agendamento_existente: {
          id: bs.appointment_id,
          data: bs.selected_date,
          hora: bs.selected_time,
        },
      }
    }

    // Estado 4 → lead já clicou horário: NÃO retorna mais dias/horários
    if (bs.stage === 'time_picked' && bs.selected_date && bs.selected_time) {
      console.log(`[buscar_horarios] Lead já escolheu ${bs.selected_date} ${bs.selected_time}. Direcionando para confirmação.`)
      return {
        estado_atual: 'aguardando_confirmacao',
        instrucao: `Lead já escolheu o dia ${bs.selected_date} às ${bs.selected_time}. NÃO ofereça outros horários ou dias. Próximo passo OBRIGATÓRIO: chame enviar_botoes com form_id="confirmacao_agendamento" perguntando "Confirma agendamento ${bs.selected_day_label || bs.selected_date} às ${bs.selected_time}?" com opções "Confirmar ✅", "Remarcar", "Cancelar".`,
        agendamento_proposto: {
          data: bs.selected_date,
          dia_semana: bs.selected_day_label,
          hora_inicio: bs.selected_time,
        },
      }
    }

    // Estado 3 → lead já clicou dia: retorna SÓ horários DESSE dia
    if (bs.stage === 'day_picked' && bs.selected_date) {
      console.log(`[buscar_horarios] Lead já escolheu dia ${bs.selected_date}. Retornando só horários DESSE dia.`)
      // forçamos data_inicio = data_fim = selected_date pra retornar só esse dia
      args.data_inicio = bs.selected_date
      args.data_fim = bs.selected_date
    }

    // Estado 4 → TEXTO LIVRE: webhook detectou data/hora natural ("hoje 18h", "dia 19 às 17:00")
    //           Promove pra stage equivalente e consome parsed_intent.
    const pi = bs.parsed_intent as { date: string | null; time: string | null } | null | undefined
    if (pi && (pi.date || pi.time) && bs.stage !== 'done' && bs.stage !== 'time_picked' && bs.stage !== 'day_picked') {
      console.log(`[buscar_horarios] parsed_intent: date=${pi.date} time=${pi.time}`)
      const dayShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
      const buildLabel = (iso: string) => {
        const d = new Date(iso + 'T00:00:00')
        return `${dayShort[d.getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
      }
      const toMinutesLocal = (hhmm: string): number => {
        const [h, m] = hhmm.split(':').map(Number)
        return h * 60 + m
      }
      const SLOT_M = 60

      // Resolve date efetivo: parsed.date OU (se só time) o selected_date pendente
      const effDate = pi.date || bs.selected_date
      const effTime = pi.time

      // Sub-caso A: temos date+time → tentar promover direto pra time_picked
      if (effDate && effTime) {
        const reqDow = new Date(effDate + 'T00:00:00').getDay()
        const { data: avail } = await supabaseAdmin
          .from('availability')
          .select('start_time, end_time')
          .eq('professional_id', professionalId)
          .eq('day_of_week', reqDow)
        const reqMins = toMinutesLocal(effTime)
        const fitsWindow = (avail || []).some((w: any) => {
          const sm = toMinutesLocal((w.start_time as string).slice(0, 5))
          const em = toMinutesLocal((w.end_time as string).slice(0, 5))
          return reqMins >= sm && reqMins + SLOT_M <= em
        })
        let isOcc = false
        if (fitsWindow) {
          const { data: occ } = await supabaseAdmin
            .from('appointments')
            .select('start_time')
            .eq('professional_id', professionalId)
            .eq('appointment_date', effDate)
            .eq('appointment_type', 'booking')
            .in('status', ['pending', 'confirmed'])
          isOcc = (occ || []).some((o: any) => (o.start_time as string).slice(0, 5) === effTime)
        }

        if (fitsWindow && !isOcc) {
          const dayLabel = buildLabel(effDate)
          await supabaseAdmin.from('leads').update({
            booking_state: {
              ...bs,
              stage: 'time_picked',
              selected_date: effDate,
              selected_time: effTime,
              selected_day_label: dayLabel,
              parsed_intent: null,
              updated_at: new Date().toISOString(),
            },
          }).eq('id', leadId)
          console.log(`[buscar_horarios] parsed_intent → time_picked direto (${effDate} ${effTime})`)
          return {
            estado_atual: 'aguardando_confirmacao',
            instrucao: `Lead pediu via texto livre: ${dayLabel} às ${effTime}. Slot está LIVRE. Próximo passo OBRIGATÓRIO: chame enviar_botoes com form_id="confirmacao_agendamento" perguntando "Confirma agendamento ${dayLabel} às ${effTime}?" com opções "Confirmar ✅", "Remarcar", "Cancelar". NÃO ofereça outros dias/horários, NÃO reapresente menu.`,
            agendamento_proposto: { data: effDate, dia_semana: dayLabel, hora_inicio: effTime },
          }
        } else {
          // Não cabe ou está ocupado: consome parsed_intent, redireciona consulta pro dia pedido
          await supabaseAdmin.from('leads').update({
            booking_state: { ...bs, parsed_intent: null, updated_at: new Date().toISOString() },
          }).eq('id', leadId)
          args.data_inicio = effDate
          args.data_fim = effDate
          // Anexa razão pra ser usada na instrucao do default
          ;(bs as any).__pi_fallback = {
            date: effDate, time: effTime,
            reason: fitsWindow ? 'horario_ocupado' : 'fora_da_janela',
            day_label: buildLabel(effDate),
          }
        }
      }
      // Sub-caso B: só date → promove pra day_picked (cai no fluxo existente)
      else if (effDate && !effTime) {
        const dayLabel = buildLabel(effDate)
        await supabaseAdmin.from('leads').update({
          booking_state: {
            ...bs,
            stage: 'day_picked',
            selected_date: effDate,
            selected_day_label: dayLabel,
            parsed_intent: null,
            updated_at: new Date().toISOString(),
          },
        }).eq('id', leadId)
        bs.stage = 'day_picked'
        bs.selected_date = effDate
        bs.selected_day_label = dayLabel
        args.data_inicio = effDate
        args.data_fim = effDate
        console.log(`[buscar_horarios] parsed_intent → day_picked (${effDate})`)
      }
      // Sub-caso C: só time sem date prévia → consome silenciosamente e cai no default
      else {
        await supabaseAdmin.from('leads').update({
          booking_state: { ...bs, parsed_intent: null, updated_at: new Date().toISOString() },
        }).eq('id', leadId)
      }
    }

    const { data_inicio, data_fim } = args

    // 1. Disponibilidade semanal do profissional (cadastrada no perfil)
    const { data: availability } = await supabaseAdmin
      .from('availability')
      .select('day_of_week, start_time, end_time')
      .eq('professional_id', professionalId)

    // 2. Agendamentos no intervalo (bookings + blocks)
    const { data: occupied } = await supabaseAdmin
      .from('appointments')
      .select('appointment_date, start_time, end_time, status, appointment_type')
      .eq('professional_id', professionalId)
      .gte('appointment_date', data_inicio)
      .lte('appointment_date', data_fim)
      .in('status', ['pending', 'confirmed'])

    const SLOT_MINUTES = 60  // duração padrão por slot (TODO: ler do perfil)

    // Fallback se não há disponibilidade cadastrada: 9-12h / 14-18h dias úteis
    const defaultWeeklyAvailability = [
      { day_of_week: 1, start_time: '09:00', end_time: '12:00' },
      { day_of_week: 1, start_time: '14:00', end_time: '18:00' },
      { day_of_week: 2, start_time: '09:00', end_time: '12:00' },
      { day_of_week: 2, start_time: '14:00', end_time: '18:00' },
      { day_of_week: 3, start_time: '09:00', end_time: '12:00' },
      { day_of_week: 3, start_time: '14:00', end_time: '18:00' },
      { day_of_week: 4, start_time: '09:00', end_time: '12:00' },
      { day_of_week: 4, start_time: '14:00', end_time: '18:00' },
      { day_of_week: 5, start_time: '09:00', end_time: '12:00' },
      { day_of_week: 5, start_time: '14:00', end_time: '17:00' },
    ]
    const weekly = (availability && availability.length > 0) ? availability : defaultWeeklyAvailability
    const usingFallback = !availability || availability.length === 0

    // Helpers
    const toMinutes = (hhmm: string): number => {
      const [h, m] = hhmm.split(':').map(Number)
      return h * 60 + m
    }
    const fromMinutes = (mins: number): string => {
      const h = Math.floor(mins / 60).toString().padStart(2, '0')
      const m = (mins % 60).toString().padStart(2, '0')
      return `${h}:${m}`
    }

    // Index de ocupados por data: Set de "HH:MM" das start_time
    const occupiedByDate: Record<string, Set<string>> = {}
    for (const apt of (occupied || [])) {
      const date = apt.appointment_date as string
      const start = (apt.start_time as string).slice(0, 5)  // "HH:MM"
      if (!occupiedByDate[date]) occupiedByDate[date] = new Set()
      occupiedByDate[date].add(start)
    }

    // Itera dia a dia gerando slots
    const dias: Array<{ data: string; dia_semana: string; horarios_livres: string[] }> = []
    const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

    const start = new Date(data_inicio + 'T00:00:00')
    const end = new Date(data_fim + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d < today) continue  // pula passado

      const dow = d.getDay()
      const dateStr = d.toISOString().slice(0, 10)
      const isToday = d.getTime() === today.getTime()

      // Janelas de disponibilidade desse dia da semana
      const windowsForDow = weekly.filter((w: any) => w.day_of_week === dow)
      if (windowsForDow.length === 0) continue

      const slotsLivresDoDia: string[] = []
      for (const w of windowsForDow) {
        const startMin = toMinutes((w.start_time as string).slice(0, 5))
        const endMin = toMinutes((w.end_time as string).slice(0, 5))

        for (let m = startMin; m + SLOT_MINUTES <= endMin; m += SLOT_MINUTES) {
          const slotStr = fromMinutes(m)
          // Pula horários no passado se for hoje
          if (isToday) {
            const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
            if (m <= nowMin) continue
          }
          // Pula se ocupado
          if (occupiedByDate[dateStr]?.has(slotStr)) continue
          slotsLivresDoDia.push(slotStr)
        }
      }

      if (slotsLivresDoDia.length > 0) {
        dias.push({
          data: dateStr,
          dia_semana: dayNames[dow],
          horarios_livres: slotsLivresDoDia,
        })
      }
    }

    // Contexto baseado no estado atual do lead
    let estadoAtual = 'aguardando_dia'
    let instrucao = 'Ofereça 2-4 DIAS DIFERENTES via enviar_botoes(form_id="escolha_dia"). NÃO ofereça horários ainda.'
    if (bs.stage === 'day_picked' && bs.selected_date) {
      estadoAtual = 'aguardando_horario'
      const diaInfo = dias.find((d) => d.data === bs.selected_date)
      const horarios = diaInfo?.horarios_livres || []
      instrucao = `Lead já escolheu ${bs.selected_day_label || bs.selected_date}. Agora ofereça 2-4 HORÁRIOS DESSE DIA via enviar_botoes(form_id="escolha_horario"). Horários disponíveis: ${horarios.slice(0, 4).join(', ')}.`
    }

    // Override: parsed_intent caiu em fallback (horário pedido ocupado/fora janela)
    const piFallback = (bs as any).__pi_fallback
    if (piFallback) {
      const diaInfo = dias.find((d) => d.data === piFallback.date)
      const horarios = diaInfo?.horarios_livres || []
      estadoAtual = 'aguardando_horario'
      if (piFallback.reason === 'horario_ocupado') {
        instrucao = `Lead pediu ${piFallback.day_label} às ${piFallback.time} (texto livre), mas esse horário JÁ ESTÁ OCUPADO. Explique isso em 1 frase humana e ofereça 2-3 horários ALTERNATIVOS do MESMO DIA via enviar_botoes(form_id="escolha_horario"). Horários livres em ${piFallback.day_label}: ${horarios.slice(0, 4).join(', ') || '(nenhum livre — sugira outro dia)'}.`
      } else {
        instrucao = `Lead pediu ${piFallback.day_label} às ${piFallback.time} (texto livre), mas FORA DA JANELA DE ATENDIMENTO do profissional naquele dia. Explique isso em 1 frase humana e ofereça 2-3 horários DENTRO da janela do MESMO DIA via enviar_botoes(form_id="escolha_horario"). Horários disponíveis em ${piFallback.day_label}: ${horarios.slice(0, 4).join(', ') || '(profissional não atende esse dia — sugira outro)'}.`
      }
    }

    return {
      estado_atual: estadoAtual,
      instrucao,
      dias_com_horarios_livres: dias,
      observacao: usingFallback
        ? 'O profissional não cadastrou a agenda semanal — estes horários são um padrão (seg-sex, 9h-12h e 14h-18h). Pergunte ao profissional pra confirmar antes de prometer.'
        : 'Disponibilidade real do profissional. Pode oferecer com confiança.',
    }
  }

  if (toolName === 'criar_agendamento') {
    // ── GUARD: lead já tem agendamento concluído nesta sessão? ──────────
    const { data: leadRowGuard } = await supabaseAdmin
      .from('leads')
      .select('booking_state')
      .eq('id', leadId)
      .maybeSingle()
    const bsGuard: any = (leadRowGuard?.booking_state) || {}
    if (bsGuard.stage === 'done' && bsGuard.appointment_id) {
      console.warn(`[criar_agendamento] Lead já tem agendamento ${bsGuard.appointment_id} — recusando criar duplicata`)
      return {
        erro: 'agendamento_ja_existe',
        instrucao: 'Lead já tem agendamento confirmado nesta sessão. NÃO crie outro. Confirme com o lead que já está marcado. Se ele quiser mudar, use atualizar_agendamento.',
        agendamento_existente: {
          id: bsGuard.appointment_id,
          data: bsGuard.selected_date,
          hora: bsGuard.selected_time,
        },
      }
    }

    // ── VALIDAÇÃO: horário cabe na janela de disponibilidade do profissional ──
    const reqDate = new Date(args.data + 'T00:00:00')
    const reqDow = reqDate.getDay()
    const { data: avail } = await supabaseAdmin
      .from('availability')
      .select('start_time, end_time')
      .eq('professional_id', professionalId)
      .eq('day_of_week', reqDow)

    if (avail && avail.length > 0) {
      const horaIni = args.hora_inicio
      const horaFim = args.hora_fim
      const dentroDeAlguma = avail.some((w: any) => {
        const wStart = (w.start_time as string).slice(0, 5)
        const wEnd   = (w.end_time as string).slice(0, 5)
        return horaIni >= wStart && horaFim <= wEnd
      })
      if (!dentroDeAlguma) {
        const janelas = avail.map((w: any) =>
          `${(w.start_time as string).slice(0, 5)}-${(w.end_time as string).slice(0, 5)}`,
        ).join(', ')
        return {
          erro: 'fora_da_grade',
          mensagem: `Esse horário está fora da grade do profissional (atendimento: ${janelas}). Escolha um horário dentro dessa faixa.`,
          janelas_disponiveis: avail,
        }
      }
    }
    // (se profissional não cadastrou availability, aceita qualquer horário —
    //  fallback intencional; ele depois confirma com o paciente.)

    // ── VALIDAÇÃO ANTI-OVERLAP (não só start_time exato) ──────────────────
    // Dois agendamentos se sobrepõem quando:
    //   existente.start < novo.end  E  existente.end > novo.start
    // Isso captura casos onde lead pede 10:15-11:15 e já existe 10:00-11:00.
    const { data: conflitos, error: conflictError } = await supabaseAdmin
      .from('appointments')
      .select('id, start_time, end_time')
      .eq('professional_id', professionalId)
      .eq('appointment_date', args.data)
      .in('status', ['pending', 'confirmed'])
      .eq('appointment_type', 'booking') // só bookings, não bloqueios (default no DB é 'booking')
      .lt('start_time', args.hora_fim)
      .gt('end_time', args.hora_inicio)

    if (conflictError) {
      console.error('[criar_agendamento] Erro ao verificar conflito:', conflictError.message)
    }

    if (conflitos && conflitos.length > 0) {
      const c = conflitos[0]
      console.warn(`[criar_agendamento] Overlap bloqueado em ${args.data} ${args.hora_inicio}-${args.hora_fim} contra ${c.start_time}-${c.end_time}`)
      return {
        erro: 'horario_indisponivel',
        mensagem: `Esse horário se sobrepõe a outro agendamento já marcado (${c.start_time?.toString().slice(0, 5)} – ${c.end_time?.toString().slice(0, 5)}). Escolha outro.`,
        conflito: { start: c.start_time, end: c.end_time },
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    const { data: agendamento, error } = await supabaseAdmin
      .from('appointments')
      .insert({
        professional_id: professionalId,
        appointment_date: args.data,
        start_time: args.hora_inicio,
        end_time: args.hora_fim,
        notes: args.observacoes || '',
        status: 'pending',
      })
      .select('id, appointment_date, start_time, end_time')
      .single()

    if (error) {
      // Se a constraint do banco pegar (race condition), retorna mensagem amigável
      if (error.code === '23505') {
        return {
          erro: 'horario_indisponivel',
          mensagem: `O horário das ${args.hora_inicio} acabou de ser reservado. Por favor, escolha outro horário disponível.`
        }
      }
      return { erro: error.message }
    }

    // Marca booking_state como concluído pra impedir criar duplicados e
    // direcionar o Sonnet a NÃO chamar criar_agendamento de novo nessa sessão.
    await supabaseAdmin.from('leads').update({
      pipeline_stage: 'agendado',
      booking_state: {
        stage: 'done',
        appointment_id: (agendamento as any)?.id,
        selected_date: args.data,
        selected_time: args.hora_inicio,
        confirmed_at: new Date().toISOString(),
      },
    }).eq('id', leadId)

    return {
      sucesso: true,
      agendamento,
      estado_atual: 'agendamento_concluido',
      instrucao: 'Agendamento criado. Confirme com o lead em 1 frase humana, varie a forma. NÃO chame criar_agendamento de novo. Se o lead pedir mudança, use atualizar_agendamento.',
    }
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

  if (toolName === 'atualizar_agendamento') {
    const aid = args.appointment_id
    const novaData = args.nova_data
    const novaHi  = args.nova_hora_inicio
    const novaHf  = args.nova_hora_fim
    if (!aid || !novaData || !novaHi || !novaHf) {
      return { erro: 'parametros_invalidos', mensagem: 'appointment_id, nova_data, nova_hora_inicio e nova_hora_fim são obrigatórios.' }
    }

    // Anti-overlap com OUTROS agendamentos (excluindo o próprio)
    const { data: conflitos } = await supabaseAdmin
      .from('appointments')
      .select('id, start_time, end_time')
      .eq('professional_id', professionalId)
      .eq('appointment_date', novaData)
      .in('status', ['pending', 'confirmed'])
      .eq('appointment_type', 'booking')
      .neq('id', aid)
      .lt('start_time', novaHf)
      .gt('end_time', novaHi)

    if (conflitos && conflitos.length > 0) {
      const c = conflitos[0]
      return {
        erro: 'horario_indisponivel',
        mensagem: `Esse novo horário se sobrepõe a outro agendamento (${c.start_time?.toString().slice(0,5)}-${c.end_time?.toString().slice(0,5)}). Escolha outro.`,
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from('appointments')
      .update({
        appointment_date: novaData,
        start_time: novaHi,
        end_time: novaHf,
        updated_at: new Date().toISOString(),
      })
      .eq('id', aid)
      .eq('professional_id', professionalId) // segurança extra
      .select('id, appointment_date, start_time, end_time')
      .single()

    if (error) {
      console.error('[atualizar_agendamento] erro:', error.message)
      return { erro: error.message }
    }

    // Atualiza booking_state — volta pra 'done' (agendamento ativo, sem novo loop)
    const { data: leadRow } = await supabaseAdmin.from('leads').select('booking_state').eq('id', leadId).maybeSingle()
    const prevBs: any = leadRow?.booking_state || {}
    await supabaseAdmin.from('leads').update({
      booking_state: {
        ...prevBs,
        stage: 'done',
        appointment_id: aid,
        selected_date: novaData,
        selected_time: novaHi,
        rescheduled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }).eq('id', leadId)

    return {
      sucesso: true,
      agendamento: updated,
      instrucao: `Agendamento movido para ${novaData} às ${novaHi}. Confirme com o lead em 1 frase humana. NÃO chame criar_agendamento (já está atualizado).`,
    }
  }

  if (toolName === 'cancelar_agendamento') {
    const aid = args.appointment_id
    if (!aid) return { erro: 'appointment_id obrigatório' }

    const { data: cancelled, error } = await supabaseAdmin
      .from('appointments')
      .update({ status: 'cancelled', notes: args.motivo || 'Cancelado pelo lead via agente.', updated_at: new Date().toISOString() })
      .eq('id', aid)
      .eq('professional_id', professionalId)
      .select('id, appointment_date, start_time')
      .single()

    if (error) return { erro: error.message }

    await supabaseAdmin.from('leads').update({
      booking_state: { stage: 'cancelled', cancelled_at: new Date().toISOString() },
      pipeline_stage: 'em_conversa',
    }).eq('id', leadId)

    return { sucesso: true, agendamento: cancelled, instrucao: 'Agendamento cancelado. Despeça-se com cordialidade e ofereça remarcar futuramente se quiser.' }
  }

  if (toolName === 'consultar_meus_agendamentos') {
    const hoje = new Date().toISOString().slice(0, 10)

    // Buscar via lead → tentar match por whatsapp do lead == patient associated. Como
    // appointments.patient_id pode estar NULL pra leads que nunca viraram paciente
    // formal, usamos notes/professional/data como heurística. Por simplicidade,
    // retornamos todos os agendamentos ativos do profissional com este lead (via patient_id)
    // OU os criados nesta sessão de chat (via booking_state.appointment_id).
    const { data: leadRow } = await supabaseAdmin
      .from('leads')
      .select('booking_state, whatsapp')
      .eq('id', leadId)
      .maybeSingle()

    const bs: any = leadRow?.booking_state || {}
    const apptIds: string[] = []
    if (bs.appointment_id) apptIds.push(bs.appointment_id)

    let query = supabaseAdmin
      .from('appointments')
      .select('id, appointment_date, start_time, end_time, status, notes')
      .eq('professional_id', professionalId)
      .eq('appointment_type', 'booking')
      .in('status', ['pending', 'confirmed'])
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (!args.incluir_passados) {
      query = query.gte('appointment_date', hoje)
    }

    if (apptIds.length > 0) {
      query = query.in('id', apptIds)
    } else {
      // Sem appointment_id no booking_state: tenta pelo telefone via leads.whatsapp
      // Não há FK direta hoje; retornamos vazio nesse caso (lead ainda não agendou).
      return {
        total: 0,
        agendamentos: [],
        instrucao: 'Este lead ainda não tem agendamento conhecido nesta sessão. Pergunte se quer marcar agora.',
      }
    }

    const { data: apts } = await query

    if (!apts || apts.length === 0) {
      return { total: 0, agendamentos: [], instrucao: 'Sem agendamentos ativos. Ofereça marcar.' }
    }

    return {
      total: apts.length,
      ja_consultou_neste_turno: true,
      instrucao: 'Os agendamentos abaixo foram listados. Responda APENAS UMA VEZ ao lead com essa info. Se ele responder com agradecimento/encerramento ("obrigado", "perfeito", "tá bom") nos próximos turnos, NÃO chame esta tool de novo nem repita os agendamentos — apenas despeça-se com 1 frase curta. Se ele perguntar algo NOVO, responda sem reapresentar a lista.',
      agendamentos: apts.map((a: any) => ({
        id: a.id,
        data: a.appointment_date,
        hora: (a.start_time as string).slice(0, 5),
        hora_fim: (a.end_time as string).slice(0, 5),
        status: a.status,
      })),
      instrucao: 'Confirme com o lead o(s) agendamento(s) listado(s). NÃO ofereça criar outro a menos que ele peça.',
    }
  }

  if (toolName === 'enviar_botoes') {
    const titulo: string = (args.titulo || '').toString().slice(0, 60)
    const descricao: string = (args.descricao || 'Escolha uma das opções:').toString().slice(0, 100)
    const formId: string = (args.form_id || 'form').toString().slice(0, 60)
    const expiraEmMin: number = Math.min(Math.max(parseInt(args.expira_em_minutos) || 10, 1), 30)
    const opcoes: Array<{ label: string; id: string }> = Array.isArray(args.opcoes) ? args.opcoes.slice(0, 4) : []

    if (opcoes.length < 2) {
      return { erro: 'opcoes deve conter pelo menos 2 itens' }
    }

    // ── ANTI-LOOP DE BOTÕES ──────────────────────────────────────────────
    // Se o mesmo form_id está sendo enviado pela 3ª vez seguida sem o lead
    // ter clicado em nada nem mudado de stage, recusa e força texto livre.
    const { data: bsRow } = await supabaseAdmin
      .from('leads')
      .select('booking_state')
      .eq('id', leadId)
      .maybeSingle()
    const bsBtn: any = (bsRow?.booking_state) || {}
    const prevFormId = bsBtn.last_form_id || null
    const prevCount = typeof bsBtn.same_form_count === 'number' ? bsBtn.same_form_count : 0
    const newCount = (formId === prevFormId) ? prevCount + 1 : 1

    if (newCount >= 3) {
      console.warn(`[enviar_botoes] LOOP detectado — form_id="${formId}" enviado ${newCount}ª vez. Recusando.`)
      // Zera o contador pra deixar o próximo form_id novo passar
      await supabaseAdmin.from('leads').update({
        booking_state: {
          ...bsBtn,
          last_form_id: null,
          same_form_count: 0,
          updated_at: new Date().toISOString(),
        },
      }).eq('id', leadId)
      return {
        erro: 'loop_detected',
        instrucao: `Você JÁ enviou form_id="${formId}" ${prevCount} vezes seguidas e o lead não está engajando com os botões. PARE de enviar botões. Em vez disso, responda em TEXTO LIVRE: peça desculpa, pergunte diretamente o que ele quer (dia E horário) e aguarde a resposta livre. Exemplo: "Desculpa a confusão! Me diz por texto: qual dia e horário ficam melhor pra você?". NÃO chame enviar_botoes neste turno.`,
      }
    }

    // Atualiza contador antes de enviar
    await supabaseAdmin.from('leads').update({
      booking_state: {
        ...bsBtn,
        last_form_id: formId,
        same_form_count: newCount,
        updated_at: new Date().toISOString(),
      },
    }).eq('id', leadId)

    // Formato confirmado em produção (sendOptionsMenu do whatsapp-webhook):
    // { type: 'reply', displayText, id }. Truncar displayText em 20 chars (limite Evolution).
    const buttons = opcoes.map((o) => ({
      type: 'reply',
      displayText: (o.label || '').toString().slice(0, 20),
      id: (o.id || '').toString().slice(0, 60),
    }))
    const expectedOptions = buttons.map((b) => b.displayText)

    // IMPORTANTE: botões durante a conversa NÃO bloqueiam o lead. O lead pode
    // clicar OU digitar livre — qualquer mensagem subsequente vai pro agente
    // normalmente (com debounce). O agente lê o histórico, vê este registro
    // e decide o próximo passo. O bloqueio só vale pro menu_inicial do lead novo.

    // Grava no histórico com contexto rico pro agente entender o estado
    await supabaseAdmin.from('chat_messages').insert({
      lead_id: leadId,
      role: 'assistant',
      content: `[Botões enviar_botoes form_id=${formId} | pergunta="${titulo}" | opções: ${expectedOptions.join(' · ')}]`,
      processed: true,
    })

    // 3. Envia pra Evolution
    const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
    const evoKey = Deno.env.get('EVOLUTION_API_KEY')
    if (!evoUrl || !evoKey || !instanceName) {
      console.error('[enviar_botoes] Config Evolution ausente')
      return { erro: 'config_evolution_ausente', mensagem: 'Não foi possível enviar os botões agora.' }
    }

    const body = {
      number: remoteJid,
      title: titulo,
      description: descricao,
      footer: 'Atendimento Virtual',
      buttons,
    }

    try {
      const res = await fetch(`${evoUrl}/message/sendButtons/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const txt = await res.text()
      console.log(`[enviar_botoes] form="${formId}" status=${res.status} body=${txt.substring(0, 150)}`)
      if (!res.ok) {
        // Fallback: envia como texto numerado
        const fallback = `${titulo}\n\n${expectedOptions.map((o, i) => `${i + 1}️⃣ ${o}`).join('\n')}\n\nResponda com o número da opção.`
        await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: remoteJid, text: fallback }),
        })
        console.log(`[enviar_botoes] Fallback texto enviado`)
      }
    } catch (e: any) {
      console.error('[enviar_botoes] Erro Evolution:', e.message)
      return { erro: 'erro_envio', mensagem: e.message }
    }

    return {
      botoes_enviados: true,
      form_id: formId,
      opcoes: expectedOptions,
      proxima_acao: 'Aguardar resposta do lead (clique ou texto livre). NÃO envie outra mensagem agora.',
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
        if (textBlock?.text) return textBlock.text
        // Sem texto e sem tool — fallback amigável
        return 'Desculpe, não consegui responder agora. Pode reformular?'
      }

      // Tem tool_use → executa ferramentas e devolve resultados
      const toolUseBlocks = content.filter((b: any) => b.type === 'tool_use')
      const toolResults = []
      let sentDirect = false  // alguma tool ENVIA mensagem direto (enviar_botoes)?
      for (const tu of toolUseBlocks) {
        const out = await handleToolCall(tu.name, tu.input, supabaseAdmin, professionalId, leadId, instanceName, remoteJid)
        if (tu.name === 'enviar_botoes' && (out as any)?.botoes_enviados) {
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

    // Mostrar "digitando..." enquanto a IA pensa
    await sendWhatsAppPresence(instance_name, remote_jid, 'composing')

    console.log(`[AI] Calling Claude Sonnet 4.6...`)
    const systemPrompt = buildSystemPrompt(professional, lead_name, lead_phone)
    let agentReply: string
    try {
      agentReply = await callClaude(systemPrompt, chatHistory, message, supabaseAdmin, professional_id, lead_id, instance_name, remote_jid)
      console.log(`[AI] Reply: ${agentReply}`)
    } catch (aiError: any) {
      console.error(`[AI Error]`, aiError.message)
      agentReply = `Erro na IA (${aiError.message}). Por favor, verifique as chaves e o modelo.`
    }

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

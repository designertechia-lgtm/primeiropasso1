// =============================================================================
// axel-agent — O cérebro conversacional do Axel (assistente do PROFISSIONAL)
//
// Replica o motor agêntico do whatsapp-agent (Claude Sonnet + Tool Use loop),
// trocando o público (lead → profissional) e as tools (agenda → produtividade).
//
// Tools de LEITURA + MEMÓRIA + EXECUÇÃO
//   - consultar_secao   : abre uma seção da base de conhecimento SECCIONADA (schema axel,
//                         via RPC public.axel_kb_sections). O índice das seções vai no system prompt.
//   - ler_estado_perfil : o que falta no perfil/onboarding
//   - salvar_memoria    : grava um fato do profissional (relacionamento)
//
// Segurança: NUNCA confia no professional_id do cliente. Valida o JWT, deriva
// o user e busca o professional dono. Persiste histórico em axel_conversations.
// =============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const CLAUDE_MODEL = "claude-sonnet-4-6"
const CLAUDE_URL = "https://api.anthropic.com/v1/messages"

// =============================================
// TOOL DEFINITIONS — formato Anthropic (Tool Use)
// =============================================
const tools = [
  {
    name: "consultar_secao",
    description:
      "Abre o passo a passo / detalhe de uma SEÇÃO da plataforma pela 'key' listada no MAPA DA PLATAFORMA (no system prompt). CHAME SEMPRE que o profissional perguntar 'como faço X?', 'como conecto Y?', 'a plataforma tem Z?', 'onde fica W?'. Fundamente a resposta no conteúdo da seção — NÃO responda de cabeça nem invente. Ex.: key 'google-agenda'.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "A chave EXATA da seção (campo [key] no MAPA DA PLATAFORMA). Ex.: 'google-agenda', 'agenda', 'landing'." },
      },
      required: ["key"],
    },
  },
  {
    name: "ler_estado_perfil",
    description:
      "Lê o estado atual do perfil e da ambientação (onboarding) do profissional: o que já está pronto e o que falta (perfil, agenda, landing publicada, whatsapp, primeiro conteúdo, assinatura). Use quando o profissional perguntar 'o que falta pra mim?', 'como tá meu progresso?', ou quando precisar de contexto pra sugerir o próximo passo.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "salvar_memoria",
    description:
      "Salva um FATO relevante sobre o profissional pra lembrar em conversas futuras (relacionamento). Use quando ele revelar objetivo, especialidade, público, dor, preferência de tom, ou contexto importante. NÃO mostre essa ação a ele — é registro interno. Pode chamar várias vezes.",
    input_schema: {
      type: "object",
      properties: {
        chave: { type: "string", description: "Nome do fato em snake_case. Use estas chaves canônicas quando aplicável (alimentam o perfil): 'objetivo_plataforma' (o que ele quer alcançar na plataforma), 'objetivo_profissional' (meta de carreira), 'profissao', 'nicho', 'publico_alvo', 'dor', 'preferencia_tom', 'migrando_de'. Pode criar outras chaves quando fizer sentido." },
        valor: { type: "string", description: "Valor do fato, curto e padronizado. Ex.: 'psicóloga infantil', 'migrar do Google Agenda', 'ainda não publicou a landing'." },
      },
      required: ["chave", "valor"],
    },
  },
  {
    name: "sugerir_dados_perfil",
    description:
      "Gera SUGESTÕES de conteúdo para o perfil/landing do profissional (bio, hero_title, hero_subtitle, pain_title, pain_subtitle, pain_items, solution_title, solution_subtitle, solution_items). Use SOMENTE quando o profissional pedir 'melhore minha bio', 'crie um título pra minha landing', 'sugira dores/problemas', etc. PRIMEIRO chame esta tool, mostre o resultado e PEÇA CONFIRMAÇÃO antes de chamar atualizar_perfil ou gerar_landing.",
    input_schema: {
      type: "object",
      properties: {
        campo: { type: "string", description: "Campo a gerar: 'bio', 'hero_title', 'hero_subtitle', 'pain_title', 'pain_subtitle', 'pain_items', 'solution_title', 'solution_subtitle', 'solution_items'." },
      },
      required: ["campo"],
    },
  },
  {
    name: "atualizar_perfil",
    description:
      "APLICA um texto gerado no perfil do profissional (grava no banco). SÓ CHAME depois que o profissional CONFIRMAR explicitamente ('sim', 'aplica', 'pode salvar', 'gostei'). NUNCA grave sem confirmação.",
    input_schema: {
      type: "object",
      properties: {
        campo: { type: "string", description: "Campo a atualizar: 'bio', 'hero_title', 'hero_subtitle', 'pain_title', 'pain_subtitle', 'pain_items', 'solution_title', 'solution_subtitle', 'solution_items'." },
        valor: { type: "string", description: "Texto gerado (JSON string para pain_items e solution_items)." },
      },
      required: ["campo", "valor"],
    },
  },
  {
    name: "gerar_landing",
    description:
      "Gera TODAS as seções da Landing Page de uma vez (hero_title, hero_subtitle, pain_title, pain_subtitle, pain_items, solution_title, solution_subtitle, solution_items). Chame quando o profissional pedir 'crie minha landing', 'monte a landing page'. PRIMEIRO chame esta tool, mostre o preview e PEÇA CONFIRMAÇÃO antes de aplicar.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "criar_artigo",
    description:
      "Cria um artigo + carrossel de imagens para o profissional. Gera título, conteúdo (legenda Instagram) e slides do carrossel com sugestões de imagem. Chame quando o profissional pedir 'crie um artigo', 'quero postar sobre ansiedade', 'sugira um post'. ANTES de chamar, avise que isso consome créditos da plataforma. Se o profissional não tiver créditos suficientes, a tool retornará erro.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "Tema sugerido pelo profissional (opcional). Ex.: 'ansiedade no trabalho', 'autoestima', 'como lidar com estresse'. Se vazio, a IA escolhe um tema relevante." },
      },
      required: [],
    },
  },
  {
    name: "abrir_pagina",
    description:
      "LEVA o profissional até uma página da plataforma (ele está logado no painel; o app navega na hora e o chat continua aberto por cima). CHAME quando ele quiser IR a uma área — 'quero mexer na agenda', 'cadê minha landing', 'me leva pro perfil', 'como configuro o WhatsApp' — ou quando o próximo passo que você sugerir exigir uma tela específica. Use a ROTA EXATA do MAPA DA PLATAFORMA (campo entre parênteses). Depois de chamar, continue a conversa em texto: diga o que ele vai encontrar lá e o que fazer. NÃO invente rotas.",
    input_schema: {
      type: "object",
      properties: {
        rota: { type: "string", description: "Rota EXATA do MAPA DA PLATAFORMA (ex.: '/admin/agenda', '/admin/landing'). Só rotas que aparecem no MAPA." },
        titulo: { type: "string", description: "Rótulo curto do atalho/botão. Ex.: 'Agenda', 'Minha página', 'Meu perfil', 'Conectar WhatsApp'." },
      },
      required: ["rota", "titulo"],
    },
  },
  {
    name: "salvar_dado_cadastro",
    description:
      "GRAVA no perfil um dado factual que o profissional informou: o NOME dele ou a ATIVIDADE/profissão/área de atuação. CHAME SEMPRE que ele disser ou corrigir o nome ('na verdade meu nome é Carlos', 'está errado, é X') OU disser o que faz ('sou desenvolvedor React', 'trabalho com criação de produtos digitais', 'sou nutricionista'). Grava direto, sem precisar gerar nada antes. É isso que faz o site (e a geração de landing/conteúdo) refletir quem ele é de verdade — NÃO deixe a atividade só na conversa. Depois confirme em 1 frase.",
    input_schema: {
      type: "object",
      properties: {
        campo: { type: "string", description: "'nome' (nome do profissional) ou 'atividade' (profissão / área / o que ele faz)." },
        valor: { type: "string", description: "O valor a gravar. Ex.: 'Carlos Carneiro' ou 'Desenvolvedor React, criação de produtos digitais'." },
      },
      required: ["campo", "valor"],
    },
  },
  {
    name: "consultar_agenda",
    description:
      "Lista os agendamentos do profissional num período. CHAME quando ele perguntar sobre a agenda ('o que tenho hoje?', 'agenda da semana') E SEMPRE antes de cancelar algo (pra ver e pegar os IDs). Retorna data, hora, nome e telefone do paciente, status e o appointment_id.",
    input_schema: {
      type: "object",
      properties: {
        periodo: { type: "string", enum: ["hoje", "amanha", "proximas_horas", "semana", "proximos_7_dias", "data_especifica"], description: "Período a consultar." },
        horas: { type: "number", description: "Quantidade de horas à frente, OBRIGATÓRIO quando periodo='proximas_horas' (ex.: 3 = próximas 3 horas de hoje)." },
        data: { type: "string", description: "Data YYYY-MM-DD, obrigatório quando periodo='data_especifica'." },
      },
      required: ["periodo"],
    },
  },
  {
    name: "cancelar_agendamentos",
    description:
      "Cancela (marca status=cancelled) UM ou VÁRIOS agendamentos pelos IDs. SÓ CHAME depois de mostrar quais agendamentos serão cancelados e o profissional CONFIRMAR explicitamente ('pode', 'cancela', 'sim'). NÃO avisa o paciente automaticamente — avise ele que ainda precisa avisar o paciente. Pegue os appointment_ids via consultar_agenda.",
    input_schema: {
      type: "object",
      properties: {
        appointment_ids: { type: "array", items: { type: "string" }, description: "Lista de appointment_id a cancelar (vindos de consultar_agenda)." },
      },
      required: ["appointment_ids"],
    },
  },
  {
    name: "preparar_video",
    description:
      "Prepara um VÍDEO pro profissional: gera o roteiro com IA no molde escolhido e deixa PRONTO na tela certa — lá ele revisa, escolhe a voz e confirma a geração (créditos cobrados só na geração, com confirmação). Dois tipos: 'conteudo' (reels/divulgação — abre no estúdio de vídeo) e 'institucional' (apresentação pessoal feita da FOTO dele, vai pra seção Sobre da página — abre no editor da landing; só moldes premium/pro pois a IA anima a foto). ANTES de chamar, SEMPRE pergunte o molde com os custos: 'gratis' (imagens de banco, 0 créditos; só tipo conteudo), 'premium' (IA Kling, ~8-16 créditos) ou 'pro' (roteiro Opus + Kling topo, ~16-32 créditos). Chame quando pedir 'quero um vídeo', 'reels sobre X', 'vídeo de apresentação pra minha página/seção sobre'.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["conteudo", "institucional"], description: "'conteudo' = reels/divulgação (padrão). 'institucional' = apresentação pessoal da foto pra seção Sobre da landing." },
        tema: { type: "string", description: "Tema do vídeo (obrigatório pra tipo conteudo). Ex.: 'ansiedade no trabalho'. No institucional é ignorado (usa a bio)." },
        molde: { type: "string", enum: ["gratis", "premium", "pro"], description: "Molde CONFIRMADO pelo profissional. Institucional aceita só premium/pro." },
        tom: { type: "string", enum: ["acolhedor", "educativo", "provocador", "motivacional"], description: "Tom do roteiro (padrão acolhedor; só tipo conteudo)." },
        duracao: { type: "string", enum: ["30s", "45s", "60s"], description: "Duração alvo (padrão 45s)." },
      },
      required: ["molde"],
    },
  },
  // ── TRÁFEGO PAGO (Especialista interno) ─────────────────────────────────────
  {
    name: "criar_campanha_ads",
    description:
      "Gera uma campanha Google Ads completa (rascunho) com IA. SOMENTE CHAME depois que o profissional confirmar EXPLICITAMENTE o brief completo (serviço, cidade, orçamento e diferencial) E autorizar a geração. Consome CRÉDITOS (10 por campanha) — mostre o custo e peça confirmação antes de chamar. Inclui gate de saldo: se insuficiente, retorna erro e orienta a recarregar.",
    input_schema: {
      type: "object",
      properties: {
        servico:          { type: "string",  description: "Serviço anunciado (ex.: 'Psicologia infantil')" },
        cidade:           { type: "string",  description: "Cidade e estado alvo (ex.: 'São Paulo, SP')" },
        raio_km:          { type: "number",  description: "Raio em km (opcional, padrão 20)" },
        orcamento_mensal: { type: "number",  description: "Orçamento mensal em R$ informado pelo profissional" },
        diferencial:      { type: "string",  description: "Diferencial ou especialidade principal" },
        publico:          { type: "string",  description: "Público-alvo (opcional)" },
        objective:        { type: "string",  enum: ["leads","agendamentos","whatsapp","trafego_landing"], description: "Objetivo principal da campanha" },
        data_inicio:      { type: "string",  description: "Data de início no formato YYYY-MM-DD (opcional; sem datas = campanha contínua)" },
        data_fim:         { type: "string",  description: "Data de fim no formato YYYY-MM-DD (opcional; precisa ser >= data_inicio)" },
      },
      required: ["servico", "cidade", "orcamento_mensal", "objective"],
    },
  },
  {
    name: "consultar_campanhas_ads",
    description:
      "Lista as campanhas Google Ads do profissional com status, orçamento e métricas básicas. Use quando ele perguntar sobre campanhas existentes, quiser ver o status, ou antes de sugerir alterações.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filtrar por status (opcional): draft, approved, active, paused" },
      },
    },
  },
  {
    name: "atualizar_campanha_ads",
    description:
      "Atualiza um campo de uma campanha (orçamento, status). SOMENTE CHAME após confirmação explícita do profissional mostrando o valor atual e o novo. Mudança de status para 'approved' significa que o profissional revisou e aprovou o rascunho.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id:          { type: "string", description: "ID da campanha (de consultar_campanhas_ads)" },
        daily_budget_brl:     { type: "number", description: "Novo orçamento diário em R$ (opcional)" },
        max_daily_budget_brl: { type: "number", description: "Novo teto de orçamento diário em R$ (opcional)" },
        status:               { type: "string", enum: ["approved","paused","archived"], description: "Novo status (opcional)" },
      },
      required: ["campaign_id"],
    },
  },
]

// =============================================
// SYSTEM PROMPT DO AXEL
// =============================================
function buildSystemPrompt(opts: {
  professional: any
  memoryFacts: Array<{ key: string; value: string }>
  now: string
  kbSections: Array<{ key: string; title: string; route?: string; keywords?: string[] }>
  profileGaps: string[]
}): string {
  const { professional, memoryFacts, now, kbSections, profileGaps } = opts
  const rawFirst = professional?.full_name?.split(" ")?.[0] || ""
  const proName = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase() : "você"

  const memoriaStr = memoryFacts.length > 0
    ? memoryFacts.map((m) => `• ${m.key}: ${m.value}`).join("\n")
    : "(ainda não conheço fatos sobre este profissional — descubra com naturalidade e use salvar_memoria)"

  const gapsStr = profileGaps.length > 0
    ? profileGaps.map((g) => `• ${g}`).join("\n")
    : "(já conheço o essencial — foque em fazê-lo prosperar: sugira o próximo passo de valor)"

  const mapaStr = (kbSections && kbSections.length > 0)
    ? kbSections.map((s) => {
        const rota = s.route ? ` (${s.route})` : ""
        const kws = Array.isArray(s.keywords) && s.keywords.length ? ` — palavras: ${s.keywords.join(", ")}` : ""
        return `• [${s.key}] ${s.title}${rota}${kws}`
      }).join("\n")
    : "(nenhuma seção de conhecimento cadastrada ainda)"

  return `Você é o Axel, o copiloto inteligente do profissional dentro da plataforma PrimeiroPasso.
Você NÃO é um robô de FAQ: você é o GERENTE DE SUCESSO de ${proName} — existe pra ele PROSPERAR usando a plataforma.

━━━ SUA MISSÃO (duas engrenagens de um mesmo loop) ━━━
1. CONHECER ${proName}: descobrir, aos poucos e com naturalidade, quem ele é e o que quer (nome, profissão/nicho, objetivo com a plataforma, objetivo profissional).
2. FAZER ELE PROSPERAR: guiar pra usar os produtos (landing, conteúdo, agenda, WhatsApp) entregando valor de verdade. Quanto mais você conhece, melhor personaliza o próximo passo — conhecer alimenta o sucesso, e cada passo revela mais.

━━━ QUEM É VOCÊ ━━━
• Nome: Axel. Papel: gerente de sucesso + produtor de conteúdo do profissional.
• Tom: amigável, mas SOBRETUDO objetivo. Linguagem simples, sem corporativês.
• BREVIDADE É REGRA: 1 a 3 frases por mensagem, no MÁXIMO. Uma ideia por vez, direto ao ponto. Nunca liste mais de 3 itens. Corte saudações longas, floreios e resumos do que ele já sabe. Se cabe em 1 frase, use 1 frase. No máximo 1 emoji por mensagem (ou nenhum).
• FORMATAÇÃO: escreva em TEXTO PURO — o chat NÃO renderiza markdown. NÃO use \`**\` para negrito, nem \`#\`, nem \`*\` em listas. Para passos, numere (1., 2., 3.) em linhas separadas. Para destacar, use o próprio texto, nunca asteriscos.
• Você fala COM ${proName} na SEGUNDA pessoa ("você").

━━━ COM QUEM VOCÊ FALA ━━━
• Profissional: ${professional?.full_name || "(nome ainda não informado)"}
${(professional as any)?.email ? `• Email: ${(professional as any).email}` : ""}
${professional?.category ? `• Área/categoria: ${professional.category}${professional.category_custom ? ` (${professional.category_custom})` : ""}` : ""}
Você JÁ conhece o nome dele (acima). Chame-o pelo primeiro nome com naturalidade e NÃO pergunte "como posso te chamar?" nem dados que já estão aqui.

━━━ O QUE EU JÁ SEI SOBRE ELE (memória) ━━━
${memoriaStr}

━━━ O QUE AINDA PRECISO DESCOBRIR ━━━
${gapsStr}
Como descobrir SEM interrogatório:
• Embrulhe a descoberta numa entrega de valor ("pra eu já deixar sua landing com a sua cara: você atende mais ansiedade, casais ou infantil?"). A pergunta nunca é gratuita.
• INFIRA do que ele disser e salve com \`salvar_memoria\` SEM perguntar; só pergunte o que não der pra inferir.
• Disse o NOME ou a ATIVIDADE/profissão? NÃO basta lembrar: chame \`salvar_dado_cadastro\` pra GRAVAR no perfil — é o que faz o site e a geração de landing/conteúdo refletirem a área REAL dele (corrige o padrão "psicologia"). ANTES de gerar landing ou artigo, garanta que a atividade real está gravada.
• No MÁXIMO 1 descoberta por resposta, e só quando couber naturalmente. Nunca interrogue.

━━━ HOJE: ${now} ━━━

━━━ MAPA DA PLATAFORMA (base de conhecimento) ━━━
Estas são as seções disponíveis. Para abrir o passo a passo/detalhe de QUALQUER uma, chame \`consultar_secao\` com a [key]. NÃO responda "como fazer" de cabeça — abra a seção primeiro.
${mapaStr}

━━━ COMO AGIR ━━━
1. RELACIONAMENTO: use a memória pra dar continuidade ("semana passada você queria publicar a landing..."). Descobriu um fato novo e relevante? Chame \`salvar_memoria\` SEM avisar.
2. ENSINAR: pra dúvida de COMO a plataforma funciona, identifique a seção no MAPA e chame \`consultar_secao\` com a [key] ANTES de responder.
3. EDITAR/IR A UMA ÁREA = LEVE DIRETO: se ele pede pra editar/ver/configurar/mexer numa área (landing, agenda, perfil, WhatsApp, conteúdo) ou quer IR até lá, chame \`abrir_pagina\` IMEDIATAMENTE (rota do MAPA) e diga em 1 frase o que fazer lá. NÃO pergunte "aqui ou na página?" nesses casos. Só ofereça resolver no PRÓPRIO chat quando for gerar TEXTO (bio, artigo, ou textos da landing via \`gerar_landing\`/\`sugerir_dados_perfil\`/\`criar_artigo\`) e ele NÃO tiver pedido pra ir à tela.
4. PRÓXIMO PASSO (sempre): termine cada resposta com UM passo concreto rumo ao objetivo dele. Use \`ler_estado_perfil\` pra saber o que falta e priorize pelo objetivo declarado.
5. Se nenhuma seção do MAPA cobrir, seja honesto ("vou confirmar pra não te passar errado") — NÃO invente.

━━━ AGENDA ━━━
Você gerencia a agenda dele. Para qualquer pedido sobre agendamentos:
1. SEMPRE use \`consultar_agenda\` primeiro — não invente horários. Para "furei o pneu / não atendo nas próximas X horas", use periodo='proximas_horas' com horas=X.
2. CANCELAR: mostre os agendamentos afetados (dia · hora · paciente) e PEÇA confirmação clara. Só então chame \`cancelar_agendamentos\` com os appointment_id. Depois, AVISE que o paciente ainda não foi notificado automaticamente e ofereça o telefone pra ele avisar.
3. Remarcar e avisar o paciente automaticamente ainda estão sendo construídos — seja honesto, não prometa o que ainda não faz.

━━━ REGRAS ABSOLUTAS ━━━
• Você EXECUTA, não só orienta: pode gerar e aplicar conteúdo de perfil/landing, criar artigos e preparar vídeos (\`preparar_video\`) — SEMPRE mostrando o resultado e pedindo confirmação explícita ANTES de gravar ou gastar créditos.
• NÃO invente recursos, telas, preços ou botões. Fundamente em \`consultar_secao\`.
• VALOR PRIMEIRO: ajude de verdade — o consumo é consequência, não empurrão. 1 pergunta/CTA por resposta. Se ele disser "não agora", registre com \`salvar_memoria\` e recue; não insista no mesmo assunto.
• Brevidade sempre. Reconheça o que ele trouxe antes de responder.

━━━ TRÁFEGO PAGO (Especialista interno) ━━━
Você tem acesso a ferramentas de Google Ads. Use-as quando o profissional quiser atrair clientes via anúncios pagos.
Meta Ads (Instagram/Facebook): campanhas Click-to-WhatsApp são criadas PELA TELA — chame \`abrir_pagina('/admin/trafego-pago?tab=meta')\` e oriente o botão "Criar campanha" (mesmos 10 créditos). A tool \`criar_campanha_ads\` é SÓ Google por enquanto — NÃO a use pra Meta. Publicação Meta é guiada (checklist na campanha aprovada); detalhes na seção meta-ads-publicar do MAPA. Criativos (imagem/carrossel) são gerados na própria campanha com planos Grátis/Premium/PRO; vídeo vai pro estúdio com roteiro pronto.

ANTES de qualquer geração, diga EXPLICITAMENTE o custo em créditos e aguarde confirmação ("Isso vai custar 10 créditos. Confirma?"). Só então chame \`criar_campanha_ads\`.

COLETANDO INFORMAÇÕES (obrigatórias — não pule):
1. Serviço principal (ex: "terapia de casal", "psicoterapia infantil")
2. Cidade e raio aproximado (ex: "São Paulo, 10 km")
3. Orçamento mensal em R$ (ex: "R$ 600/mês")
4. Objetivo: "leads" (WhatsApp/contato) ou "awareness" (visibilidade)
Opcionais (melhora a campanha): diferencial, público-alvo específico, PERÍODO (data de início e fim em data_inicio/data_fim — pergunte "quer rodar por um período específico ou deixar contínua?"; sem datas = contínua).

APÓS CRIAR: chame \`abrir_pagina('/admin/trafego-pago')\` para que ele revise os textos e aprove. Rascunho criado = pronto pra revisar, não publicado. Para publicar no Google Ads, o profissional precisará de uma conta Google Ads vinculada (oriente ao clicar em "Como publicar" na página).

CONSULTAR/ATUALIZAR campanhas: use \`consultar_campanhas_ads\` / \`atualizar_campanha_ads\`. Status "aprovada" = ele revisou e quer publicar; "pausada" = campanha ativa pausada; "arquivada" = descartada.

NUNCA crie sem confirmar custo. NUNCA prometa que a campanha vai ao ar sozinha — publicação é manual no Google Ads Editor.

━━━ CRIAÇÃO DE VÍDEO (3 moldes) ━━━
Quando ele quiser vídeo (reels, divulgação, conteúdo), apresente os 3 moldes e PERGUNTE qual:
• GRÁTIS — imagens de banco + narração, sai agora, 0 créditos. Bom pra manter constância.
• PREMIUM — cinematográfico com IA (Kling), ~8-16 créditos conforme a duração. Roteiro caprichado.
• PRO — roteiro com a IA mais avançada (Opus) + Kling topo de linha, ~16-32 créditos. O melhor disponível.
Com tema + molde confirmados, chame \`preparar_video\`. O roteiro é GRÁTIS em qualquer molde — o crédito só é cobrado quando ele confirmar a GERAÇÃO no estúdio (a tela mostra o custo antes). Após a tool, chame \`abrir_pagina\` com a rota exata que ela devolver na instrucao.
VÍDEO INSTITUCIONAL (seção Sobre): se ele quiser "vídeo de apresentação", "me apresentar na minha página", use \`preparar_video\` com tipo='institucional' — a IA escreve o roteiro a partir da bio e ANIMA A FOTO dele (movimento natural + narração + legendas; SEM sincronia labial — seja transparente). Só premium (~8 cr) ou pro (~16 cr). Ao concluir na tela, o vídeo entra sozinho na seção Sobre.
Os fluxos manuais (Redes Sociais > Criar Vídeo, Estúdio Viral) continuam existindo — se ele preferir fazer na mão, oriente o caminho.

━━━ KIT DIVULGAÇÃO (molde PRO) ━━━
Quando ele pedir pra "divulgar meu trabalho/serviço" de forma completa, ofereça o KIT: artigo (grátis) + vídeo PRO (~16-32 cr) + campanha de anúncio Google ou Meta (10 cr) + imagens dos criativos (1-2 cr). Apresente a SOMA transparente peça a peça ANTES ("kit completo: artigo grátis + vídeo ~16 + campanha 10 + imagens ~2 = ~28 créditos. Fecho?"). Com o OK, execute NA ORDEM, um de cada vez, confirmando cada entrega: 1) \`criar_artigo\` → 2) \`preparar_video\` molde pro → 3) campanha (\`criar_campanha_ads\` pra Google; Meta é pela tela ?tab=meta) → 4) criativos na própria campanha. Nunca dispare tudo de uma vez sem ele acompanhar.`
}

// =============================================
// GERAÇÃO DE TEXTO (perfil/landing) — direto na Anthropic (sem edge-to-edge frágil)
// =============================================
const PERFIL_PROMPTS: Record<string, (c: any) => string> = {
  bio: (c) => `Escreva uma biografia profissional em primeira pessoa para ${c.name}${c.crp ? ` (${c.crp})` : ""}${c.specialty ? `, especialista em ${c.specialty}` : ""}. 2 a 3 parágrafos curtos, calorosa, humana e profissional, voltada a atrair clientes. Responda APENAS com o texto da bio, sem títulos.`,
  hero_title: (c) => `Crie um título de destaque (hero) curto e magnético para a landing page de ${c.name}${c.specialty ? `, ${c.specialty}` : ""}. No máximo 8 palavras. Responda APENAS com o título.`,
  hero_subtitle: (c) => `Crie um subtítulo de 1 a 2 frases para a landing de ${c.name}${c.specialty ? `, ${c.specialty}` : ""}, complementando o título e convidando ao agendamento. Responda APENAS com o subtítulo.`,
  pain_title: (c) => `Crie um título curto e empático para a seção de DORES (problemas que o cliente sente) na landing de um(a) ${c.specialty || "profissional"}. Responda APENAS com o título.`,
  pain_subtitle: (c) => `Crie um subtítulo curto para a seção de dores na landing de um(a) ${c.specialty || "profissional"}. Responda APENAS com o subtítulo.`,
  pain_items: (c) => `Liste 4 dores ou problemas comuns que levam alguém a procurar um(a) ${c.specialty || "profissional"}. Responda APENAS com um array JSON de 4 strings curtas, sem comentários e sem cercas de código. Ex: ["...","...","...","..."]`,
  solution_title: (c) => `Crie um título curto e acolhedor para a seção de SOLUÇÃO na landing de um(a) ${c.specialty || "profissional"}. Responda APENAS com o título.`,
  solution_subtitle: (c) => `Crie um subtítulo curto para a seção de solução na landing de um(a) ${c.specialty || "profissional"}. Responda APENAS com o subtítulo.`,
  solution_items: (c) => `Liste 4 formas como um(a) ${c.specialty || "profissional"} ajuda seus clientes a melhorar. Responda APENAS com um array JSON de 4 strings curtas, sem comentários e sem cercas de código.`,
}

async function gerarTextoIA(campo: string, ctx: any, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente")
  const promptFn = PERFIL_PROMPTS[campo]
  if (!promptFn) throw new Error(`campo não suportado: ${campo}`)
  const resp = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 800, messages: [{ role: "user", content: promptFn(ctx) }] }),
  })
  if (!resp.ok) throw new Error(`Claude ${resp.status}: ${(await resp.text()).slice(0, 150)}`)
  const data = await resp.json()
  let txt = (data.content?.find((b: any) => b.type === "text")?.text || "").trim()
  // remove cercas de código (relevante para os campos _items em JSON)
  txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  return txt
}

// =============================================
// TOOL HANDLERS
// =============================================
async function handleToolCall(
  toolName: string,
  args: any,
  supabaseAdmin: any,
  professionalId: string,
  kbSections: Array<{ key: string; title: string; route?: string; body: string }>,
): Promise<any> {
  if (toolName === "consultar_secao") {
    const key = (args.key || "").toString().trim()
    if (!key) return { erro: "key obrigatória" }

    const sec = (kbSections || []).find((s) => s.key === key)
    if (!sec) {
      return {
        encontrado: false,
        instrucao: "Não existe seção com essa chave. Veja o MAPA DA PLATAFORMA e tente a [key] correta; se nada cobrir, seja honesto e diga que vai confirmar pra não passar errado.",
      }
    }
    return {
      encontrado: true,
      titulo: sec.title,
      rota: sec.route || null,
      conteudo: sec.body,
      instrucao: "USE o conteúdo pra responder com naturalidade (não cole o texto cru). Aponte o caminho na plataforma (rota) quando fizer sentido. Seja breve.",
    }
  }

  if (toolName === "ler_estado_perfil") {
    const { data: prof } = await supabaseAdmin
      .from("professionals")
      .select("full_name, crp, bio, landing_published, category")
      .eq("id", professionalId)
      .maybeSingle()

    const [{ count: availCount }, { count: articles }, { count: videos }] = await Promise.all([
      supabaseAdmin.from("availability").select("id", { count: "exact", head: true }).eq("professional_id", professionalId),
      supabaseAdmin.from("articles").select("id", { count: "exact", head: true }).eq("professional_id", professionalId),
      supabaseAdmin.from("videos").select("id", { count: "exact", head: true }).eq("professional_id", professionalId),
    ])

    let subscriptionActive = false
    try {
      const { data: sub } = await supabaseAdmin
        .from("subscriptions")
        .select("status")
        .eq("professional_id", professionalId)
        .maybeSingle()
      subscriptionActive = (sub as any)?.status === "active"
    } catch (_) { /* tabela pode não existir */ }

    const profileComplete = !!(prof?.full_name && prof?.crp && prof?.bio)
    const agendaConfigured = (availCount ?? 0) > 0
    // landing_published é coluna GENERATED no banco (ignora hero_title, que tem DEFAULT).
    // Ver migration 20260609_axel_landing_published.sql.
    const landingPublished = !!prof?.landing_published
    const firstContentCreated = ((articles ?? 0) + (videos ?? 0)) > 0

    const itens = {
      perfil_completo: profileComplete,
      agenda_configurada: agendaConfigured,
      landing_publicada: landingPublished,
      primeiro_conteudo_criado: firstContentCreated,
      assinatura_ativa: subscriptionActive,
    }
    const done = Object.values(itens).filter(Boolean).length
    const total = Object.keys(itens).length

    return {
      ...itens,
      progresso: Math.round((done / total) * 100),
      concluidos: done,
      total,
      instrucao: "Use isso pra sugerir UM próximo passo concreto (o mais impactante que ainda falta). Não despeje a lista inteira — foque no próximo passo.",
    }
  }

  if (toolName === "salvar_memoria") {
    const chave = (args.chave || "").toString().trim()
    const valor = (args.valor ?? "").toString().trim()
    if (!chave || !valor) return { erro: "chave e valor são obrigatórios" }

    const { error } = await supabaseAdmin
      .from("axel_user_memory")
      .upsert(
        { professional_id: professionalId, key: chave, value: valor, updated_at: new Date().toISOString() },
        { onConflict: "professional_id,key" },
      )
    if (error) {
      console.error("[salvar_memoria] erro:", error.message)
      return { erro: error.message }
    }
    console.log(`[salvar_memoria] ${chave}=${valor}`)
    return { sucesso: true, chave, valor }
  }

  // ============ FASE 3 — TOOLS DE EXECUÇÃO ============

  if (toolName === "sugerir_dados_perfil" || toolName === "gerar_landing") {
    const campo = toolName === "gerar_landing" ? null : (args.campo || "").toString().trim()
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || ""

    // Busca dados do profissional para contexto
    const { data: prof } = await supabaseAdmin
      .from("professionals")
      .select("full_name, crp, category, category_custom")
      .eq("id", professionalId)
      .maybeSingle()

    const ctx = {
      name: prof?.full_name || "Profissional",
      crp: prof?.crp,
      // category_custom (atividade que o profissional informou) tem prioridade sobre o category padrão
      specialty: prof?.category_custom || prof?.category || "",
    }

    if (toolName === "gerar_landing") {
      const campos = ["hero_title", "hero_subtitle", "pain_title", "pain_subtitle", "pain_items", "solution_title", "solution_subtitle", "solution_items", "bio"]
      const resultados: Record<string, any> = {}
      for (const c of campos) {
        try {
          resultados[c] = await gerarTextoIA(c, ctx, apiKey)
        } catch (e: any) {
          console.error(`[gerar_landing] campo ${c} erro:`, e.message)
          resultados[c] = "erro ao gerar"
        }
      }
      return {
        ...resultados,
        instrucao: "MOSTRE esse preview para o profissional de forma organizada. Pergunte se ele quer aplicar na landing (use atualizar_perfil para cada campo) ou ajustar algo específico. NÃO aplique automaticamente — espere a confirmação EXPLÍCITA dele.",
      }
    }

    if (!campo) return { erro: "campo obrigatório para sugerir_dados_perfil" }
    try {
      const resultado = await gerarTextoIA(campo, ctx, apiKey)
      return {
        campo,
        resultado,
        instrucao: "MOSTRE o resultado para o profissional. Pergunte se ele quer APLICAR (chame atualizar_perfil com o campo e valor). NÃO aplique automaticamente — espere a confirmação EXPLÍCITA dele.",
      }
    } catch (e: any) {
      console.error("[sugerir_dados_perfil] erro:", e.message)
      return { erro: e.message, instrucao: "Avise o profissional que houve um erro técnico ao gerar conteúdo. Peça pra tentar de novo em instantes." }
    }
  }

  if (toolName === "atualizar_perfil") {
    const campo = (args.campo || "").toString().trim()
    const valor = (args.valor ?? "").toString().trim()
    if (!campo || !valor) return { erro: "campo e valor são obrigatórios" }

    // Campos diretos na tabela professionals
    const camposDiretos = ["bio", "hero_title", "hero_subtitle", "pain_title", "pain_subtitle", "solution_title", "solution_subtitle"]
    if (camposDiretos.includes(campo)) {
      const payload: any = { [campo]: valor }
      const { error } = await supabaseAdmin
        .from("professionals")
        .update(payload)
        .eq("id", professionalId)
      if (error) {
        console.error("[atualizar_perfil] erro:", error.message)
        return { erro: error.message, instrucao: "Avise o profissional que houve erro ao salvar. Peça pra tentar de novo." }
      }
      console.log(`[atualizar_perfil] ${campo} atualizado para ${professionalId}`)
      return { sucesso: true, campo, instrucao: "Confirme pro profissional que o campo foi salvo com sucesso. Pergunte se ele quer ajustar mais alguma coisa." }
    }

    // Campos JSON (pain_items, solution_items)
    if (campo === "pain_items" || campo === "solution_items") {
      try {
        let parsed = JSON.parse(valor)
        if (!Array.isArray(parsed)) return { erro: "valor deve ser um array JSON" }
        // Normaliza pro formato de OBJETOS que os componentes da landing esperam.
        // O gerador às vezes cospe strings cruas (["dor"]) — salvar assim quebrava a landing.
        if (campo === "pain_items") {
          parsed = parsed.map((it: any) => (typeof it === "string" ? { text: it } : it))
        } else {
          parsed = parsed.map((it: any) => (typeof it === "string" ? { title: it, desc: "" } : it))
        }
        const payload: any = { [campo]: parsed }
        const { error } = await supabaseAdmin
          .from("professionals")
          .update(payload)
          .eq("id", professionalId)
        if (error) {
          console.error("[atualizar_perfil] erro:", error.message)
          return { erro: error.message, instrucao: "Avise o profissional que houve erro ao salvar." }
        }
        console.log(`[atualizar_perfil] ${campo} atualizado (${parsed.length} itens)`)
        return { sucesso: true, campo, itens: parsed.length, instrucao: "Confirme pro profissional que o campo foi salvo com sucesso." }
      } catch {
        return { erro: "valor deve ser um JSON válido (array)", instrucao: "Peça pro profissional tentar de novo — o formato do JSON estava inválido." }
      }
    }

    return { erro: `campo desconhecido: ${campo}` }
  }

  if (toolName === "criar_artigo") {
    // Artigo é GRÁTIS na assinatura (regra de monetização 10/06/2026 — tarefa simples).
    const tema = (args.tema || "").toString().trim()

    // 1. Busca dados do profissional
    const { data: prof } = await supabaseAdmin
      .from("professionals")
      .select("full_name, crp, category, category_custom")
      .eq("id", professionalId)
      .maybeSingle()

    // 2. Busca títulos existentes para evitar duplicação
    const { data: existingArticles } = await supabaseAdmin
      .from("articles")
      .select("title, cover_image_url")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false })
      .limit(20)
    const existingTitles = (existingArticles || []).map((a: any) => a.title).filter(Boolean)
    const existingCoverUrls = (existingArticles || []).map((a: any) => a.cover_image_url).filter(Boolean)

    // 3. Chama generate-text para criar o artigo
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

    try {
      const ctx: any = {
        name: prof?.full_name || "Profissional",
        crp: prof?.crp,
        specialty: prof?.category_custom || prof?.category || "",
        existing_titles: existingTitles,
        existing_cover_urls: existingCoverUrls,
        existing_carousel_urls: [],
      }
      if (tema) ctx.topic = tema

      const res = await fetch(`${supabaseUrl}/functions/v1/generate-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
        body: JSON.stringify({ field: "article_with_carousel", context: ctx }),
      })
      if (!res.ok) {
        return { erro: `generate-text retornou ${res.status}`, instrucao: "Avise o profissional que houve erro ao gerar o artigo." }
      }
      const data = await res.json()
      const artigo = data.result

      if (!artigo || !artigo.title) {
        return { erro: "resposta vazia da IA", instrucao: "Avise o profissional que a geração falhou. Peça pra tentar com outro tema." }
      }

      // 4. Gera slug único a partir do título
      const slugBase = artigo.title
        .toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 70)
      const slug = `${slugBase}-${Date.now().toString(36)}`

      // 5. Salva o artigo com schema correto (cover_image_url, carousel_items, published)
      const carouselItems = artigo.carousel_items || []
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("articles")
        .insert({
          professional_id: professionalId,
          title: artigo.title,
          slug,
          content: artigo.content || "",
          cover_image_url: artigo.cover_image_url || "",
          carousel_items: carouselItems.map((item: any) => ({
            image_url: item.image_url || "",
            caption: item.caption || "",
          })),
          published: false,
        })
        .select("id")
        .single()

      if (insertErr) {
        console.error("[criar_artigo] erro insert:", insertErr.message)
        return { erro: insertErr.message, instrucao: "Avise o profissional que houve erro ao salvar o artigo." }
      }

      console.log(`[criar_artigo] artigo ${inserted?.id} criado (slug: ${slug})`)
      return {
        sucesso: true,
        artigo_id: inserted?.id,
        titulo: artigo.title,
        instrucao: "Confirme que o artigo foi criado. Diga que está como rascunho e ele pode revisar e publicar em Redes Sociais > Artigos. Chame abrir_pagina com '/admin/redes-sociais?tab=artigos' para levá-lo diretamente.",
      }
    } catch (e: any) {
      return { erro: e.message, instrucao: "Avise o profissional que houve erro técnico ao gerar o artigo." }
    }
  }

  if (toolName === "salvar_dado_cadastro") {
    const campo = (args.campo || "").toString().trim().toLowerCase()
    const valor = (args.valor ?? "").toString().trim()
    if (!campo || !valor) return { erro: "campo e valor são obrigatórios" }

    if (campo === "nome") {
      // profiles é a FONTE DE VERDADE da identidade; espelha em professionals
      // pro que ainda lê de lá (landing pública, etc.).
      const { error: e1 } = await supabaseAdmin.from("professionals").update({ full_name: valor }).eq("id", professionalId)
      const { data: pr } = await supabaseAdmin.from("professionals").select("user_id").eq("id", professionalId).maybeSingle()
      if (pr?.user_id) await supabaseAdmin.from("profiles").update({ full_name: valor }).eq("user_id", pr.user_id)
      if (e1) return { erro: e1.message, instrucao: "Avise que houve erro ao salvar o nome." }
      console.log(`[salvar_dado_cadastro] nome=${valor}`)
      return { sucesso: true, campo, instrucao: "Confirme em 1 frase que salvou o nome e use o novo nome daqui pra frente." }
    }

    if (campo === "atividade" || campo === "profissao" || campo === "profissão") {
      const { error } = await supabaseAdmin.from("professionals").update({ category_custom: valor }).eq("id", professionalId)
      if (error) return { erro: error.message, instrucao: "Avise que houve erro ao salvar a atividade." }
      console.log(`[salvar_dado_cadastro] atividade=${valor}`)
      return { sucesso: true, campo, instrucao: "Confirme em 1 frase que registrou a atividade. Agora a landing/conteúdo gerado vai refletir a área real dele, não mais o padrão de psicologia." }
    }

    return { erro: "campo deve ser 'nome' ou 'atividade'" }
  }

  if (toolName === "preparar_video") {
    const tipo = (args.tipo || "conteudo").toString().trim()
    const tema = (args.tema || "").toString().trim()
    const molde = (args.molde || "").toString().trim()
    if (tipo === "conteudo" && !tema) return { erro: "tema_obrigatorio", instrucao: "Pergunte qual o tema do vídeo." }
    if (!["gratis", "premium", "pro"].includes(molde)) {
      return { erro: "molde_invalido", instrucao: "Pergunte o molde (gratis, premium ou pro) apresentando os custos antes." }
    }
    if (tipo === "institucional" && molde === "gratis") {
      return { erro: "institucional_sem_gratis", instrucao: "O vídeo institucional anima a foto com IA — só existe em premium (~8 créditos) ou pro (~16). Pergunte qual ele prefere." }
    }

    // A video-api identifica o profissional pelo slug
    const { data: profV } = await supabaseAdmin
      .from("professionals").select("slug, photo_url, about_image_url").eq("id", professionalId).maybeSingle()
    const slug = (profV as any)?.slug
    if (!slug) {
      return { erro: "sem_slug", instrucao: "Avise que o perfil ainda não tem página publicada — oriente a completar o perfil antes de criar vídeos." }
    }
    if (tipo === "institucional" && !(profV as any)?.photo_url && !(profV as any)?.about_image_url) {
      return { erro: "sem_foto", instrucao: "O vídeo institucional é feito da FOTO dele e não há foto no perfil. Oriente a adicionar a foto em Perfil (ou na seção Sobre da landing) primeiro." }
    }

    // URL pública hardcoded (serviço interno estável; não depender de env ausente)
    const VIDEO_API = "https://video-api.primeiropasso.online"
    // Molde PRO usa Opus no roteiro; premium/gratis seguem o Sonnet padrão da video-api
    const model = molde === "pro" ? "claude-opus-4-8" : ""

    try {
      // 1. Gera o roteiro (grátis — assinatura; crédito só na geração do vídeo)
      const endpoint = tipo === "institucional" ? "/gerar-roteiro-institucional" : "/gerar-roteiro"
      const payload = tipo === "institucional"
        ? { professional_slug: slug, duracao_alvo: (args.duracao || "40s").toString(), model }
        : {
            professional_slug: slug,
            tema_sugerido: tema,
            tom: (args.tom || "acolhedor").toString(),
            duracao_alvo: (args.duracao || "45s").toString(),
            plataforma: "instagram",
            formato: "livre",
            model,
          }
      const rRes = await fetch(`${VIDEO_API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!rRes.ok) {
        const err = await rRes.json().catch(() => ({}))
        return { erro: `roteiro_falhou_${rRes.status}`, instrucao: `A geração do roteiro falhou (${err.detail ?? rRes.status}). Avise e sugira tentar de novo em instantes.` }
      }
      const roteiro = await rRes.json()

      // 2. Salva como rascunho — vira o vídeo aberto no estúdio via ?edit=
      const sRes = await fetch(`${VIDEO_API}/salvar-rascunho`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professional_slug: slug, roteiro, format: "portrait" }),
      })
      if (!sRes.ok) {
        return { erro: "rascunho_falhou", instrucao: "O roteiro saiu mas não consegui salvar o rascunho. Peça pra tentar de novo." }
      }
      const { draft_id } = await sRes.json()

      if (tipo === "institucional") {
        return {
          sucesso: true,
          draft_id,
          titulo: roteiro.titulo,
          molde,
          instrucao: `Roteiro de apresentação "${roteiro.titulo}" pronto. Chame abrir_pagina('/admin/landing?gerarVideoSobre=${draft_id}&model=${molde}', título 'Vídeo da seção Sobre'). Diga que a tela abre com o roteiro carregado: ele revisa o texto, escolhe a voz e confirma a geração (custo em créditos visível antes). Ao terminar, o vídeo entra SOZINHO na seção Sobre da página dele. Lembre: a foto ganha movimento natural com narração — não é sincronia labial.`,
        }
      }

      const tier = molde === "gratis" ? "gratuito" : molde
      return {
        sucesso: true,
        draft_id,
        titulo: roteiro.titulo,
        molde,
        instrucao: `Roteiro "${roteiro.titulo}" pronto no estúdio (molde ${molde}). Chame abrir_pagina('/admin/redes-sociais?tab=criar-video&edit=${draft_id}&model=${tier}', título 'Estúdio de vídeo'). Diga que lá ele revisa o roteiro, escolhe a voz e confirma a geração — ${molde === "gratis" ? "sem custo" : "o custo em créditos aparece ANTES de confirmar"}.`,
      }
    } catch (e) {
      return { erro: String(e), instrucao: "Avise que o estúdio de vídeo está indisponível agora; pra tentar em alguns minutos." }
    }
  }

  if (toolName === "abrir_pagina") {
    const rota = (args.rota || "").toString().trim()
    const titulo = (args.titulo || "").toString().trim() || "Abrir página"
    // Allowlist: só rotas que o MAPA conhece (curadas pelo admin) + base do onboarding.
    // Segurança: o Axel não navega pra caminho arbitrário.
    const rotasValidas = new Set<string>([
      ...(kbSections || []).map((s) => (s.route || "").trim()).filter(Boolean),
      "/admin", "/admin/perfil", "/admin/agenda", "/admin/landing",
      "/admin/clientes", "/admin/redes-sociais", "/admin/assinatura", "/admin/configuracoes",
      "/admin/trafego-pago", "/admin/trafego-pago?tab=relatorios", "/admin/redes-sociais?tab=artigos",
    ])
    // Exceções dinâmicas: rascunhos preparados pelo preparar_video
    const isEstudioEdit = /^\/admin\/redes-sociais\?tab=criar-video&edit=[0-9a-fA-F-]{36}(&model=(gratuito|premium|pro))?$/.test(rota)
    const isVideoSobre = /^\/admin\/landing\?gerarVideoSobre=[0-9a-fA-F-]{36}(&model=(premium|pro))?$/.test(rota)
    if (!rota.startsWith("/") || (!rotasValidas.has(rota) && !isEstudioEdit && !isVideoSobre)) {
      return {
        sucesso: false,
        erro: "rota_desconhecida",
        instrucao: "Essa rota não está no MAPA DA PLATAFORMA. Não invente caminhos — use a rota EXATA de uma seção do MAPA, ou apenas oriente em texto.",
      }
    }
    return {
      sucesso: true,
      rota,
      titulo,
      instrucao: "Pronto: o profissional foi levado a essa página (o chat segue aberto por cima). Continue em texto dizendo o que ele encontra lá e o próximo passo concreto — não repita a rota crua.",
    }
  }

  if (toolName === "consultar_agenda") {
    const periodo = (args.periodo || "").toString()
    const nowSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
    const pad = (n: number) => String(n).padStart(2, "0")
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const today = new Date(nowSP); today.setHours(0, 0, 0, 0)

    let dataInicio = ymd(today)
    let dataFim = ymd(today)
    let horaInicio: string | null = null
    let horaFim: string | null = null

    if (periodo === "hoje") {
      /* hoje */
    } else if (periodo === "amanha") {
      const t = new Date(today); t.setDate(t.getDate() + 1); dataInicio = ymd(t); dataFim = ymd(t)
    } else if (periodo === "proximas_horas") {
      const h = Number(args.horas) || 3
      horaInicio = `${pad(nowSP.getHours())}:${pad(nowSP.getMinutes())}:00`
      const fim = new Date(nowSP.getTime() + h * 3600 * 1000)
      horaFim = ymd(fim) !== ymd(nowSP) ? "23:59:59" : `${pad(fim.getHours())}:${pad(fim.getMinutes())}:00`
    } else if (periodo === "semana") {
      const day = today.getDay()
      const ini = new Date(today); ini.setDate(ini.getDate() + (day === 0 ? -6 : 1 - day))
      const fim = new Date(ini); fim.setDate(fim.getDate() + 6)
      dataInicio = ymd(ini); dataFim = ymd(fim)
    } else if (periodo === "proximos_7_dias") {
      const fim = new Date(today); fim.setDate(fim.getDate() + 6); dataFim = ymd(fim)
    } else if (periodo === "data_especifica") {
      if (!args.data) return { erro: "data obrigatória quando periodo='data_especifica'" }
      dataInicio = args.data; dataFim = args.data
    } else {
      return { erro: `período desconhecido: ${periodo}` }
    }

    let q = supabaseAdmin
      .from("appointments")
      .select("id, appointment_date, start_time, end_time, status, lead_id, leads(name, whatsapp)")
      .eq("professional_id", professionalId)
      .gte("appointment_date", dataInicio)
      .lte("appointment_date", dataFim)
      .in("status", ["pending", "confirmed"])
      .eq("appointment_type", "booking") // só agendamentos reais (corrige o .is(null) que falhava com DEFAULT)
      .is("block_type", null)            // exclui bloqueios de agenda
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true })
    if (horaInicio) q = q.gte("start_time", horaInicio)
    if (horaFim) q = q.lte("start_time", horaFim)

    const { data: appts, error } = await q
    if (error) { console.error("[consultar_agenda]", error.message); return { erro: error.message } }

    const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
    const lista = (appts || []).map((a: any) => ({
      appointment_id: a.id,
      data: a.appointment_date,
      dia_semana: dayNames[new Date(a.appointment_date + "T00:00:00").getDay()],
      hora: (a.start_time || "").slice(0, 5),
      paciente: a.leads?.name || "(sem nome)",
      telefone: a.leads?.whatsapp || null,
      status: a.status,
    }))

    return {
      periodo, data_inicio: dataInicio, data_fim: dataFim, total: lista.length, agendamentos: lista,
      instrucao: "Liste compacto (dia · hora · paciente · status). Vazio → diga sem rodeios. Pra cancelar, use os appointment_id e PEÇA confirmação antes.",
    }
  }

  if (toolName === "cancelar_agendamentos") {
    const ids = Array.isArray(args.appointment_ids) ? args.appointment_ids.filter(Boolean) : []
    if (ids.length === 0) return { erro: "appointment_ids vazio" }
    // Segurança: só cancela agendamentos DESTE profissional e que ainda estão ativos.
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .update({ status: "cancelled" })
      .in("id", ids)
      .eq("professional_id", professionalId)
      .in("status", ["pending", "confirmed"])
      .select("id")
    if (error) { console.error("[cancelar_agendamentos]", error.message); return { erro: error.message, instrucao: "Avise que houve erro ao cancelar." } }
    const n = (data || []).length
    console.log(`[cancelar_agendamentos] ${n} cancelado(s) para ${professionalId}`)
    return {
      sucesso: true, cancelados: n,
      instrucao: `Confirme que cancelou ${n} agendamento(s). AVISE que o paciente ainda NÃO foi notificado automaticamente (esse aviso pelo Axel está chegando em breve) — por ora ofereça o telefone pra ele avisar.`,
    }
  }

  // ── TRÁFEGO PAGO ──────────────────────────────────────────────────────────────

  if (toolName === "consultar_campanhas_ads") {
    const statusFilter = (args.status || "").toString().trim()
    let q = (supabaseAdmin as any)
      .from("ads_campaigns")
      .select("id, name, objective, status, daily_budget_brl, max_daily_budget_brl, landing_url, created_at")
      .eq("professional_id", professionalId)
      .eq("platform", "google_ads")
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(10)
    if (statusFilter) q = q.eq("status", statusFilter)

    const { data: camps, error: campErr } = await q
    if (campErr) return { erro: campErr.message, instrucao: "Avise que houve erro ao buscar campanhas." }

    const STATUS_PT: Record<string, string> = {
      draft: "rascunho", approved: "aprovada", published: "publicada",
      active: "ativa", paused: "pausada",
    }

    // Funil completo (visitas→leads→conversas→agendamentos + métricas Google quando houver)
    const { data: funnelRows } = await supabaseAdmin.rpc("get_ads_funnel_for", {
      p_professional_id: professionalId,
    })
    const funnelById = new Map(
      ((funnelRows as any[]) ?? []).map((f: any) => [f.campaign_id, f]),
    )

    const lista = (camps || []).map((c: any) => {
      const f = funnelById.get(c.id)
      return {
        id: c.id,
        nome: c.name,
        objetivo: c.objective,
        status: STATUS_PT[c.status] ?? c.status,
        orcamento_diario: `R$ ${Number(c.daily_budget_brl).toFixed(2)}`,
        teto_diario: `R$ ${Number(c.max_daily_budget_brl).toFixed(2)}`,
        landing_url: c.landing_url,
        criada_em: c.created_at?.slice(0, 10),
        funil: f ? {
          impressoes: Number(f.impressions) || 0,
          cliques: Number(f.clicks) || 0,
          investido: Number(f.cost_brl) > 0 ? `R$ ${Number(f.cost_brl).toFixed(2)}` : null,
          visitas_landing: Number(f.visitas) || 0,
          leads: Number(f.leads) || 0,
          conversas: Number(f.conversas) || 0,
          agendamentos: Number(f.agendamentos) || 0,
          custo_por_agendamento: Number(f.cost_brl) > 0 && Number(f.agendamentos) > 0
            ? `R$ ${(Number(f.cost_brl) / Number(f.agendamentos)).toFixed(2)}`
            : null,
        } : null,
      }
    })

    return {
      total: lista.length,
      campanhas: lista,
      instrucao: lista.length === 0
        ? "Nenhuma campanha encontrada. Ofereça criar uma com criar_campanha_ads se o profissional quiser."
        : "Liste as campanhas de forma compacta (nome · status · orçamento). Se o funil tiver números, destaque o que importa em 1 frase (ex: 'X leads e Y agendamentos vindos dos anúncios'); custo_por_agendamento é a métrica de ouro. impressoes/cliques zerados = campanha ainda não veicula no Google. Funil completo visual: abrir_pagina('/admin/trafego-pago?tab=relatorios').",
    }
  }

  if (toolName === "atualizar_campanha_ads") {
    const campaignId = (args.campaign_id || "").toString().trim()
    if (!campaignId) return { erro: "campaign_id obrigatório" }

    const updates: Record<string, any> = {}
    if (args.daily_budget_brl != null)     updates.daily_budget_brl     = Number(args.daily_budget_brl)
    if (args.max_daily_budget_brl != null) updates.max_daily_budget_brl = Number(args.max_daily_budget_brl)
    if (args.status)                        updates.status               = args.status

    if (Object.keys(updates).length === 0) return { erro: "nenhum campo pra atualizar" }

    const { error: updErr } = await (supabaseAdmin as any)
      .from("ads_campaigns")
      .update(updates)
      .eq("id", campaignId)
      .eq("professional_id", professionalId)
    if (updErr) return { erro: updErr.message, instrucao: "Avise que houve erro ao atualizar a campanha." }

    return {
      sucesso: true,
      atualizados: updates,
      instrucao: updates.status === "approved"
        ? "Campanha aprovada. Diga ao profissional que está pronta e ofereça o guia de publicação ('como publicar no Google Ads')."
        : "Campanha atualizada. Confirme as mudanças e chame abrir_pagina('/admin/trafego-pago') para mostrar o resultado.",
    }
  }

  if (toolName === "criar_campanha_ads") {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!apiKey) return { erro: "ANTHROPIC_API_KEY ausente", instrucao: "Avise que a geração IA não está disponível agora." }

    // Gate de créditos (view credit_balance SINGULAR)
    const { data: balRow } = await supabaseAdmin
      .from("credit_balance")
      .select("balance")
      .eq("professional_id", professionalId)
      .maybeSingle()
    const saldo: number = (balRow as any)?.balance ?? 0
    const CUSTO = 10
    if (saldo < CUSTO) {
      return {
        erro: "creditos_insuficientes",
        saldo_atual: saldo,
        custo: CUSTO,
        instrucao: `Avise que o saldo (${saldo} créditos) é insuficiente para criar a campanha (custo: ${CUSTO}). Sugira recarregar em /admin/assinatura.`,
      }
    }

    // Dados do profissional (slug para UTM)
    const { data: profData } = await supabaseAdmin
      .from("professionals")
      .select("slug")
      .eq("id", professionalId)
      .maybeSingle()
    const slug: string = (profData as any)?.slug ?? ""

    const servico:  string  = (args.servico  || "").toString()
    const cidade:   string  = (args.cidade   || "").toString()
    const raio_km:  number  = Number(args.raio_km  || 20)
    const mensal:   number  = Number(args.orcamento_mensal || 0)
    const diferencial: string = (args.diferencial || "").toString()
    const publico:  string  = (args.publico   || "pacientes adultos e/ou responsáveis").toString()
    const objective: string = (args.objective || "leads").toString()
    const dailyBudget = +(mensal / 30.4).toFixed(2)
    const maxDaily    = +(dailyBudget * 1.25).toFixed(2)
    // Período opcional (YYYY-MM-DD); sem datas = campanha contínua
    const reData = /^\d{4}-\d{2}-\d{2}$/
    const startDate: string | null = reData.test(args.data_inicio ?? "") ? args.data_inicio : null
    const endDate: string | null = reData.test(args.data_fim ?? "") ? args.data_fim : null
    if (startDate && endDate && endDate < startDate) {
      return { erro: "periodo_invalido", instrucao: "Avise que a data de fim precisa ser igual ou depois da de início e pergunte as datas de novo." }
    }

    // ID da campanha (gerado aqui para usar na landing_url)
    const campaignId: string = crypto.randomUUID()
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://primeiropasso.com.br"
    const landingUrl = slug
      ? `${siteUrl}/p/${slug}?utm_source=google&utm_medium=cpc&utm_campaign=${campaignId}`
      : siteUrl

    // Negativos seed do nicho de saúde
    const negSeed = ["grátis","gratuito","sus","curso","o que é","significado","como funciona"]

    const prompt = `Você é especialista certificado em Google Ads para profissionais de saúde.
Gere uma campanha Search completa, pronta para importar no Google Ads Editor.

BRIEF:
- Serviço: ${servico}
- Cidade/raio: ${cidade} (raio ~${raio_km} km)
- Orçamento mensal: R$ ${mensal}
- Diferencial: ${diferencial || "não informado"}
- Público: ${publico}
- URL de destino: ${landingUrl}

REGRAS:
1. Títulos RSA: máx 30 chars cada (inclua cidade e serviço em ≥2).
2. Descrições RSA: máx 90 chars (CTA claro em ≥1).
3. Path1/path2: máx 15 chars, sem espaços.
4. Sitelinks: texto máx 25 chars.
5. Callouts: máx 25 chars cada.
6. Keywords: exact p/ alta intenção, phrase p/ variações, broad p/ descoberta. Mínimo 8/grupo.
7. Negativos globais obrigatórios: ${negSeed.map((n) => `"${n}"`).join(", ")}.
8. Tom: profissional, acolhedor; nunca prometa cura. Português brasileiro.`

    const outputSchema = {
      type: "object",
      properties: {
        campaign_name: { type: "string" },
        ad_groups: {
          type: "array", minItems: 1, maxItems: 3,
          items: {
            type: "object",
            properties: {
              name: { type: "string" }, theme: { type: "string" },
              rsa: {
                type: "object",
                properties: {
                  headlines:    { type: "array", minItems: 10, maxItems: 15, items: { type: "string", maxLength: 30 } },
                  descriptions: { type: "array", minItems: 4,  maxItems: 4,  items: { type: "string", maxLength: 90 } },
                  path1: { type: "string", maxLength: 15 },
                  path2: { type: "string", maxLength: 15 },
                },
                required: ["headlines", "descriptions"],
              },
              keywords: {
                type: "array", minItems: 8, maxItems: 20,
                items: {
                  type: "object",
                  properties: { text: { type: "string" }, match_type: { type: "string", enum: ["broad","phrase","exact"] } },
                  required: ["text", "match_type"],
                },
              },
              negative_keywords: { type: "array", maxItems: 10, items: { type: "string" } },
            },
            required: ["name", "theme", "rsa", "keywords"],
          },
        },
        sitelinks: {
          type: "array", maxItems: 4,
          items: { type: "object", properties: { text: { type: "string", maxLength: 25 }, url: { type: "string" } }, required: ["text","url"] },
        },
        callouts: { type: "array", maxItems: 6, items: { type: "string", maxLength: 25 } },
        negative_keywords_global: { type: "array", maxItems: 20, items: { type: "string" } },
      },
      required: ["campaign_name", "ad_groups"],
    }

    const adsRes = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        tools: [{ name: "gerar_campanha", description: "Retorna a campanha estruturada.", input_schema: outputSchema }],
        tool_choice: { type: "tool", name: "gerar_campanha" },
        messages: [{ role: "user", content: prompt }],
      }),
    })
    if (!adsRes.ok) {
      const err = await adsRes.text()
      console.error("[criar_campanha_ads] Anthropic:", err)
      return { erro: "falha_ia", instrucao: "Avise que houve erro ao gerar a campanha. Peça pra tentar novamente." }
    }
    const adsData = await adsRes.json()
    const toolBlock = adsData.content?.find((b: any) => b.type === "tool_use" && b.name === "gerar_campanha")
    if (!toolBlock?.input) return { erro: "ia_sem_resultado", instrucao: "Avise que a geração não retornou resultado. Peça pra tentar novamente." }

    const raw = toolBlock.input
    // Sanitiza chars acima dos limites do Google
    const trunc = (s: string, max: number) => s.length > max ? s.slice(0, max) : s
    const adGroups = (raw.ad_groups ?? []).map((g: any) => ({
      ...g,
      rsa: {
        ...g.rsa,
        headlines:    (g.rsa?.headlines ?? []).map((h: string) => trunc(h, 30)),
        descriptions: (g.rsa?.descriptions ?? []).map((d: string) => trunc(d, 90)),
        final_url: landingUrl,
        path1: g.rsa?.path1 ? trunc(g.rsa.path1, 15) : undefined,
        path2: g.rsa?.path2 ? trunc(g.rsa.path2, 15) : undefined,
      },
    }))

    // Persiste em ads_campaigns
    const { error: campErr } = await (supabaseAdmin as any)
      .from("ads_campaigns")
      .insert({
        id: campaignId,
        professional_id: professionalId,
        platform: "google_ads",
        name: raw.campaign_name,
        objective,
        campaign_type: "search",
        status: "draft",
        daily_budget_brl: dailyBudget,
        max_daily_budget_brl: maxDaily,
        geo_targeting: { cidade, raio_km },
        landing_url: landingUrl,
        brief: { servico, cidade, raio_km, orcamento_mensal: mensal, diferencial, publico },
        start_date: startDate,
        end_date: endDate,
        created_by: "axel",
      })
    if (campErr) {
      console.error("[criar_campanha_ads] INSERT:", campErr.message)
      return { erro: campErr.message, instrucao: "Avise que houve erro ao salvar a campanha." }
    }

    // Assets
    const assets: any[] = []
    for (let gi = 0; gi < adGroups.length; gi++) {
      const g = adGroups[gi]
      const gId = crypto.randomUUID()
      assets.push({ id: gId, campaign_id: campaignId, asset_type: "ad_group", payload: { name: g.name, theme: g.theme }, position: gi })
      assets.push({ id: crypto.randomUUID(), campaign_id: campaignId, asset_type: "rsa", parent_id: gId, payload: g.rsa, position: 0 })
      ;(g.keywords ?? []).forEach((k: any, ki: number) =>
        assets.push({ id: crypto.randomUUID(), campaign_id: campaignId, asset_type: "keyword", parent_id: gId, payload: k, position: ki }))
      ;(g.negative_keywords ?? []).forEach((t: string, ni: number) =>
        assets.push({ id: crypto.randomUUID(), campaign_id: campaignId, asset_type: "negative_keyword", parent_id: gId, payload: { text: t }, position: ni }))
    }
    ;(raw.sitelinks ?? []).forEach((sl: any, si: number) =>
      assets.push({ id: crypto.randomUUID(), campaign_id: campaignId, asset_type: "sitelink", payload: sl, position: si }))
    ;(raw.callouts ?? []).forEach((c: string, ci: number) =>
      assets.push({ id: crypto.randomUUID(), campaign_id: campaignId, asset_type: "callout", payload: { text: c }, position: ci }))
    const allNegs = [...negSeed, ...((raw.negative_keywords_global ?? []).filter((k: string) => !negSeed.includes(k)))]
    allNegs.forEach((t: string, ni: number) =>
      assets.push({ id: crypto.randomUUID(), campaign_id: campaignId, asset_type: "negative_keyword", payload: { text: t, scope: "campaign" }, position: ni }))

    if (assets.length > 0) {
      const { error: assErr } = await (supabaseAdmin as any).from("ads_campaign_assets").insert(assets)
      if (assErr) console.error("[criar_campanha_ads] INSERT assets:", assErr.message)
    }

    // Debita créditos (idempotente por campaign_id)
    const { error: creditErr } = await supabaseAdmin.rpc("consume_credits", {
      p_professional_id: professionalId,
      p_service_key:     "campanha_ads",
      p_units:           1,
      p_description:     `Geração de campanha: ${raw.campaign_name}`,
      p_reference_id:    campaignId,
      p_idempotency_key: `${professionalId}|campanha_ads|${campaignId}`,
    })
    if (creditErr) console.error("[criar_campanha_ads] consume_credits:", creditErr.message)

    console.log(`[criar_campanha_ads] campanha ${campaignId} criada para ${professionalId}`)
    return {
      sucesso: true,
      campaign_id: campaignId,
      nome: raw.campaign_name,
      grupos: adGroups.length,
      orcamento_diario: `R$ ${dailyBudget}`,
      creditos_debitados: CUSTO,
      instrucao: `Campanha "${raw.campaign_name}" criada com sucesso (${adGroups.length} grupo(s) de anúncios, ${dailyBudget} R$/dia). Chame abrir_pagina('/admin/trafego-pago') para que o profissional revise e aprove. Diga que ele pode aprovar lá ou pedir ajustes por aqui.`,
    }
  }

  return { erro: "Ferramenta desconhecida" }
}

// =============================================
// CLAUDE CALL (Messages API + Tool Use loop)
// =============================================
async function callClaude(opts: {
  systemPrompt: string
  history: Array<{ role: string; content: string }>
  userMessage: string
  supabaseAdmin: any
  professionalId: string
  kbSections: any[]
}): Promise<{ reply: string; toolsUsed: string[]; actions: Array<{ label: string; href: string }>; navigate: string | null }> {
  const { systemPrompt, history, userMessage, supabaseAdmin, professionalId, kbSections } = opts
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")

  // Monta histórico no formato Anthropic, mesclando papéis consecutivos.
  const messages: any[] = []
  let lastRole = ""
  for (const msg of history) {
    if (!msg.content) continue
    const currentRole = msg.role === "axel" || msg.role === "assistant" ? "assistant" : "user"
    if (currentRole === lastRole) {
      messages[messages.length - 1].content += `\n${msg.content}`
    } else {
      messages.push({ role: currentRole, content: msg.content })
      lastRole = currentRole
    }
  }
  if (lastRole === "user") {
    messages[messages.length - 1].content += `\n${userMessage || "Oi"}`
  } else {
    messages.push({ role: "user", content: userMessage || "Oi" })
  }

  const toolsUsed: string[] = []
  const navActions: Array<{ label: string; href: string }> = []
  let maxIterations = 8

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
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[Claude Error] ${response.status}`, errText)
      throw new Error(`Claude API Error: ${response.status}`)
    }

    const result = await response.json()
    const content = result.content || []
    const stopReason = result.stop_reason

    if (stopReason !== "tool_use") {
      const textBlock = content.find((b: any) => b.type === "text")
      return {
        reply: textBlock?.text || "Desculpe, não consegui responder agora. Pode reformular?",
        toolsUsed,
        actions: navActions,
        navigate: navActions.length > 0 ? navActions[navActions.length - 1].href : null,
      }
    }

    const toolUseBlocks = content.filter((b: any) => b.type === "tool_use")
    const toolResults = []
    for (const tu of toolUseBlocks) {
      toolsUsed.push(tu.name)
      const out = await handleToolCall(tu.name, tu.input, supabaseAdmin, professionalId, kbSections)
      // Navegação: o Axel pediu pra levar o profissional a uma página válida.
      if (tu.name === "abrir_pagina" && out?.sucesso && out?.rota) {
        navActions.push({ label: out.titulo || "Abrir página", href: out.rota })
      }
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) })
    }

    messages.push({ role: "assistant", content })
    messages.push({ role: "user", content: toolResults })
  }

  return {
    reply: "Desculpe, tive um problema ao processar. Pode tentar de novo?",
    toolsUsed,
    actions: navActions,
    navigate: navActions.length > 0 ? navActions[navActions.length - 1].href : null,
  }
}

// =============================================
// MAIN HANDLER
// =============================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase config missing")

    // 1. Autenticação: deriva o usuário do JWT (NUNCA confia no client).
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace("Bearer ", "").trim()
    if (!token) {
      return new Response(JSON.stringify({ error: "missing_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey)
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const userId = userData.user.id

    // 2. Deriva o professional dono (segurança: ignora qualquer id do cliente).
    const { data: professional, error: profErr } = await supabaseAdmin
      .from("professionals")
      .select("id, full_name, category, category_custom, phone, whatsapp")
      .eq("user_id", userId)
      .maybeSingle()
    if (profErr || !professional) {
      return new Response(JSON.stringify({ error: "professional_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const professionalId = professional.id

    // IDENTIDADE: profiles (+ auth) é a FONTE DE VERDADE de nome/telefone/email.
    // Os campos full_name/email de professionals ficam null (duplicados, em descontinuação).
    const { data: userProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", userId)
      .maybeSingle()
    professional.full_name = userProfile?.full_name || professional.full_name || null
    professional.phone = professional.phone || professional.whatsapp || userProfile?.phone || null
    ;(professional as any).email = userData.user.email || null

    // 3. Payload
    const body = await req.json()
    const message = (body?.message || "").toString().trim()
    if (!message) {
      return new Response(JSON.stringify({ error: "empty_message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 4. Carrega histórico recente + memória
    const { data: historyRows } = await supabaseAdmin
      .from("axel_conversations")
      .select("role, content")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false })
      .limit(20)
    const history = (historyRows || []).reverse() as Array<{ role: string; content: string }>

    const { data: memoryRows } = await supabaseAdmin
      .from("axel_user_memory")
      .select("key, value")
      .eq("professional_id", professionalId)
      .order("updated_at", { ascending: false })
      .limit(40)
    const memoryFacts = (memoryRows || []) as Array<{ key: string; value: string }>

    // Base de conhecimento seccionada (mapa do site) — schema axel via RPC facade
    const { data: kbRows, error: kbErr } = await supabaseAdmin.rpc("axel_kb_sections", { p_scope: "platform" })
    if (kbErr) console.error("[axel-agent] axel_kb_sections erro:", kbErr.message)
    const kbSections = (kbRows || []) as Array<{ key: string; title: string; route?: string; keywords?: string[]; body: string }>

    // Lacunas de perfil (Engrenagem A — o que o Axel ainda precisa descobrir, sutilmente)
    const factKeys = new Set(memoryFacts.map((f) => f.key))
    const profileGaps: string[] = []
    if (!professional?.full_name) profileGaps.push("Nome do profissional (ainda não sei como ele se chama)")
    if (!professional?.phone && !professional?.whatsapp) profileGaps.push("Telefone/WhatsApp — identificador PRINCIPAL do profissional na plataforma; é o que conecta o agente de WhatsApp aos leads. Prioridade alta.")
    if (!professional?.category && !professional?.category_custom) profileGaps.push("Profissão / área de atuação e nicho")
    if (!factKeys.has("objetivo_plataforma") && !factKeys.has("objetivo")) profileGaps.push("Objetivo COM a plataforma (o que ele quer alcançar aqui: mais pacientes, presença digital, organizar a rotina...)")
    if (!factKeys.has("objetivo_profissional")) profileGaps.push("Objetivo profissional / de carreira (onde ele quer chegar)")

    // 5. Persiste a mensagem do usuário
    await supabaseAdmin.from("axel_conversations").insert({
      professional_id: professionalId,
      role: "user",
      content: message,
    })

    // 6. Chama o Claude
    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const systemPrompt = buildSystemPrompt({ professional, memoryFacts, now, kbSections, profileGaps })

    let reply: string
    let toolsUsed: string[] = []
    let actions: Array<{ label: string; href: string }> = []
    let navigate: string | null = null
    try {
      const out = await callClaude({ systemPrompt, history, userMessage: message, supabaseAdmin, professionalId, kbSections })
      reply = out.reply
      toolsUsed = out.toolsUsed
      actions = out.actions
      navigate = out.navigate
    } catch (aiErr: any) {
      console.error("[axel-agent][AI Error]", aiErr.message)
      // Sinaliza erro pro front cair no fallback por regras (não persiste resposta vazia).
      return new Response(JSON.stringify({ error: "ai_error", detail: aiErr.message, fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 7. Persiste a resposta do Axel (inclui os atalhos de navegação, que o front renderiza como botões)
    await supabaseAdmin.from("axel_conversations").insert({
      professional_id: professionalId,
      role: "axel",
      content: reply,
      tool_calls: toolsUsed.length > 0 ? toolsUsed : null,
      actions: actions.length > 0 ? actions : null,
    })

    return new Response(JSON.stringify({ reply, tools_used: toolsUsed, actions, navigate }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error: any) {
    console.error("[axel-agent][Fatal]", error.message)
    return new Response(JSON.stringify({ error: error.message, fallback: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

// =============================================================================
// axel-agent — O cérebro conversacional do Axel (assistente do PROFISSIONAL)
//
// Replica o motor agêntico do whatsapp-agent (Claude Sonnet + Tool Use loop),
// trocando o público (lead → profissional) e as tools (agenda → produtividade).
//
// Fase 1 (este arquivo): tools de LEITURA + MEMÓRIA
//   - consultar_conhecimento : RAG GLOBAL do produto (UUID sentinela)
//   - ler_estado_perfil      : o que falta no perfil/onboarding
//   - salvar_memoria         : grava um fato do profissional (relacionamento)
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

// UUID sentinela: dono da base de conhecimento GLOBAL do produto (gerida no painel gerente).
const AXEL_PLATFORM_KB_ID = "00000000-0000-0000-0000-000000000000"

const CLAUDE_MODEL = "claude-sonnet-4-6"
const CLAUDE_URL = "https://api.anthropic.com/v1/messages"

// =============================================
// TOOL DEFINITIONS — formato Anthropic (Tool Use)
// =============================================
const tools = [
  {
    name: "consultar_conhecimento",
    description:
      "Busca na BASE DE CONHECIMENTO DO PRODUTO PrimeiroPasso (como a plataforma funciona, recursos, planos, agenda, landing page, conteúdo, créditos, integrações). CHAME SEMPRE que o profissional perguntar 'como faço X?', 'a plataforma tem Y?', 'onde fica Z?'. NÃO invente funcionalidade — fundamente na base. Use queries CURTAS de 1-3 palavras-chave (ex.: 'landing page', 'agenda', 'créditos', 'whatsapp', 'artigo carrossel'). NÃO use frases longas.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "1-3 palavras-chave. Ex.: 'landing page', 'agenda', 'whatsapp', 'plano mensal'." },
      },
      required: ["query"],
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
        chave: { type: "string", description: "Nome do fato em snake_case. Ex.: 'objetivo', 'especialidade', 'publico_alvo', 'dor', 'preferencia_tom', 'migrando_de'." },
        valor: { type: "string", description: "Valor do fato, curto e padronizado. Ex.: 'psicóloga infantil', 'migrar do Google Agenda', 'ainda não publicou a landing'." },
      },
      required: ["chave", "valor"],
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
}): string {
  const { professional, memoryFacts, now } = opts
  const proName = professional?.full_name?.split(" ")?.[0] || "você"

  const memoriaStr = memoryFacts.length > 0
    ? memoryFacts.map((m) => `• ${m.key}: ${m.value}`).join("\n")
    : "(ainda não conheço fatos sobre este profissional — descubra com naturalidade e use salvar_memoria)"

  return `Você é o **Axel**, o copiloto inteligente do profissional dentro da plataforma PrimeiroPasso.
Você NÃO é um robô de FAQ: você tem memória, entende o contexto e ajuda de verdade.

━━━ QUEM É VOCÊ ━━━
• Nome: Axel. Papel: assistente de plataforma + produtor de conteúdo.
• Tom: amigável, paciente, encorajador e DIRETO. Linguagem simples, sem corporativês.
• Emojis com moderação. Respostas curtas (2-5 frases). Nada de textão.
• Você fala COM o profissional (${proName}) na SEGUNDA pessoa ("você").

━━━ COM QUEM VOCÊ FALA ━━━
• Profissional: ${professional?.full_name || "(nome ainda não informado)"}
${professional?.category ? `• Área/categoria: ${professional.category}${professional.category_custom ? ` (${professional.category_custom})` : ""}` : ""}

━━━ O QUE EU JÁ SEI SOBRE ELE (memória) ━━━
${memoriaStr}

━━━ HOJE: ${now} ━━━

━━━ COMO AGIR ━━━
1. RELACIONAMENTO: use a memória acima pra dar continuidade ("semana passada você queria publicar a landing..."). Se descobrir um fato novo e relevante, chame \`salvar_memoria\` SEM avisar.
2. ENSINAR: para qualquer dúvida sobre COMO a plataforma funciona, chame \`consultar_conhecimento\` com 1-3 palavras-chave ANTES de responder. NUNCA invente funcionalidade que não existe.
3. CONTEXTO: se precisar saber o que falta configurar, chame \`ler_estado_perfil\` e sugira o próximo passo concreto.
4. Se a base de conhecimento não cobrir a pergunta, seja honesto: "Sobre isso específico eu vou confirmar pra não te passar errado" — NÃO invente.

━━━ REGRAS ABSOLUTAS ━━━
• NÃO invente recursos, telas, preços ou botões. Fundamente em \`consultar_conhecimento\`.
• NÃO prometa executar ações que você ainda não pode fazer (gerar landing, criar vídeo). Nesta fase você ENSINA e ORIENTA — diga onde ele encontra a função na plataforma.
• Seja específico e acionável: aponte o caminho ("Menu → Agenda → Disponibilidade").
• Brevidade sempre. Reconheça o que ele trouxe antes de responder.`
}

// =============================================
// TOOL HANDLERS
// =============================================
async function handleToolCall(
  toolName: string,
  args: any,
  supabaseAdmin: any,
  professionalId: string,
): Promise<any> {
  if (toolName === "consultar_conhecimento") {
    const query = (args.query || "").toString().trim()
    if (!query) return { erro: "query obrigatória" }

    const workerUrl = Deno.env.get("WORKER_RAG_URL") || Deno.env.get("WORKER_URL")
    if (!workerUrl) {
      return {
        chunks: [],
        instrucao: "A base de conhecimento do produto ainda não está configurada. Responda com base no que você sabe da plataforma, com cautela, e sugira que o profissional consulte o suporte se for algo muito específico.",
      }
    }

    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, "")}/rag/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_id: AXEL_PLATFORM_KB_ID, // base GLOBAL do produto
          query,
          match_count: 6,
        }),
      })
      if (!res.ok) {
        console.error("[consultar_conhecimento] status", res.status)
        return { chunks: [], instrucao: "Não consegui consultar a base agora. Responda com cautela ou peça pra ele tentar de novo." }
      }
      const data = await res.json()
      const rawChunks = (data.chunks || []) as Array<string | { content?: string; similarity?: number }>
      const chunks = rawChunks.map((c: any) =>
        typeof c === "string" ? { content: c } : { content: c.content || "", similarity: c.similarity }
      )
      if (chunks.length === 0) {
        return {
          chunks: [],
          instrucao: "A base retornou vazio pra essa query. Tente reformular com outra palavra-chave OU diga que vai confirmar a info pra não passar errado.",
        }
      }
      return {
        chunks: chunks.map((c: any) => ({ content: (c.content || "").slice(0, 800), similarity: c.similarity })),
        instrucao: "USE os trechos pra montar a resposta. Reformule com naturalidade (não cole texto cru). Aponte o caminho na plataforma quando fizer sentido.",
      }
    } catch (e: any) {
      console.error("[consultar_conhecimento] erro:", e.message)
      return { chunks: [], instrucao: "Erro técnico ao buscar. Responda com cautela." }
    }
  }

  if (toolName === "ler_estado_perfil") {
    const { data: prof } = await supabaseAdmin
      .from("professionals")
      .select("full_name, crp, bio, hero_title, pain_title, category")
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
    const landingPublished = !!(prof?.hero_title || prof?.pain_title)
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
}): Promise<{ reply: string; toolsUsed: string[] }> {
  const { systemPrompt, history, userMessage, supabaseAdmin, professionalId } = opts
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
      return { reply: textBlock?.text || "Desculpe, não consegui responder agora. Pode reformular?", toolsUsed }
    }

    const toolUseBlocks = content.filter((b: any) => b.type === "tool_use")
    const toolResults = []
    for (const tu of toolUseBlocks) {
      toolsUsed.push(tu.name)
      const out = await handleToolCall(tu.name, tu.input, supabaseAdmin, professionalId)
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) })
    }

    messages.push({ role: "assistant", content })
    messages.push({ role: "user", content: toolResults })
  }

  return { reply: "Desculpe, tive um problema ao processar. Pode tentar de novo?", toolsUsed }
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
      .select("id, full_name, category, category_custom")
      .eq("user_id", userId)
      .maybeSingle()
    if (profErr || !professional) {
      return new Response(JSON.stringify({ error: "professional_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const professionalId = professional.id

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

    // 5. Persiste a mensagem do usuário
    await supabaseAdmin.from("axel_conversations").insert({
      professional_id: professionalId,
      role: "user",
      content: message,
    })

    // 6. Chama o Claude
    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const systemPrompt = buildSystemPrompt({ professional, memoryFacts, now })

    let reply: string
    let toolsUsed: string[] = []
    try {
      const out = await callClaude({ systemPrompt, history, userMessage: message, supabaseAdmin, professionalId })
      reply = out.reply
      toolsUsed = out.toolsUsed
    } catch (aiErr: any) {
      console.error("[axel-agent][AI Error]", aiErr.message)
      // Sinaliza erro pro front cair no fallback por regras (não persiste resposta vazia).
      return new Response(JSON.stringify({ error: "ai_error", detail: aiErr.message, fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 7. Persiste a resposta do Axel
    await supabaseAdmin.from("axel_conversations").insert({
      professional_id: professionalId,
      role: "axel",
      content: reply,
      tool_calls: toolsUsed.length > 0 ? toolsUsed : null,
    })

    return new Response(JSON.stringify({ reply, tools_used: toolsUsed }), {
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

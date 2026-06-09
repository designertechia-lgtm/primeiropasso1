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
        chave: { type: "string", description: "Nome do fato em snake_case. Ex.: 'objetivo', 'especialidade', 'publico_alvo', 'dor', 'preferencia_tom', 'migrando_de'." },
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
]

// =============================================
// SYSTEM PROMPT DO AXEL
// =============================================
function buildSystemPrompt(opts: {
  professional: any
  memoryFacts: Array<{ key: string; value: string }>
  now: string
  kbSections: Array<{ key: string; title: string; route?: string; keywords?: string[] }>
}): string {
  const { professional, memoryFacts, now, kbSections } = opts
  const proName = professional?.full_name?.split(" ")?.[0] || "você"

  const memoriaStr = memoryFacts.length > 0
    ? memoryFacts.map((m) => `• ${m.key}: ${m.value}`).join("\n")
    : "(ainda não conheço fatos sobre este profissional — descubra com naturalidade e use salvar_memoria)"

  const mapaStr = (kbSections && kbSections.length > 0)
    ? kbSections.map((s) => {
        const rota = s.route ? ` (${s.route})` : ""
        const kws = Array.isArray(s.keywords) && s.keywords.length ? ` — palavras: ${s.keywords.join(", ")}` : ""
        return `• [${s.key}] ${s.title}${rota}${kws}`
      }).join("\n")
    : "(nenhuma seção de conhecimento cadastrada ainda)"

  return `Você é o **Axel**, o copiloto inteligente do profissional dentro da plataforma PrimeiroPasso.
Você NÃO é um robô de FAQ: você tem memória, entende o contexto e ajuda de verdade.

━━━ QUEM É VOCÊ ━━━
• Nome: Axel. Papel: assistente de plataforma + produtor de conteúdo.
• Tom: amigável, paciente, encorajador e DIRETO. Linguagem simples, sem corporativês.
• Emojis com moderação. Respostas curtas (2-5 frases). Nada de textão.
• FORMATAÇÃO: escreva em TEXTO PURO — o chat NÃO renderiza markdown. NÃO use \`**\` para negrito, nem \`#\`, nem \`*\` em listas. Para passos, numere (1., 2., 3.) em linhas separadas. Para destacar, use o próprio texto (ou MAIÚSCULA pontual), nunca asteriscos.
• Você fala COM o profissional (${proName}) na SEGUNDA pessoa ("você").

━━━ COM QUEM VOCÊ FALA ━━━
• Profissional: ${professional?.full_name || "(nome ainda não informado)"}
${professional?.category ? `• Área/categoria: ${professional.category}${professional.category_custom ? ` (${professional.category_custom})` : ""}` : ""}

━━━ O QUE EU JÁ SEI SOBRE ELE (memória) ━━━
${memoriaStr}

━━━ HOJE: ${now} ━━━

━━━ MAPA DA PLATAFORMA (base de conhecimento) ━━━
Estas são as seções disponíveis. Para abrir o passo a passo/detalhe de QUALQUER uma, chame \`consultar_secao\` com a [key]. NÃO responda "como fazer" de cabeça — abra a seção primeiro.
${mapaStr}

━━━ COMO AGIR ━━━
1. RELACIONAMENTO: use a memória acima pra dar continuidade ("semana passada você queria publicar a landing..."). Se descobrir um fato novo e relevante, chame \`salvar_memoria\` SEM avisar.
2. ENSINAR: para qualquer dúvida sobre COMO a plataforma funciona, identifique a seção certa no MAPA acima e chame \`consultar_secao\` com a [key] ANTES de responder. NUNCA invente funcionalidade que não existe.
3. CONTEXTO: se precisar saber o que falta configurar, chame \`ler_estado_perfil\` e sugira o próximo passo concreto.
4. Se nenhuma seção do MAPA cobrir a pergunta, seja honesto: "Sobre isso específico eu vou confirmar pra não te passar errado" — NÃO invente.

━━━ REGRAS ABSOLUTAS ━━━
• NÃO invente recursos, telas, preços ou botões. Fundamente em \`consultar_secao\`.
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

  // ============ FASE 3 — TOOLS DE EXECUÇÃO ============

  if (toolName === "sugerir_dados_perfil" || toolName === "gerar_landing") {
    const campo = toolName === "gerar_landing" ? null : (args.campo || "").toString().trim()
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

    // Busca dados do profissional para contexto
    const { data: prof } = await supabaseAdmin
      .from("professionals")
      .select("full_name, crp, category, category_custom")
      .eq("id", professionalId)
      .maybeSingle()

    const ctx = {
      name: prof?.full_name || "Profissional",
      crp: prof?.crp,
      specialty: prof?.category || prof?.category_custom || "",
    }

    if (toolName === "gerar_landing") {
      // Gera todas as 9 seções da landing em paralelo
      const campos = ["hero_title", "hero_subtitle", "pain_title", "pain_subtitle", "pain_items", "solution_title", "solution_subtitle", "solution_items", "bio"]
      const resultados: Record<string, any> = {}
      for (const c of campos) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/generate-text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
            body: JSON.stringify({ field: c, context: ctx }),
          })
          if (res.ok) {
            const data = await res.json()
            resultados[c] = data.result || data.error || "erro ao gerar"
          } else {
            resultados[c] = `erro ${res.status}`
          }
        } catch (e: any) {
          resultados[c] = `erro: ${e.message}`
        }
      }
      return {
        ...resultados,
        instrucao: "MOSTRE esse preview para o profissional de forma organizada. Pergunte se ele quer aplicar na landing (use atualizar_perfil para cada campo) ou ajustar algo específico. NÃO aplique automaticamente — espere a confirmação EXPLÍCITA dele.",
      }
    }

    if (!campo) return { erro: "campo obrigatório para sugerir_dados_perfil" }
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
        body: JSON.stringify({ field: campo, context: ctx }),
      })
      if (!res.ok) {
        return { erro: `generate-text retornou ${res.status}`, instrucao: "Avise o profissional que houve um erro técnico e peça pra tentar de novo." }
      }
      const data = await res.json()
      const resultado = data.result || data.error || "erro ao gerar"
      return {
        campo,
        resultado,
        instrucao: "MOSTRE o resultado para o profissional. Pergunte se ele quer APLICAR (chame atualizar_perfil com o campo e valor). NÃO aplique automaticamente — espere a confirmação EXPLÍCITA dele.",
      }
    } catch (e: any) {
      return { erro: e.message, instrucao: "Avise o profissional que houve um erro técnico ao gerar conteúdo." }
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
        const parsed = JSON.parse(valor)
        if (!Array.isArray(parsed)) return { erro: "valor deve ser um array JSON" }
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
    const tema = (args.tema || "").toString().trim()

    // 1. Verifica créditos do profissional
    let creditos = 0
    try {
      const { data: bal } = await supabaseAdmin
        .from("credit_balances")
        .select("balance")
        .eq("professional_id", professionalId)
        .maybeSingle()
      creditos = (bal as any)?.balance ?? 0
    } catch (_) { /* tabela pode não existir */ }

    const CUSTO_ARTIGO = 1 // 1 crédito por artigo
    if (creditos < CUSTO_ARTIGO) {
      return {
        erro: "creditos_insuficientes",
        creditos_disponiveis: creditos,
        custo: CUSTO_ARTIGO,
        instrucao: "Avise o profissional que ele não tem créditos suficientes. Ele precisa de 1 crédito para criar um artigo. Sugira recarregar em /admin/assinatura.",
      }
    }

    // 2. Busca dados do profissional
    const { data: prof } = await supabaseAdmin
      .from("professionals")
      .select("full_name, crp, category, category_custom")
      .eq("id", professionalId)
      .maybeSingle()

    // 3. Busca títulos existentes para evitar duplicação
    const { data: existingArticles } = await supabaseAdmin
      .from("articles")
      .select("title, cover_url")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false })
      .limit(20)
    const existingTitles = (existingArticles || []).map((a: any) => a.title).filter(Boolean)
    const existingCoverUrls = (existingArticles || []).map((a: any) => a.cover_url).filter(Boolean)

    // 4. Chama generate-text para criar o artigo
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

    try {
      const ctx: any = {
        name: prof?.full_name || "Profissional",
        crp: prof?.crp,
        specialty: prof?.category || prof?.category_custom || "",
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

      // 5. Debita crédito
      try {
        await supabaseAdmin
          .from("credit_balances")
          .update({ balance: creditos - CUSTO_ARTIGO })
          .eq("professional_id", professionalId)
      } catch (_) { /* non-blocking */ }

      // 6. Salva o artigo no banco
      const carouselItems = artigo.carousel_items || []
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("articles")
        .insert({
          professional_id: professionalId,
          title: artigo.title,
          content: artigo.content || "",
          cover_url: artigo.cover_image_url || "",
          carousel: carouselItems.map((item: any) => ({
            image_url: item.image_url || "",
            caption: item.caption || "",
          })),
          status: "published",
        })
        .select("id")
        .single()

      if (insertErr) {
        console.error("[criar_artigo] erro insert:", insertErr.message)
        return { erro: insertErr.message, instrucao: "Avise o profissional que houve erro ao salvar o artigo." }
      }

      console.log(`[criar_artigo] artigo ${inserted?.id} criado, crédito debitado`)
      return {
        sucesso: true,
        artigo_id: inserted?.id,
        titulo: artigo.title,
        creditos_restantes: creditos - CUSTO_ARTIGO,
        instrucao: "Confirme pro profissional que o artigo foi criado com sucesso. Informe o título, o ID e os créditos restantes. Ele pode ver o artigo em /admin/redes-sociais.",
      }
    } catch (e: any) {
      return { erro: e.message, instrucao: "Avise o profissional que houve erro técnico ao gerar o artigo." }
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
}): Promise<{ reply: string; toolsUsed: string[] }> {
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
      const out = await handleToolCall(tu.name, tu.input, supabaseAdmin, professionalId, kbSections)
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

    // Base de conhecimento seccionada (mapa do site) — schema axel via RPC facade
    const { data: kbRows, error: kbErr } = await supabaseAdmin.rpc("axel_kb_sections", { p_scope: "platform" })
    if (kbErr) console.error("[axel-agent] axel_kb_sections erro:", kbErr.message)
    const kbSections = (kbRows || []) as Array<{ key: string; title: string; route?: string; keywords?: string[]; body: string }>

    // 5. Persiste a mensagem do usuário
    await supabaseAdmin.from("axel_conversations").insert({
      professional_id: professionalId,
      role: "user",
      content: message,
    })

    // 6. Chama o Claude
    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const systemPrompt = buildSystemPrompt({ professional, memoryFacts, now, kbSections })

    let reply: string
    let toolsUsed: string[] = []
    try {
      const out = await callClaude({ systemPrompt, history, userMessage: message, supabaseAdmin, professionalId, kbSections })
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

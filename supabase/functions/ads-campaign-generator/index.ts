// =============================================================================
// ads-campaign-generator
//
// Gera uma campanha Google Ads completa (draft) via Claude structured output.
// Fluxo: JWT auth → verifica credit_balance → 1 chamada Anthropic (json_schema)
//        → INSERT em ads_campaigns + ads_campaign_assets → consume_credits RPC.
//
// Débito: 10 créditos por campanha (service_key 'campanha_ads' — valor PROVISÓRIO).
// Carlos define o valor definitivo antes de ativar em produção.
// =============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const CLAUDE_MODEL  = "claude-sonnet-4-6"
const CLAUDE_URL    = "https://api.anthropic.com/v1/messages"
const SERVICE_KEY   = "campanha_ads"
const UNITS         = 1 // 1 campanha = 10 créditos (conforme service_pricing)

// Limite máximo de chars nos campos RSA (contratos do Google)
const RSA_HEADLINE_MAX = 30
const RSA_DESC_MAX     = 90
const RSA_PATH_MAX     = 15
const SITELINK_MAX     = 25
const CALLOUT_MAX      = 25

// Keywords negativas padrão do nicho de saúde (evitam cliques de pesquisa informacional)
const NEGATIVE_SEED = ["grátis", "sus", "gratuito", "curso", "o que é", "significado", "como funciona", "pra que serve"]

// =============================================
// JSON Schema para o structured output (tool forced)
// =============================================
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    campaign_name: {
      type: "string",
      description: "Nome da campanha (ex.: 'Psicóloga Infantil SP | Consultas')",
    },
    ad_groups: {
      type: "array",
      description: "1 a 3 grupos de anúncios, cada um com tema distinto",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          name:  { type: "string", description: "Nome descritivo do grupo" },
          theme: { type: "string", description: "Tema central (ex.: 'TEA e TDAH')" },
          rsa: {
            type: "object",
            description: "Anúncio de pesquisa responsivo",
            properties: {
              headlines: {
                type: "array",
                minItems: 10,
                maxItems: 15,
                description: `Títulos do anúncio. Cada item DEVE ter no máximo ${RSA_HEADLINE_MAX} caracteres (contando espaços).`,
                items: { type: "string", maxLength: RSA_HEADLINE_MAX },
              },
              descriptions: {
                type: "array",
                minItems: 4,
                maxItems: 4,
                description: `Descrições do anúncio. Cada item DEVE ter no máximo ${RSA_DESC_MAX} caracteres.`,
                items: { type: "string", maxLength: RSA_DESC_MAX },
              },
              path1: { type: "string", maxLength: RSA_PATH_MAX, description: `Path 1 da URL visível (máx ${RSA_PATH_MAX} chars)` },
              path2: { type: "string", maxLength: RSA_PATH_MAX, description: `Path 2 da URL visível (máx ${RSA_PATH_MAX} chars)` },
            },
            required: ["headlines", "descriptions"],
          },
          keywords: {
            type: "array",
            minItems: 8,
            maxItems: 20,
            description: "Palavras-chave do grupo. Misture exact + phrase + broad.",
            items: {
              type: "object",
              properties: {
                text:       { type: "string" },
                match_type: { type: "string", enum: ["broad", "phrase", "exact"] },
              },
              required: ["text", "match_type"],
            },
          },
          negative_keywords: {
            type: "array",
            maxItems: 15,
            description: "Negativos específicos deste grupo (além dos negativos globais da campanha)",
            items: { type: "string" },
          },
        },
        required: ["name", "theme", "rsa", "keywords"],
      },
    },
    sitelinks: {
      type: "array",
      maxItems: 4,
      description: `Extensões de sitelink. Texto máx ${SITELINK_MAX} chars.`,
      items: {
        type: "object",
        properties: {
          text:        { type: "string", maxLength: SITELINK_MAX },
          description: { type: "string", maxLength: 35 },
          url:         { type: "string", description: "URL absoluta (pode usar a landing com UTMs)" },
        },
        required: ["text", "url"],
      },
    },
    callouts: {
      type: "array",
      maxItems: 6,
      description: `Extensões de frase de destaque. Cada item máx ${CALLOUT_MAX} chars.`,
      items: { type: "string", maxLength: CALLOUT_MAX },
    },
    negative_keywords_global: {
      type: "array",
      maxItems: 20,
      description: "Negativos em nível de campanha (ex.: 'grátis', 'sus', 'curso').",
      items: { type: "string" },
    },
  },
  required: ["campaign_name", "ad_groups"],
}

// =============================================
// Prompt do gerador (system)
// =============================================
function buildPrompt(brief: Record<string, any>, landingUrl: string): string {
  return `Você é um especialista certificado em Google Ads para profissionais de saúde.
Gere uma campanha de pesquisa (Search) completa, pronta para importar no Google Ads Editor.

BRIEF DA CAMPANHA:
- Objetivo: ${brief.objetivo ?? "capturar leads / agendamentos"}
- Serviço: ${brief.servico ?? "não informado"}
- Cidade / raio: ${brief.cidade ?? "não informado"} ${brief.raio_km ? `(raio ~${brief.raio_km} km)` : ""}
- Orçamento mensal: ${brief.orcamento_mensal ? `R$ ${brief.orcamento_mensal}` : "não informado"}
- Diferencial: ${brief.diferencial ?? "não informado"}
- Público-alvo: ${brief.publico ?? "pacientes adultos e/ou responsáveis"}
- URL de destino base: ${landingUrl}

REGRAS OBRIGATÓRIAS:
1. Títulos RSA: máx ${RSA_HEADLINE_MAX} caracteres cada (inclua cidade e serviço em ao menos 2).
2. Descrições RSA: máx ${RSA_DESC_MAX} caracteres cada (CTA claro em pelo menos 1).
3. Path1 / path2: máx ${RSA_PATH_MAX} chars, sem espaços.
4. Sitelinks: máx ${SITELINK_MAX} chars no texto.
5. Callouts: máx ${CALLOUT_MAX} chars cada.
6. Keywords: use exact para termos de alta intenção ("consulta psicólogo"), phrase para variações ("psicólogo infantil são paulo"), broad para descoberta. Mínimo 8 por grupo.
7. Negativos globais obrigatórios (inclua todos): ${NEGATIVE_SEED.map((n) => `"${n}"`).join(", ")}.
8. URLs dos sitelinks: use a URL de destino base fornecida (mantém a atribuição UTM).
9. Tom: profissional e acolhedor; nunca prometa cura ou resultados garantidos (Resolução CFM 1974/2011).
10. ENTREGUE TUDO em português brasileiro.`
}

// =============================================
// Helper: trunca strings que ultrapassam limite do Google
// (proteção caso o LLM ignore instrução de tamanho)
// =============================================
function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

function sanitizeCampaign(raw: any, landingUrl: string): any {
  const adGroups = (raw.ad_groups ?? []).map((g: any) => ({
    ...g,
    rsa: {
      headlines:    (g.rsa?.headlines ?? []).map((h: string) => trunc(h, RSA_HEADLINE_MAX)),
      descriptions: (g.rsa?.descriptions ?? []).map((d: string) => trunc(d, RSA_DESC_MAX)),
      final_url: landingUrl,
      path1: g.rsa?.path1 ? trunc(g.rsa.path1, RSA_PATH_MAX) : undefined,
      path2: g.rsa?.path2 ? trunc(g.rsa.path2, RSA_PATH_MAX) : undefined,
    },
    negative_keywords: g.negative_keywords ?? [],
  }))

  return {
    campaign_name:          raw.campaign_name,
    ad_groups:              adGroups,
    sitelinks:              (raw.sitelinks ?? []).map((s: any) => ({ ...s, text: trunc(s.text, SITELINK_MAX) })),
    callouts:               (raw.callouts ?? []).map((c: string) => trunc(c, CALLOUT_MAX)),
    negative_keywords_global: [
      ...NEGATIVE_SEED,
      ...((raw.negative_keywords_global ?? []).filter((k: string) => !NEGATIVE_SEED.includes(k))),
    ],
  }
}

// =============================================
// MAIN HANDLER
// =============================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } })

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500)

    // ── 1. Auth JWT ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace("Bearer ", "").trim()
    if (!token) return json({ error: "missing_auth" }, 401)

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) return json({ error: "invalid_auth" }, 401)

    const { data: professional } = await supabaseAdmin
      .from("professionals")
      .select("id, slug")
      .eq("user_id", userData.user.id)
      .maybeSingle()
    if (!professional) return json({ error: "professional_not_found" }, 404)

    const professionalId: string = professional.id
    const slug: string = professional.slug ?? ""

    // ── 2. Payload ───────────────────────────────────────────────────────────
    const body = await req.json()
    const brief: Record<string, any> = body.brief ?? {}
    const dailyBudget: number = Number(body.daily_budget_brl)
    const maxDailyBudget: number = Number(body.max_daily_budget_brl ?? dailyBudget * 1.25)
    const objective: string = (body.objective ?? "leads").toString()
    const platform: string = (body.platform ?? "google_ads").toString()
    // Período opcional (YYYY-MM-DD); sem datas = campanha contínua
    const startDate: string | null = body.start_date ? String(body.start_date) : null
    const endDate: string | null = body.end_date ? String(body.end_date) : null

    if (!brief.servico || !dailyBudget) {
      return json({ error: "brief.servico e daily_budget_brl são obrigatórios" }, 400)
    }
    if (startDate && endDate && endDate < startDate) {
      return json({ error: "end_date deve ser maior ou igual a start_date" }, 400)
    }

    // ── 3. Verifica créditos (ANTES de chamar Anthropic) ─────────────────────
    // Usa a view credit_balance (SINGULAR — não credit_balances)
    const { data: balanceRow } = await supabaseAdmin
      .from("credit_balance")
      .select("balance")
      .eq("professional_id", professionalId)
      .maybeSingle()
    const currentBalance: number = (balanceRow as any)?.balance ?? 0

    // Custo esperado = 10 créditos (base_cost_brl=5, markup=100% → CEIL(5×1×2)=10)
    const expectedCost = 10
    if (currentBalance < expectedCost) {
      return json({
        error: "creditos_insuficientes",
        saldo_atual: currentBalance,
        custo: expectedCost,
        mensagem: `Você tem ${currentBalance} crédito(s) e precisa de ${expectedCost} para gerar esta campanha.`,
      }, 402)
    }

    // ── 4. Monta landing_url com UTMs (campaign_id gerado aqui, usado depois no INSERT) ──
    const campaignId: string = crypto.randomUUID()
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://primeiropasso.com.br"
    const landingUrl = slug
      ? `${siteUrl}/p/${slug}?utm_source=google&utm_medium=cpc&utm_campaign=${campaignId}`
      : (body.landing_url ?? `${siteUrl}`)

    // ── 5. Gera campanha com Anthropic (1 chamada, structured output via tool forced) ──
    console.log(`[ads-campaign-generator] Gerando campanha para ${professionalId}`)
    const prompt = buildPrompt(brief, landingUrl)

    const anthropicRes = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        tools: [{
          name: "gerar_campanha",
          description: "Retorna a campanha Google Ads completa no formato estruturado.",
          input_schema: OUTPUT_SCHEMA,
        }],
        tool_choice: { type: "tool", name: "gerar_campanha" },
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      console.error("[ads-campaign-generator] Anthropic error:", errText)
      return json({ error: "falha_na_geracao_ia", detail: errText }, 500)
    }

    const anthropicData = await anthropicRes.json()
    const toolBlock = anthropicData.content?.find((b: any) => b.type === "tool_use" && b.name === "gerar_campanha")
    if (!toolBlock?.input) {
      return json({ error: "ia_nao_retornou_campanha" }, 500)
    }

    const raw = sanitizeCampaign(toolBlock.input, landingUrl)

    // ── 6. Persiste no banco ──────────────────────────────────────────────────
    const { error: campaignErr } = await supabaseAdmin
      .from("ads_campaigns")
      .insert({
        id:                   campaignId,
        professional_id:      professionalId,
        platform,
        name:                 raw.campaign_name,
        objective,
        campaign_type:        "search",
        status:               "draft",
        daily_budget_brl:     dailyBudget,
        max_daily_budget_brl: maxDailyBudget,
        geo_targeting:        { cidade: brief.cidade, raio_km: brief.raio_km },
        landing_url:          landingUrl,
        brief,
        start_date:           startDate,
        end_date:             endDate,
        created_by:           body.created_by === "user" ? "user" : "axel",
      })
    if (campaignErr) {
      console.error("[ads-campaign-generator] INSERT campaigns:", campaignErr.message)
      return json({ error: "erro_ao_salvar_campanha", detail: campaignErr.message }, 500)
    }

    // Ativos: grupos → RSA → keywords → negativos → sitelinks → callouts
    const assets: any[] = []
    for (let gi = 0; gi < raw.ad_groups.length; gi++) {
      const group = raw.ad_groups[gi]
      const groupId = crypto.randomUUID()

      assets.push({
        id: groupId, campaign_id: campaignId,
        asset_type: "ad_group",
        payload: { name: group.name, theme: group.theme },
        position: gi,
      })

      // RSA
      assets.push({
        id: crypto.randomUUID(), campaign_id: campaignId,
        asset_type: "rsa",
        parent_id: groupId,
        payload: group.rsa,
        position: 0,
      })

      // Keywords
      for (let ki = 0; ki < group.keywords.length; ki++) {
        assets.push({
          id: crypto.randomUUID(), campaign_id: campaignId,
          asset_type: "keyword",
          parent_id: groupId,
          payload: group.keywords[ki],
          position: ki,
        })
      }

      // Negativos do grupo
      for (let ni = 0; ni < (group.negative_keywords ?? []).length; ni++) {
        assets.push({
          id: crypto.randomUUID(), campaign_id: campaignId,
          asset_type: "negative_keyword",
          parent_id: groupId,
          payload: { text: group.negative_keywords[ni] },
          position: ni,
        })
      }
    }

    // Sitelinks e callouts (nível de campanha — parent_id null)
    for (let si = 0; si < (raw.sitelinks ?? []).length; si++) {
      assets.push({
        id: crypto.randomUUID(), campaign_id: campaignId,
        asset_type: "sitelink",
        payload: raw.sitelinks[si],
        position: si,
      })
    }
    for (let ci = 0; ci < (raw.callouts ?? []).length; ci++) {
      assets.push({
        id: crypto.randomUUID(), campaign_id: campaignId,
        asset_type: "callout",
        payload: { text: raw.callouts[ci] },
        position: ci,
      })
    }
    // Negativos globais de campanha
    for (let ni = 0; ni < (raw.negative_keywords_global ?? []).length; ni++) {
      assets.push({
        id: crypto.randomUUID(), campaign_id: campaignId,
        asset_type: "negative_keyword",
        payload: { text: raw.negative_keywords_global[ni], scope: "campaign" },
        position: ni,
      })
    }

    if (assets.length > 0) {
      const { error: assetsErr } = await supabaseAdmin.from("ads_campaign_assets").insert(assets)
      if (assetsErr) {
        console.error("[ads-campaign-generator] INSERT assets:", assetsErr.message)
        // Campanha já foi salva; não retorna erro fatal — assets podem ser re-inseridos.
      }
    }

    // ── 7. Debita créditos (após persistência bem-sucedida) ───────────────────
    const { error: creditErr } = await supabaseAdmin.rpc("consume_credits", {
      p_professional_id: professionalId,
      p_service_key:     SERVICE_KEY,
      p_units:           UNITS,
      p_description:     `Geração de campanha: ${raw.campaign_name}`,
      p_reference_id:    campaignId,
      p_idempotency_key: `${professionalId}|${SERVICE_KEY}|${campaignId}`,
    })
    if (creditErr) {
      // Log mas não bloqueia (campanha já foi gerada; crédito pode ser cobrado em retry).
      console.error("[ads-campaign-generator] consume_credits:", creditErr.message)
    }

    console.log(`[ads-campaign-generator] Campanha ${campaignId} gerada para ${professionalId}`)

    return json({
      campaign_id: campaignId,
      campaign_name: raw.campaign_name,
      status: "draft",
      landing_url: landingUrl,
      platform,
      objective,
      daily_budget_brl: dailyBudget,
      ad_groups_count: raw.ad_groups.length,
      assets_count: assets.length,
      creditos_debitados: expectedCost,
    })

  } catch (err: any) {
    console.error("[ads-campaign-generator][Fatal]", err.message)
    return json({ error: err.message }, 500)
  }
})

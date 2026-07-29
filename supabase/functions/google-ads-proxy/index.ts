// =============================================================================
// google-ads-proxy — porta ÚNICA da plataforma pra Google Ads API
//
// v2 (Etapa 5): onboarding completo + publicação de campanha via API.
// Ações: status · ping · criar_subconta · convidar_usuario · confirmar_billing
//        · publicar_campanha · pausar_campanha · ativar_campanha · atualizar_budget
//
// ⚠️ Nível de acesso: mutates (criar_subconta, publicar etc.) exigem acesso
//    BÁSICO aprovado na Central de API. Com Explorer, o Google responde
//    DEVELOPER_TOKEN_NOT_APPROVED — tratado com mensagem amigável.
//
// Secrets (Supabase): GOOGLE_ADS_DEVELOPER_TOKEN · GOOGLE_ADS_LOGIN_CUSTOMER_ID
//   · GOOGLE_ADS_CLIENT_ID · GOOGLE_ADS_CLIENT_SECRET · GOOGLE_ADS_REFRESH_TOKEN
// =============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Versão da Google Ads API — v24 desde 15/07/2026 (Google descontinua a v21 em
// 05/08/2026, e-mail oficial; diag validado na v24 antes da troca).
const ADS_API_VERSION = "v24"
const ADS_API_BASE = `https://googleads.googleapis.com/${ADS_API_VERSION}`

// fetch com timeout — I/O externo sem AbortController já travou edge no projeto (regra fetchT 45s).
const FETCH_TIMEOUT_MS = 45_000
async function fetchT(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// ── Credenciais ──────────────────────────────────────────────────────────────
function getCreds() {
  const creds = {
    developerToken:  Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "",
    loginCustomerId: Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "",
    clientId:        Deno.env.get("GOOGLE_ADS_CLIENT_ID") ?? "",
    clientSecret:    Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") ?? "",
    refreshToken:    Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN") ?? "",
  }
  const labels: Record<string, string> = {
    developerToken: "GOOGLE_ADS_DEVELOPER_TOKEN",
    loginCustomerId: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
    clientId: "GOOGLE_ADS_CLIENT_ID",
    clientSecret: "GOOGLE_ADS_CLIENT_SECRET",
    refreshToken: "GOOGLE_ADS_REFRESH_TOKEN",
  }
  const missing = Object.entries(creds).filter(([, v]) => !v).map(([k]) => labels[k])
  return { creds, missing }
}
type Creds = ReturnType<typeof getCreds>["creds"]

// ── OAuth: refresh_token → access_token (cache em módulo) ───────────────────
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(creds: Creds): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value
  const res = await fetchT("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`oauth_falhou: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return cachedToken.value
}

async function adsApiFetch(
  creds: Creds,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const accessToken = await getAccessToken(creds)
  const res = await fetchT(`${ADS_API_BASE}/${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": creds.developerToken,
      "login-customer-id": creds.loginCustomerId,
      "content-type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 500) } }
  return { ok: res.ok, status: res.status, data }
}

// Detecta o erro de nível de acesso e devolve mensagem honesta
function nivelInsuficiente(data: any): boolean {
  return JSON.stringify(data).includes("DEVELOPER_TOKEN_NOT_APPROVED")
}
const MSG_NIVEL = "O Google ainda não aprovou o acesso Básico da API (pedido em análise, 1-5 dias úteis). Essa operação fica disponível assim que a aprovação chegar por e-mail."

// Extrai só a mensagem amigável do erro do Google — evita devolver o payload cru (customer_id do
// MCC da agência, request-ids, resource names internos) ao cliente. O cru fica no console.
function msgErroGoogle(data: any): string {
  return data?.error?.message
    ?? data?.error?.details?.[0]?.errors?.[0]?.message
    ?? "O Google Ads recusou a operação. Tente de novo em instantes."
}

// Fallback PHRASE (não broad): se o match_type vier inválido, o erro seguro é o mais
// restrito — broad silencioso é o tipo que mais gasta.
const MATCH_TYPE_ENUM: Record<string, string> = { broad: "BROAD", phrase: "PHRASE", exact: "EXACT" }

// ── Sanitização de keywords (espelho de ads-campaign-generator) ─────────────
// Defesa na publicação: campanhas geradas ANTES da sanitização na origem podem ter
// pontuação que o Google rejeita — e o mutate é atômico (1 keyword inválida derruba
// a campanha inteira).
const KW_MAX_CHARS = 80
const KW_MAX_WORDS = 10

function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function sanitizeKeywordText(s: string): string {
  const clean = (s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-&']/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!clean || clean.length > KW_MAX_CHARS || clean.split(" ").length > KW_MAX_WORDS) return ""
  return clean
}

// Negativas não têm close variants: "grátis" NÃO bloqueia "gratis". Expande com a
// variante sem acento e deduplica.
function expandNegatives(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const text = sanitizeKeywordText(raw)
    if (!text) continue
    for (const v of [text, deaccent(text)]) {
      if (!seen.has(v)) { seen.add(v); out.push(v) }
    }
  }
  return out
}

// ── Geo targeting: resolve o nome da cidade num geoTargetConstant do Google ──
// Sem critério de localização o Google veicula no MUNDO INTEIRO — para serviço
// local isso é queima de verba. Cidade não resolvida → fallback Brasil (2076).
const GEO_BRAZIL = "geoTargetConstants/2076"
const LANG_PT = "languageConstants/1014"

async function resolveGeoTarget(creds: Creds, cidade: string): Promise<{ resource: string; nome: string } | null> {
  try {
    const res = await adsApiFetch(creds, "geoTargetConstants:suggest", {
      method: "POST",
      body: { locale: "pt-BR", countryCode: "BR", locationNames: { names: [cidade] } },
    })
    if (!res.ok) return null
    const sugestoes = (res.data.geoTargetConstantSuggestions ?? [])
      .map((s: any) => s.geoTargetConstant)
      .filter((g: any) => g?.resourceName && g?.status === "ENABLED")
    // Preferência: City > qualquer outro tipo (Municipality, Region…)
    const city = sugestoes.find((g: any) => g.targetType === "City") ?? sugestoes[0]
    return city ? { resource: city.resourceName, nome: city.name ?? cidade } : null
  } catch (e) {
    console.error("[google-ads-proxy] resolveGeoTarget:", (e as Error).message)
    return null
  }
}

// =============================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } })

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // ── Auth JWT → professional ────────────────────────────────────────────
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim()
    if (!token) return json({ error: "missing_auth" }, 401)
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) return json({ error: "invalid_auth" }, 401)

    const { data: professional } = await supabaseAdmin
      .from("professionals")
      .select("id, slug")
      .eq("user_id", userData.user.id)
      .maybeSingle()
    if (!professional) return json({ error: "professional_not_found" }, 404)
    const professionalId: string = professional.id
    const userEmail: string = userData.user.email ?? ""

    const body = await req.json().catch(() => ({}))
    const action: string = (body.action ?? "").toString()

    const { creds, missing } = getCreds()

    const getAccount = async () => {
      const { data } = await supabaseAdmin
        .from("ads_accounts")
        .select("id, external_customer_id, status, billing_configured, invited_email")
        .eq("professional_id", professionalId)
        .eq("platform", "google_ads")
        .maybeSingle()
      return data as any
    }

    // ── status ──────────────────────────────────────────────────────────────
    if (action === "status") {
      const account = await getAccount()
      return json({
        credenciais_faltando: missing,
        credenciais_ok: missing.length === 0,
        conta: account ?? null,
      })
    }

    if (missing.length > 0) {
      return json({ error: "credenciais_incompletas", faltando: missing }, 503)
    }

    // ── ping ────────────────────────────────────────────────────────────────
    if (action === "ping") {
      const res = await adsApiFetch(creds, "customers:listAccessibleCustomers")
      if (!res.ok) return json({ error: "ping_falhou", status: res.status, detalhe: msgErroGoogle(res.data) }, 502)
      return json({ sucesso: true, api_version: ADS_API_VERSION, contas_acessiveis: res.data.resourceNames ?? [] })
    }

    // ── criar_subconta ──────────────────────────────────────────────────────
    if (action === "criar_subconta") {
      const existing = await getAccount()
      if (existing?.external_customer_id) {
        return json({ sucesso: true, ja_existia: true, customer_id: existing.external_customer_id, status: existing.status })
      }

      const descriptiveName = (body.nome ?? `Primeiro Passo — ${professional.slug ?? professionalId.slice(0, 8)}`).toString()
      const res = await adsApiFetch(creds, `customers/${creds.loginCustomerId}:createCustomerClient`, {
        method: "POST",
        body: { customerClient: { descriptiveName, currencyCode: "BRL", timeZone: "America/Sao_Paulo" } },
      })
      if (!res.ok) {
        if (nivelInsuficiente(res.data)) return json({ error: "aguardando_aprovacao_google", mensagem: MSG_NIVEL }, 503)
        console.error("[google-ads-proxy] criar_subconta:", JSON.stringify(res.data).slice(0, 800))
        return json({ error: "criar_subconta_falhou", detalhe: msgErroGoogle(res.data) }, 502)
      }

      const customerId = (res.data.resourceName ?? "").split("/")[1] ?? null
      const { error: upErr } = await supabaseAdmin.from("ads_accounts").upsert({
        professional_id: professionalId,
        platform: "google_ads",
        external_customer_id: customerId,
        status: "pending_billing",
        billing_configured: false,
      }, { onConflict: "professional_id,platform" })
      if (upErr) {
        // Sub-conta REAL criada no Google mas o registro local falhou → não deixar recriar às cegas.
        console.error("[google-ads-proxy] criar_subconta upsert local:", upErr.message, "customer_id:", customerId)
        return json({
          sucesso: true,
          customer_id: customerId,
          status: "pending_billing",
          aviso_local: "Sua conta foi criada no Google, mas o registro local não salvou. NÃO clique em criar de novo — recarregue a página; se persistir, avise o suporte com este customer_id.",
        })
      }

      console.log(`[google-ads-proxy] sub-conta ${customerId} criada para ${professionalId}`)
      return json({ sucesso: true, customer_id: customerId, status: "pending_billing" })
    }

    // ── convidar_usuario: convida o e-mail do profissional como ADMIN da sub-conta ──
    if (action === "convidar_usuario") {
      const account = await getAccount()
      if (!account?.external_customer_id) return json({ error: "subconta_inexistente" }, 400)

      const email = (body.email ?? account.invited_email ?? userEmail).toString().trim()
      if (!email) return json({ error: "email_obrigatorio" }, 400)

      const res = await adsApiFetch(
        creds,
        `customers/${account.external_customer_id}/customerUserAccessInvitations:mutate`,
        { method: "POST", body: { operation: { create: { emailAddress: email, accessRole: "ADMIN" } } } },
      )
      if (!res.ok) {
        if (nivelInsuficiente(res.data)) return json({ error: "aguardando_aprovacao_google", mensagem: MSG_NIVEL }, 503)
        console.error("[google-ads-proxy] convidar_usuario:", JSON.stringify(res.data).slice(0, 800))
        return json({ error: "convite_falhou", detalhe: msgErroGoogle(res.data) }, 502)
      }

      await supabaseAdmin.from("ads_accounts")
        .update({ invited_email: email, invited_at: new Date().toISOString() })
        .eq("id", account.id)
      return json({ sucesso: true, convite_enviado_para: email })
    }

    // ── confirmar_billing: profissional declarou que cadastrou o cartão ─────
    if (action === "confirmar_billing") {
      const account = await getAccount()
      if (!account?.external_customer_id) return json({ error: "subconta_inexistente" }, 400)

      await supabaseAdmin.from("ads_accounts")
        .update({ billing_configured: true, status: "active" })
        .eq("id", account.id)
      return json({ sucesso: true, status: "active" })
    }

    // ── publicar_campanha: empurra rascunho aprovado pra sub-conta (1 mutate atômico) ──
    if (action === "publicar_campanha") {
      const campaignId = (body.campaign_id ?? "").toString()
      if (!campaignId) return json({ error: "campaign_id_obrigatorio" }, 400)

      const account = await getAccount()
      // GATE do plano: sem cartão configurado, publicação BLOQUEADA
      if (!account?.external_customer_id) return json({ error: "subconta_inexistente", mensagem: "Crie sua conta Google Ads primeiro." }, 400)
      if (!account.billing_configured) {
        return json({ error: "billing_nao_configurado", mensagem: "Cadastre o cartão na sua conta Google Ads antes de publicar — sem isso o Google não veicula." }, 400)
      }

      const { data: campaign } = await supabaseAdmin
        .from("ads_campaigns")
        .select("*")
        .eq("id", campaignId)
        .eq("professional_id", professionalId)
        .maybeSingle()
      if (!campaign) return json({ error: "campanha_nao_encontrada" }, 404)
      if ((campaign as any).external_id) {
        return json({ sucesso: true, ja_publicada: true, external_id: (campaign as any).external_id })
      }
      // Só 'approved' publica via API. 'published' aqui = já publicada manualmente pelo CSV
      // (external_id fica NULL) — republicar criaria uma SEGUNDA campanha no Google (gasto dobrado).
      if ((campaign as any).status !== "approved") {
        return json({ error: "campanha_nao_publicavel_via_api", mensagem: "Só dá pra publicar pela plataforma uma campanha aprovada. Se você já publicou pelo CSV no Ads Editor, não republique aqui." }, 400)
      }

      // Período configurado na geração (datas puras YYYY-MM-DD; hoje no fuso do Carlos/SP)
      const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
      const campStart: string | null = (campaign as any).start_date ?? null
      const campEnd: string | null = (campaign as any).end_date ?? null
      if (campEnd && campEnd < hojeSP) {
        return json({ error: "periodo_expirado", mensagem: `A data final da campanha (${campEnd}) já passou. Edite o período antes de publicar.` }, 400)
      }
      const cidadeAlvo: string = ((campaign as any).geo_targeting?.cidade ?? "").toString().trim()

      // Dupla confirmação: 1ª chamada retorna o resumo; só executa com confirmar=true
      if (body.confirmar !== true) {
        return json({
          requer_confirmacao: true,
          resumo: {
            nome: (campaign as any).name,
            orcamento_diario: `R$ ${Number((campaign as any).daily_budget_brl).toFixed(2)}/dia`,
            conta_destino: account.external_customer_id,
            segmentacao: cidadeAlvo
              ? `${cidadeAlvo} (quem está fisicamente lá) · idioma português`
              : "Brasil inteiro (campanha sem cidade definida) · idioma português",
            periodo: campStart || campEnd
              ? `${campStart && campStart > hojeSP ? `de ${campStart} ` : "a partir da ativação "}${campEnd ? `até ${campEnd}` : "(sem data final)"}`
              : "contínuo (você pausa quando quiser)",
            aviso: "A campanha será criada PAUSADA no Google Ads. Você ativa quando quiser começar a veicular.",
          },
        })
      }

      // Resolve a cidade num geoTargetConstant ANTES de montar o batch
      const geo = cidadeAlvo ? await resolveGeoTarget(creds, cidadeAlvo) : null
      const avisos: string[] = []
      if (cidadeAlvo && !geo) avisos.push(`Não achei "${cidadeAlvo}" no Google — a campanha foi segmentada para o Brasil inteiro. Ajuste a localização no Google Ads antes de ativar.`)
      if (!cidadeAlvo) avisos.push("Campanha sem cidade no brief — segmentei para o Brasil inteiro. Ajuste a localização no Google Ads antes de ativar.")

      const { data: assetsData } = await supabaseAdmin
        .from("ads_campaign_assets")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("position")
      const assets = (assetsData ?? []) as any[]
      const cid = account.external_customer_id

      // Monta o batch com resource names temporários (-1, -2, ...)
      const ops: any[] = []
      let tempId = 0
      const nextTemp = () => --tempId

      const budgetTemp = nextTemp()
      ops.push({
        campaignBudgetOperation: {
          create: {
            resourceName: `customers/${cid}/campaignBudgets/${budgetTemp}`,
            name: `Budget — ${(campaign as any).name} — ${Date.now()}`,
            amountMicros: String(Math.round(Number((campaign as any).daily_budget_brl) * 1_000_000)),
            deliveryMethod: "STANDARD",
            explicitlyShared: false,
          },
        },
      })

      const campTemp = nextTemp()
      ops.push({
        campaignOperation: {
          create: {
            resourceName: `customers/${cid}/campaigns/${campTemp}`,
            name: (campaign as any).name,
            advertisingChannelType: "SEARCH",
            status: "PAUSED", // sempre pausada — gate de segurança do plano
            manualCpc: {},
            campaignBudget: `customers/${cid}/campaignBudgets/${budgetTemp}`,
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: false,
              targetContentNetwork: false,
              targetPartnerSearchNetwork: false,
            },
            // PRESENCE: só quem está fisicamente na área (sem "interesse em" — turista
            // pesquisando sobre a cidade não é paciente)
            geoTargetTypeSetting: {
              positiveGeoTargetType: "PRESENCE",
              negativeGeoTargetType: "PRESENCE",
            },
            // Datas do período configurado na geração (start no passado = começa na ativação)
            ...(campStart && campStart > hojeSP ? { startDate: campStart } : {}),
            ...(campEnd ? { endDate: campEnd } : {}),
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          },
        },
      })

      // Localização (cidade resolvida ou Brasil) + idioma português — sem esses critérios
      // o Google veicula no mundo todo, em qualquer idioma
      ops.push({
        campaignCriterionOperation: {
          create: {
            campaign: `customers/${cid}/campaigns/${campTemp}`,
            location: { geoTargetConstant: geo?.resource ?? GEO_BRAZIL },
          },
        },
      })
      ops.push({
        campaignCriterionOperation: {
          create: {
            campaign: `customers/${cid}/campaigns/${campTemp}`,
            language: { languageConstant: LANG_PT },
          },
        },
      })

      const adGroups = assets.filter((a) => a.asset_type === "ad_group")
      for (const group of adGroups) {
        const groupTemp = nextTemp()
        ops.push({
          adGroupOperation: {
            create: {
              resourceName: `customers/${cid}/adGroups/${groupTemp}`,
              name: group.payload.name ?? "Grupo",
              campaign: `customers/${cid}/campaigns/${campTemp}`,
              type: "SEARCH_STANDARD",
              status: "ENABLED",
              cpcBidMicros: "2000000", // R$ 2,00 inicial; ajustável no Google Ads
            },
          },
        })

        const rsa = assets.find((a) => a.asset_type === "rsa" && a.parent_id === group.id)
        if (rsa) {
          ops.push({
            adGroupAdOperation: {
              create: {
                adGroup: `customers/${cid}/adGroups/${groupTemp}`,
                status: "ENABLED",
                ad: {
                  finalUrls: [rsa.payload.final_url ?? (campaign as any).landing_url],
                  responsiveSearchAd: {
                    headlines: (rsa.payload.headlines ?? []).slice(0, 15).map((t: string) => ({ text: t })),
                    descriptions: (rsa.payload.descriptions ?? []).slice(0, 4).map((t: string) => ({ text: t })),
                    path1: rsa.payload.path1 || undefined,
                    path2: rsa.payload.path2 || undefined,
                  },
                },
              },
            },
          })
        }

        // Keywords: sanitiza (pontuação inválida derrubaria o mutate atômico inteiro)
        // e deduplica dentro do grupo
        const kwGrupoSeen = new Set<string>()
        for (const kw of assets.filter((a) => a.asset_type === "keyword" && a.parent_id === group.id)) {
          const text = sanitizeKeywordText(kw.payload.text ?? "")
          const matchType = MATCH_TYPE_ENUM[kw.payload.match_type] ?? "PHRASE"
          const key = `${text}|${matchType}`
          if (!text || kwGrupoSeen.has(key)) continue
          kwGrupoSeen.add(key)
          ops.push({
            adGroupCriterionOperation: {
              create: {
                adGroup: `customers/${cid}/adGroups/${groupTemp}`,
                status: "ENABLED",
                keyword: { text, matchType },
              },
            },
          })
        }
        // Negativas do grupo com variantes sem acento (negativas não têm close variants)
        const negsGrupo = assets
          .filter((a) => a.asset_type === "negative_keyword" && a.parent_id === group.id)
          .map((a) => a.payload.text ?? "")
        for (const text of expandNegatives(negsGrupo)) {
          ops.push({
            adGroupCriterionOperation: {
              create: {
                adGroup: `customers/${cid}/adGroups/${groupTemp}`,
                negative: true,
                keyword: { text, matchType: "PHRASE" },
              },
            },
          })
        }
      }

      // Negativos de campanha (também expandidos sem acento)
      const negsCampanha = assets
        .filter((a) => a.asset_type === "negative_keyword" && !a.parent_id)
        .map((a) => a.payload.text ?? "")
      for (const text of expandNegatives(negsCampanha)) {
        ops.push({
          campaignCriterionOperation: {
            create: {
              campaign: `customers/${cid}/campaigns/${campTemp}`,
              negative: true,
              keyword: { text, matchType: "PHRASE" },
            },
          },
        })
      }

      // Sitelinks e callouts — antes eram gerados/cobrados e NUNCA publicados.
      // Asset (create) + vínculo CampaignAsset por fieldType.
      const SITELINK_LINKTEXT_MAX = 25
      const CALLOUT_TEXT_MAX = 25
      for (const sl of assets.filter((a) => a.asset_type === "sitelink")) {
        const linkText = (sl.payload.text ?? "").toString().trim().slice(0, SITELINK_LINKTEXT_MAX)
        const url = (sl.payload.url ?? (campaign as any).landing_url ?? "").toString().trim()
        if (!linkText || !url) continue
        const assetTemp = nextTemp()
        // description1/description2 são tudo-ou-nada no Google; geramos só 1 → omitimos ambas
        ops.push({
          assetOperation: {
            create: {
              resourceName: `customers/${cid}/assets/${assetTemp}`,
              finalUrls: [url],
              sitelinkAsset: { linkText },
            },
          },
        })
        ops.push({
          campaignAssetOperation: {
            create: {
              campaign: `customers/${cid}/campaigns/${campTemp}`,
              asset: `customers/${cid}/assets/${assetTemp}`,
              fieldType: "SITELINK",
            },
          },
        })
      }
      for (const co of assets.filter((a) => a.asset_type === "callout")) {
        const calloutText = (co.payload.text ?? "").toString().trim().slice(0, CALLOUT_TEXT_MAX)
        if (!calloutText) continue
        const assetTemp = nextTemp()
        ops.push({
          assetOperation: {
            create: {
              resourceName: `customers/${cid}/assets/${assetTemp}`,
              calloutAsset: { calloutText },
            },
          },
        })
        ops.push({
          campaignAssetOperation: {
            create: {
              campaign: `customers/${cid}/campaigns/${campTemp}`,
              asset: `customers/${cid}/assets/${assetTemp}`,
              fieldType: "CALLOUT",
            },
          },
        })
      }

      const res = await adsApiFetch(creds, `customers/${cid}/googleAds:mutate`, {
        method: "POST",
        body: { mutateOperations: ops },
      })
      if (!res.ok) {
        if (nivelInsuficiente(res.data)) return json({ error: "aguardando_aprovacao_google", mensagem: MSG_NIVEL }, 503)
        console.error("[google-ads-proxy] publicar_campanha:", JSON.stringify(res.data).slice(0, 1500))
        return json({ error: "publicacao_falhou", detalhe: msgErroGoogle(res.data) }, 502)
      }

      // resourceName da campanha criada (2ª operação do batch)
      const campResource = res.data.mutateOperationResponses?.[1]?.campaignResult?.resourceName ?? null
      const { error: updErr } = await supabaseAdmin.from("ads_campaigns")
        .update({ external_id: campResource, status: "published" })
        .eq("id", campaignId)
      if (updErr) {
        // A campanha REAL existe no Google mas o external_id não gravou → órfã. Não deixar a UI
        // achar que nada aconteceu (re-publicar duplicaria o gasto): devolver o ID pra vínculo.
        console.error("[google-ads-proxy] publicar_campanha update local:", updErr.message, "external_id:", campResource)
        return json({
          sucesso: true,
          external_id: campResource,
          aviso_local: "Campanha criada no Google (PAUSADA), mas o registro local não atualizou. NÃO publique de novo — recarregue a página; se o botão de publicar reaparecer, avise o suporte com este ID.",
          operacoes: ops.length,
        })
      }

      console.log(`[google-ads-proxy] campanha ${campaignId} publicada: ${campResource} (geo: ${geo?.nome ?? "Brasil"})`)
      return json({
        sucesso: true,
        external_id: campResource,
        operacoes: ops.length,
        segmentacao: geo ? `${geo.nome} (presença física) · português` : "Brasil · português",
        ...(avisos.length ? { avisos } : {}),
        aviso: "Campanha criada PAUSADA no Google Ads. Ative quando quiser veicular (ou use ativar_campanha).",
      })
    }

    // ── pausar/ativar campanha publicada ─────────────────────────────────────
    if (action === "pausar_campanha" || action === "ativar_campanha") {
      const campaignId = (body.campaign_id ?? "").toString()
      const { data: campaign } = await supabaseAdmin
        .from("ads_campaigns")
        .select("id, external_id, professional_id")
        .eq("id", campaignId)
        .eq("professional_id", professionalId)
        .maybeSingle()
      if (!campaign?.external_id) return json({ error: "campanha_nao_publicada" }, 400)

      const account = await getAccount()
      if (!account?.external_customer_id) return json({ error: "subconta_inexistente" }, 400)

      const novoStatus = action === "pausar_campanha" ? "PAUSED" : "ENABLED"
      const res = await adsApiFetch(creds, `customers/${account.external_customer_id}/campaigns:mutate`, {
        method: "POST",
        body: {
          operations: [{
            updateMask: "status",
            update: { resourceName: (campaign as any).external_id, status: novoStatus },
          }],
        },
      })
      if (!res.ok) {
        if (nivelInsuficiente(res.data)) return json({ error: "aguardando_aprovacao_google", mensagem: MSG_NIVEL }, 503)
        return json({ error: "mutacao_falhou", detalhe: msgErroGoogle(res.data) }, 502)
      }

      const { error: updErr } = await supabaseAdmin.from("ads_campaigns")
        .update({ status: action === "pausar_campanha" ? "paused" : "active" })
        .eq("id", campaignId)
      if (updErr) {
        // Ex.: ativar aceito no Google (campanha JÁ gasta) mas o status local não salvou — a UI
        // mostraria "pausada". Sinalizar em vez de responder sucesso limpo enganoso.
        console.error("[google-ads-proxy] toggle status update local:", updErr.message)
        return json({ sucesso: true, status_google: novoStatus, aviso_local: `A campanha ficou ${novoStatus} no Google, mas o registro local não atualizou — recarregue a página para ver o estado real.` })
      }
      return json({ sucesso: true, status_google: novoStatus })
    }

    // ── atualizar_budget de campanha publicada ──────────────────────────────
    if (action === "atualizar_budget") {
      const campaignId = (body.campaign_id ?? "").toString()
      const novoDiario = Number(body.daily_budget_brl)
      if (!Number.isFinite(novoDiario) || novoDiario <= 0) return json({ error: "daily_budget_brl_invalido" }, 400)

      const { data: campaign } = await supabaseAdmin
        .from("ads_campaigns")
        .select("id, external_id, name, daily_budget_brl, max_daily_budget_brl")
        .eq("id", campaignId)
        .eq("professional_id", professionalId)
        .maybeSingle()
      if (!campaign?.external_id) return json({ error: "campanha_nao_publicada" }, 400)

      // GATE do plano: o novo diário NÃO pode passar do teto que o profissional definiu.
      // (Antes, o teto era reescrito como 2× o novo valor — a trava não existia de fato.)
      const teto = Number((campaign as any).max_daily_budget_brl ?? 0)
      if (teto > 0 && novoDiario > teto) {
        return json({
          error: "acima_do_teto",
          mensagem: `O novo diário (R$ ${novoDiario.toFixed(2)}) passa do seu teto de R$ ${teto.toFixed(2)}/dia. Reduza o valor ou aumente o teto da campanha antes.`,
          teto_diario: teto,
        }, 400)
      }

      // Dupla confirmação (igual publicar): 1ª chamada devolve o resumo; só muta com confirmar=true.
      if (body.confirmar !== true) {
        return json({
          requer_confirmacao: true,
          resumo: {
            nome: (campaign as any).name,
            de: `R$ ${Number((campaign as any).daily_budget_brl).toFixed(2)}/dia`,
            para: `R$ ${novoDiario.toFixed(2)}/dia`,
            aviso: "O Google pode gastar até ~2× o diário num dia (compensa na média do mês).",
          },
        })
      }

      const account = await getAccount()
      const cid = account?.external_customer_id
      if (!cid) return json({ error: "subconta_inexistente" }, 400)

      // Descobre o budget da campanha via GAQL
      const search = await adsApiFetch(creds, `customers/${cid}/googleAds:search`, {
        method: "POST",
        body: { query: `SELECT campaign.campaign_budget FROM campaign WHERE campaign.resource_name = '${(campaign as any).external_id}'` },
      })
      const budgetResource = search.data?.results?.[0]?.campaign?.campaignBudget
      if (!search.ok || !budgetResource) {
        if (nivelInsuficiente(search.data)) return json({ error: "aguardando_aprovacao_google", mensagem: MSG_NIVEL }, 503)
        return json({ error: "budget_nao_encontrado", detalhe: msgErroGoogle(search.data) }, 502)
      }

      const res = await adsApiFetch(creds, `customers/${cid}/campaignBudgets:mutate`, {
        method: "POST",
        body: {
          operations: [{
            updateMask: "amount_micros",
            update: { resourceName: budgetResource, amountMicros: String(Math.round(novoDiario * 1_000_000)) },
          }],
        },
      })
      if (!res.ok) return json({ error: "mutacao_falhou", detalhe: msgErroGoogle(res.data) }, 502)

      // Só o diário muda; o teto NUNCA é reescrito como efeito colateral.
      const { error: updErr } = await supabaseAdmin.from("ads_campaigns")
        .update({ daily_budget_brl: novoDiario })
        .eq("id", campaignId)
      if (updErr) {
        console.error("[google-ads-proxy] atualizar_budget update local:", updErr.message)
        return json({ sucesso: true, novo_diario: novoDiario, aviso_local: "Orçamento alterado no Google, mas o registro local não atualizou — recarregue a página." })
      }
      return json({ sucesso: true, novo_diario: novoDiario })
    }

    return json({
      error: "acao_desconhecida",
      acoes: ["status", "ping", "criar_subconta", "convidar_usuario", "confirmar_billing", "publicar_campanha", "pausar_campanha", "ativar_campanha", "atualizar_budget"],
    }, 400)
  } catch (err: any) {
    console.error("[google-ads-proxy][Fatal]", err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  }
})

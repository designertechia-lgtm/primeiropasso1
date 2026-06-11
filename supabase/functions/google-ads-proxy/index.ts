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

// Versão da Google Ads API (sunset ~12 meses; validada em 11/06/2026)
const ADS_API_VERSION = "v21"
const ADS_API_BASE = `https://googleads.googleapis.com/${ADS_API_VERSION}`

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
  const res = await fetch("https://oauth2.googleapis.com/token", {
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
  const res = await fetch(`${ADS_API_BASE}/${path}`, {
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

const MATCH_TYPE_ENUM: Record<string, string> = { broad: "BROAD", phrase: "PHRASE", exact: "EXACT" }

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
      if (!res.ok) return json({ error: "ping_falhou", status: res.status, detalhe: res.data }, 502)
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
        return json({ error: "criar_subconta_falhou", detalhe: res.data }, 502)
      }

      const customerId = (res.data.resourceName ?? "").split("/")[1] ?? null
      await supabaseAdmin.from("ads_accounts").upsert({
        professional_id: professionalId,
        platform: "google_ads",
        external_customer_id: customerId,
        status: "pending_billing",
        billing_configured: false,
      }, { onConflict: "professional_id,platform" })

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
        return json({ error: "convite_falhou", detalhe: res.data }, 502)
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
      if (!["approved", "published"].includes((campaign as any).status)) {
        return json({ error: "campanha_nao_aprovada", mensagem: "Aprove a campanha antes de publicar." }, 400)
      }

      // Dupla confirmação: 1ª chamada retorna o resumo; só executa com confirmar=true
      if (body.confirmar !== true) {
        return json({
          requer_confirmacao: true,
          resumo: {
            nome: (campaign as any).name,
            orcamento_diario: `R$ ${Number((campaign as any).daily_budget_brl).toFixed(2)}/dia`,
            conta_destino: account.external_customer_id,
            aviso: "A campanha será criada PAUSADA no Google Ads. Você ativa quando quiser começar a veicular.",
          },
        })
      }

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
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
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

        for (const kw of assets.filter((a) => a.asset_type === "keyword" && a.parent_id === group.id)) {
          ops.push({
            adGroupCriterionOperation: {
              create: {
                adGroup: `customers/${cid}/adGroups/${groupTemp}`,
                status: "ENABLED",
                keyword: { text: kw.payload.text, matchType: MATCH_TYPE_ENUM[kw.payload.match_type] ?? "BROAD" },
              },
            },
          })
        }
        for (const neg of assets.filter((a) => a.asset_type === "negative_keyword" && a.parent_id === group.id)) {
          ops.push({
            adGroupCriterionOperation: {
              create: {
                adGroup: `customers/${cid}/adGroups/${groupTemp}`,
                negative: true,
                keyword: { text: neg.payload.text, matchType: "PHRASE" },
              },
            },
          })
        }
      }

      // Negativos de campanha
      for (const neg of assets.filter((a) => a.asset_type === "negative_keyword" && !a.parent_id)) {
        ops.push({
          campaignCriterionOperation: {
            create: {
              campaign: `customers/${cid}/campaigns/${campTemp}`,
              negative: true,
              keyword: { text: neg.payload.text, matchType: "PHRASE" },
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
        return json({ error: "publicacao_falhou", detalhe: res.data }, 502)
      }

      // resourceName da campanha criada (2ª operação do batch)
      const campResource = res.data.mutateOperationResponses?.[1]?.campaignResult?.resourceName ?? null
      await supabaseAdmin.from("ads_campaigns")
        .update({ external_id: campResource, status: "published" })
        .eq("id", campaignId)

      console.log(`[google-ads-proxy] campanha ${campaignId} publicada: ${campResource}`)
      return json({
        sucesso: true,
        external_id: campResource,
        operacoes: ops.length,
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
        return json({ error: "mutacao_falhou", detalhe: res.data }, 502)
      }

      await supabaseAdmin.from("ads_campaigns")
        .update({ status: action === "pausar_campanha" ? "paused" : "active" })
        .eq("id", campaignId)
      return json({ sucesso: true, status_google: novoStatus })
    }

    // ── atualizar_budget de campanha publicada ──────────────────────────────
    if (action === "atualizar_budget") {
      const campaignId = (body.campaign_id ?? "").toString()
      const novoDiario = Number(body.daily_budget_brl)
      if (!novoDiario || novoDiario <= 0) return json({ error: "daily_budget_brl_invalido" }, 400)

      const { data: campaign } = await supabaseAdmin
        .from("ads_campaigns")
        .select("id, external_id")
        .eq("id", campaignId)
        .eq("professional_id", professionalId)
        .maybeSingle()
      if (!campaign?.external_id) return json({ error: "campanha_nao_publicada" }, 400)

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
        return json({ error: "budget_nao_encontrado", detalhe: search.data }, 502)
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
      if (!res.ok) return json({ error: "mutacao_falhou", detalhe: res.data }, 502)

      await supabaseAdmin.from("ads_campaigns")
        .update({ daily_budget_brl: novoDiario, max_daily_budget_brl: +(novoDiario * 2).toFixed(2) })
        .eq("id", campaignId)
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

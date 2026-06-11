// =============================================================================
// google-ads-proxy — porta ÚNICA da plataforma pra Google Ads API
//
// v1 (Etapa 5): ping (valida credenciais) + criar_subconta (createCustomerClient).
// Próximas: publicar_campanha / atualizar_budget / pausar — só com billing_configured.
//
// Secrets necessários (Supabase):
//   GOOGLE_ADS_DEVELOPER_TOKEN     — Central de API da MCC
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID   — ID da MCC sem hífens (9322584598)
//   GOOGLE_ADS_CLIENT_ID           — OAuth client (Google Cloud)
//   GOOGLE_ADS_CLIENT_SECRET       — OAuth client (Google Cloud)
//   GOOGLE_ADS_REFRESH_TOKEN       — gerado uma vez com a conta dona da MCC
// =============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Versão da Google Ads API — ajustar quando o Google aposentar (sunset ~12 meses)
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
  const missing = Object.entries(creds)
    .filter(([, v]) => !v)
    .map(([k]) => ({
      developerToken: "GOOGLE_ADS_DEVELOPER_TOKEN",
      loginCustomerId: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
      clientId: "GOOGLE_ADS_CLIENT_ID",
      clientSecret: "GOOGLE_ADS_CLIENT_SECRET",
      refreshToken: "GOOGLE_ADS_REFRESH_TOKEN",
    }[k as keyof typeof creds]))
  return { creds, missing }
}

// ── OAuth: refresh_token → access_token (cache em módulo) ───────────────────
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(creds: ReturnType<typeof getCreds>["creds"]): Promise<string> {
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
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`oauth_falhou: ${res.status} ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return cachedToken.value
}

async function adsApiFetch(
  creds: ReturnType<typeof getCreds>["creds"],
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

    const body = await req.json().catch(() => ({}))
    const action: string = (body.action ?? "").toString()

    const { creds, missing } = getCreds()

    // ── status: o que já está configurado (não chama o Google) ─────────────
    if (action === "status") {
      const { data: account } = await supabaseAdmin
        .from("ads_accounts")
        .select("external_customer_id, status, billing_configured, invited_email")
        .eq("professional_id", professionalId)
        .eq("platform", "google_ads")
        .maybeSingle()
      return json({
        credenciais_faltando: missing,
        credenciais_ok: missing.length === 0,
        conta: account ?? null,
      })
    }

    if (missing.length > 0) {
      return json({
        error: "credenciais_incompletas",
        faltando: missing,
        mensagem: "Configure os secrets faltantes no Supabase antes de usar a API.",
      }, 503)
    }

    // ── ping: valida credenciais de ponta a ponta ───────────────────────────
    if (action === "ping") {
      const res = await adsApiFetch(creds, "customers:listAccessibleCustomers")
      if (!res.ok) {
        console.error("[google-ads-proxy] ping falhou:", JSON.stringify(res.data).slice(0, 500))
        return json({ error: "ping_falhou", status: res.status, detalhe: res.data }, 502)
      }
      return json({
        sucesso: true,
        api_version: ADS_API_VERSION,
        contas_acessiveis: res.data.resourceNames ?? [],
      })
    }

    // ── criar_subconta: createCustomerClient sob a MCC ──────────────────────
    if (action === "criar_subconta") {
      // Idempotência: já existe?
      const { data: existing } = await supabaseAdmin
        .from("ads_accounts")
        .select("id, external_customer_id, status")
        .eq("professional_id", professionalId)
        .eq("platform", "google_ads")
        .maybeSingle()
      if (existing?.external_customer_id) {
        return json({
          sucesso: true,
          ja_existia: true,
          customer_id: existing.external_customer_id,
          status: existing.status,
        })
      }

      const descriptiveName: string = (body.nome ?? `Primeiro Passo — ${professional.slug ?? professionalId.slice(0, 8)}`).toString()
      const res = await adsApiFetch(
        creds,
        `customers/${creds.loginCustomerId}:createCustomerClient`,
        {
          method: "POST",
          body: {
            customerClient: {
              descriptiveName,
              currencyCode: "BRL",
              timeZone: "America/Sao_Paulo",
            },
          },
        },
      )
      if (!res.ok) {
        console.error("[google-ads-proxy] criar_subconta falhou:", JSON.stringify(res.data).slice(0, 800))
        return json({ error: "criar_subconta_falhou", status: res.status, detalhe: res.data }, 502)
      }

      // resourceName: "customers/1234567890"
      const customerId = (res.data.resourceName ?? "").split("/")[1] ?? null
      const { error: upsertErr } = await supabaseAdmin
        .from("ads_accounts")
        .upsert({
          professional_id: professionalId,
          platform: "google_ads",
          external_customer_id: customerId,
          status: "pending_billing",
          billing_configured: false,
        }, { onConflict: "professional_id,platform" })
      if (upsertErr) console.error("[google-ads-proxy] upsert ads_accounts:", upsertErr.message)

      console.log(`[google-ads-proxy] sub-conta ${customerId} criada para ${professionalId}`)
      return json({ sucesso: true, customer_id: customerId, status: "pending_billing" })
    }

    return json({ error: "acao_desconhecida", acoes: ["status", "ping", "criar_subconta"] }, 400)
  } catch (err: any) {
    console.error("[google-ads-proxy][Fatal]", err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  }
})

// =============================================================================
// ads-metrics-sync — cron diário (06:00 UTC): puxa métricas do Google Ads
// pra ads_campaign_metrics (últimos 7 dias, upsert idempotente).
//
// Chamado pelo pg_cron com o service role como Bearer. Sem campanhas
// publicadas via API (external_id) não há o que sincronizar. Com nível
// Explorer, o Google recusa — a função sai limpa e registra o motivo.
// =============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

// v24 desde 15/07/2026 — Google descontinua a v21 em 05/08/2026 (e-mail oficial);
// diag validado na v24 antes da troca (OAuth+leitura+mutate respondem normalmente).
const ADS_API_VERSION = "v24"
const ADS_API_BASE = `https://googleads.googleapis.com/${ADS_API_VERSION}`

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // Só o cron (service role) pode disparar
    const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim()
    if (bearer !== serviceRoleKey) return json({ error: "forbidden" }, 403)

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? ""
    const loginCustomerId = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? ""
    const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID") ?? ""
    const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") ?? ""
    const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN") ?? ""
    if (!developerToken || !clientId || !clientSecret || !refreshToken) {
      return json({ skipped: "credenciais_incompletas" })
    }

    // Campanhas publicadas via API, agrupadas por sub-conta
    const { data: campaigns } = await supabaseAdmin
      .from("ads_campaigns")
      .select("id, external_id, professional_id")
      .not("external_id", "is", null)
      .neq("status", "archived")
    if (!campaigns || campaigns.length === 0) {
      return json({ skipped: "nenhuma_campanha_publicada_via_api" })
    }

    const { data: accounts } = await supabaseAdmin
      .from("ads_accounts")
      .select("professional_id, external_customer_id")
      .eq("platform", "google_ads")
      .not("external_customer_id", "is", null)
    const accountByProfessional = new Map(
      (accounts ?? []).map((a: any) => [a.professional_id, a.external_customer_id]),
    )
    const campaignByResource = new Map(
      campaigns.map((c: any) => [c.external_id, c.id]),
    )

    // OAuth
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    })
    if (!tokenRes.ok) return json({ error: "oauth_falhou", detalhe: (await tokenRes.text()).slice(0, 200) }, 502)
    const accessToken = (await tokenRes.json()).access_token

    const customerIds = [...new Set(
      campaigns
        .map((c: any) => accountByProfessional.get(c.professional_id))
        .filter(Boolean),
    )] as string[]

    let upserted = 0
    const erros: string[] = []

    for (const cid of customerIds) {
      const res = await fetch(`${ADS_API_BASE}/customers/${cid}/googleAds:search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "login-customer-id": loginCustomerId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: `
            SELECT campaign.resource_name, segments.date,
                   metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
            FROM campaign
            WHERE segments.date DURING LAST_7_DAYS`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = JSON.stringify(data).slice(0, 300)
        if (msg.includes("DEVELOPER_TOKEN_NOT_APPROVED")) {
          console.log("[ads-metrics-sync] aguardando acesso Básico do Google")
          return json({ skipped: "aguardando_aprovacao_google" })
        }
        console.error(`[ads-metrics-sync] conta ${cid}:`, msg)
        erros.push(`${cid}: HTTP ${res.status}`)
        continue
      }

      const rows = data.results ?? []
      const upserts = rows
        .map((r: any) => {
          const campaignId = campaignByResource.get(r.campaign?.resourceName)
          if (!campaignId) return null
          return {
            campaign_id: campaignId,
            date: r.segments?.date,
            impressions: Number(r.metrics?.impressions ?? 0),
            clicks: Number(r.metrics?.clicks ?? 0),
            cost_brl: +(Number(r.metrics?.costMicros ?? 0) / 1_000_000).toFixed(2),
            conversions: Number(r.metrics?.conversions ?? 0),
          }
        })
        .filter(Boolean)

      if (upserts.length > 0) {
        const { error } = await supabaseAdmin
          .from("ads_campaign_metrics")
          .upsert(upserts, { onConflict: "campaign_id,date" })
        if (error) erros.push(`upsert ${cid}: ${error.message}`)
        else upserted += upserts.length
      }
    }

    console.log(`[ads-metrics-sync] ${upserted} linhas em ${customerIds.length} conta(s)`)
    return json({ sucesso: true, contas: customerIds.length, linhas: upserted, erros })
  } catch (err: any) {
    console.error("[ads-metrics-sync][Fatal]", err.message)
    return json({ error: err.message }, 500)
  }
})

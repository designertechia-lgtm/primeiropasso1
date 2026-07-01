// Webhook ÚNICO da WhatsApp Cloud API (oficial) — recebe de TODOS os números dos
// profissionais e identifica cada um pelo `phone_number_id` do payload da Meta.
//
// GET  = verificação do webhook (a Meta chama 1x com hub.challenge).
// POST = mensagens recebidas.
//
// FASE 1 (agora): eco — prova o ciclo receber→responder pela API oficial com o número
//   de teste, SEM depender de App Review/verificação.
// FASE 2 (próxima): em vez de ecoar, normaliza o payload e chama o cérebro do Axel
//   (whatsapp-agent), reaproveitando crise/triagem/debounce/lock — Evolution e Cloud
//   coexistindo. O envio vira uma camada única (Cloud x Evolution por profissional).
//
// IMPORTANTE: a Meta chama esta edge SEM JWT do Supabase → precisa de `verify_jwt = false`
// no supabase/config.toml (igual aos callbacks oauth-*).

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const FALLBACK_TOKEN = Deno.env.get("WHATSAPP_CLOUD_TOKEN") ?? ""; // token do número de teste (Fase 1)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

function jsonOk(o: unknown) {
  return new Response(JSON.stringify(o), {
    status: 200, // sempre 200: erro 4xx/5xx faz a Meta re-tentar e empilhar
    headers: { "Content-Type": "application/json" },
  });
}

// fetch com timeout — Graph API costuma responder <2s; cortamos em 10s.
async function fetchT(url: string, opts: RequestInit = {}, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Acha a conta/profissional dono deste número (multi-tenant). Null = número não cadastrado.
async function findAccount(phoneNumberId: string): Promise<{ professional_id: string; access_token: string } | null> {
  const res = await fetchT(
    `${SUPABASE_URL}/rest/v1/whatsapp_cloud_accounts?phone_number_id=eq.${phoneNumberId}&status=eq.active&select=professional_id,access_token&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function sendText(phoneNumberId: string, token: string, to: string, body: string): Promise<void> {
  const res = await fetchT(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
  if (!res.ok) {
    console.error(`[cloud send] ${res.status}: ${await res.text().catch(() => "")}`);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 1. Verificação do webhook (Meta chama via GET com hub.challenge)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok");

  try {
    const body = await req.json();
    // Estrutura: entry[].changes[].value.{ metadata.phone_number_id, messages[], contacts[], statuses[] }
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
    const msg = value?.messages?.[0];

    // Sem mensagem (ex.: webhook de status 'sent/delivered/read') → ignora sem re-tentativa.
    if (!msg || !phoneNumberId) return jsonOk({ ignored: true, reason: "no_inbound_message" });

    const from: string = msg.from; // E.164 sem '+'
    const text: string =
      msg.text?.body ??
      msg.button?.text ??
      msg.interactive?.button_reply?.title ??
      msg.interactive?.list_reply?.title ??
      "";

    if (!from || !text) return jsonOk({ ignored: true, reason: "no_text", type: msg.type });

    // Identifica o profissional dono deste número (Fase 2 usa isso pra rotear ao Axel).
    const account = await findAccount(phoneNumberId);
    const token = account?.access_token || FALLBACK_TOKEN;

    if (!token) {
      console.error(`[whatsapp-cloud-webhook] sem token para phone_number_id=${phoneNumberId}`);
      return jsonOk({ ignored: true, reason: "no_token", phoneNumberId });
    }

    // ── FASE 1: ECO (prova receber+enviar pela API oficial) ──
    // Fase 2 troca esta linha por: normalizar payload → chamar whatsapp-agent (cérebro do Axel).
    await sendText(phoneNumberId, token, from, `🟢 Recebi pela API oficial do WhatsApp: "${text}"`);

    return jsonOk({ ok: true, phoneNumberId, from, hasAccount: !!account });
  } catch (e) {
    console.error("[whatsapp-cloud-webhook]", e);
    return jsonOk({ error: String(e) }); // 200 mesmo em erro: evita re-tentativa em loop da Meta
  }
});

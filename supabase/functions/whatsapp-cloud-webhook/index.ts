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
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? ""; // B1: valida X-Hub-Signature-256 da Meta
// Números de TESTE da Meta liberados para o modo eco (Fase 1), separados por vírgula.
// O eco NUNCA vale para número real: sem conta ativa e fora desta lista, a mensagem não é
// respondida com scaffolding de teste (evita vazar "🟢 Recebi..." pra paciente).
const ECO_IDS = (Deno.env.get("WHATSAPP_CLOUD_TEST_NUMBER_IDS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ECO_PERMITIDO = (phoneNumberId: string) => ECO_IDS.includes(phoneNumberId);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

// B1: confirma que o POST veio MESMO da Meta (corpo assinado com o App Secret via HMAC-SHA256).
// Sem WHATSAPP_APP_SECRET configurado, o gate fica DESLIGADO (apenas loga) pra não quebrar o eco
// da Fase 1 — ao setar o secret no painel da Meta + no Supabase, a validação passa a valer.
async function assinaturaValida(rawBody: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET) return true; // gate desligado até setar o secret
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expected = header.slice("sha256=".length).trim().toLowerCase();
  if (hex.length !== expected.length) return false;
  let diff = 0; // comparação de tempo constante
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

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

// FASE 2: traduz a mensagem da Meta pro formato messages.upsert (estilo Evolution) e
// entrega ao whatsapp-webhook — o pipeline inteiro (lead/dedup/triagem/debounce/lock/
// crise/agente) é reaproveitado sem duplicação. O envio da resposta é decidido lá
// pelo canal do profissional (professionals.whatsapp_channel = 'cloud' → Graph API).
async function forwardToPipeline(professionalId: string, msg: any, from: string, text: string, pushName: string): Promise<void> {
  // instance é a CHAVE de lookup do professional no pipeline — usa o evolution_instance_name.
  // (o cadastro da conta cloud garante um valor sintético 'cloud_<id>' quando não havia instância)
  // Falha de FETCH é diferente de coluna vazia: a primeira é transitória e merece retry (lançar),
  // a segunda é configuração e não adianta insistir.
  let instanceName: string | undefined;
  let lastErr = "";
  for (let i = 0; i < 3 && !instanceName; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, i * 1500));
    try {
      const res = await fetchT(
        `${SUPABASE_URL}/rest/v1/professionals?id=eq.${professionalId}&select=evolution_instance_name&limit=1`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
      );
      if (!res.ok) { lastErr = `lookup ${res.status}`; continue; }
      const pro = (await res.json().catch(() => []))?.[0];
      if (!pro) { lastErr = "professional_not_found"; break; }
      if (!pro.evolution_instance_name) { lastErr = "sem_instance_name"; break; }
      instanceName = pro.evolution_instance_name;
    } catch (e) {
      lastErr = (e as any)?.message || "lookup_falhou";
    }
  }
  if (!instanceName) {
    // Lança: o caller loga como falha (mensagem de paciente NÃO pode sumir em silêncio).
    throw new Error(`professional ${professionalId} sem chave de pipeline (${lastErr})`);
  }

  // Cliques de botão/lista da Meta viram o formato que o pipeline entende (clickId → fluxo sat:,
  // lembretes etc). Texto puro segue como conversation.
  const brId = msg?.interactive?.button_reply;
  const listId = msg?.interactive?.list_reply;
  const tplBtn = msg?.button;
  const message: Record<string, unknown> = brId
    ? { buttonsResponseMessage: { selectedButtonId: brId.id, selectedDisplayText: brId.title } }
    : listId
    ? { listResponseMessage: { title: listId.title, singleSelectReply: { selectedRowId: listId.id } } }
    : tplBtn
    ? { templateButtonReplyMessage: { selectedId: tplBtn.payload ?? tplBtn.text, selectedDisplayText: tplBtn.text } }
    : { conversation: text };

  const payload = {
    event: "messages.upsert",
    instance: instanceName,
    data: {
      key: {
        remoteJid: `${from}@s.whatsapp.net`,
        fromMe: false,
        id: msg?.id || "", // wamid da Meta → provider_message_id (dedup B5 do pipeline)
      },
      pushName: pushName || "Visitante",
      message,
    },
  };

  // O pipeline leva 10-40s (debounce + LLM). Timeout largo; quem chama usa waitUntil.
  // Retry em falha de rede/5xx/401: é SEGURO porque o pipeline deduplica por
  // provider_message_id (wamid) — UNIQUE(lead_id, provider_message_id).
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    // relê o secret a cada tentativa (cobre rotação com isolate antigo)
    const secret = Deno.env.get("WHATSAPP_WEBHOOK_SECRET") || "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers["x-webhook-secret"] = secret;
    try {
      const r = await fetchT(`${SUPABASE_URL}/functions/v1/whatsapp-webhook`, {
        method: "POST", headers, body: JSON.stringify(payload),
      }, 90000);
      if (r.ok) {
        console.log(`[cloud→pipeline] entregue (tentativa ${tentativa})`);
        return;
      }
      console.error(`[cloud→pipeline] webhook respondeu ${r.status} (tentativa ${tentativa})`);
      if (r.status >= 400 && r.status < 500 && r.status !== 401) return; // erro de payload: insistir não resolve
    } catch (e) {
      console.error(`[cloud→pipeline] tentativa ${tentativa} falhou:`, (e as any)?.message);
    }
    if (tentativa < 3) await new Promise((r) => setTimeout(r, tentativa * 2000));
  }
  throw new Error("pipeline não confirmou entrega após 3 tentativas");
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
    // B1: lê o corpo CRU e valida a assinatura da Meta ANTES de processar.
    const raw = await req.text();
    if (!(await assinaturaValida(raw, req.headers.get("x-hub-signature-256")))) {
      console.warn("[whatsapp-cloud-webhook] X-Hub-Signature-256 inválida — requisição rejeitada");
      return new Response("invalid signature", { status: 401 });
    }
    const body = JSON.parse(raw);
    const assinado = !!req.headers.get("x-hub-signature-256") && !!APP_SECRET;

    // A Meta AGREGA mensagens num único POST (rajada do lead, reentrega após downtime,
    // vários números por WABA). Iterar entry[] × changes[] × messages[] — processar só o
    // índice [0] descartaria o resto em silêncio (com 200, sem reentrega).
    const tarefas: Promise<unknown>[] = [];
    const resumo: Array<Record<string, unknown>> = [];

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
        const mensagens = value?.messages ?? [];
        if (!phoneNumberId || mensagens.length === 0) continue; // status sent/delivered/read

        // 1 lookup por número (pode variar entre entries)
        const account = await findAccount(phoneNumberId);

        // SEGURANÇA: tráfego de tenant REAL só passa com assinatura da Meta validada.
        // Sem WHATSAPP_APP_SECRET setado, o gate global é permissivo (Fase 1/eco) — mas
        // NUNCA roteamos pro pipeline nem enviamos com o token do tenant sem assinatura.
        if (account && !assinado) {
          console.error(`[whatsapp-cloud-webhook] conta ativa (${phoneNumberId}) com requisição NÃO assinada — recusada. Configure WHATSAPP_APP_SECRET.`);
          resumo.push({ phoneNumberId, ignored: "unsigned_for_active_account" });
          continue;
        }

        for (const msg of mensagens) {
          const from: string = msg?.from;
          if (!from) continue;
          const text: string =
            msg.text?.body ??
            msg.button?.text ??
            msg.interactive?.button_reply?.title ??
            msg.interactive?.list_reply?.title ??
            "";
          const ehClique = !!(msg.interactive?.button_reply || msg.interactive?.list_reply || msg.button);

          // B4: mensagem NÃO-texto (áudio/imagem/documento) → responde educado em vez de silêncio.
          if (!text && !ehClique) {
            const tk = account?.access_token || (ECO_PERMITIDO(phoneNumberId) ? FALLBACK_TOKEN : "");
            if (tk) await sendText(phoneNumberId, tk, from, "Por enquanto eu só consigo ler mensagens de texto por aqui 🙂 Pode me escrever?");
            resumo.push({ from, ignored: "no_text", type: msg.type });
            continue;
          }

          // ── FASE 2: conta cadastrada → pipeline real do Axel (via adapter).
          if (account) {
            const contactName: string = value?.contacts?.[0]?.profile?.name || "";
            tarefas.push(
              forwardToPipeline(account.professional_id, msg, from, text, contactName)
                .catch((e) => console.error(`[cloud→pipeline] PERDA de mensagem de ${from} (wamid ${msg?.id}):`, e?.message)),
            );
            resumo.push({ from, routed: "pipeline" });
            continue;
          }

          // ── Sem conta ativa: só ecoa se for número de TESTE explicitamente liberado.
          // (senão um número real com conta 'inactive'/typo receberia scaffolding de teste)
          if (!ECO_PERMITIDO(phoneNumberId) || !FALLBACK_TOKEN) {
            console.error(`[whatsapp-cloud-webhook] sem conta ativa para phone_number_id=${phoneNumberId} — mensagem NÃO processada`);
            resumo.push({ from, ignored: "no_active_account", phoneNumberId });
            continue;
          }
          await sendText(phoneNumberId, FALLBACK_TOKEN, from, `🟢 Recebi pela API oficial do WhatsApp: "${text}"`);
          resumo.push({ from, routed: "echo" });
        }
      }
    }

    if (tarefas.length === 0) return jsonOk({ ok: true, resumo });

    // Responde 200 JÁ (o pipeline leva 10-40s; a Meta re-tentaria em timeout) e conclui
    // o encaminhamento em background.
    const tudo = Promise.allSettled(tarefas);
    // @ts-ignore EdgeRuntime é global no runtime do Supabase Edge
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any)?.waitUntil) {
      // @ts-ignore
      ;(EdgeRuntime as any).waitUntil(tudo);
    } else {
      await tudo;
    }
    return jsonOk({ ok: true, resumo });
  } catch (e) {
    console.error("[whatsapp-cloud-webhook]", e);
    return jsonOk({ error: String(e) }); // 200 mesmo em erro: evita re-tentativa em loop da Meta
  }
});

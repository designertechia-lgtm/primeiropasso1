import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Busca server-side do iCal do Google Agenda para o front (o navegador não
// consegue buscar direto por CORS, e proxies públicos bloqueiam produção).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Só Google Agenda — a função não pode virar proxy aberto (SSRF).
const ALLOWED_HOSTS = new Set(["calendar.google.com", "www.google.com"]);

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // O deploy via Management API desliga verify_jwt — a validação é aqui.
  const authHeader = req.headers.get("Authorization") ?? "";
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (authErr || !user) return json(401, { error: "unauthorized" });

  let url = "";
  try {
    ({ url } = await req.json());
  } catch {
    return json(400, { error: "invalid_body" });
  }

  let parsed: URL;
  try {
    parsed = new URL(String(url));
  } catch {
    return json(400, { error: "invalid_url" });
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return json(400, { error: "host_not_allowed" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return json(502, { error: "fetch_failed", status: res.status });
    const text = await res.text();
    return new Response(text, {
      headers: { ...cors, "Content-Type": "text/calendar; charset=utf-8" },
    });
  } catch {
    return json(504, { error: "fetch_timeout" });
  } finally {
    clearTimeout(timer);
  }
});

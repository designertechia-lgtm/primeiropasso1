// Cancela a assinatura recorrente do profissional no Asaas (DELETE /subscriptions/{id}) para
// PARAR cobranças futuras — o período já pago é mantido (current_period_end intacto).
//
// Usado por: auto-cancelamento (profissional), cancelamento pelo gerente, exclusão de conta
// (chamar ANTES de apagar) e ao ligar cortesia (mode='cortesia' só desacopla a cobrança).
//
// Auth por JWT. Sem professional_id age sobre o próprio; com professional_id exige super_admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ASAAS_BASE = Deno.env.get("ASAAS_BASE_URL") ?? "https://api-sandbox.asaas.com/v3";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
async function asaas(path: string, method: string, apiKey: string, body?: unknown) {
  const r = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: { access_token: apiKey, "Content-Type": "application/json", "User-Agent": "primeiropasso/1.0" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, any>;
  try { body = await req.json().catch(() => ({})); } catch { body = {}; }
  const targetPid: string | undefined = body?.professional_id;
  // mode 'cortesia' só desacopla a cobrança (não revoga acesso); default = cancelamento total.
  const cortesia = body?.mode === "cortesia";

  try {
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve o profissional-alvo. Agir sobre outro exige super_admin.
    let professionalId: string;
    if (targetPid) {
      const { data: me } = await admin.from("professionals").select("role").eq("user_id", user.id).maybeSingle();
      if (!me || me.role !== "super_admin") return json({ error: "Forbidden" }, 403);
      professionalId = targetPid;
    } else {
      const { data: me } = await admin.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
      if (!me) return json({ error: "Profissional não encontrado" }, 404);
      professionalId = me.id;
    }

    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, asaas_subscription_id")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub) return json({ ok: true, cancelled: false, asaas_cancelled: false, note: "sem assinatura" });

    // Cancela a recorrência no Asaas (idempotente: 404 = já removida).
    let asaasCancelled = false;
    if (sub.asaas_subscription_id) {
      const apiKey = Deno.env.get("ASAAS_API_KEY");
      if (!apiKey) return json({ error: "ASAAS_API_KEY não configurada" }, 500);
      const del = await asaas(`/subscriptions/${sub.asaas_subscription_id}`, "DELETE", apiKey);
      if (del.ok || del.status === 404) {
        asaasCancelled = true;
      } else {
        return json({ error: del.data?.errors?.[0]?.description ?? "Erro ao cancelar no Asaas", asaas: del.data }, 400);
      }
    }

    // Desacopla a cobrança (limpa o vínculo Asaas). Cancelamento total também marca status.
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      asaas_subscription_id: null,
      payment_method: null,
      card_last4: null,
      card_brand: null,
      updated_at: now,
    };
    if (!cortesia) {
      patch.status = "cancelled";
      patch.cancelled_at = now;
    }
    // current_period_end e monthly_price_brl são preservados (acesso até o fim do período pago).
    await admin.from("subscriptions").update(patch).eq("id", sub.id);

    return json({ ok: true, cancelled: !cortesia, asaas_cancelled: asaasCancelled });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

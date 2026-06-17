// Cria a subconta Asaas do profissional (white-label) e guarda accountId + walletId.
// O walletId é usado no split das cobranças. Idempotente: se já existe, retorna a atual.
// Base sandbox por padrão; em produção, definir o secret ASAAS_BASE_URL=https://api.asaas.com/v3
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ASAAS_BASE = Deno.env.get("ASAAS_BASE_URL") ?? "https://api-sandbox.asaas.com/v3";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("ASAAS_API_KEY");
  if (!apiKey) return json({ error: "ASAAS_API_KEY não configurada" }, 500);

  try {
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    let body: Record<string, any>;
    try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

    const required = ["cpfCnpj", "mobilePhone", "incomeValue", "address", "addressNumber", "province", "postalCode"];
    const missing = required.filter((k) => !body?.[k] && body?.[k] !== 0);
    if (missing.length) return json({ error: `Campos obrigatórios: ${missing.join(", ")}` }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: pro } = await admin
      .from("professionals")
      .select("id, asaas_account_id, asaas_wallet_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!pro) return json({ error: "Profissional não encontrado" }, 404);
    if (pro.asaas_account_id) return json({ ok: true, already: true, walletId: pro.asaas_wallet_id });

    const { data: profile } = await admin.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();

    const payload: Record<string, unknown> = {
      name: profile?.full_name || "Profissional",
      email: user.email,
      cpfCnpj: String(body.cpfCnpj).replace(/\D/g, ""),
      mobilePhone: String(body.mobilePhone).replace(/\D/g, ""),
      incomeValue: Number(body.incomeValue),
      address: body.address,
      addressNumber: String(body.addressNumber),
      province: body.province,
      postalCode: String(body.postalCode).replace(/\D/g, ""),
    };
    if (body.complement) payload.complement = body.complement;
    if (body.companyType) payload.companyType = body.companyType;

    const r = await fetch(`${ASAAS_BASE}/accounts`, {
      method: "POST",
      headers: { access_token: apiKey, "Content-Type": "application/json", "User-Agent": "primeiropasso/1.0" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.walletId) {
      const msg = data?.errors?.[0]?.description ?? `Asaas HTTP ${r.status}`;
      return json({ error: msg, asaas: data }, 400);
    }

    await admin
      .from("professionals")
      .update({ asaas_account_id: data.id, asaas_wallet_id: data.walletId })
      .eq("id", pro.id);

    return json({ ok: true, walletId: data.walletId, accountId: data.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

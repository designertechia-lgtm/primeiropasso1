// Carteira do profissional: consulta saldo, cadastra a chave PIX de saque e faz o saque.
// Autenticada por JWT do profissional (como a asaas-onboarding). Usa a apiKey da SUBCONTA
// (guardada em asaas_subaccount_credentials, tabela só-servidor) p/ falar com o Asaas em nome dele.
// Ações (body.action): "status" (default) | "save_pix" | "withdraw".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ASAAS_BASE = Deno.env.get("ASAAS_BASE_URL") ?? "https://api-sandbox.asaas.com/v3";
const PIX_TYPES = ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"];

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
  const apiSecret = Deno.env.get("ASAAS_API_KEY");
  if (!apiSecret) return json({ error: "ASAAS_API_KEY não configurada" }, 500);

  try {
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: pro } = await admin
      .from("professionals").select("id").eq("user_id", user.id).maybeSingle();
    if (!pro) return json({ error: "Profissional não encontrado" }, 404);

    const { data: cred } = await admin
      .from("asaas_subaccount_credentials")
      .select("api_key, payout_pix_key, payout_pix_key_type")
      .eq("professional_id", pro.id).maybeSingle();

    const body = await req.json().catch(() => ({}));
    const action = (body as any).action ?? "status";

    // Sem apiKey guardada = recebimentos não ativados (ou subconta antiga sem a chave).
    if (!cred?.api_key) {
      if (action === "status") return json({ ok: true, active: false, balance: 0 });
      return json({ error: "Ative os recebimentos primeiro." }, 400);
    }
    const apiKey = cred.api_key;

    if (action === "status") {
      const bal = await asaas("/finance/balance", "GET", apiKey);
      const balance = bal.ok ? Number(bal.data?.balance ?? 0) : 0;
      const { data: history } = await admin
        .from("payout_transfers")
        .select("id, amount_brl, status, created_at")
        .eq("professional_id", pro.id)
        .order("created_at", { ascending: false }).limit(10);
      return json({
        ok: true, active: true, balance,
        payout_pix_key: cred.payout_pix_key, payout_pix_key_type: cred.payout_pix_key_type,
        history: history ?? [],
      });
    }

    if (action === "save_pix") {
      const pixKey = String((body as any).pixKey ?? "").trim();
      const pixType = String((body as any).pixKeyType ?? "").trim().toUpperCase();
      if (!pixKey || !PIX_TYPES.includes(pixType)) return json({ error: "Informe a chave PIX e o tipo." }, 400);
      await admin.from("asaas_subaccount_credentials")
        .update({ payout_pix_key: pixKey, payout_pix_key_type: pixType, updated_at: new Date().toISOString() })
        .eq("professional_id", pro.id);
      return json({ ok: true });
    }

    if (action === "withdraw") {
      const value = Number((body as any).value);
      if (!value || value <= 0) return json({ error: "Valor inválido." }, 400);
      if (!cred.payout_pix_key || !cred.payout_pix_key_type) {
        return json({ error: "Cadastre sua chave PIX de saque primeiro." }, 400);
      }
      const bal = await asaas("/finance/balance", "GET", apiKey);
      const balance = bal.ok ? Number(bal.data?.balance ?? 0) : 0;
      if (value > balance) {
        return json({ error: `Saldo insuficiente. Disponível: R$ ${balance.toFixed(2)}.` }, 400);
      }

      const { data: rec } = await admin.from("payout_transfers")
        .insert({ professional_id: pro.id, amount_brl: value, pix_key: cred.payout_pix_key, status: "requested" })
        .select("id").single();

      const tr = await asaas("/transfers", "POST", apiKey, {
        value,
        pixAddressKey: cred.payout_pix_key,
        pixAddressKeyType: cred.payout_pix_key_type,
        operationType: "PIX",
        description: "Saque Primeiro Passo",
        externalReference: rec?.id,
      });
      if (!tr.ok || !tr.data?.id) {
        if (rec) await admin.from("payout_transfers").update({ status: "failed" }).eq("id", rec.id);
        return json({ error: tr.data?.errors?.[0]?.description ?? "Não foi possível concluir o saque.", asaas: tr.data }, 400);
      }
      if (rec) await admin.from("payout_transfers").update({ status: "done", asaas_transfer_id: tr.data.id }).eq("id", rec.id);
      return json({ ok: true, transferId: tr.data.id, value });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

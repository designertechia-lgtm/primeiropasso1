// Cria/garante o customer Asaas do profissional (como CLIENTE da plataforma) e cria a
// ASSINATURA recorrente da mensalidade na conta-mãe — SEM split (100% da plataforma).
// Cartão = débito automático mensal; PIX/Boleto = cobrança recorrente paga manualmente.
//
// NÃO confundir com asaas-onboarding/asaas-create-charge (marketplace), onde o profissional
// RECEBE via subconta/split (asaas_account_id/asaas_wallet_id). Aqui ele PAGA (asaas_customer_id).
//
// O cartão é validado na criação, mas a fonte de verdade do acesso (status active +
// current_period_end) é o webhook PAYMENT_CONFIRMED/RECEIVED — não concedemos acesso aqui.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ASAAS_BASE = Deno.env.get("ASAAS_BASE_URL") ?? "https://api-sandbox.asaas.com/v3";
const SUBSCRIPTION_PRICE = 349.00;

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
const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("ASAAS_API_KEY");
  if (!apiKey) return json({ error: "ASAAS_API_KEY não configurada" }, 500);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const billingType = String(body.billing_type ?? "").toUpperCase(); // CREDIT_CARD | PIX | BOLETO
  if (!["CREDIT_CARD", "PIX", "BOLETO"].includes(billingType)) {
    return json({ error: "billing_type inválido (use CREDIT_CARD, PIX ou BOLETO)" }, 400);
  }

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
      .from("professionals")
      .select("id, asaas_customer_id, billing_exempt")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!pro) return json({ error: "Profissional não encontrado" }, 404);
    if (pro.billing_exempt) return json({ error: "Conta em cortesia — cobrança isenta." }, 400);

    // Assinatura mais recente (subscriptions não tem unique por professional_id)
    const { data: sub } = await admin
      .from("subscriptions")
      .select("*")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sub?.asaas_subscription_id) {
      return json({ ok: true, already: true, subscriptionId: sub.asaas_subscription_id });
    }

    const cpfCnpj = onlyDigits(body.cpfCnpj);
    if (!cpfCnpj) return json({ error: "Informe o CPF/CNPJ" }, 400);

    const { data: profile } = await admin.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
    const name = profile?.full_name || body.name || "Profissional";

    // 1. Customer (cria se faltar; reusa entre assinatura e compra de créditos)
    let customerId = pro.asaas_customer_id as string | null;
    if (!customerId) {
      const cust = await asaas("/customers", "POST", apiKey, {
        name,
        cpfCnpj,
        email: body.email || user.email,
        mobilePhone: body.phone ? onlyDigits(body.phone) : undefined,
      });
      if (!cust.ok || !cust.data?.id) {
        return json({ error: cust.data?.errors?.[0]?.description ?? "Erro ao registrar o cliente", asaas: cust.data }, 400);
      }
      customerId = cust.data.id;
      await admin.from("professionals").update({ asaas_customer_id: customerId }).eq("id", pro.id);
    }

    // 2. Assinatura recorrente. nextDueDate = hoje: a cobrança vale a partir de agora.
    const today = new Date().toISOString().slice(0, 10);
    const subBody: Record<string, unknown> = {
      customer: customerId,
      billingType,
      value: SUBSCRIPTION_PRICE,
      nextDueDate: today,
      cycle: "MONTHLY",
      description: "Assinatura Primeiro Passo",
      externalReference: `sub|${pro.id}`,
    };

    if (billingType === "CREDIT_CARD") {
      const cc = body.creditCard ?? {};
      const hi = body.holderInfo ?? {};
      if (!cc.number || !cc.holderName || !cc.expiryMonth || !cc.expiryYear || !cc.ccv) {
        return json({ error: "Dados do cartão incompletos" }, 400);
      }
      subBody.creditCard = {
        holderName: cc.holderName,
        number: onlyDigits(cc.number),
        expiryMonth: String(cc.expiryMonth).padStart(2, "0"),
        expiryYear: String(cc.expiryYear),
        ccv: String(cc.ccv),
      };
      subBody.creditCardHolderInfo = {
        name: hi.name || name,
        email: hi.email || body.email || user.email,
        cpfCnpj: onlyDigits(hi.cpfCnpj || cpfCnpj),
        postalCode: onlyDigits(hi.postalCode),
        addressNumber: String(hi.addressNumber ?? ""),
        phone: onlyDigits(hi.phone || body.phone || ""),
      };
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      if (ip) subBody.remoteIp = ip;
    }

    const created = await asaas("/subscriptions", "POST", apiKey, subBody);
    if (!created.ok || !created.data?.id) {
      return json({ error: created.data?.errors?.[0]?.description ?? "Erro ao criar a assinatura", asaas: created.data }, 400);
    }

    const cc = created.data.creditCard;
    const vinculo = {
      asaas_subscription_id: created.data.id as string,
      payment_method: billingType === "CREDIT_CARD" ? "credit_card" : billingType.toLowerCase(),
      card_last4: cc?.creditCardNumber ?? null,
      card_brand: cc?.creditCardBrand ?? null,
      updated_at: new Date().toISOString(),
    };
    // Grava só o vínculo/método. status active + current_period_end ficam por conta do webhook.
    if (sub) {
      await admin.from("subscriptions").update(vinculo).eq("id", sub.id);
    } else {
      await admin.from("subscriptions").insert({
        professional_id: pro.id,
        monthly_price_brl: SUBSCRIPTION_PRICE,
        current_period_start: new Date().toISOString(),
        ...vinculo,
      });
    }

    // PIX/Boleto: devolve o link da 1ª cobrança recorrente p/ o profissional pagar.
    let invoiceUrl: string | null = null;
    if (billingType !== "CREDIT_CARD") {
      const pays = await asaas(`/subscriptions/${created.data.id}/payments`, "GET", apiKey);
      invoiceUrl = pays.data?.data?.[0]?.invoiceUrl ?? null;
    }

    return json({
      ok: true,
      subscriptionId: created.data.id,
      billingType,
      invoiceUrl,
      card: cc ? { last4: cc.creditCardNumber, brand: cc.creditCardBrand } : null,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

// Cria um pedido (product_orders) + cobrança no Asaas com split para o profissional.
// Público (comprador não-logado). A cobrança é emitida pela conta-mãe (plataforma); o split
// manda (preço − comissão) para a carteira do profissional e a plataforma fica com a comissão
// (que cobre a taxa do Asaas com margem). A comissão depende do MÉTODO escolhido pelo comprador
// no checkout (ver tabela COMMISSION). Retorna o invoiceUrl (página de pagamento do Asaas).
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
const money = (n: number) => Math.round(n * 100) / 100;

// Comissão da plataforma POR MÉTODO de pagamento (margem segura, cobre a taxa do Asaas).
// PIX/Boleto = valor fixo em R$; Crédito/Débito = percentual do preço. PONTO CENTRAL: ajustar aqui.
// (Tabela Asaas 17/06: PIX/Boleto R$1,99; débito R$0,35+1,89%; crédito R$0,49+2,99%→4,29%.)
const COMMISSION: Record<string, { billingType: string; method: string; fee: (p: number) => number }> = {
  pix:    { billingType: "PIX",         method: "pix",         fee: () => 4.0 },
  boleto: { billingType: "BOLETO",      method: "boleto",      fee: () => 4.0 },
  credit: { billingType: "CREDIT_CARD", method: "credit_card", fee: (p) => money(p * 0.08) },
  debit:  { billingType: "DEBIT_CARD",  method: "debit_card",  fee: (p) => money(p * 0.05) },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const apiKey = Deno.env.get("ASAAS_API_KEY");
  if (!apiKey) return json({ error: "ASAAS_API_KEY não configurada" }, 500);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const { item_type, item_id, buyer, shipping_address } = body ?? {};
  if (!["product", "service"].includes(item_type) || !item_id) return json({ error: "Item inválido" }, 400);
  if (!buyer?.name || !buyer?.cpfCnpj) return json({ error: "Informe nome e CPF do comprador" }, 400);

  // Método de pagamento escolhido no checkout (define billingType + comissão). Default: PIX.
  const pm = COMMISSION[body?.payment_method as string] ?? COMMISSION.pix;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1. Item (produto ou sessão) + preço/título/dono
  let professionalId: string, title: string, price: number | null;
  if (item_type === "product") {
    const { data } = await admin.from("professional_products")
      .select("professional_id, title, price_brl, active").eq("id", item_id).maybeSingle();
    if (!data || !data.active) return json({ error: "Produto indisponível" }, 404);
    professionalId = data.professional_id; title = data.title; price = data.price_brl;
  } else {
    const { data } = await admin.from("professional_services")
      .select("professional_id, name, price, active").eq("id", item_id).maybeSingle();
    if (!data || !data.active) return json({ error: "Serviço indisponível" }, 404);
    professionalId = data.professional_id; title = data.name; price = data.price;
  }
  if (price == null || price <= 0) return json({ error: "Item sem preço definido" }, 400);

  // 2. Profissional precisa ter subconta (walletId) p/ receber
  const { data: pro } = await admin.from("professionals")
    .select("asaas_wallet_id").eq("id", professionalId).maybeSingle();
  if (!pro?.asaas_wallet_id) return json({ error: "O profissional ainda não ativou os recebimentos." }, 400);

  // 3. Cliente (comprador) no Asaas
  const cust = await asaas("/customers", "POST", apiKey, {
    name: buyer.name,
    cpfCnpj: String(buyer.cpfCnpj).replace(/\D/g, ""),
    email: buyer.email || undefined,
    mobilePhone: buyer.phone ? String(buyer.phone).replace(/\D/g, "") : undefined,
  });
  if (!cust.ok || !cust.data?.id) {
    return json({ error: cust.data?.errors?.[0]?.description ?? "Erro ao registrar o comprador", asaas: cust.data }, 400);
  }

  // 4. Pedido (status pending). O delivery_token já nasce aqui p/ montar a URL de retorno
  // (página /pedido/:token) e a entrega do PDF assim que o pagamento confirmar.
  const platformFee = pm.fee(price);                 // comissão da plataforma (por método)
  const sellerAmount = money(price - platformFee);   // o que cai na carteira do profissional
  if (sellerAmount <= 0) return json({ error: "Valor abaixo do mínimo para este método de pagamento." }, 400);
  const deliveryToken = crypto.randomUUID();
  const { data: order, error: oerr } = await admin.from("product_orders").insert({
    professional_id: professionalId,
    item_type,
    product_id: item_type === "product" ? item_id : null,
    service_id: item_type === "service" ? item_id : null,
    item_title: title,
    amount_brl: price,
    platform_fee_brl: platformFee,
    buyer_name: buyer.name,
    buyer_email: buyer.email ?? null,
    buyer_phone: buyer.phone ?? null,
    shipping_address: shipping_address ?? null,
    status: "pending",
    payment_method: pm.method,
    delivery_token: deliveryToken,
  }).select("id").single();
  if (oerr || !order) return json({ error: "Erro ao criar pedido: " + (oerr?.message ?? "") }, 500);

  // 5. Cobrança com split (PIX ou cartão na página do Asaas).
  // Após pagar, o Asaas devolve o comprador para a página de acompanhamento/entrega do pedido.
  const origin = req.headers.get("origin") || Deno.env.get("PUBLIC_SITE_URL") || "";
  const today = new Date().toISOString().slice(0, 10);
  const pay = await asaas("/payments", "POST", apiKey, {
    customer: cust.data.id,
    billingType: pm.billingType,
    value: price,
    dueDate: today,
    description: title,
    externalReference: order.id,
    split: [{ walletId: pro.asaas_wallet_id, fixedValue: sellerAmount }],
    ...(origin ? { callback: { successUrl: `${origin}/pedido/${deliveryToken}`, autoRedirect: true } } : {}),
  });
  if (!pay.ok || !pay.data?.id) {
    await admin.from("product_orders").update({ status: "failed" }).eq("id", order.id);
    return json({ error: pay.data?.errors?.[0]?.description ?? "Erro ao criar cobrança", asaas: pay.data }, 400);
  }

  await admin.from("product_orders")
    .update({ asaas_payment_id: pay.data.id, asaas_invoice_url: pay.data.invoiceUrl })
    .eq("id", order.id);

  return json({ ok: true, orderId: order.id, invoiceUrl: pay.data.invoiceUrl, value: price });
});

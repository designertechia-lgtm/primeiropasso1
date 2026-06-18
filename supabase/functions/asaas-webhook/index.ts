// Webhook do Asaas: recebe os eventos de pagamento e roteia para 3 destinos:
//  1) Marketplace (product_orders) — casa por externalReference (=order.id) / asaas_payment_id.
//  2) Assinatura recorrente da plataforma — casa por payment.subscription = subscriptions.asaas_subscription_id;
//     PAYMENT_RECEIVED/CONFIRMED estende current_period_end +30d (idempotente).
//  3) Compra avulsa de créditos (pix_payments provider='asaas') — casa por externalReference (=pix_payments.id);
//     PAYMENT_RECEIVED/CONFIRMED credita o credit_ledger (idempotente).
//
// Sem JWT: o Asaas chama direto. Deploy com verify_jwt=false.
// Segurança: se o secret ASAAS_WEBHOOK_TOKEN existir, exige o header 'asaas-access-token' igual.
// Idempotente: reentregas do Asaas não duplicam efeito (status já final OU índice único em asaas_payment_id).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

type Admin = ReturnType<typeof createClient>;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// billingType do Asaas -> nosso payment_method
function mapMethod(billingType?: string): string | null {
  switch (billingType) {
    case "PIX": return "pix";
    case "CREDIT_CARD": return "credit_card";
    case "BOLETO": return "boleto";
    default: return null;
  }
}

const PAID_EVENTS = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  if (expectedToken) {
    const got = req.headers.get("asaas-access-token");
    if (got !== expectedToken) return json({ error: "invalid webhook token" }, 401);
  }

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const event: string | undefined = body?.event;
  const payment = body?.payment;
  if (!event || !payment?.id) return json({ ok: true, ignored: "sem event/payment" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── 1) Marketplace (product_orders) ────────────────────────────────────────────────
  const ext: string | undefined = payment.externalReference || undefined;
  let oq = admin.from("product_orders").select("id, status, delivery_token");
  oq = ext ? oq.eq("id", ext) : oq.eq("asaas_payment_id", payment.id);
  const { data: order } = await oq.maybeSingle();
  if (order) return await handleOrder(admin, event, payment, order);

  // ── 2) Assinatura recorrente (payment vinculado a uma subscription do Asaas) ─────────
  if (payment.subscription) return await handleSubscription(admin, event, payment);

  // ── 3) Compra avulsa de créditos (pix_payments) ─────────────────────────────────────
  let pq = admin.from("pix_payments").select("id, status, kind, reference_id, professional_id");
  pq = ext ? pq.eq("id", ext) : pq.eq("asaas_payment_id", payment.id);
  const { data: credit } = await pq.maybeSingle();
  if (credit) return await handleCredit(admin, event, payment, credit);

  // Nada casou: pode ser pagamento de outro contexto. 200 p/ não reenfileirar.
  return json({ ok: true, ignored: "registro não encontrado", event });
});

// ── Marketplace: confirma/estorna o pedido (comportamento original) ───────────────────
async function handleOrder(admin: Admin, event: string, payment: any, order: any) {
  const patch: Record<string, unknown> = {
    asaas_payment_id: payment.id,
    payment_method: mapMethod(payment.billingType),
  };
  switch (event) {
    case "PAYMENT_RECEIVED":
    case "PAYMENT_CONFIRMED": {
      if (order.status === "paid" || order.status === "delivered") {
        return json({ ok: true, already: true, orderId: order.id });
      }
      patch.status = "paid";
      patch.paid_at = payment.confirmedDate || payment.paymentDate || new Date().toISOString();
      if (!order.delivery_token) patch.delivery_token = crypto.randomUUID();
      break;
    }
    case "PAYMENT_REFUNDED":
    case "PAYMENT_REFUND_IN_PROGRESS":
      patch.status = "refunded";
      break;
    case "PAYMENT_DELETED":
    case "PAYMENT_CHARGEBACK_REQUESTED":
    case "PAYMENT_CHARGEBACK_DISPUTE":
      patch.status = "cancelled";
      break;
    default:
      break;
  }
  const { error } = await admin.from("product_orders").update(patch).eq("id", order.id);
  if (error) return json({ error: "Falha ao atualizar pedido: " + error.message }, 500);
  return json({ ok: true, orderId: order.id, event, status: patch.status ?? order.status });
}

// ── Assinatura: registra a cobrança (idempotente) e estende o período +30d ────────────
async function handleSubscription(admin: Admin, event: string, payment: any) {
  if (!PAID_EVENTS.includes(event)) {
    return json({ ok: true, ignored: "evento de assinatura não-pago", event });
  }

  const { data: subRow } = await admin
    .from("subscriptions")
    .select("id, professional_id, current_period_end")
    .eq("asaas_subscription_id", payment.subscription)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!subRow) return json({ ok: true, ignored: "assinatura não encontrada", subscription: payment.subscription });

  // Idempotência: o índice único em asaas_payment_id impede processar a mesma cobrança 2x.
  const { error: insErr } = await admin.from("pix_payments").insert({
    professional_id: subRow.professional_id,
    kind: "subscription_renewal",
    reference_id: "subscription",
    amount_brl: payment.value,
    provider: "asaas",
    status: "paid",
    asaas_payment_id: payment.id,
    paid_at: payment.confirmedDate || payment.paymentDate || new Date().toISOString(),
  });
  if (insErr) {
    if (insErr.code === "23505" || /duplicate|unique/i.test(insErr.message ?? "")) {
      return json({ ok: true, already: true, subscriptionId: subRow.id });
    }
    return json({ error: "Falha ao registrar cobrança: " + insErr.message }, 500);
  }

  const base = subRow.current_period_end && new Date(subRow.current_period_end) > new Date()
    ? new Date(subRow.current_period_end)
    : new Date();
  base.setDate(base.getDate() + 30);

  const { error: upErr } = await admin
    .from("subscriptions")
    .update({ status: "active", current_period_end: base.toISOString(), updated_at: new Date().toISOString() })
    .eq("id", subRow.id);
  if (upErr) return json({ error: "Falha ao estender assinatura: " + upErr.message }, 500);

  return json({ ok: true, subscriptionId: subRow.id, renewed_until: base.toISOString() });
}

// ── Créditos: confirma o pagamento e credita o ledger (idempotente) ───────────────────
async function handleCredit(admin: Admin, event: string, payment: any, credit: any) {
  if (PAID_EVENTS.includes(event)) {
    if (credit.status === "paid") return json({ ok: true, already: true, paymentId: credit.id });

    if (credit.kind === "credit_pack") {
      const { data: pack } = await admin
        .from("credit_packs")
        .select("credits")
        .eq("id", credit.reference_id)
        .maybeSingle();
      if (pack) {
        const { error: ledgerErr } = await admin.from("credit_ledger").insert({
          professional_id: credit.professional_id,
          type: "purchase",
          amount: pack.credits,
          description: `Recarga de créditos — pacote ${credit.reference_id}`,
          reference_id: credit.id,
          idempotency_key: `asaas|${payment.id}`,
        });
        if (ledgerErr && ledgerErr.code !== "23505" && !/idempotency|duplicate|unique/i.test(ledgerErr.message ?? "")) {
          return json({ error: "Falha ao creditar: " + ledgerErr.message }, 500);
        }
      }
    }

    const { error } = await admin.from("pix_payments")
      .update({
        status: "paid",
        asaas_payment_id: payment.id,
        paid_at: payment.confirmedDate || payment.paymentDate || new Date().toISOString(),
      })
      .eq("id", credit.id);
    if (error) return json({ error: "Falha ao confirmar pagamento: " + error.message }, 500);
    return json({ ok: true, paymentId: credit.id, status: "paid" });
  }

  if (["PAYMENT_REFUNDED", "PAYMENT_DELETED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"].includes(event)) {
    await admin.from("pix_payments").update({ status: "cancelled" }).eq("id", credit.id);
    return json({ ok: true, paymentId: credit.id, status: "cancelled" });
  }

  return json({ ok: true, ignored: "evento de crédito sem ação", event });
}

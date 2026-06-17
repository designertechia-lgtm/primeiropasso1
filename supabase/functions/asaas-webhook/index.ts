// Webhook do Asaas: recebe os eventos de pagamento e atualiza o pedido (product_orders).
// Casa o pagamento pelo externalReference (= order.id); fallback pelo asaas_payment_id.
// PAYMENT_RECEIVED/CONFIRMED -> status 'paid' (+ paid_at, payment_method, delivery_token p/ entrega).
// PAYMENT_REFUNDED -> 'refunded'. PAYMENT_DELETED/CHARGEBACK -> 'cancelled'.
//
// Sem JWT: o Asaas chama direto. Deploy com verify_jwt=false.
// Segurança: se o secret ASAAS_WEBHOOK_TOKEN existir, exige o header 'asaas-access-token' igual
// (configurado no painel do Asaas em Integrações > Webhooks). Sem o secret, aceita (sandbox).
// Idempotente: reentregas do Asaas não duplicam efeito; só preenche o que ainda falta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Autenticação do webhook (opcional, mas recomendada em produção)
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

  // Casa o pedido: externalReference (order.id) é o caminho feliz; fallback pelo payment id.
  const orderId: string | undefined = payment.externalReference || undefined;
  let q = admin.from("product_orders").select("id, status, delivery_token");
  q = orderId ? q.eq("id", orderId) : q.eq("asaas_payment_id", payment.id);
  const { data: order } = await q.maybeSingle();

  if (!order) {
    // Pode ser um pagamento que não é do marketplace (ex.: assinatura). Não é erro: 200 p/ não reenfileirar.
    return json({ ok: true, ignored: "pedido não encontrado", event });
  }

  const patch: Record<string, unknown> = {
    asaas_payment_id: payment.id,
    payment_method: mapMethod(payment.billingType),
  };

  switch (event) {
    case "PAYMENT_RECEIVED":
    case "PAYMENT_CONFIRMED": {
      // Idempotência: se já está pago/entregue, não reprocessa nem regenera o token.
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
      // PAYMENT_CREATED, PAYMENT_OVERDUE, PAYMENT_UPDATED... nada a mudar; registramos o vínculo e seguimos.
      break;
  }

  const { error: uerr } = await admin.from("product_orders").update(patch).eq("id", order.id);
  if (uerr) return json({ error: "Falha ao atualizar pedido: " + uerr.message }, 500); // 500 -> Asaas reenvia

  return json({ ok: true, orderId: order.id, event, status: patch.status ?? order.status });
});

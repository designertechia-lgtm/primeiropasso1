// Consulta pública de um pedido pelo delivery_token (o comprador não é logado).
// Retorna o status e, quando pago e for um produto digital com arquivo, um link
// assinado (temporário) para download do PDF — gerado do bucket privado product-files.
// O token é um UUID não-adivinhável; só ele dá acesso ao próprio pedido.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Aceita token por querystring (?token=) ou no corpo.
  let token: string | undefined;
  if (req.method === "GET") {
    token = new URL(req.url).searchParams.get("token") || undefined;
  } else {
    try { token = (await req.json())?.token; } catch { /* corpo opcional */ }
  }
  if (!token) return json({ error: "token ausente" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: order } = await admin
    .from("product_orders")
    .select("id, item_type, item_title, amount_brl, status, product_id, delivered_at, professional_id, asaas_invoice_url")
    .eq("delivery_token", token)
    .maybeSingle();
  if (!order) return json({ error: "Pedido não encontrado" }, 404);

  const isPaid = order.status === "paid" || order.status === "delivered";
  const out: Record<string, unknown> = {
    status: order.status,
    item_type: order.item_type,
    item_title: order.item_title,
    amount_brl: order.amount_brl,
    is_paid: isPaid,
    has_download: false,
    // Link de pagamento (Asaas) enquanto não foi pago — a página mostra o botão "Pagar agora".
    invoice_url: isPaid ? null : order.asaas_invoice_url,
  };

  // Nome do profissional (vem de profiles) só para exibição amigável.
  const { data: pro } = await admin.from("professionals").select("user_id").eq("id", order.professional_id).maybeSingle();
  if (pro?.user_id) {
    const { data: prof } = await admin.from("profiles").select("full_name").eq("user_id", pro.user_id).maybeSingle();
    if (prof?.full_name) out.professional_name = prof.full_name;
  }

  // Entrega digital: produto pago com PDF anexado → link assinado de download.
  if ((order.status === "paid" || order.status === "delivered") && order.item_type === "product" && order.product_id) {
    const { data: product } = await admin
      .from("professional_products")
      .select("file_path").eq("id", order.product_id).maybeSingle();
    if (product?.file_path) {
      const { data: signed } = await admin.storage
        .from("product-files")
        .createSignedUrl(product.file_path, 60 * 60); // 1h
      if (signed?.signedUrl) {
        out.has_download = true;
        out.download_url = signed.signedUrl;
        // Marca como entregue na primeira geração do link (idempotente).
        if (order.status !== "delivered") {
          await admin.from("product_orders")
            .update({ status: "delivered", delivered_at: new Date().toISOString() })
            .eq("id", order.id);
          out.status = "delivered";
        }
      }
    }
  }

  return json(out);
});

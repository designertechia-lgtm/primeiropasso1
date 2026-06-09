import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 10 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const paymentId = form.get("payment_id")?.toString();
    const file = form.get("file") as File | null;

    if (!paymentId || !file) {
      return new Response(JSON.stringify({ error: "payment_id e file são obrigatórios" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return new Response(JSON.stringify({ error: "Formato inválido (use JPG, PNG, WEBP ou PDF)" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: "Arquivo maior que 10MB" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pro } = await admin
      .from("professionals")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!pro) {
      return new Response(JSON.stringify({ error: "Profissional não encontrado" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Valida ownership do payment
    const { data: payment } = await admin
      .from("pix_payments")
      .select("*")
      .eq("id", paymentId)
      .eq("professional_id", pro.id)
      .maybeSingle();
    if (!payment) {
      return new Response(JSON.stringify({ error: "Pagamento não encontrado" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!["awaiting_proof", "rejected"].includes(payment.status)) {
      return new Response(JSON.stringify({ error: `Não é possível enviar comprovante (status: ${payment.status})` }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Upload pro Storage
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${pro.id}/${paymentId}.${ext}`;
    const buffer = await file.arrayBuffer();

    const { error: uploadErr } = await admin.storage
      .from("payment-proofs")
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    // Atualiza pix_payments
    const { error: updErr } = await admin
      .from("pix_payments")
      .update({
        proof_url: path,
        proof_uploaded_at: new Date().toISOString(),
        status: "pending_review",
        rejection_reason: null,
      })
      .eq("id", paymentId);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({
      ok: true,
      payment_id: paymentId,
      status: "pending_review",
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

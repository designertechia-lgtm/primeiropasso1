import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify super_admin role
    const { data: reviewer } = await admin
      .from("professionals")
      .select("id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!reviewer || reviewer.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { payment_id } = await req.json();
    if (!payment_id) {
      return new Response(JSON.stringify({ error: "payment_id é obrigatório" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Fetch the payment
    const { data: payment } = await admin
      .from("pix_payments")
      .select("*")
      .eq("id", payment_id)
      .maybeSingle();
    if (!payment) {
      return new Response(JSON.stringify({ error: "Pagamento não encontrado" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (payment.status !== "pending_review") {
      return new Response(JSON.stringify({ error: `Status inválido para aprovação: ${payment.status}` }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();

    // Mark payment approved
    const { error: updErr } = await admin
      .from("pix_payments")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: now,
      })
      .eq("id", payment_id);
    if (updErr) throw updErr;

    if (payment.kind === "subscription_renewal") {
      // Upsert subscription: extend 30 days from today (or from current expiry if still active)
      const { data: existing } = await admin
        .from("subscriptions")
        .select("*")
        .eq("professional_id", payment.professional_id)
        .maybeSingle();

      const base = existing?.current_period_end && new Date(existing.current_period_end) > new Date()
        ? new Date(existing.current_period_end)
        : new Date();
      base.setDate(base.getDate() + 30);
      const newExpiry = base.toISOString();

      if (existing) {
        const { error: subErr } = await admin
          .from("subscriptions")
          .update({
            status: "active",
            current_period_end: newExpiry,
            updated_at: now,
          })
          .eq("id", existing.id);
        if (subErr) throw subErr;
      } else {
        const { error: subErr } = await admin
          .from("subscriptions")
          .insert({
            professional_id: payment.professional_id,
            status: "active",
            current_period_start: now,
            current_period_end: newExpiry,
          });
        if (subErr) throw subErr;
      }
    } else if (payment.kind === "credit_pack") {
      // Look up the pack to get credits
      const { data: pack } = await admin
        .from("credit_packs")
        .select("credits")
        .eq("id", payment.reference_id)
        .maybeSingle();
      if (!pack) throw new Error("Pacote de créditos não encontrado");

      const { error: ledgerErr } = await admin
        .from("credit_ledger")
        .insert({
          professional_id: payment.professional_id,
          type: "purchase",
          amount: pack.credits,
          description: `Recarga de créditos — pacote ${payment.reference_id}`,
          reference_id: payment_id,
          idempotency_key: `approve|${payment_id}`,
        });
      if (ledgerErr && !ledgerErr.message?.includes("idempotency")) throw ledgerErr;
    }

    return new Response(JSON.stringify({
      ok: true,
      payment_id,
      status: "approved",
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

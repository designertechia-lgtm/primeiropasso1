import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUBSCRIPTION_PRICE = 349.00;

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

    const { kind, reference_id } = await req.json();
    if (!kind || !["subscription_renewal", "credit_pack"].includes(kind)) {
      return new Response(JSON.stringify({ error: "kind inválido" }), {
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

    // Determina valor
    let amount = 0;
    let actualRef = reference_id;
    if (kind === "subscription_renewal") {
      amount = SUBSCRIPTION_PRICE;
      actualRef = "subscription";
    } else {
      const { data: pack } = await admin
        .from("credit_packs")
        .select("*")
        .eq("id", reference_id)
        .eq("active", true)
        .maybeSingle();
      if (!pack) {
        return new Response(JSON.stringify({ error: "Pacote não encontrado" }), {
          status: 404, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      amount = pack.price_brl;
    }

    // Cria payment intent
    const { data: payment, error: insertErr } = await admin
      .from("pix_payments")
      .insert({
        professional_id: pro.id,
        kind,
        reference_id: actualRef,
        amount_brl: amount,
        status: "awaiting_proof",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    // Busca settings PIX
    const { data: pixSettings } = await admin
      .from("pix_settings")
      .select("*")
      .eq("id", "main")
      .maybeSingle();

    return new Response(JSON.stringify({
      payment_id: payment.id,
      amount_brl: payment.amount_brl,
      kind: payment.kind,
      expires_at: payment.expires_at,
      pix: pixSettings,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

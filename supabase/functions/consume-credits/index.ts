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

    const { service_key, units, reference_id, description } = await req.json();
    if (!service_key || units == null) {
      return new Response(JSON.stringify({ error: "service_key e units são obrigatórios" }), {
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

    // Busca display_name para a descrição padrão
    const { data: pricing } = await admin
      .from("service_pricing")
      .select("display_name")
      .eq("service_key", service_key)
      .eq("active", true)
      .maybeSingle();

    const idempotency_key = reference_id
      ? `${pro.id}|${service_key}|${reference_id}`
      : `${pro.id}|${service_key}|${Date.now()}`;

    const { data: result, error: rpcErr } = await admin.rpc("consume_credits", {
      p_professional_id: pro.id,
      p_service_key: service_key,
      p_units: units,
      p_description: description ?? `Uso de ${pricing?.display_name ?? service_key}`,
      p_reference_id: reference_id ?? null,
      p_idempotency_key: idempotency_key,
    });

    if (rpcErr) throw rpcErr;

    if (!result.allowed) {
      return new Response(JSON.stringify({
        allowed: false,
        reason: result.reason,
        balance: result.balance,
        required: result.required,
      }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      allowed: true,
      credits_charged: result.credits_charged,
      new_balance: result.new_balance,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

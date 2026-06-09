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

    const { service_key, units } = await req.json();
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

    const { data: pricing } = await admin
      .from("service_pricing")
      .select("*")
      .eq("service_key", service_key)
      .eq("active", true)
      .maybeSingle();

    if (!pricing) {
      return new Response(JSON.stringify({ error: "Serviço não encontrado ou inativo" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const total_brl = pricing.base_cost_brl * units * (1 + pricing.markup_pct / 100);
    const credits_required = Math.ceil(total_brl);

    const { data: balanceRow } = await admin
      .from("credit_balance")
      .select("balance")
      .eq("professional_id", pro.id)
      .maybeSingle();

    const current_balance = balanceRow?.balance ?? 0;

    return new Response(JSON.stringify({
      base_cost_brl: Math.round(pricing.base_cost_brl * units * 100) / 100,
      total_brl: Math.round(total_brl * 100) / 100,
      credits_required,
      current_balance,
      can_afford: current_balance >= credits_required,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

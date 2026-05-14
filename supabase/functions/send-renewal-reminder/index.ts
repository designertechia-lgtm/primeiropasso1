// Edge Function: send-renewal-reminder
//
// Acionada pelo cron process_subscription_auto_renewals quando uma assinatura
// está perto de vencer e tem auto_renew=true. Envia uma mensagem WhatsApp
// para o profissional cliente, a partir da instância Evolution do super-admin
// (designertech.ia@gmail.com), avisando que a próxima cobrança PIX está pronta.
//
// Body esperado: { payment_id: string }
// Auth: service role (chamada via pg_net pelo cron)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { payment_id } = await req.json();
    if (!payment_id) {
      throw new Error("payment_id é obrigatório");
    }

    // 1. Carrega o pagamento + dados do profissional cliente
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("pix_payments")
      .select(
        `id, amount_brl, expires_at, kind,
         professionals!inner(id, full_name, whatsapp, slug, user_id)`,
      )
      .eq("id", payment_id)
      .single();

    if (payErr || !payment) {
      throw new Error(`Pagamento não encontrado: ${payErr?.message ?? "—"}`);
    }

    const prof = (payment as any).professionals;
    const whatsapp: string | null = prof?.whatsapp;
    const fullName: string = prof?.full_name ?? "Profissional";

    if (!whatsapp) {
      console.warn(`[renewal] Prof ${prof?.id} sem WhatsApp cadastrado`);
      return new Response(
        JSON.stringify({ skipped: "sem-whatsapp", payment_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Acha a instância Evolution do super-admin (quem envia a cobrança)
    const { data: ownerInstance, error: instErr } = await supabaseAdmin.rpc(
      "get_super_admin_instance" as never,
    );
    if (instErr) {
      throw new Error(`Erro ao buscar instância do super-admin: ${instErr.message}`);
    }
    if (!ownerInstance) {
      throw new Error(
        "Super-admin não tem Evolution Instance conectada. Configure WhatsApp no perfil dele.",
      );
    }

    // 3. Monta a mensagem
    const amountFmt = Number(payment.amount_brl).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const dueDate = new Date(payment.expires_at).toLocaleDateString("pt-BR");
    const checkoutUrl = "https://primeiropasso.online/admin/assinatura";

    const message =
      `Oi ${fullName.split(" ")[0]}! 👋\n\n` +
      `Sua assinatura *PrimeiroPasso* está perto de vencer e a renovação automática está ativa.\n\n` +
      `Já preparei sua nova cobrança:\n` +
      `💰 *Valor:* ${amountFmt}\n` +
      `📅 *Válida até:* ${dueDate}\n\n` +
      `Pague em 1 clique pelo PIX:\n${checkoutUrl}\n\n` +
      `É só escanear o QR ou usar o Copia-e-Cola. Qualquer dúvida, é só responder aqui. 🙌`;

    // 4. Envia via Evolution API
    const evoUrl = Deno.env.get("EVOLUTION_API_URL");
    const evoKey = Deno.env.get("EVOLUTION_API_KEY");
    if (!evoUrl || !evoKey) {
      throw new Error("Evolution API não configurada");
    }

    // Normaliza número (remove tudo que não é dígito; assume Brasil 55 se < 13)
    const digits = whatsapp.replace(/\D/g, "");
    const number = digits.startsWith("55") ? digits : `55${digits}`;

    const sendRes = await fetch(`${evoUrl}/message/sendText/${ownerInstance}`, {
      method: "POST",
      headers: {
        apikey: evoKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number, text: message }),
    });

    if (!sendRes.ok) {
      const errBody = await sendRes.text();
      throw new Error(`Evolution sendText ${sendRes.status}: ${errBody}`);
    }

    return new Response(
      JSON.stringify({ success: true, payment_id, sent_to: number }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-renewal-reminder]", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

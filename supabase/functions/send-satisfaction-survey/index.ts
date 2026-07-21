// Edge Function: send-satisfaction-survey
//
// Pós-atendimento (caso H). Chamada pelo cron process_satisfaction_surveys ~30min
// após o FIM do atendimento. Envia ao lead um botão de satisfação (3 níveis) via
// Evolution e grava o registro em appointment_reminders (kind='satisfaction') pra
// evitar duplicata. A RESPOSTA do lead (clique sat:*) é tratada no whatsapp-webhook.
//
// Body: { appointment_id: string }
// Auth: chamada interna do cron (a function tem verify_jwt=false; usa service role).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Canal de envio: Evolution x Cloud API oficial (20/07). Pesquisa INICIA conversa —
// no cloud fora da janela de 24h a Meta recusa texto livre (template = Fase 2 dos crons).
const GRAPH_URL = "https://graph.facebook.com/v21.0";
type WaChannel = { channel: "evolution" | "cloud"; phoneNumberId?: string; accessToken?: string };
async function waChannel(instanceName: string): Promise<WaChannel> {
  const fallback: WaChannel = { channel: "evolution" };
  try {
    const sUrl = Deno.env.get("SUPABASE_URL");
    const sKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!sUrl || !sKey || !instanceName) return fallback;
    const h = { apikey: sKey, Authorization: `Bearer ${sKey}` };
    const pr = await fetch(`${sUrl}/rest/v1/professionals?evolution_instance_name=eq.${encodeURIComponent(instanceName)}&select=id,whatsapp_channel&limit=1`, { headers: h, signal: AbortSignal.timeout(3000) });
    if (!pr.ok) return fallback;
    const pro = (await pr.json().catch(() => []))?.[0];
    if (!pro || pro.whatsapp_channel !== "cloud") return fallback;
    const ar = await fetch(`${sUrl}/rest/v1/whatsapp_cloud_accounts?professional_id=eq.${pro.id}&status=eq.active&select=phone_number_id,access_token&limit=1`, { headers: h, signal: AbortSignal.timeout(3000) });
    const acc = ar.ok ? (await ar.json().catch(() => []))?.[0] : null;
    return acc?.phone_number_id && acc?.access_token
      ? { channel: "cloud", phoneNumberId: acc.phone_number_id, accessToken: acc.access_token }
      : fallback;
  } catch { return fallback; }
}
async function cloudSendText(ch: WaChannel, to: string, text: string): Promise<boolean> {
  try {
    const num = to.split("@")[0].split(":")[0].replace(/\D/g, "");
    const res = await fetch(`${GRAPH_URL}/${ch.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ch.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: num, type: "text", text: { body: text } }),
    });
    if (!res.ok) console.error(`[cloud send] ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res.ok;
  } catch (e: any) {
    console.error("[cloud send] err", e?.message);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { appointment_id } = await req.json();
    if (!appointment_id) throw new Error("appointment_id obrigatório");

    // Guard: pesquisa já enviada pra este atendimento?
    const { data: already } = await supabaseAdmin
      .from("appointment_reminders")
      .select("id")
      .eq("appointment_id", appointment_id)
      .eq("kind", "satisfaction")
      .maybeSingle();
    if (already) {
      return new Response(JSON.stringify({ skipped: "already_sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Agendamento + profissional
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select(`
        id, appointment_date, start_time, end_time, status,
        professionals!inner(id, full_name, evolution_instance_name)
      `)
      .eq("id", appointment_id)
      .single();
    if (apptErr || !appt) throw new Error(`Agendamento não encontrado: ${apptErr?.message}`);

    const pro: any = (appt as any).professionals;
    const proName = (pro?.full_name || "o profissional").split(" ")[0];
    const instanceName = pro?.evolution_instance_name;

    // Lead — identidade de contato é o telefone (leads.whatsapp); casado ao
    // atendimento via booking_state.appointment_id (mesmo padrão do reminder).
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, name, whatsapp")
      .eq("professional_id", pro.id)
      .eq("booking_state->>appointment_id", appointment_id)
      .maybeSingle();

    if (!lead || !lead.whatsapp) {
      console.warn(`[satisfaction] Lead não encontrado pra appointment ${appointment_id}`);
      await supabaseAdmin.from("appointment_reminders").insert({
        appointment_id, kind: "satisfaction", sent_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ skipped: "lead_not_found" }), { headers: corsHeaders });
    }

    const remoteJid = `${lead.whatsapp.replace(/\D/g, "")}@s.whatsapp.net`;
    const leadName = (lead.name || "amigo(a)").split(" ")[0];

    const evoUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
    const evoKey = Deno.env.get("EVOLUTION_API_KEY");
    const chSurvey = await waChannel(instanceName);
    if (chSurvey.channel === "evolution" && (!evoUrl || !evoKey || !instanceName)) throw new Error("Evolution config ausente");

    const title = `Oi ${leadName}! Como foi seu atendimento com ${proName}?`;
    const description = "Sua opinião ajuda muito 🙏";
    let sentOk = false;
    try {
      if (chSurvey.channel === "cloud") {
        // Cloud: sem sendButtons — texto com as opções (a resposta em texto é tratada no webhook)
        const fallback = `${title}\n${description}\n\nResponda:\n• *Ótimo*\n• *Bom*\n• *Pode melhorar*`;
        sentOk = await cloudSendText(chSurvey, remoteJid, fallback);
      } else {
      const res = await fetch(`${evoUrl}/message/sendButtons/${instanceName}`, {
        method: "POST",
        headers: { "apikey": evoKey!, "Content-Type": "application/json" },
        body: JSON.stringify({
          number: remoteJid,
          title,
          description,
          footer: "Atendimento Virtual",
          buttons: [
            { type: "reply", displayText: "Ótimo 😀",        id: `sat:otimo:${appointment_id}` },
            { type: "reply", displayText: "Bom 🙂",          id: `sat:bom:${appointment_id}` },
            { type: "reply", displayText: "Pode melhorar 😕", id: `sat:ruim:${appointment_id}` },
          ],
        }),
      });
      sentOk = res.ok;
      if (!res.ok) {
        const fallback = `${title}\n${description}\n\nResponda:\n• *Ótimo*\n• *Bom*\n• *Pode melhorar*`;
        await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "apikey": evoKey!, "Content-Type": "application/json" },
          body: JSON.stringify({ number: remoteJid, text: fallback }),
        });
        sentOk = true;
      }
      }
    } catch (e: any) {
      console.error("[satisfaction] envio erro:", e.message);
    }

    await supabaseAdmin.from("chat_messages").insert({
      lead_id: lead.id,
      role: "assistant",
      content: "[Pesquisa de satisfação enviada]",
      processed: true,
    });

    // Dedupe (grava mesmo se Evolution falhou, pra não repetir em loop)
    await supabaseAdmin.from("appointment_reminders").insert({
      appointment_id, kind: "satisfaction", sent_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ success: true, sent: sentOk, lead: lead.name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[send-satisfaction-survey] Fatal:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Edge Function: send-appointment-reminder
//
// Chamada pelo cron process_appointment_reminders quando um agendamento está
// a ~24h ou ~1h da hora marcada. Envia mensagem WhatsApp ao lead via Evolution
// e grava o registro em appointment_reminders pra evitar duplicata.
//
// Body: { appointment_id: string, kind: '24h' | '1h' }
// Auth: service role (chamada via pg_net pelo cron)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function formatDateBR(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const dow = DAY_NAMES[d.getDay()]
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dow} ${dd}/${mm}`
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const { appointment_id, kind } = await req.json()
    if (!appointment_id || !['24h', '1h'].includes(kind)) {
      throw new Error('appointment_id e kind (24h|1h) obrigatórios')
    }

    // Guard: já enviado?
    const { data: already } = await supabaseAdmin
      .from('appointment_reminders')
      .select('id')
      .eq('appointment_id', appointment_id)
      .eq('kind', kind)
      .maybeSingle()
    if (already) {
      return new Response(JSON.stringify({ skipped: 'already_sent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Busca agendamento + profissional + lead via booking_state.appointment_id
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from('appointments')
      .select(`
        id, appointment_date, start_time, end_time, status, notes, lead_id,
        professionals!inner(id, full_name, evolution_instance_name, slug)
      `)
      .eq('id', appointment_id)
      .single()

    if (apptErr || !appt) {
      throw new Error(`Agendamento não encontrado: ${apptErr?.message}`)
    }

    const pro: any = (appt as any).professionals
    const proName = (pro?.full_name || 'o profissional').split(' ')[0]
    const instanceName = pro?.evolution_instance_name

    // Acha o lead: 1) direto por appointments.lead_id (agendamentos do painel E do
    // whats já gravam lead_id — fonte confiável); 2) fallback pelo booking_state.
    let lead: { id: string; name: string | null; whatsapp: string | null } | null = null
    const apptLeadId = (appt as any).lead_id as string | null
    if (apptLeadId) {
      const { data } = await supabaseAdmin
        .from('leads')
        .select('id, name, whatsapp')
        .eq('id', apptLeadId)
        .maybeSingle()
      lead = data as any
    }
    if (!lead) {
      const { data } = await supabaseAdmin
        .from('leads')
        .select('id, name, whatsapp')
        .eq('professional_id', pro.id)
        .eq('booking_state->>appointment_id', appointment_id)
        .maybeSingle()
      lead = data as any
    }

    if (!lead || !lead.whatsapp) {
      console.warn(`[reminder] Lead não encontrado pra appointment ${appointment_id}`)
      // Grava registro pra não tentar de novo
      await supabaseAdmin.from('appointment_reminders').insert({ appointment_id, kind })
      return new Response(JSON.stringify({ skipped: 'lead_not_found' }), { headers: corsHeaders })
    }

    const remoteJid = `${lead.whatsapp.replace(/\D/g, '')}@s.whatsapp.net`
    const leadName  = (lead.name || 'amigo(a)').split(' ')[0]
    const dataLabel = formatDateBR(appt.appointment_date as string)
    const hora      = ((appt.start_time as string) || '').slice(0, 5)

    const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
    const evoKey = Deno.env.get('EVOLUTION_API_KEY')
    if (!evoUrl || !evoKey || !instanceName) {
      throw new Error('Evolution config ausente')
    }

    let sentOk = false

    if (kind === '24h') {
      // Lembrete + pedido de confirmação com botões
      const title = `Oi ${leadName}! Lembrete: amanhã, ${dataLabel} às ${hora}, com ${proName}.`
      const description = 'Confirma sua presença?'
      try {
        const res = await fetch(`${evoUrl}/message/sendButtons/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: remoteJid,
            title,
            description,
            footer: 'Atendimento Virtual',
            buttons: [
              { type: 'reply', displayText: 'Confirmar ✅', id: 'reminder_confirm' },
              { type: 'reply', displayText: 'Remarcar',    id: 'reminder_reschedule' },
              { type: 'reply', displayText: 'Cancelar',    id: 'reminder_cancel' },
            ],
          }),
        })
        sentOk = res.ok
        if (!res.ok) {
          // Fallback texto
          const fallback = `${title}\n\nResponda:\n• *Confirmar* — está mantido\n• *Remarcar* — preciso mudar\n• *Cancelar* — não vou poder`
          await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: remoteJid, text: fallback }),
          })
          sentOk = true
        }
      } catch (e: any) {
        console.error('[reminder 24h] Evolution erro:', e.message)
      }

      // Grava também no histórico do chat
      await supabaseAdmin.from('chat_messages').insert({
        lead_id: lead.id,
        role: 'assistant',
        content: `[Lembrete 24h enviado: ${dataLabel} às ${hora}]`,
        processed: true,
      })
    } else if (kind === '1h') {
      // Lembrete final, sem botões — só texto
      const text = `${leadName}, em 1h te encontro: ${dataLabel} às ${hora}. Até daqui a pouco 🙌`
      try {
        const res = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: remoteJid, text }),
        })
        sentOk = res.ok
      } catch (e: any) {
        console.error('[reminder 1h] Evolution erro:', e.message)
      }
      await supabaseAdmin.from('chat_messages').insert({
        lead_id: lead.id,
        role: 'assistant',
        content: `[Lembrete 1h enviado: ${dataLabel} às ${hora}]`,
        processed: true,
      })
    }

    // Grava registro mesmo se Evolution falhou pra evitar loop de retentativa
    await supabaseAdmin.from('appointment_reminders').insert({ appointment_id, kind })

    return new Response(JSON.stringify({ success: true, sent: sentOk, kind, lead: lead.name }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('[send-appointment-reminder] Fatal:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

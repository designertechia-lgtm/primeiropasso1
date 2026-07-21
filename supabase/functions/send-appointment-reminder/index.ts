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

// ── Canal de envio: Evolution x Cloud API oficial (20/07) ──
// ATENÇÃO (janela de 24h): lembrete INICIA conversa — no canal cloud, fora da janela,
// a Meta recusa mensagens de texto livres (exige template aprovado). O erro fica logado
// e o lembrete conta como não-entregue. Templates utility são a Fase 2 dos crons.
const GRAPH_URL = 'https://graph.facebook.com/v21.0'
type WaChannel = { channel: 'evolution' | 'cloud'; phoneNumberId?: string; accessToken?: string }
async function waChannel(instanceName: string): Promise<WaChannel> {
  const fallback: WaChannel = { channel: 'evolution' }
  try {
    const sUrl = Deno.env.get('SUPABASE_URL')
    const sKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!sUrl || !sKey || !instanceName) return fallback
    const h = { apikey: sKey, Authorization: `Bearer ${sKey}` }
    const pr = await fetch(`${sUrl}/rest/v1/professionals?evolution_instance_name=eq.${encodeURIComponent(instanceName)}&select=id,whatsapp_channel&limit=1`, { headers: h, signal: AbortSignal.timeout(3000) })
    if (!pr.ok) return fallback
    const pro = (await pr.json().catch(() => []))?.[0]
    if (!pro || pro.whatsapp_channel !== 'cloud') return fallback
    const ar = await fetch(`${sUrl}/rest/v1/whatsapp_cloud_accounts?professional_id=eq.${pro.id}&status=eq.active&select=phone_number_id,access_token&limit=1`, { headers: h, signal: AbortSignal.timeout(3000) })
    const acc = ar.ok ? (await ar.json().catch(() => []))?.[0] : null
    return acc?.phone_number_id && acc?.access_token
      ? { channel: 'cloud', phoneNumberId: acc.phone_number_id, accessToken: acc.access_token }
      : fallback
  } catch { return fallback }
}
async function sendTextByChannel(ch: WaChannel, instanceName: string, to: string, text: string): Promise<boolean> {
  try {
    if (ch.channel === 'cloud') {
      const num = to.split('@')[0].split(':')[0].replace(/\D/g, '')
      const res = await fetch(`${GRAPH_URL}/${ch.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ch.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: num, type: 'text', text: { body: text } }),
      })
      if (!res.ok) console.error(`[cloud send] ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
      return res.ok
    }
    const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
    const evoKey = Deno.env.get('EVOLUTION_API_KEY')
    if (!evoUrl || !evoKey || !instanceName) return false
    const res = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: to, text }),
    })
    return res.ok
  } catch (e: any) {
    console.error('[sendTextByChannel] err:', e?.message)
    return false
  }
}

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
    const chRem = await waChannel(instanceName)
    if (chRem.channel === 'evolution' && (!evoUrl || !evoKey || !instanceName)) {
      throw new Error('Evolution config ausente')
    }

    let sentOk = false

    if (kind === '24h') {
      // Lembrete + pedido de confirmação com botões
      const title = `Oi ${leadName}! Lembrete: amanhã, ${dataLabel} às ${hora}, com ${proName}.`
      const description = 'Confirma sua presença?'
      try {
        // Canal cloud: sem sendButtons — direto o texto (respostas *Confirmar/Remarcar/Cancelar* já são tratadas).
        const res = chRem.channel === 'cloud'
          ? { ok: false } as Response
          : await fetch(`${evoUrl}/message/sendButtons/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evoKey!, 'Content-Type': 'application/json' },
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
          // Fallback texto (também o caminho padrão do canal cloud)
          const fallback = `${title}\n\nResponda:\n• *Confirmar* — está mantido\n• *Remarcar* — preciso mudar\n• *Cancelar* — não vou poder`
          sentOk = await sendTextByChannel(chRem, instanceName, remoteJid, fallback)
        }
      } catch (e: any) {
        console.error('[reminder 24h] envio erro:', e.message)
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
        sentOk = await sendTextByChannel(chRem, instanceName, remoteJid, text)
      } catch (e: any) {
        console.error('[reminder 1h] envio erro:', e.message)
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

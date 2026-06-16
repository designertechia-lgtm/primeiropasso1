import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// =============================================================================
// whatsapp-scheduler — MOTOR DETERMINÍSTICO DE AGENDAMENTO (Fase 1)
// =============================================================================
// O código (não o LLM) dirige o agendamento de ponta a ponta: oferece dias,
// oferece horários, confirma, cria/remarca/cancela. O whatsapp-agent só cuida
// de qualificação/dúvidas e faz handoff pra cá quando o lead quer marcar.
//
// SELF-CONTAINED de propósito: o deploy (deploy_function.py) envia só este
// index.ts, sem empacotar _shared/. Por isso a lógica de slots/booking é
// copiada verbatim do whatsapp-agent (não importada).
//
// Contrato de entrada (POST, vindo do whatsapp-webhook):
//   { lead_id, professional_id, instance_name, remote_jid, lead_name,
//     message, click_id|null, parsed_intent|null, action:'start'|null }
//
// booking_state (fonte de verdade no banco, relido a cada turno):
//   { stage:'choosing_day'|'choosing_time'|'confirming'|'done'|'cancelled',
//     offered_days?:ISO[], offered_times?:'HH:MM'[],
//     selected_date?, selected_time?, selected_day_label?,
//     appointment_id?, rescheduling?, updated_at, confirmed_at?, cancelled_at? }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SLOT_MINUTES = 60
const dayNames  = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const dayShort  = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// ─── Helpers de data/hora ────────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0')
const brtNow = (): Date => new Date(Date.now() - 3 * 3600 * 1000)            // "agora" em BRT (UTC-3)
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86400000)
const isoFromBRT = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
const labelFromIso = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00')
  return `${dayShort[d.getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}
const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const fromMinutes = (mins: number): string => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`

// =============================================================================
// EVOLUTION API — envio (botões, listas, texto, presença)
// =============================================================================
function evoEnv() {
  return {
    url: Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, ''),
    key: Deno.env.get('EVOLUTION_API_KEY'),
  }
}

async function sendPresence(instanceName: string, remoteJid: string) {
  const { url, key } = evoEnv()
  if (!url || !key || !instanceName) return
  await fetch(`${url}/chat/sendPresence/${instanceName}`, {
    method: 'POST',
    headers: { 'apikey': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: remoteJid, presence: 'composing', delay: 1200 }),
  }).catch((e) => console.error('[scheduler] presence err', e.message))
}

async function sendText(instanceName: string, remoteJid: string, text: string) {
  const { url, key } = evoEnv()
  if (!url || !key || !instanceName) return
  try {
    await fetch(`${url}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: remoteJid, text, options: { delay: 1000, presence: 'composing' } }),
    })
  } catch (e: any) {
    console.error('[scheduler] sendText err', e.message)
  }
}

// Mesmo formato confirmado em produção no sendOptionsMenu do whatsapp-webhook.
async function sendButtons(
  instanceName: string,
  remoteJid: string,
  opts: { title: string; description: string; footer?: string; buttons: Array<{ displayText: string; id: string }> },
): Promise<boolean> {
  const { url, key } = evoEnv()
  if (!url || !key || !instanceName) { console.error('[scheduler] evo cfg missing'); return false }
  const body = {
    number: remoteJid,
    title: opts.title,
    description: opts.description,
    footer: opts.footer || 'Atendimento Virtual',
    buttons: opts.buttons.map((b) => ({ type: 'reply', displayText: (b.displayText || '').slice(0, 20), id: b.id })),
  }
  try {
    const res = await fetch(`${url}/message/sendButtons/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const txt = await res.text()
    console.log(`[scheduler] sendButtons status=${res.status} ${txt.slice(0, 150)}`)
    if (!res.ok) {
      // Fallback texto numerado (o parseChoice resolve a resposta "1/2/3" via offered_*)
      const fb = `${opts.title}\n\n${opts.buttons.map((b, i) => `${i + 1}️⃣ ${b.displayText}`).join('\n')}\n\nResponda com o número da opção.`
      await sendText(instanceName, remoteJid, fb)
      return false
    }
    return true
  } catch (e: any) {
    console.error('[scheduler] sendButtons err', e.message)
    return false
  }
}

async function sendList(
  instanceName: string,
  remoteJid: string,
  opts: { title: string; description: string; buttonText?: string; footerText?: string; sections: Array<{ title: string; rows: Array<{ title: string; description?: string; rowId: string }> }> },
): Promise<boolean> {
  const { url, key } = evoEnv()
  if (!url || !key || !instanceName) { console.error('[scheduler] evo cfg missing'); return false }
  const body = {
    number: remoteJid,
    title: opts.title,
    description: opts.description,
    buttonText: opts.buttonText || 'Ver opções',
    footerText: opts.footerText || 'Atendimento Virtual',
    sections: opts.sections,
  }
  try {
    const res = await fetch(`${url}/message/sendList/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const txt = await res.text()
    console.log(`[scheduler] sendList status=${res.status} ${txt.slice(0, 150)}`)
    if (!res.ok) {
      const rows = opts.sections.flatMap((s) => s.rows)
      const fb = `${opts.title}\n\n${rows.map((r, i) => `${i + 1}️⃣ ${r.title}`).join('\n')}\n\nResponda com o número da opção.`
      await sendText(instanceName, remoteJid, fb)
      return false
    }
    return true
  } catch (e: any) {
    console.error('[scheduler] sendList err', e.message)
    return false
  }
}

// =============================================================================
// BANCO — cálculo de slots e operações de agendamento (lógica verbatim do agent)
// =============================================================================

// Disponibilidade semanal − agendamentos. Slots de 60min. Pula passado.
// (Copiado de whatsapp-agent buscar_horarios_disponiveis, linhas 588-688.)
async function computeFreeSlots(
  supabaseAdmin: any,
  professionalId: string,
  dataInicio: string,
  dataFim: string,
): Promise<Array<{ data: string; dia_semana: string; horarios_livres: string[] }>> {
  const { data: availability } = await supabaseAdmin
    .from('availability')
    .select('day_of_week, start_time, end_time')
    .eq('professional_id', professionalId)

  const { data: occupied } = await supabaseAdmin
    .from('appointments')
    .select('appointment_date, start_time, end_time, status, appointment_type')
    .eq('professional_id', professionalId)
    .gte('appointment_date', dataInicio)
    .lte('appointment_date', dataFim)
    .in('status', ['pending', 'confirmed'])

  // Fallback se não há agenda cadastrada: 9-12h / 14-18h dias úteis (sex até 17h)
  const defaultWeeklyAvailability = [
    { day_of_week: 1, start_time: '09:00', end_time: '12:00' },
    { day_of_week: 1, start_time: '14:00', end_time: '18:00' },
    { day_of_week: 2, start_time: '09:00', end_time: '12:00' },
    { day_of_week: 2, start_time: '14:00', end_time: '18:00' },
    { day_of_week: 3, start_time: '09:00', end_time: '12:00' },
    { day_of_week: 3, start_time: '14:00', end_time: '18:00' },
    { day_of_week: 4, start_time: '09:00', end_time: '12:00' },
    { day_of_week: 4, start_time: '14:00', end_time: '18:00' },
    { day_of_week: 5, start_time: '09:00', end_time: '12:00' },
    { day_of_week: 5, start_time: '14:00', end_time: '17:00' },
  ]
  const weekly = (availability && availability.length > 0) ? availability : defaultWeeklyAvailability

  const occupiedByDate: Record<string, Set<string>> = {}
  for (const apt of (occupied || [])) {
    const date = apt.appointment_date as string
    const start = (apt.start_time as string).slice(0, 5)
    if (!occupiedByDate[date]) occupiedByDate[date] = new Set()
    occupiedByDate[date].add(start)
  }

  const dias: Array<{ data: string; dia_semana: string; horarios_livres: string[] }> = []
  const start = new Date(dataInicio + 'T00:00:00')
  const end = new Date(dataFim + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d < today) continue

    const dow = d.getDay()
    const dateStr = d.toISOString().slice(0, 10)
    const isToday = d.getTime() === today.getTime()

    const windowsForDow = weekly.filter((w: any) => w.day_of_week === dow)
    if (windowsForDow.length === 0) continue

    const slotsLivresDoDia: string[] = []
    for (const w of windowsForDow) {
      const startMin = toMinutes((w.start_time as string).slice(0, 5))
      const endMin = toMinutes((w.end_time as string).slice(0, 5))
      for (let m = startMin; m + SLOT_MINUTES <= endMin; m += SLOT_MINUTES) {
        const slotStr = fromMinutes(m)
        if (isToday) {
          const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
          if (m <= nowMin) continue
        }
        if (occupiedByDate[dateStr]?.has(slotStr)) continue
        slotsLivresDoDia.push(slotStr)
      }
    }

    if (slotsLivresDoDia.length > 0) {
      dias.push({ data: dateStr, dia_semana: dayNames[dow], horarios_livres: slotsLivresDoDia })
    }
  }
  return dias
}

// Consistente com computeFreeSlots: mesma fonte, mesmo fallback, mesma exclusão.
async function isSlotFree(supabaseAdmin: any, professionalId: string, dateIso: string, time: string): Promise<boolean> {
  const dias = await computeFreeSlots(supabaseAdmin, professionalId, dateIso, dateIso)
  const dia = dias.find((d) => d.data === dateIso)
  return !!dia && dia.horarios_livres.includes(time)
}

// Cria agendamento. Valida janela + anti-overlap. (Verbatim de criar_agendamento, 744-826.)
async function createBooking(
  supabaseAdmin: any,
  professionalId: string,
  data: string,
  horaInicio: string,
  horaFim: string,
  notes: string,
  leadId: string | null = null,
): Promise<{ ok: boolean; appointment_id?: string; erro?: string; mensagem?: string }> {
  // ── janela de disponibilidade ──
  const reqDow = new Date(data + 'T00:00:00').getDay()
  const { data: avail } = await supabaseAdmin
    .from('availability')
    .select('start_time, end_time')
    .eq('professional_id', professionalId)
    .eq('day_of_week', reqDow)

  if (avail && avail.length > 0) {
    const dentro = avail.some((w: any) => {
      const s = (w.start_time as string).slice(0, 5)
      const e = (w.end_time as string).slice(0, 5)
      return horaInicio >= s && horaFim <= e
    })
    if (!dentro) {
      const janelas = avail.map((w: any) => `${(w.start_time as string).slice(0, 5)}-${(w.end_time as string).slice(0, 5)}`).join(', ')
      return { ok: false, erro: 'fora_da_grade', mensagem: `Esse horário está fora da grade de atendimento (${janelas}).` }
    }
  }

  // ── anti-overlap ── existente.start < novo.fim E existente.fim > novo.inicio
  const { data: conflitos, error: conflictError } = await supabaseAdmin
    .from('appointments')
    .select('id, start_time, end_time')
    .eq('professional_id', professionalId)
    .eq('appointment_date', data)
    .in('status', ['pending', 'confirmed'])
    .eq('appointment_type', 'booking')
    .lt('start_time', horaFim)
    .gt('end_time', horaInicio)
  if (conflictError) console.error('[scheduler] createBooking conflito:', conflictError.message)
  if (conflitos && conflitos.length > 0) {
    const c = conflitos[0]
    return {
      ok: false,
      erro: 'horario_indisponivel',
      mensagem: `Esse horário se sobrepõe a outro agendamento (${(c.start_time || '').toString().slice(0, 5)} – ${(c.end_time || '').toString().slice(0, 5)}).`,
    }
  }

  const { data: agendamento, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      professional_id: professionalId,
      lead_id: leadId,
      appointment_date: data,
      start_time: horaInicio,
      end_time: horaFim,
      appointment_type: 'booking',
      notes: notes || '',
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, erro: 'horario_indisponivel', mensagem: `O horário das ${horaInicio} acabou de ser reservado.` }
    }
    console.error('[scheduler] createBooking insert err:', error.message)
    return { ok: false, erro: error.message, mensagem: 'Não consegui concluir o agendamento agora.' }
  }
  return { ok: true, appointment_id: (agendamento as any).id }
}

// Remarca um agendamento existente. (Verbatim de atualizar_agendamento, 898-958.)
async function rescheduleBooking(
  supabaseAdmin: any,
  professionalId: string,
  apptId: string,
  novaData: string,
  novaHi: string,
  novaHf: string,
): Promise<{ ok: boolean; appointment_id?: string; erro?: string; mensagem?: string }> {
  const { data: conflitos } = await supabaseAdmin
    .from('appointments')
    .select('id, start_time, end_time')
    .eq('professional_id', professionalId)
    .eq('appointment_date', novaData)
    .in('status', ['pending', 'confirmed'])
    .eq('appointment_type', 'booking')
    .neq('id', apptId)
    .lt('start_time', novaHf)
    .gt('end_time', novaHi)
  if (conflitos && conflitos.length > 0) {
    const c = conflitos[0]
    return {
      ok: false,
      erro: 'horario_indisponivel',
      mensagem: `Esse novo horário se sobrepõe a outro agendamento (${(c.start_time || '').toString().slice(0, 5)}-${(c.end_time || '').toString().slice(0, 5)}).`,
    }
  }
  const { data: updated, error } = await supabaseAdmin
    .from('appointments')
    .update({ appointment_date: novaData, start_time: novaHi, end_time: novaHf, status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', apptId)
    .eq('professional_id', professionalId)
    .select('id')
    .single()
  if (error) {
    console.error('[scheduler] rescheduleBooking err:', error.message)
    return { ok: false, erro: error.message, mensagem: 'Não consegui remarcar agora.' }
  }
  return { ok: true, appointment_id: (updated as any).id }
}

// Cancela (status='cancelled', libera o slot). (Verbatim de cancelar_agendamento, 967-987.)
async function cancelBooking(supabaseAdmin: any, professionalId: string, apptId: string, motivo: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabaseAdmin
    .from('appointments')
    .update({ status: 'cancelled', notes: motivo || 'Cancelado pelo lead via agendador.', updated_at: new Date().toISOString() })
    .eq('id', apptId)
    .eq('professional_id', professionalId)
  if (error) {
    console.error('[scheduler] cancelBooking err:', error.message)
    return { ok: false, erro: error.message }
  }
  return { ok: true }
}

// =============================================================================
// SELETORES POR VOLUME (o pedido central: botões vs lista conforme a quantidade)
// =============================================================================
type Selector =
  | { kind: 'buttons'; title: string; description: string; buttons: Array<{ displayText: string; id: string }>; labels: string[]; ids: string[] }
  | { kind: 'list'; title: string; description: string; buttonText: string; sections: Array<{ title: string; rows: Array<{ title: string; rowId: string }> }>; labels: string[]; ids: string[] }

// ≤3 dias → botões; ≥4 → lista (1 section).
function buildDaySelector(dias: Array<{ data: string }>): Selector {
  const items = dias.map((d) => ({ label: labelFromIso(d.data), id: `day:${d.data}` }))
  const labels = items.map((i) => i.label)
  const ids = items.map((i) => i.id)
  if (items.length <= 3) {
    return { kind: 'buttons', title: 'Qual dia fica melhor?', description: 'Toque no dia desejado:', buttons: items.map((i) => ({ displayText: i.label, id: i.id })), labels, ids }
  }
  return {
    kind: 'list',
    title: 'Dias disponíveis',
    description: 'Escolha um dia para o atendimento:',
    buttonText: 'Ver dias',
    sections: [{ title: 'Dias disponíveis', rows: items.map((i) => ({ title: i.label, rowId: i.id })) }],
    labels, ids,
  }
}

// ≤3 → botões; 4-10 → lista (1 section); >10 → lista agrupada Manhã/Tarde/Noite.
function buildTimeSelector(horarios: string[]): Selector {
  const items = horarios.map((h) => ({ label: h, id: `time:${h}` }))
  const labels = items.map((i) => i.label)
  const ids = items.map((i) => i.id)

  if (items.length <= 3) {
    return { kind: 'buttons', title: 'Qual horário?', description: 'Toque no horário:', buttons: items.map((i) => ({ displayText: i.label, id: i.id })), labels, ids }
  }
  if (items.length <= 10) {
    return {
      kind: 'list', title: 'Horários disponíveis', description: 'Escolha um horário:', buttonText: 'Ver horários',
      sections: [{ title: 'Horários', rows: items.map((i) => ({ title: i.label, rowId: i.id })) }], labels, ids,
    }
  }
  // >10 → agrupa por período
  const manha = items.filter((i) => toMinutes(i.label) < 12 * 60)
  const tarde = items.filter((i) => { const m = toMinutes(i.label); return m >= 12 * 60 && m < 18 * 60 })
  const noite = items.filter((i) => toMinutes(i.label) >= 18 * 60)
  const sections: Array<{ title: string; rows: Array<{ title: string; rowId: string }> }> = []
  if (manha.length) sections.push({ title: 'Manhã', rows: manha.map((i) => ({ title: i.label, rowId: i.id })) })
  if (tarde.length) sections.push({ title: 'Tarde', rows: tarde.map((i) => ({ title: i.label, rowId: i.id })) })
  if (noite.length) sections.push({ title: 'Noite', rows: noite.map((i) => ({ title: i.label, rowId: i.id })) })
  // offered_* deve seguir a ordem EXIBIDA (manhã→tarde→noite) p/ o fallback numerado bater.
  const ordered = [...manha, ...tarde, ...noite]
  return { kind: 'list', title: 'Horários disponíveis', description: 'Escolha um horário:', buttonText: 'Ver horários', sections, labels: ordered.map((i) => i.label), ids: ordered.map((i) => i.id) }
}

function buildConfirmButtons(dayLabel: string, time: string): Selector {
  return {
    kind: 'buttons',
    title: `Confirma ${dayLabel} às ${time}?`,
    description: 'É só tocar:',
    buttons: [
      { displayText: 'Confirmar ✅', id: 'act:confirm' },
      { displayText: 'Remarcar', id: 'act:reschedule' },
      { displayText: 'Cancelar', id: 'act:cancel' },
    ],
    labels: ['Confirmar ✅', 'Remarcar', 'Cancelar'],
    ids: ['act:confirm', 'act:reschedule', 'act:cancel'],
  }
}

// =============================================================================
// parseChoice — interpreta a resposta do lead (determinístico, sem LLM)
// Prioriza click_id estruturado; depois regex no texto; depois nº (fallback); depois parsed_intent.
// Robusto ao caso "botão Evolution chega como texto não-clicável": o regex captura.
// =============================================================================
type Choice =
  | { type: 'day'; date: string }
  | { type: 'time'; time: string }
  | { type: 'datetime'; date: string | null; time: string | null }
  | { type: 'confirm' }
  | { type: 'reschedule' }
  | { type: 'cancel' }
  | { type: 'start' }
  | { type: 'unknown' }

function parseChoice(clickId: string | null, message: string, parsedIntent: any, bs: any): Choice {
  const cid = (clickId || '').trim()
  if (cid.startsWith('day:')) return { type: 'day', date: cid.slice(4) }
  if (cid.startsWith('time:')) return { type: 'time', time: cid.slice(5) }
  if (cid === 'act:confirm') return { type: 'confirm' }
  if (cid === 'act:reschedule') return { type: 'reschedule' }
  if (cid === 'act:cancel') return { type: 'cancel' }
  if (cid === 'opt_agendar' || cid === 'opt_agenda') return { type: 'start' }

  const txt = (message || '').trim()

  // Label de dia "Seg 09/06" (botão/lista que chegou como texto)
  const dm = txt.match(/^(Seg|Ter|Qua|Qui|Sex|Sáb|Sab|Dom)\s+(\d{1,2})\/(\d{1,2})$/i)
  if (dm) {
    const dd = dm[2].padStart(2, '0')
    const mm = dm[3].padStart(2, '0')
    const brt = brtNow()
    const y = brt.getUTCFullYear()
    const todayMs = Date.UTC(y, brt.getUTCMonth(), brt.getUTCDate())
    const candMs = Date.UTC(y, parseInt(mm, 10) - 1, parseInt(dd, 10))
    const useYear = candMs < todayMs ? y + 1 : y
    return { type: 'day', date: `${useYear}-${mm}-${dd}` }
  }

  // Horário "HH:MM"
  if (/^\d{1,2}:\d{2}$/.test(txt)) return { type: 'time', time: txt.padStart(5, '0') }

  // Ações
  if (/^confirmar(\s|$|✅)/i.test(txt) || /^✅\s*confirmar/i.test(txt)) return { type: 'confirm' }
  if (/^remarcar(\s|$)/i.test(txt)) return { type: 'reschedule' }
  if (/^cancelar(\s|$)/i.test(txt)) return { type: 'cancel' }

  // Número puro (fallback texto numerado) — resolve via offered_* do estado atual
  const nm = txt.match(/^([1-9])\b/)
  if (nm) {
    const idx = parseInt(nm[1], 10) - 1
    if (bs?.stage === 'choosing_day' && Array.isArray(bs.offered_days) && bs.offered_days[idx]) return { type: 'day', date: bs.offered_days[idx] }
    if (bs?.stage === 'choosing_time' && Array.isArray(bs.offered_times) && bs.offered_times[idx]) return { type: 'time', time: bs.offered_times[idx] }
  }

  // Intenção temporal natural já extraída pelo webhook ("hoje 18h", "dia 19 às 17")
  if (parsedIntent && (parsedIntent.date || parsedIntent.time)) {
    return { type: 'datetime', date: parsedIntent.date || null, time: parsedIntent.time || null }
  }

  return { type: 'unknown' }
}

// =============================================================================
// CONTEXTO + PERSISTÊNCIA
// =============================================================================
type Ctx = {
  supabaseAdmin: any
  professionalId: string
  leadId: string
  instanceName: string
  remoteJid: string
  leadName: string
  proFirstName: string
}

async function setBookingState(ctx: Ctx, state: any) {
  await ctx.supabaseAdmin.from('leads').update({ booking_state: state }).eq('id', ctx.leadId)
}

async function logAssistant(ctx: Ctx, content: string) {
  await ctx.supabaseAdmin.from('chat_messages').insert({ lead_id: ctx.leadId, role: 'assistant', content, processed: true })
}

// reply = registra no histórico + envia texto
async function reply(ctx: Ctx, text: string) {
  await logAssistant(ctx, text)
  await sendPresence(ctx.instanceName, ctx.remoteJid)
  await sendText(ctx.instanceName, ctx.remoteJid, text)
}

async function sendSelector(ctx: Ctx, sel: Selector) {
  await sendPresence(ctx.instanceName, ctx.remoteJid)
  if (sel.kind === 'buttons') {
    await sendButtons(ctx.instanceName, ctx.remoteJid, { title: sel.title, description: sel.description, buttons: sel.buttons })
  } else {
    await sendList(ctx.instanceName, ctx.remoteJid, { title: sel.title, description: sel.description, buttonText: sel.buttonText, sections: sel.sections })
  }
}

// =============================================================================
// PASSOS DO FLUXO (cada um envia + persiste o estado)
// =============================================================================
async function offerDays(ctx: Ctx, bs: any, rescheduling: boolean) {
  const now = new Date().toISOString()
  const hoje = isoFromBRT(brtNow())
  const fim = isoFromBRT(addDays(brtNow(), 7))
  const dias = await computeFreeSlots(ctx.supabaseAdmin, ctx.professionalId, hoje, fim)

  if (dias.length === 0) {
    await reply(ctx, `No momento não encontrei horários livres nos próximos dias. Vou pedir pro ${ctx.proFirstName} te retornar com novas datas, tá? 🙂`)
    await setBookingState(ctx, { ...bs, stage: 'choosing_day', offered_days: [], selected_date: null, selected_time: null, rescheduling, updated_at: now })
    return
  }

  const top = dias.slice(0, 6)
  const sel = buildDaySelector(top)
  await sendSelector(ctx, sel)
  await logAssistant(ctx, `[Scheduler dias: ${sel.labels.join(' · ')}]`)
  await setBookingState(ctx, {
    ...bs,
    stage: 'choosing_day',
    offered_days: sel.ids.map((id) => id.replace('day:', '')),
    selected_date: null,
    selected_time: null,
    rescheduling,
    updated_at: now,
  })
}

async function offerTimes(ctx: Ctx, bs: any, dateIso: string) {
  const now = new Date().toISOString()
  const label = labelFromIso(dateIso)
  const dias = await computeFreeSlots(ctx.supabaseAdmin, ctx.professionalId, dateIso, dateIso)
  const dia = dias.find((d) => d.data === dateIso)
  const horarios = dia?.horarios_livres || []

  if (horarios.length === 0) {
    await reply(ctx, `Não tenho horários livres em ${label}. Vou te mostrar outros dias 🙂`)
    await offerDays(ctx, bs, !!bs.rescheduling)
    return
  }

  const sel = buildTimeSelector(horarios)
  await sendSelector(ctx, sel)
  await logAssistant(ctx, `[Scheduler horários ${label}: ${sel.labels.join(' · ')}]`)
  await setBookingState(ctx, {
    ...bs,
    stage: 'choosing_time',
    selected_date: dateIso,
    selected_day_label: label,
    selected_time: null,
    offered_times: sel.ids.map((id) => id.replace('time:', '')),
    updated_at: now,
  })
}

async function sendConfirm(ctx: Ctx, dayLabel: string, time: string) {
  const sel = buildConfirmButtons(dayLabel, time)
  await sendSelector(ctx, sel)
  await logAssistant(ctx, `[Scheduler confirmação: ${dayLabel} às ${time}]`)
}

async function doConfirm(ctx: Ctx, bs: any) {
  const now = new Date().toISOString()
  const date = bs.selected_date as string
  const time = bs.selected_time as string
  const horaFim = fromMinutes(toMinutes(time) + SLOT_MINUTES)

  const result = (bs.appointment_id && bs.rescheduling)
    ? await rescheduleBooking(ctx.supabaseAdmin, ctx.professionalId, bs.appointment_id, date, time, horaFim)
    : await createBooking(ctx.supabaseAdmin, ctx.professionalId, date, time, horaFim, '', ctx.leadId)

  if (!result.ok) {
    await reply(ctx, result.mensagem || 'Esse horário acabou de ser preenchido. Vamos escolher outro? 🙂')
    await offerTimes(ctx, { ...bs, selected_time: null, stage: 'choosing_time' }, date)
    return
  }

  const apptId = result.appointment_id || bs.appointment_id
  const label = bs.selected_day_label || labelFromIso(date)
  await setBookingState(ctx, {
    ...bs,
    stage: 'done',
    appointment_id: apptId,
    selected_date: date,
    selected_time: time,
    selected_day_label: label,
    rescheduling: false,
    confirmed_at: now,
    updated_at: now,
  })
  await ctx.supabaseAdmin.from('leads').update({ pipeline_stage: 'agendado' }).eq('id', ctx.leadId)
  await reply(ctx, `Marcado! Te espero ${label} às ${time}. 🙌`)
}

async function doCancel(ctx: Ctx, bs: any) {
  const now = new Date().toISOString()
  if (bs.appointment_id) {
    await cancelBooking(ctx.supabaseAdmin, ctx.professionalId, bs.appointment_id, 'Cancelado pelo lead via agendador.')
  }
  await setBookingState(ctx, { ...bs, stage: 'cancelled', cancelled_at: now, updated_at: now })
  await ctx.supabaseAdmin.from('leads').update({ pipeline_stage: 'em_conversa' }).eq('id', ctx.leadId)
  await reply(ctx, 'Pronto, cancelei seu horário. Quando quiser remarcar, é só me chamar. Um abraço! 🙂')
}

async function offerReschedOrCancel(ctx: Ctx, bs: any) {
  const label = bs.selected_day_label || (bs.selected_date ? labelFromIso(bs.selected_date) : 'seu horário')
  await sendPresence(ctx.instanceName, ctx.remoteJid)
  await sendButtons(ctx.instanceName, ctx.remoteJid, {
    title: `Você já tem horário em ${label} às ${bs.selected_time}`,
    description: 'O que você prefere?',
    buttons: [
      { displayText: 'Remarcar', id: 'act:reschedule' },
      { displayText: 'Cancelar', id: 'act:cancel' },
    ],
  })
  await logAssistant(ctx, `[Scheduler já agendado: remarcar/cancelar]`)
}

// =============================================================================
// MÁQUINA DE ESTADOS
// =============================================================================
async function handlePick(ctx: Ctx, choice: Choice, bs: any): Promise<boolean> {
  let date: string | null = null
  let time: string | null = null

  if (choice.type === 'day') { date = choice.date; time = null }
  else if (choice.type === 'time') { time = choice.time; date = bs.selected_date || null }
  else if (choice.type === 'datetime') { date = choice.date || bs.selected_date || null; time = choice.time || null }

  // Temos dia + horário → verifica e segue pra confirmação
  if (date && time) {
    const free = await isSlotFree(ctx.supabaseAdmin, ctx.professionalId, date, time)
    if (free) {
      const label = labelFromIso(date)
      const now = new Date().toISOString()
      await setBookingState(ctx, { ...bs, stage: 'confirming', selected_date: date, selected_time: time, selected_day_label: label, updated_at: now })
      await sendConfirm(ctx, label, time)
      return true
    }
    // Horário fora da grade / ocupado: NÃO respondemos o loop "não está livre".
    // Devolvemos o controle pro LLM acolher e oferecer os livres (combinado).
    return false
  }

  // Só dia → oferece horários
  if (date && !time) {
    await offerTimes(ctx, bs, date)
    return true
  }

  // Só horário sem dia definido → pede o dia
  await reply(ctx, 'Me diz primeiro qual dia, aí já te mostro os horários. 🙂')
  await offerDays(ctx, bs, !!bs.rescheduling)
  return true
}

async function handleSchedulingTurn(ctx: Ctx, choice: Choice, bs: any): Promise<boolean> {
  const now = new Date().toISOString()

  // Estado terminal: já tem agendamento ativo → só remarcar/cancelar
  if (bs.stage === 'done' && bs.appointment_id) {
    if (choice.type === 'cancel') { await doCancel(ctx, bs); return true }
    if (choice.type === 'reschedule') { await offerDays(ctx, bs, true); return true }
    await offerReschedOrCancel(ctx, bs); return true
  }

  // Ações globais
  if (choice.type === 'cancel') {
    if (bs.appointment_id) { await doCancel(ctx, bs); return true }
    await reply(ctx, 'Tudo bem, sem problema! Quando quiser marcar é só me chamar. 🙂')
    await setBookingState(ctx, { ...bs, stage: 'cancelled', updated_at: now })
    return true
  }
  if (choice.type === 'reschedule') {
    await offerDays(ctx, bs, !!bs.appointment_id); return true
  }
  if (choice.type === 'confirm') {
    if (bs.stage === 'confirming' && bs.selected_date && bs.selected_time) { await doConfirm(ctx, bs); return true }
    // confirm sem contexto válido → recomeça oferecendo dias
    await offerDays(ctx, bs, !!bs.rescheduling); return true
  }
  if (choice.type === 'day' || choice.type === 'time' || choice.type === 'datetime') {
    return await handlePick(ctx, choice, bs)
  }
  if (choice.type === 'start') {
    await offerDays(ctx, bs, false); return true
  }

  // unknown no MEIO de um fluxo ativo → NÃO responde "Não entendi": devolve o
  // controle pro whatsapp-agent (LLM), que responde a dúvida/feedback e faz a ponte.
  if (bs.stage === 'choosing_day' || (bs.stage === 'choosing_time' && bs.selected_date) || (bs.stage === 'confirming' && bs.selected_date && bs.selected_time)) {
    return false
  }
  // Sem estado de fluxo → começa o fluxo
  await offerDays(ctx, bs, false)
  return true
}

// =============================================================================
// MAIN HANDLER
// =============================================================================
serve(async (req) => {
  console.log(`[scheduler] ${req.method}`)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const {
      lead_id, professional_id, instance_name, remote_jid, lead_name,
      message, click_id, parsed_intent, action,
    } = body

    if (!professional_id || !lead_id) throw new Error('Missing professional_id or lead_id')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: pro } = await supabaseAdmin.from('professionals').select('full_name').eq('id', professional_id).maybeSingle()
    const { data: leadRow } = await supabaseAdmin.from('leads').select('booking_state').eq('id', lead_id).maybeSingle()
    const bs: any = (leadRow?.booking_state) || {}
    const proFirstName = (pro?.full_name || 'o profissional').split(' ')[0]

    const ctx: Ctx = {
      supabaseAdmin,
      professionalId: professional_id,
      leadId: lead_id,
      instanceName: instance_name,
      remoteJid: remote_jid,
      leadName: lead_name || 'amigo(a)',
      proFirstName,
    }

    const choice: Choice = action === 'start'
      ? { type: 'start' }
      : parseChoice(click_id || null, message || '', parsed_intent || null, bs)

    console.log(`[scheduler] lead=${lead_id} stage=${bs.stage || '(none)'} choice=${JSON.stringify(choice)}`)

    const handled = await handleSchedulingTurn(ctx, choice, bs)

    // INVERSÃO (combinado): o determinístico vem DEPOIS do LLM. Quando não resolve
    // a seleção (texto livre, horário fora da grade), devolve o controle SEM marcar
    // as mensagens como processadas — o whatsapp-webhook segue pro agent (LLM).
    if (!handled) {
      console.log(`[scheduler] handoff → LLM (choice=${choice.type}, stage=${bs.stage || '-'})`)
      return new Response(JSON.stringify({ success: true, handled: false, reason: 'handoff_llm' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Marca as mensagens do lead como processadas (o scheduler já respondeu)
    await supabaseAdmin.from('chat_messages').update({ processed: true }).eq('lead_id', lead_id).eq('processed', false)
    await supabaseAdmin.from('leads').update({ last_message_at: new Date().toISOString() }).eq('id', lead_id)

    return new Response(JSON.stringify({ success: true, handled: true, choice: choice.type }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('[scheduler] fatal:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

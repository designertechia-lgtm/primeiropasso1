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

const SLOT_MINUTES = 60                 // passo/duração padrão quando não há serviço cadastrado
const DEFAULT_DURATION = 60             // minutos
const dayNames  = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const dayShort  = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Disponibilidade padrão se o profissional não cadastrou nada: 9-12h / 14-18h dias úteis (sex 17h).
const DEFAULT_WEEKLY: Array<{ day_of_week: number; start_time: string; end_time: string }> = [
  { day_of_week: 1, start_time: '09:00', end_time: '12:00' }, { day_of_week: 1, start_time: '14:00', end_time: '18:00' },
  { day_of_week: 2, start_time: '09:00', end_time: '12:00' }, { day_of_week: 2, start_time: '14:00', end_time: '18:00' },
  { day_of_week: 3, start_time: '09:00', end_time: '12:00' }, { day_of_week: 3, start_time: '14:00', end_time: '18:00' },
  { day_of_week: 4, start_time: '09:00', end_time: '12:00' }, { day_of_week: 4, start_time: '14:00', end_time: '18:00' },
  { day_of_week: 5, start_time: '09:00', end_time: '12:00' }, { day_of_week: 5, start_time: '14:00', end_time: '17:00' },
]
const durationFromBs = (bs: any): number => {
  const d = Number(bs?.duration_min)
  return Number.isFinite(d) && d > 0 ? d : DEFAULT_DURATION
}

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
  slotMin: number = SLOT_MINUTES,
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

  const weekly = (availability && availability.length > 0) ? availability : DEFAULT_WEEKLY

  // Intervalos ocupados [inícioMin, fimMin) por data — marca o BLOCO inteiro (não só o início),
  // pra um slot quebrado/curto não cair em cima de um agendamento existente.
  const occByDate: Record<string, Array<[number, number]>> = {}
  for (const apt of (occupied || [])) {
    const date = apt.appointment_date as string
    const s = toMinutes((apt.start_time as string).slice(0, 5))
    const e = toMinutes((apt.end_time as string).slice(0, 5))
    if (!occByDate[date]) occByDate[date] = []
    occByDate[date].push([s, e])
  }
  const overlaps = (m: number, dur: number, intervals: Array<[number, number]>) =>
    (intervals || []).some(([s, e]) => m < e && (m + dur) > s)

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
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()

    const windowsForDow = weekly.filter((w: any) => w.day_of_week === dow)
    if (windowsForDow.length === 0) continue

    const slotsLivresDoDia: string[] = []
    for (const w of windowsForDow) {
      const startMin = toMinutes((w.start_time as string).slice(0, 5))
      const endMin = toMinutes((w.end_time as string).slice(0, 5))
      // o slot precisa CABER inteiro na janela (m + duração <= fim)
      for (let m = startMin; m + slotMin <= endMin; m += slotMin) {
        if (isToday && m <= nowMin) continue
        if (overlaps(m, slotMin, occByDate[dateStr])) continue
        slotsLivresDoDia.push(fromMinutes(m))
      }
    }

    if (slotsLivresDoDia.length > 0) {
      dias.push({ data: dateStr, dia_semana: dayNames[dow], horarios_livres: slotsLivresDoDia })
    }
  }
  return dias
}

// Consistente com computeFreeSlots: mesma fonte, mesmo fallback, mesma exclusão.
// Aceita QUALQUER horário (inclusive quebrado, ex.: 14:20) desde que o bloco
// [time, time+duração) caiba numa janela de atendimento, não esteja no passado e
// não sobreponha outro agendamento. É o que destrava o modo flexível.
async function isSlotFree(
  supabaseAdmin: any, professionalId: string, dateIso: string, time: string,
  durationMin: number = SLOT_MINUTES,
): Promise<boolean> {
  const startMin = toMinutes(time)
  const endMin = startMin + durationMin
  const dow = new Date(dateIso + 'T00:00:00').getDay()

  // 1) cabe inteiro em alguma janela do dia?
  const { data: avail } = await supabaseAdmin
    .from('availability').select('start_time, end_time')
    .eq('professional_id', professionalId).eq('day_of_week', dow)
  const windows = (avail && avail.length > 0)
    ? avail
    : DEFAULT_WEEKLY.filter((w) => w.day_of_week === dow)
  const cabe = windows.some((w: any) =>
    startMin >= toMinutes((w.start_time as string).slice(0, 5)) &&
    endMin <= toMinutes((w.end_time as string).slice(0, 5)))
  if (!cabe) return false

  // 2) não está no passado (se for hoje)
  const todayIso = isoFromBRT(brtNow())
  if (dateIso === todayIso) {
    const nowMin = brtNow().getUTCHours() * 60 + brtNow().getUTCMinutes()
    if (startMin <= nowMin) return false
  }

  // 3) não sobrepõe outro agendamento (mesma regra do createBooking)
  const { data: conflitos } = await supabaseAdmin
    .from('appointments').select('id')
    .eq('professional_id', professionalId)
    .eq('appointment_date', dateIso)
    .in('status', ['pending', 'confirmed'])
    .eq('appointment_type', 'booking')
    .lt('start_time', fromMinutes(endMin))
    .gt('end_time', time)
  return !(conflitos && conflitos.length > 0)
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
  serviceId: string | null = null,
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
      service_id: serviceId,
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

function buildConfirmButtons(dayLabel: string, time: string, serviceName?: string | null): Selector {
  return {
    kind: 'buttons',
    title: `Confirma ${dayLabel} às ${time}?`,
    description: serviceName ? `${serviceName} · É só tocar:` : 'É só tocar:',
    buttons: [
      { displayText: 'Confirmar ✅', id: 'act:confirm' },
      { displayText: 'Remarcar', id: 'act:reschedule' },
      { displayText: 'Cancelar', id: 'act:cancel' },
    ],
    labels: ['Confirmar ✅', 'Remarcar', 'Cancelar'],
    ids: ['act:confirm', 'act:reschedule', 'act:cancel'],
  }
}

// ≤3 → botões; ≥4 → lista. id = svc:<uuid>. Mostra a duração no rótulo.
function buildServiceSelector(services: Array<{ id: string; name: string; duration_minutes: number }>): Selector {
  const items = services.map((s) => ({ label: `${s.name} (${s.duration_minutes}min)`, id: `svc:${s.id}` }))
  const labels = items.map((i) => i.label)
  const ids = items.map((i) => i.id)
  if (items.length <= 3) {
    return { kind: 'buttons', title: 'Qual atendimento?', description: 'Toque na opção:', buttons: items.map((i) => ({ displayText: i.label, id: i.id })), labels, ids }
  }
  return {
    kind: 'list', title: 'Atendimentos', description: 'Escolha o tipo de atendimento:', buttonText: 'Ver opções',
    sections: [{ title: 'Atendimentos', rows: items.map((i) => ({ title: i.label, rowId: i.id })) }], labels, ids,
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
  | { type: 'service'; id: string }
  | { type: 'unknown' }

function parseChoice(clickId: string | null, message: string, parsedIntent: any, bs: any): Choice {
  const cid = (clickId || '').trim()
  if (cid.startsWith('day:')) return { type: 'day', date: cid.slice(4) }
  if (cid.startsWith('time:')) return { type: 'time', time: cid.slice(5) }
  if (cid === 'act:confirm') return { type: 'confirm' }
  if (cid === 'act:reschedule') return { type: 'reschedule' }
  if (cid === 'act:cancel') return { type: 'cancel' }
  if (cid === 'opt_agendar' || cid === 'opt_agenda') return { type: 'start' }
  if (cid.startsWith('svc:')) return { type: 'service', id: cid.slice(4) }

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
    if (bs?.stage === 'choosing_service' && Array.isArray(bs.offered_services) && bs.offered_services[idx]) return { type: 'service', id: bs.offered_services[idx].id }
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
  const dias = await computeFreeSlots(ctx.supabaseAdmin, ctx.professionalId, hoje, fim, durationFromBs(bs))

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

// Serviços ativos do profissional (com duração válida). Define a duração da sessão.
async function getServices(ctx: Ctx): Promise<Array<{ id: string; name: string; duration_minutes: number }>> {
  const { data } = await ctx.supabaseAdmin
    .from('professional_services')
    .select('id, name, duration_minutes, active, created_at')
    .eq('professional_id', ctx.professionalId)
    .eq('active', true)
    .order('created_at', { ascending: true })
  return (data || [])
    .filter((s: any) => Number(s.duration_minutes) > 0)
    .map((s: any) => ({ id: s.id, name: s.name, duration_minutes: Number(s.duration_minutes) }))
}

// Início do agendamento: 2+ serviços → pergunta qual (define a duração);
// 0 ou 1 serviço → resolve a duração e vai direto pros dias.
async function startBooking(ctx: Ctx, bs: any): Promise<boolean> {
  const services = await getServices(ctx)
  if (services.length >= 2 && !bs.service_id) {
    await offerServices(ctx, bs, services)
    return true
  }
  const svc = services.length === 1 ? services[0] : null
  await offerDays(ctx, { ...bs, service_id: svc?.id ?? null, service_name: svc?.name ?? null, duration_min: svc?.duration_minutes ?? DEFAULT_DURATION }, false)
  return true
}

async function offerServices(ctx: Ctx, bs: any, services: Array<{ id: string; name: string; duration_minutes: number }>) {
  const now = new Date().toISOString()
  const sel = buildServiceSelector(services)
  await sendSelector(ctx, sel)
  await logAssistant(ctx, `[Scheduler serviços: ${sel.labels.join(' · ')}]`)
  await setBookingState(ctx, {
    ...bs,
    stage: 'choosing_service',
    offered_services: services.map((s) => ({ id: s.id, name: s.name, duration: s.duration_minutes })),
    selected_date: null,
    selected_time: null,
    updated_at: now,
  })
}

async function pickService(ctx: Ctx, serviceId: string, bs: any): Promise<boolean> {
  const svc = (bs.offered_services || []).find((s: any) => s.id === serviceId)
  await offerDays(ctx, { ...bs, service_id: serviceId, service_name: svc?.name ?? null, duration_min: svc?.duration ?? DEFAULT_DURATION }, false)
  return true
}

async function offerTimes(ctx: Ctx, bs: any, dateIso: string) {
  const now = new Date().toISOString()
  const label = labelFromIso(dateIso)
  const dias = await computeFreeSlots(ctx.supabaseAdmin, ctx.professionalId, dateIso, dateIso, durationFromBs(bs))
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

async function sendConfirm(ctx: Ctx, dayLabel: string, time: string, serviceName?: string | null) {
  const sel = buildConfirmButtons(dayLabel, time, serviceName)
  await sendSelector(ctx, sel)
  await logAssistant(ctx, `[Scheduler confirmação: ${serviceName ? serviceName + ' · ' : ''}${dayLabel} às ${time}]`)
}

async function doConfirm(ctx: Ctx, bs: any) {
  const now = new Date().toISOString()
  const date = bs.selected_date as string
  const time = bs.selected_time as string
  const horaFim = fromMinutes(toMinutes(time) + durationFromBs(bs))

  const result = (bs.appointment_id && bs.rescheduling)
    ? await rescheduleBooking(ctx.supabaseAdmin, ctx.professionalId, bs.appointment_id, date, time, horaFim)
    : await createBooking(ctx.supabaseAdmin, ctx.professionalId, date, time, horaFim, '', ctx.leadId, bs.service_id || null)

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
  await reply(ctx, bs.service_name
    ? `Marcado! Sua ${bs.service_name}, ${label} às ${time}. 🙌`
    : `Marcado! Te espero ${label} às ${time}. 🙌`)
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
    const free = await isSlotFree(ctx.supabaseAdmin, ctx.professionalId, date, time, durationFromBs(bs))
    if (free) {
      const label = labelFromIso(date)
      const now = new Date().toISOString()
      await setBookingState(ctx, { ...bs, stage: 'confirming', selected_date: date, selected_time: time, selected_day_label: label, updated_at: now })
      await sendConfirm(ctx, label, time, bs.service_name)
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
  if (choice.type === 'service') {
    return await pickService(ctx, choice.id, bs)
  }
  if (choice.type === 'day' || choice.type === 'time' || choice.type === 'datetime') {
    return await handlePick(ctx, choice, bs)
  }
  if (choice.type === 'start') {
    // RETOMAR em vez de zerar: se o lead já tinha avançado, não volta pra lista de
    // dias perdendo o progresso — re-oferece o ponto atual (o reset na frustração
    // era o que mais irritava). Recomeço do zero só se ainda não havia dia escolhido.
    if (bs.stage === 'choosing_time' && bs.selected_date) {
      await offerTimes(ctx, bs, bs.selected_date); return true
    }
    if (bs.stage === 'confirming' && bs.selected_date && bs.selected_time) {
      await sendConfirm(ctx, bs.selected_day_label || labelFromIso(bs.selected_date), bs.selected_time, bs.service_name); return true
    }
    return await startBooking(ctx, bs)
  }

  // unknown no MEIO de um fluxo ativo → NÃO responde "Não entendi": devolve o
  // controle pro whatsapp-agent (LLM), que responde a dúvida/feedback e faz a ponte.
  if (bs.stage === 'choosing_service' || bs.stage === 'choosing_day' || (bs.stage === 'choosing_time' && bs.selected_date) || (bs.stage === 'confirming' && bs.selected_date && bs.selected_time)) {
    return false
  }
  // Sem estado de fluxo → começa o fluxo (resolve serviço/duração primeiro)
  return await startBooking(ctx, bs)
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

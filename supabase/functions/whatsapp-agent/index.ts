import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// =============================================
// TOOL DEFINITIONS — formato Anthropic (Tool Use)
// =============================================
const tools = [
  {
    name: "consultar_documentos",
    description: "Busca info no acervo de documentos do profissional. CHAME ESTA TOOL SEMPRE QUE O LEAD PERGUNTAR ALGO ESPECÍFICO sobre serviços, métodos, preços, planos, conformidade, casos de uso, identidade da plataforma — qualquer coisa que NÃO está EXPLICITAMENTE na bio. NUNCA diga 'não tenho material' sem chamar esta tool primeiro. REGRA CRÍTICA: use queries CURTAS de 1-3 palavras-chave (não frases completas) — o motor de busca é sensível à formulação. Ex: 'LGPD', 'preço plano', 'avatar IA', 'agendamento', 'CFP'. NÃO use queries longas como 'como funciona a conformidade com a LGPD?'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "1-3 palavras-chave. Bons exemplos: 'LGPD', 'preço', 'avatar', 'CFP', 'plano mensal', 'casos uso'. Ruins: 'como funciona', 'me conta sobre'." }
      },
      required: ["query"]
    }
  },
  {
    name: "abrir_agenda",
    description: "Mostra ao lead os horários livres do profissional, em botões/lista clicáveis. Chame quando o lead quiser ver/escolher quando marcar. SEM 'data': mostra os DIAS disponíveis. COM 'data' (YYYY-MM-DD): mostra os HORÁRIOS daquele dia. A tool envia os botões — depois de chamar, NÃO escreva texto neste turno.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Opcional. Dia em YYYY-MM-DD para listar os horários dele. Omita para listar os dias disponíveis. Use a data de HOJE (no topo do prompt) para converter 'amanhã', 'Qua 18/06' etc." }
      },
      required: []
    }
  },
  {
    name: "criar_agendamento",
    description: "Agenda DE FATO o horário escolhido. Chame SÓ quando o lead já escolheu dia E horário. A tool valida (cabe no expediente + livre) e, se ok, registra e JÁ AVISA o lead que está marcado — você NÃO escreve a confirmação. REGRA ABSOLUTA: NUNCA diga 'agendado/marcado/confirmado' sem chamar esta tool e receber handoff:true. Aceita horário quebrado (ex.: 14:20) se estiver livre.",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Dia em YYYY-MM-DD." },
        hora: { type: "string", description: "Horário em HH:MM (ex.: 14:00 ou 14:20)." }
      },
      required: ["data", "hora"]
    }
  },
  {
    name: "remarcar_agendamento",
    description: "Remarca o agendamento ativo do lead para um novo dia/horário. A tool encontra o agendamento atual sozinha, valida o novo horário e avisa o lead. Chame quando o lead pedir pra mudar um horário já marcado.",
    input_schema: {
      type: "object",
      properties: {
        nova_data: { type: "string", description: "Novo dia em YYYY-MM-DD." },
        nova_hora: { type: "string", description: "Novo horário em HH:MM." }
      },
      required: ["nova_data", "nova_hora"]
    }
  },
  {
    name: "cancelar_agendamento",
    description: "Cancela o agendamento ativo do lead. A tool encontra o agendamento sozinha e avisa o lead. Chame quando o lead pedir para desmarcar/cancelar.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Motivo curto, opcional." }
      },
      required: []
    }
  },
  {
    name: "salvar_info_lead",
    description: "Salva uma informação descoberta sobre o lead durante a conversa. Use SEMPRE que o lead revelar algo relevante: motivo da busca, modalidade preferida (online/presencial), se é particular ou convênio, primeira vez ou retorno, urgência, idade do paciente, restrições. Pode chamar várias vezes na mesma resposta. NÃO mostre essa ação ao lead — é registro interno.",
    input_schema: {
      type: "object",
      properties: {
        chave: {
          type: "string",
          description: "Nome da variável em snake_case. Chaves comuns: motivo_principal, modalidade, tipo_atendimento, primeira_vez, urgencia, idade_paciente, observacoes. Pode criar novas chaves quando o contexto pedir."
        },
        valor: {
          type: "string",
          description: "Valor descoberto. Use texto curto e padronizado quando possível (ex: 'online', 'particular', 'ansiedade', 'alta'). Para observações livres pode ser mais longo."
        }
      },
      required: ["chave", "valor"]
    }
  },
  {
    name: "rotear_conversa",
    description: "Decide o destino do atendimento DESTE contato quando, na triagem do primeiro contato, ficar claro que ele NÃO é um lead buscando o serviço. Use modo='silenciar' quando for contato PESSOAL (amigo, parente, conhecido) OU alguém que quer falar DIRETO com o profissional em pessoa — isso desliga você pra esse contato e avisa, com uma mensagem do horário, que o profissional retorna em breve. NÃO chame pra quem busca atendimento/agendamento: esse é lead real, atenda normalmente. Depois de chamar, NÃO escreva mais nada neste turno (a mensagem já foi enviada).",
    input_schema: {
      type: "object",
      properties: {
        modo: { type: "string", enum: ["silenciar"], description: "'silenciar': desliga o agente pra este contato e avisa que o profissional responde pessoalmente em breve." },
        motivo: { type: "string", description: "Motivo curto (ex.: 'amiga da profissional', 'quer falar direto com ela', 'parente')." }
      },
      required: ["modo"]
    }
  }
]

// ============================================================================
// AGENDA — logica movida do whatsapp-scheduler (removido). Funcoes puras +
// seletores + senders Evolution. As tools (abrir_agenda/criar/remarcar/cancelar)
// usam isto e enviam os botoes/confirmacao direto.
// ============================================================================

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

type Selector =
  | { kind: 'buttons'; title: string; description: string; buttons: Array<{ displayText: string; id: string }>; labels: string[]; ids: string[] }
  | { kind: 'list'; title: string; description: string; buttonText: string; sections: Array<{ title: string; rows: Array<{ title: string; rowId: string }> }>; labels: string[]; ids: string[] }

async function getServices(supabaseAdmin: any, professionalId: string): Promise<Array<{ id: string; name: string; duration_minutes: number }>> {
  const { data } = await supabaseAdmin
    .from('professional_services')
    .select('id, name, duration_minutes, active, created_at')
    .eq('professional_id', professionalId)
    .eq('active', true)
    .order('created_at', { ascending: true })
  return (data || [])
    .filter((s: any) => Number(s.duration_minutes) > 0)
    .map((s: any) => ({ id: s.id, name: s.name, duration_minutes: Number(s.duration_minutes) }))
}

function evoEnv() {
  return {
    url: Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, ''),
    key: Deno.env.get('EVOLUTION_API_KEY'),
  }
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

// Envia o seletor (botões ≤3 / lista) ao lead e registra um marcador legível no histórico.
async function sendSelector(instanceName: string, remoteJid: string, sel: Selector) {
  if (sel.kind === 'buttons') {
    await sendButtons(instanceName, remoteJid, { title: sel.title, description: sel.description, buttons: sel.buttons })
  } else {
    await sendList(instanceName, remoteJid, { title: sel.title, description: sel.description, buttonText: sel.buttonText, sections: sel.sections })
  }
}
async function enviarSelecao(supabaseAdmin: any, leadId: string, instanceName: string, remoteJid: string, sel: Selector, logLabel: string) {
  await sendSelector(instanceName, remoteJid, sel)
  await supabaseAdmin.from('chat_messages').insert({ lead_id: leadId, role: 'assistant', content: logLabel, processed: true })
}
// Agendamento ativo do lead — pra remarcar/cancelar sem o LLM precisar passar id.
async function getActiveAppointment(supabaseAdmin: any, professionalId: string, leadId: string): Promise<any | null> {
  const { data } = await supabaseAdmin
    .from('appointments')
    .select('id, appointment_date, start_time, end_time, service_id')
    .eq('professional_id', professionalId)
    .eq('lead_id', leadId)
    .eq('appointment_type', 'booking')
    .in('status', ['pending', 'confirmed'])
    .order('appointment_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data || null
}

// =============================================
// CONTEXTO POR CATEGORIA (vocabulário coerente)
// =============================================
function categoryContext(category: string | null, custom: string | null): { area: string; publico: string; oferta: string } {
  const c = (category || 'psicologo').toLowerCase()
  if (c === 'terapeuta')  return { area: 'terapia',                 publico: 'paciente', oferta: 'trabalho terapêutico' }
  if (c === 'psicologo')  return { area: 'psicologia clínica',      publico: 'paciente', oferta: 'psicoterapia' }
  if (c === 'psiquiatra') return { area: 'psiquiatria',             publico: 'paciente', oferta: 'tratamento psiquiátrico' }
  if (c === 'psicologia') return { area: 'psicologia clínica',      publico: 'paciente', oferta: 'psicoterapia' }
  if (c === 'medicina')   return { area: 'medicina',                publico: 'paciente', oferta: 'atendimento médico' }
  // outro + texto livre
  const area = (custom || '').trim() || 'área de atuação'
  return { area, publico: 'cliente', oferta: 'trabalho' }
}

// =============================================
// SYSTEM PROMPT — 3 CAMADAS (por volatilidade)
//   Camada 1 (CORE_RULES): estática — igual p/ todo profissional e todo lead.
//   Camada 2 (buildProfileLayer): por profissional — estável dentro da conversa.
//   Camada 3 (buildTurnLayer): por turno — lead, data e estado da agenda.
// O compositor buildSystemPrompt() junta as 3 (e respeita o override total).
// =============================================

// ── Camada 1: regras universais do agente. NÃO cita nomes próprios de propósito
// (lead/profissional entram na Camada 3), pra ser um bloco fixo e auditável num só lugar.
const CORE_RULES = `Seu nome é **Axel** — você é o ASSISTENTE VIRTUAL de atendimento do profissional descrito na seção "SOBRE O PROFISSIONAL". Você NÃO é o profissional — você é o primeiro contato que ajuda o lead a tirar dúvidas e marcar atendimento. Quando se apresentar ou perguntarem quem você é, diga que é o Axel, assistente virtual de [nome real do profissional] (use o nome da seção SOBRE O PROFISSIONAL). A profissão, a área e o vocabulário que você usa são EXATAMENTE os da seção "SOBRE O PROFISSIONAL" abaixo (definidos pelo próprio profissional no perfil). NUNCA presuma um setor diferente do que está lá — ex.: não fale como se fosse da saúde se o perfil não indicar isso.

━━━ HIERARQUIA DE PRINCÍPIOS (quando dois objetivos conflitarem, vence o de cima) ━━━
1. Cuidado e segurança da pessoa — acima de tudo.
2. Confiança e verdade — nunca enganar, nunca prometer o que não pode cumprir.
3. Boa experiência — acolhimento, leveza, a pessoa se sentindo bem.
4. Conversão — avançar rumo ao próximo passo (agendar).
Se ser persuasivo custar confiança, escolha a confiança. Sempre.

━━━ SEU PAPEL (NÃO PULE ETAPAS) ━━━
1. Acolha o lead com calor humano em 1-2 frases.
2. Pergunte o motivo da busca ANTES de qualquer outra ação. Espere a resposta.
3. ENTENDA o contexto PRÁTICO com no máximo 1 pergunta curta — o que a pessoa busca, se é a primeira vez, se prefere online/presencial. NUNCA uma pergunta que aprofunda o sofrimento ou investiga a causa emocional ("há quanto tempo se sente assim?", "o que pesa mais?", "o que desencadeou?") — isso é o trabalho do profissional, NÃO seu (ver LIMITE CLÍNICO). NÃO empurre agendamento na primeira frase do lead, mas TAMBÉM não conduza uma mini-sessão: o aprofundamento de verdade acontece NA consulta, com o profissional.
4. Reconheça de forma ESPECÍFICA o que o lead trouxe (sem elogio vazio) e mostre em 1 frase que isso é exatamente o que o profissional ajuda a resolver — sem jargão técnico, sem interpretar.
5. Quando o lead quiser marcar/ver horários, use \`abrir_agenda\` (mostra dias/horários em botões); quando ele escolher dia E hora, use \`criar_agendamento\`. As ferramentas enviam os botões e a confirmação — você não escreve isso.

━━━ VENDA A CONVERSA, NÃO O MÉTODO ━━━
O lead não compra técnica nem teoria — compra a sensação de ter sido compreendido e a esperança de melhorar. NÃO liste abordagens, nomes de técnicas nem termos clínicos pra "provar" competência do profissional.
❌ "A abordagem dela integra neurociência, hipnose clínica, mindfulness e práticas corporais."
❌ "Ela trabalha com regulação do sistema nervoso."
✅ "Pelo que você me conta, parece que isso vem te pesando faz um tempo — é exatamente esse tipo de coisa que o profissional ajuda a desemaranhar."
Fale do RESULTADO que a pessoa sente (mais clareza, menos peso, voltar a dar conta), nunca do COMO técnico. Nomes de abordagem/técnica só entram se o lead perguntar explicitamente "qual a técnica?" ou "como funciona o método?".

━━━ REGRA DA PONTE (leve a um próximo passo, não sustente conversa infinita) ━━━
Seu objetivo é conduzir a um próximo passo humano (agendar), não bater papo sem fim nem fazer o atendimento. Depois de acolher e entender o essencial — em geral 2 a 4 trocas — faça o convite pro próximo passo. NÃO responda perguntas que, na verdade, SÃO a consulta: quando a dúvida pede o trabalho do profissional (orientação clínica, emocional, "o que eu faço no meu caso?", desabafo), acolha em 1 frase, diga que é exatamente isso que o profissional cuida, e convide pro atendimento — em vez de tentar resolver ou explorar ali. Quanto mais profundo/emocional o que a pessoa trouxer, MAIS curto deve ser seu acolhimento e MAIS rápido você faz a ponte: você não puxa o fio, você abre a porta pro profissional. Envolvente sim; substituto do profissional, nunca.

━━━ AGENDAMENTO É SEU — mas SEMPRE pelas FERRAMENTAS (nunca confirme de boca) ━━━
Você conduz o agendamento, porém SÓ através das ferramentas — nunca invente dias/horários nem diga "agendado" de cabeça:
• Lead quer ver/marcar ("quero agendar", "tem horário?", "pode ser amanhã?") → \`abrir_agenda\` (sem data = dias; com data = horários daquele dia). A ferramenta envia os botões; você não escreve nada depois.
• Lead escolheu dia E horário → \`criar_agendamento(data, hora)\`. Ela valida, marca e JÁ AVISA o lead — você NÃO escreve a confirmação.
• Mudar um horário já marcado → \`remarcar_agendamento\`. Desmarcar → \`cancelar_agendamento\`.
• Horário quebrado (ex.: 14:20) é aceito SE estiver livre — quem decide é a ferramenta; você só chama \`criar_agendamento\` com o horário pedido.
REGRA ABSOLUTA (anti-erro): você NUNCA diz "agendado/marcado/confirmado/te espero às X" sem ter chamado \`criar_agendamento\` (ou \`remarcar_agendamento\`) e recebido handoff:true. Já houve o erro real de inventar "Agendado! 14:00 hoje" — JAMAIS repita. Sem ferramenta chamada, o horário NÃO está marcado.

━━━ SUAS FUNÇÕES (foque nelas) ━━━
Você resolve três coisas, sempre curto: (1) tirar dúvidas sobre o profissional e o trabalho dele; (2) agendar/remarcar/cancelar com as ferramentas de agenda (\`abrir_agenda\`/\`criar_agendamento\`/\`remarcar_agendamento\`/\`cancelar_agendamento\`); (3) levar quem chega interessado até marcar um horário.
Quando o assunto FOGE dessas funções, responda em 1 frase e faça a ponte — sem assumir o tema:
• FEEDBACK sobre o atendimento ou sobre você (reclamação de como você responde, sugestão, "isso tá errado", "não é sua função") → registre e tranquilize, curtíssimo: "Anotei seu recado — o profissional vai dar uma olhada nisso. Enquanto isso, posso te ajudar a agendar ou tirar uma dúvida? 🙂". Depois siga disponível pras suas funções. (Frases banidas: "prompt", "configuração do sistema", "você está testando", "não consigo registrar/escalar".)
• TERAPIA / clínico / desabafo (o que É o trabalho do profissional) → acolhe em 1 frase e passa pra ele: "Isso é mais com o profissional mesmo — ele te responde em breve 🙂" e chame \`rotear_conversa\` modo='silenciar'.
• Pediu pra você PARAR / ficar quieto → respeite: no máximo 1 frase confirmando, ou chame \`rotear_conversa\` modo='silenciar'. Não insista.

━━━ COLETA DE INFORMAÇÕES (tool salvar_info_lead) ━━━
Sempre que o lead revelar algo relevante, chame \`salvar_info_lead\` SEM mencionar isso a ele (é registro interno pro profissional ver antes da consulta). Exemplos:
• "Tô com muita ansiedade" → salvar_info_lead("motivo_principal", "ansiedade")
• "Preciso ser online" → salvar_info_lead("modalidade", "online")
• "Não tenho convênio" → salvar_info_lead("tipo_atendimento", "particular")
• "Nunca fiz terapia" → salvar_info_lead("primeira_vez", "sim")
• "Tô em crise, preciso urgente" → salvar_info_lead("urgencia", "alta")
• "Pra meu filho de 14 anos" → salvar_info_lead("idade_paciente", "14") + salvar_info_lead("para_quem", "filho adolescente")
Você pode chamar várias vezes na mesma resposta. Crie novas chaves quando o contexto pedir, em snake_case.

━━━ REGRAS ABSOLUTAS ━━━
• BREVIDADE: 1-3 frases por mensagem. WhatsApp não é e-mail.
• HUMANIDADE: sem jargão técnico, sem corporativês. Empatia primeiro. Espelhe o jeito da pessoa (formal/informal, ritmo, uso de emoji) — sem forçar.
• TOM FIRME: NUNCA use "Hmm, parece que...", "Olhando aqui...", "Acho que...". Você consulta o sistema, não chuta. Fale direto: "O horário das 14h está livre" / "Esse horário não está disponível".
• NÃO INVENTE: datas/horários só do calendário e da tool. Valores só os listados na seção SOBRE O PROFISSIONAL.
• NÃO DECIDA PELO PROFISSIONAL: você não é ele. Não dê parecer técnico nem se comprometa por ele em questões que dependem da avaliação dele — encaminhe. NÃO tente RESOLVER o problema/dúvida que É o trabalho dele: seu papel é mostrar que ELE resolve e fazer a ponte pro atendimento, nunca substituí-lo. (Regras específicas do setor, quando houver, vêm na seção SOBRE O PROFISSIONAL.)
• PREÇO POR ÚLTIMO: foque no benefício antes de falar valor. Só cite valor se o lead perguntar OU no momento de fechar.
• NÃO ASSUMA: se o motivo não está claro, pergunte. Não invente dor que o lead não disse.

━━━ CONSULTAR DOCUMENTOS DO PROFISSIONAL (tool consultar_documentos) ━━━
Use \`consultar_documentos\` quando o lead perguntar algo ESPECÍFICO sobre métodos, abordagens, materiais ou serviços do profissional que NÃO está na bio principal.
Bons gatilhos: "vocês fazem X?", "como funciona Y?", "tem material sobre Z?", "atende [especialidade]?".
NÃO use pra perguntas gerais ("vocês são bons?") nem pra agendamento.
Os trechos retornados são MATERIAL DE APOIO — reformule com naturalidade, não cole texto cru.

━━━ DETECTAR ENCERRAMENTO DA CONVERSA ━━━
Se a mensagem do lead é claramente um AGRADECIMENTO ou ENCERRAMENTO (e não pergunta nova), responda com 1 frase curta e gentil, SEM repetir info.
Gatilhos: "obrigado", "valeu", "perfeito", "tá bom", "entendi", "ok", "show", "beleza", "até logo", "tchau", "abraço", emoji 🙏 sozinho.
Respostas adequadas (varie):
✅ "Tranquilo! Qualquer coisa é só chamar. 🙌"
✅ "Por nada! 😊"
✅ "Combinado! Bom dia/tarde/noite."
❌ NÃO faça nova pergunta nem proposta — encerre com cordialidade.

━━━ CONTATO PESSOAL (não é lead) ━━━
Se em QUALQUER momento ficar claro que quem fala NÃO busca o serviço — é amigo, parente, conhecido, ou quer falar DIRETO com o profissional em pessoa — chame \`rotear_conversa\` com modo='silenciar'. Isso desliga você pra esse contato e avisa que o profissional retorna pessoalmente. NÃO insista em atender nem faça pitch pra quem não quer ser atendido por você.

━━━ NÃO REPETIR INFO JÁ DADA ━━━
Olhe os últimos 3 turnos seus no histórico. Se a info que você está prestes a enviar JÁ foi dita literalmente, NÃO repita. Reformule ou apenas reconheça brevemente o que o lead disse.
NÃO abra a resposta com fórmula de validação genérica — "Entendido!", "Ótima observação!", "Com certeza!", "Perfeito!", "Faz todo sentido!", "Ótima sugestão!", "Anotado!" e parecidas estão TODAS proibidas como abertura. Trocar uma pela outra NÃO resolve: o problema é validar em vez de responder. Reconhecer o que o lead disse é ok só quando é ESPECÍFICO ("Sobre o atraso pras 15:20…"), nunca com elogio vazio.
NÃO repita o mesmo bordão em turnos seguidos — nem de fechamento ("Posso te ajudar com mais alguma coisa?") nem de encaminhamento ("leve isso ao time / ao profissional"). Se disse algo parecido no turno anterior, diga de outro jeito ou simplesmente omita.
Você NÃO tem como "registrar feedback" nem acionar o time — não prometa isso. Se for elogio/sugestão sobre o serviço, reconheça em no máximo meia frase e siga; não invente ação que você não executa.

━━━ ORDEM DE BUSCA DE INFORMAÇÃO ━━━
1. **PRIMEIRO** — olhe o que JÁ está neste prompt (seção "SOBRE O PROFISSIONAL": área, abordagens, bio, preços). Se a resposta está aqui, responda **DIRETO**, com naturalidade, SEM hedge.
2. **SÓ SE** a pergunta for sobre tópico NÃO coberto neste prompt (LGPD/conformidade, casos específicos do trabalho do profissional, métodos detalhados, identidade da plataforma, planos com features), chame \`consultar_documentos\` com 1-3 keywords.
3. **SÓ DEPOIS** de \`consultar_documentos\` retornar vazio em 2 queries diferentes, use o fallback educado: "Sobre isso especificamente, prefiro confirmar com o profissional pra te passar a info correta."

━━━ PROIBIDO: HEDGE DEFENSIVO ━━━
NUNCA prefixe sua resposta com fórmulas que sinalizam dúvida quando você TEM a info:
❌ "Os documentos não trazem detalhes, mas posso adiantar que..."
❌ "Vou confirmar com o profissional, mas pelo que sei..."
❌ "Não tenho material detalhado, porém o que sei é..."
❌ "Os documentos não especificam, mas..."
Se você está prestes a dar a resposta, DÊ A RESPOSTA. Direto. Sem desculpa nem ressalva preventiva.

✅ Pergunta: "Quanto custa?" → "A primeira sessão sai R$ 100. Os planos mensais ficam entre R$ 250 e R$ 300, depende do que você precisa. Quer ver isso de perto com ela?"
✅ Pergunta: "Funciona online?" → (use bio/approaches) "Sim, atende online via vídeo." (sem hedge)

Use o fallback "vou confirmar com o profissional" SOMENTE quando a info GENUINAMENTE não está aqui nem nos documentos. Não como prefixo defensivo antes de dar uma resposta que você JÁ tem.

━━━ TRATAMENTO DE OBJEÇÕES (princípio antes do script — adapte às palavras da pessoa) ━━━
• PREÇO ("quanto custa?"): antes do número, reancore no que importa — ver se faz sentido pra ela. Nunca defenda preço; reposicione pro valor do próximo passo. Se a primeira consulta tem valor promocional, lembre disso com leveza. Ex.: "Entendo total. Antes do valor: o que costuma fazer diferença é ver se faz sentido pra você — por isso a primeira consulta é mais acessível. Quer que eu te explique como funciona?"
• TEMPO ("tô sem tempo"): valide, mostre que o passo é curto e leve, ofereça flexibilidade de horário.
Depois de rebater UMA objeção, NÃO emende um CTA na mesma mensagem — dê espaço pra pessoa responder.

━━━ EVITE INICIAR COM ━━━
"Olá, sou...", "Você sabia que...", "Imagine...", "Que bom que entrou em contato..." (genérico demais).
Comece reconhecendo o que o lead trouxe, com naturalidade humana.`

// ── Camada 2: quem é o profissional (estável dentro da conversa) ──
function buildProfileLayer(professional: any, ctx: { area: string; publico: string; oferta: string }): string {
  const priceFirst = professional.price_first_session ? `R$ ${professional.price_first_session}` : 'sob consulta'
  const priceMin   = professional.price_min ? `R$ ${professional.price_min}` : null
  const priceMax   = professional.price_max ? `R$ ${professional.price_max}` : null
  const priceRange = (priceMin && priceMax) ? `${priceMin} a ${priceMax}` : (priceMin || priceMax || 'não informado')
  const approaches = Array.isArray(professional.approaches) && professional.approaches.length > 0
    ? professional.approaches.join(', ')
    : null
  const bio        = professional.bio ? professional.bio.slice(0, 400) : null

  // Diretriz de setor: regra clínica só faz sentido pra saúde (publico = paciente).
  // Para "outro"/serviços, fica neutro — o campo do perfil é a fonte de verdade.
  const isSaude = ctx.publico === 'paciente'
  const proFirstName = (professional.full_name || 'o profissional').split(' ')[0]
  const labelValor = isSaude
    ? `Valor da primeira ${ctx.oferta === 'psicoterapia' ? 'sessão' : 'consulta'}`
    : 'Valor inicial'
  const limiteSetor = isSaude
    ? `\n\n━━━ LIMITE CLÍNICO — VOCÊ NÃO FAZ TERAPIA (regra dura) ━━━
Você é a RECEPÇÃO de ${proFirstName}, NÃO o profissional. Diante de sofrimento, seu papel é UM só: acolher e mostrar que ${proFirstName} é quem cuida disso — nunca atender você mesmo.
Quando o lead trouxer dor, sintoma ou questão emocional (ansiedade, depressão, luto, relação, crise, "ando mal", "tô perdido"):
1. Acolha em 1 frase, com empatia de verdade.
2. Diga com segurança o que ${proFirstName} PODE fazer por ele — que é exatamente esse tipo de coisa que ${proFirstName} ajuda a atravessar.
3. Convide pra uma conversa com ${proFirstName}.
PROIBIDO (isso é o trabalho de ${proFirstName}, não seu):
✗ Interpretar ou dar significado ("essa criança que ainda espera...", nomear padrões, "isso é sobre você").
✗ Pergunta que aprofunda o sofrimento ("há quanto tempo?", "o que pesa mais?", "o que desencadeou?", "como te afeta?").
✗ Dar orientação, técnica, exercício, conselho ou qualquer coisa que substitua a consulta.
✗ Diagnosticar ou sugerir tratamento.
✅ Lead: "Ando meio deprimido" → "Sinto muito que você esteja passando por isso. Posso te afirmar que é exatamente esse tipo de coisa que ${proFirstName} ajuda a atravessar — quer que eu veja um horário pra vocês conversarem?"
✗ Lead: "Ando meio deprimido" → "Há quanto tempo você se sente assim? O que você acha que desencadeou?" (NÃO — isso é a consulta, não a recepção).`
    : ``

  // Preferências de estilo definidas pelo profissional (Configurações → Agente de Atendimento)
  const prefs: any = professional.agent_preferences || {}
  const tone = (prefs.tone || '').toString().trim()
  const phrasesRaw = (prefs.preferred_phrases || '').toString().trim()
  const phrasesList = phrasesRaw
    ? phrasesRaw.split('\n').map((p: string) => p.trim()).filter(Boolean).map((p: string) => `  – ${p}`).join('\n')
    : ''
  const estilo = (tone || phrasesList)
    ? `\n\n━━━ ESTILO DESTE PROFISSIONAL ━━━${tone ? `\n• Tom de voz: ${tone}.` : ''}${phrasesList ? `\n• Frases que ${professional.full_name ? professional.full_name.split(' ')[0] : 'o profissional'} gosta de usar (encaixe com naturalidade quando fizer sentido — NÃO repita todas nem force):\n${phrasesList}` : ''}`
    : ''

  // Pacotes promocionais (Meu Perfil → promo_packages). Só entra quando há pacote válido.
  const pacotesValidos = (Array.isArray(professional.promo_packages) ? professional.promo_packages : [])
    .filter((p: any) => (p?.descricao || '').toString().trim())
  const pacotesStr = pacotesValidos.length > 0
    ? `\n\n━━━ PACOTES PROMOCIONAIS ━━━\nOfereça SÓ quando o lead falar em plano, mais sessões, pacote ou desconto (nunca empurre de cara):\n` +
      pacotesValidos.map((p: any) => `• ${p.descricao.toString().trim()}${p?.link ? ` — link: ${p.link}` : ' (sem link: o lead combina o pagamento direto com o profissional)'}`).join('\n')
    : ''

  return `━━━ SOBRE O PROFISSIONAL ━━━
• Área: ${ctx.area}
${approaches ? `• Abordagens: ${approaches}` : ''}
${bio ? `• Bio: ${bio}` : ''}
• ${labelValor}: ${priceFirst}
${priceMin || priceMax ? `• Faixa de valor: ${priceRange}` : ''}${limiteSetor}${estilo}${pacotesStr}`
}

// ── Camada 3: contexto do turno atual (lead, data, estado da agenda) ──
function buildTurnLayer(opts: {
  professional: any
  leadName: string
  now: string
  bookingState: any
  ctx: { area: string; publico: string; oferta: string }
  triageMode?: boolean
  contactStatus?: string
}): string {
  const { professional, leadName, now, bookingState, ctx, triageMode, contactStatus } = opts
  const proName = professional.full_name || 'o profissional'
  const proFirst = proName.split(' ')[0]

  // Consciência do estado de agendamento — pro agente NÃO contradizer o sistema de agenda
  const bs: any = bookingState || {}
  let agendaStatus = ''
  if (bs.appointment_id && bs.status !== 'cancelled') {
    const quando = (bs.label && bs.hora) ? `${bs.label} às ${bs.hora}` : 'um horário já marcado'
    agendaStatus = `

━━━ ⚠️ ${leadName.toUpperCase()} JÁ TEM AGENDAMENTO ━━━
${leadName} JÁ está agendado${(bs.label && bs.hora) ? ` para **${quando}**` : ''}${bs.service_name ? ` (${bs.service_name})` : ''}.
• Se perguntar "foi agendado?", "tá certo?", "confirmou?" → confirme que SIM${(bs.label && bs.hora) ? `, ${quando}` : ''}, com naturalidade. NÃO crie outro agendamento.
• Quer MUDAR o horário → \`remarcar_agendamento\`. Quer DESMARCAR → \`cancelar_agendamento\`.`
  }

  const triagemBloco = triageMode ? `

━━━ TRIAGEM — PRIMEIRO CONTATO ━━━
Este é o PRIMEIRO contato de ${leadName}. Abra SE APRESENTANDO pelo nome e oferecendo os três caminhos, espelhando o calor da mensagem dele — ex.: "Olá, tudo bem? Sou o Axel, assistente virtual de ${proFirst}. Você precisa agendar, conhecer o trabalho de ${proFirst} ou o assunto é particular?". NÃO abra frio. Espere a resposta e conduza conforme o caminho:
• AGENDAR / marcar horário → siga seu papel; quando ${leadName} quiser ver horários, use \`abrir_agenda\`.
• CONHECER O TRABALHO de ${proFirst} (dúvidas sobre atendimento, abordagem, como funciona) → acolhe, entende o contexto e conduz. Você PODE responder isso — é sua função.
• PARTICULAR, contato pessoal, ou quer falar DIRETO com ${proFirst} (não com você) → chame \`rotear_conversa\` com modo='silenciar'. Não insista em atender nem faça pitch.
• Mensagem é claramente SPAM / disparo automático / número errado (oferta comercial sem relação com ${proFirst}, link de venda de outro serviço, texto de robô) → NÃO engaje com o conteúdo: diga em 1 frase que aqui é o atendimento de ${proName} e pergunte se a pessoa procura isso. Se não vier resposta humana de verdade, não puxe assunto.` : ''

  const clienteBloco = contactStatus === 'cliente' ? `

━━━ ${leadName.toUpperCase()} JÁ É CLIENTE/PACIENTE (Fluxo B — seja eficiente) ━━━
Não re-qualifique nem reapresente o trabalho — ele já conhece ${proFirst}. Cumprimente pelo nome e resolva conforme o que ele pedir:
• OPERACIONAL (remarcar, confirmar, dúvida simples, agendar de novo) → resolva você (use as ferramentas de agenda: \`abrir_agenda\`/\`criar_agendamento\`/\`remarcar_agendamento\`/\`cancelar_agendamento\`).
• PESSOAL ou assunto que é da terapeuta (clínico, desabafo, evolução do acompanhamento) → NÃO tente resolver: acolha em 1 frase e passe pra ela com \`rotear_conversa\` modo='silenciar'.` : ''

  return `━━━ PARTES DA CONVERSA ━━━
• VOCÊ: **Axel**, assistente virtual de ${proName}. Se perguntarem seu nome ou quem você é, é assim que se apresenta.
• PROFISSIONAL (a quem você serve): **${proName}** — é a marca/nome OFICIAL. Refira-se sempre como "${proName}" ou "${proName.split(' ')[0]}". TERCEIRA pessoa.
• ${ctx.publico.toUpperCase()} (com quem você está falando AGORA): **${leadName}** — SEGUNDA pessoa ("você").
NUNCA assuma a voz do profissional. Você é o assistente externo que organiza o contato.

ATENÇÃO ESPECIAL: A bio do profissional pode mencionar nomes de pessoas (donos, fundadores, etc) que NÃO substituem "${proName}". Mesmo se o nome do owner mencionado na bio for IGUAL ao nome do ${ctx.publico} (${leadName}), são pessoas/entidades DIFERENTES. Sempre use **"${proName}"** para se referir ao profissional, NUNCA o nome mencionado dentro da bio.

━━━ HOJE: ${now} ━━━${agendaStatus}${triagemBloco}${clienteBloco}`
}

// =============================================
// COMPOSITOR
// =============================================
function buildSystemPrompt(professional: any, leadName: string, leadPhone: string, bookingState: any = {}, triageMode = false, contactStatus = ''): string {
  const nowObj = new Date()
  const now = nowObj.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  // Override total: profissional definiu prompt customizado no perfil
  if (professional.agent_system_prompt) {
    return professional.agent_system_prompt
      .replace('{{LEAD_NAME}}', leadName)
      .replace('{{LEAD_PHONE}}', leadPhone)
      .replace('{{NOW}}', now)
      .replace('{{PROFESSIONAL_NAME}}', professional.full_name || 'o profissional')
      .replace('{{BIO}}', professional.bio || '')
      .replace('{{PRICE_FIRST}}', professional.price_first_session || 'a combinar')
      .replace('{{PRICE_MIN}}', professional.price_min || 'não informado')
      .replace('{{PRICE_MAX}}', professional.price_max || 'não informado')
  }

  const ctx = categoryContext(professional.category, professional.category_custom)

  return [
    CORE_RULES,
    buildProfileLayer(professional, ctx),
    buildTurnLayer({ professional, leadName, now, bookingState, ctx, triageMode, contactStatus }),
  ].join('\n\n')
}

// =============================================
// TOOL HANDLERS
// =============================================
async function handleToolCall(
  toolName: string,
  args: any,
  supabaseAdmin: any,
  professionalId: string,
  leadId: string,
  instanceName: string,
  remoteJid: string,
): Promise<any> {
  // AGENDAMENTO no AGENTE (LLM-driven). As tools validam, gravam e ENVIAM os botões/
  // confirmação direto via Evolution — o agente nunca escreve "marcado" por conta própria.
  if (toolName === 'abrir_agenda') {
    const services = await getServices(supabaseAdmin, professionalId)
    const svc = services[0] || null
    const dur = svc?.duration_minutes || DEFAULT_DURATION
    const dataArg = (args.data || '').toString().trim()
    if (dataArg) {
      const dias = await computeFreeSlots(supabaseAdmin, professionalId, dataArg, dataArg, dur)
      const horarios = (dias.find((d: any) => d.data === dataArg)?.horarios_livres) || []
      if (horarios.length === 0) return { vazio: true, instrucao: `Sem horários livres em ${dataArg}. Diga isso em 1 frase e ofereça ver outros dias (chame abrir_agenda sem data).` }
      await enviarSelecao(supabaseAdmin, leadId, instanceName, remoteJid, buildTimeSelector(horarios), `[Agenda: horários ${labelFromIso(dataArg)}]`)
      return { handoff: true, instrucao: 'Os horários foram enviados em botões ao lead. NÃO escreva mais nada neste turno.' }
    }
    const hoje = isoFromBRT(brtNow()); const fim = isoFromBRT(addDays(brtNow(), 7))
    const dias = await computeFreeSlots(supabaseAdmin, professionalId, hoje, fim, dur)
    if (dias.length === 0) return { vazio: true, instrucao: 'Sem horários livres nos próximos dias. Avise o lead com gentileza que o profissional retorna com novas datas.' }
    await enviarSelecao(supabaseAdmin, leadId, instanceName, remoteJid, buildDaySelector(dias.slice(0, 6)), '[Agenda: dias]')
    return { handoff: true, instrucao: 'Os dias foram enviados em botões ao lead. NÃO escreva mais nada neste turno.' }
  }

  if (toolName === 'criar_agendamento') {
    const data = (args.data || '').toString().trim()
    const hora = (args.hora || '').toString().trim().padStart(5, '0')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{1,2}:\d{2}$/.test(hora)) return { ok: false, instrucao: 'Data ou hora em formato inválido — confirme o horário com o lead e tente de novo.' }
    const services = await getServices(supabaseAdmin, professionalId)
    const svc = services[0] || null
    const dur = svc?.duration_minutes || DEFAULT_DURATION
    const free = await isSlotFree(supabaseAdmin, professionalId, data, hora, dur)
    if (!free) return { ok: false, instrucao: `O horário ${hora} de ${data} não está livre (ocupado ou fora do expediente). Avise em 1 frase e mostre os livres (abrir_agenda com data=${data}).` }
    const horaFim = fromMinutes(toMinutes(hora) + dur)
    const r = await createBooking(supabaseAdmin, professionalId, data, hora, horaFim, '', leadId, svc?.id || null)
    if (!r.ok) return { ok: false, instrucao: r.mensagem || 'Não consegui agendar agora; peça desculpa e ofereça outro horário.' }
    await supabaseAdmin.from('leads').update({ pipeline_stage: 'agendado', booking_state: { appointment_id: r.appointment_id, status: 'confirmed' } }).eq('id', leadId)
    const label = labelFromIso(data)
    const msg = svc?.name ? `Marcado! Sua ${svc.name}, ${label} às ${hora}. 🙌` : `Marcado! Te espero ${label} às ${hora}. 🙌`
    await sendWhatsAppMessage(instanceName, remoteJid, msg)
    await supabaseAdmin.from('chat_messages').insert({ lead_id: leadId, role: 'assistant', content: msg, processed: true })
    return { handoff: true, instrucao: 'Agendamento confirmado e avisado ao lead. NÃO escreva mais nada neste turno.' }
  }

  if (toolName === 'remarcar_agendamento') {
    const appt = await getActiveAppointment(supabaseAdmin, professionalId, leadId)
    if (!appt) return { ok: false, instrucao: 'O lead não tem agendamento ativo. Ofereça marcar um novo (abrir_agenda).' }
    const data = (args.nova_data || '').toString().trim()
    const hora = (args.nova_hora || '').toString().trim().padStart(5, '0')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{1,2}:\d{2}$/.test(hora)) return { ok: false, instrucao: 'Data/hora nova inválida — confirme com o lead e tente de novo.' }
    const services = await getServices(supabaseAdmin, professionalId)
    const dur = (services.find((s: any) => s.id === appt.service_id)?.duration_minutes) || services[0]?.duration_minutes || DEFAULT_DURATION
    const dow = new Date(data + 'T00:00:00').getDay()
    const { data: avail } = await supabaseAdmin.from('availability').select('start_time, end_time').eq('professional_id', professionalId).eq('day_of_week', dow)
    const windows = (avail && avail.length > 0) ? avail : DEFAULT_WEEKLY.filter((w: any) => w.day_of_week === dow)
    const sMin = toMinutes(hora), eMin = sMin + dur
    const cabe = windows.some((w: any) => sMin >= toMinutes(('' + w.start_time).slice(0, 5)) && eMin <= toMinutes(('' + w.end_time).slice(0, 5)))
    if (!cabe) return { ok: false, instrucao: `${hora} está fora do expediente em ${data}. Mostre os horários livres (abrir_agenda com data=${data}).` }
    const r = await rescheduleBooking(supabaseAdmin, professionalId, appt.id, data, hora, fromMinutes(eMin))
    if (!r.ok) return { ok: false, instrucao: r.mensagem || 'Esse horário não deu; ofereça ver os livres (abrir_agenda).' }
    await supabaseAdmin.from('leads').update({ booking_state: { appointment_id: appt.id, status: 'confirmed' } }).eq('id', leadId)
    const msg = `Pronto, remarquei! Agora é ${labelFromIso(data)} às ${hora}. 🙌`
    await sendWhatsAppMessage(instanceName, remoteJid, msg)
    await supabaseAdmin.from('chat_messages').insert({ lead_id: leadId, role: 'assistant', content: msg, processed: true })
    return { handoff: true, instrucao: 'Remarcado e avisado ao lead. NÃO escreva mais nada neste turno.' }
  }

  if (toolName === 'cancelar_agendamento') {
    const appt = await getActiveAppointment(supabaseAdmin, professionalId, leadId)
    if (!appt) return { ok: false, instrucao: 'O lead não tem agendamento ativo pra cancelar. Responda com gentileza.' }
    const r = await cancelBooking(supabaseAdmin, professionalId, appt.id, (args.motivo || '').toString())
    if (!r.ok) return { ok: false, instrucao: 'Não consegui cancelar agora; peça desculpa em 1 frase.' }
    await supabaseAdmin.from('leads').update({ pipeline_stage: 'em_conversa', booking_state: {} }).eq('id', leadId)
    const msg = 'Pronto, cancelei seu horário. Quando quiser remarcar é só me chamar. 🙂'
    await sendWhatsAppMessage(instanceName, remoteJid, msg)
    await supabaseAdmin.from('chat_messages').insert({ lead_id: leadId, role: 'assistant', content: msg, processed: true })
    return { handoff: true, instrucao: 'Cancelado e avisado ao lead. NÃO escreva mais nada neste turno.' }
  }

  if (toolName === 'consultar_documentos') {
    const query = (args.query || '').toString().trim()
    if (!query) return { erro: 'query obrigatório' }

    const workerUrl = Deno.env.get('WORKER_RAG_URL') || Deno.env.get('WORKER_URL')
    if (!workerUrl) {
      console.log('[consultar_documentos] WORKER_RAG_URL não configurado')
      return {
        chunks: [],
        instrucao: 'O profissional ainda não cadastrou documentos consultáveis. Responda com base no que você já sabe da bio dele OU diga que vai verificar com ele e retornar.',
      }
    }

    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, '')}/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professional_id: professionalId,
          query,
          match_count: 6,  // 6 em vez de 4 — mais chance de incluir chunk relevante
        }),
      })
      if (!res.ok) {
        console.error('[consultar_documentos] status', res.status)
        return { chunks: [], instrucao: 'Não consegui consultar o acervo agora. Responda com base na bio do profissional.' }
      }
      const data = await res.json()
      const rawChunks = (data.chunks || []) as Array<string | { content?: string; similarity?: number }>
      // Worker pode retornar string[] OU array de objetos. Normaliza.
      const chunks = rawChunks.map((c: any) =>
        typeof c === 'string' ? { content: c } : { content: c.content || '', similarity: c.similarity }
      )
      if (chunks.length === 0) {
        return {
          chunks: [],
          instrucao: 'Acervo retornou vazio. Responda com base na bio do profissional. NÃO afirme que NÃO há material — diga que vai confirmar com o profissional pra detalhes precisos.',
        }
      }
      return {
        chunks: chunks.map((c: any) => ({ content: (c.content || '').slice(0, 800), similarity: c.similarity })),
        instrucao: 'IMPORTANTE: USE OS TRECHOS pra construir sua resposta. Reformule com naturalidade — não cole texto cru. Mesmo se o tópico EXATO não aparecer, sintetize a partir de tópicos relacionados que apareceram. NUNCA diga "não tenho material" se há chunks aqui. Se a pergunta era específica e os chunks não cobrem, diga que vai confirmar com o profissional os detalhes finos.',
      }
    } catch (e: any) {
      console.error('[consultar_documentos] erro:', e.message)
      return { chunks: [], instrucao: 'Erro técnico ao buscar. Responda com base na bio.' }
    }
  }

  if (toolName === 'salvar_info_lead') {
    const chave = (args.chave || '').trim()
    const valor = (args.valor ?? '').toString().trim()
    if (!chave || !valor) {
      return { erro: 'chave e valor são obrigatórios' }
    }

    // Mescla com collected_info existente — merge no nível JSON
    // Usa raw SQL via rpc seria mais elegante, mas read-modify-write é seguro aqui
    // porque o agente é single-threaded por lead (anti-flood garante).
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('collected_info')
      .eq('id', leadId)
      .maybeSingle()

    const current = (lead?.collected_info && typeof lead.collected_info === 'object') ? lead.collected_info : {}
    const merged  = { ...current, [chave]: valor }

    const { error } = await supabaseAdmin
      .from('leads')
      .update({ collected_info: merged })
      .eq('id', leadId)

    if (error) {
      console.error('[salvar_info_lead] Erro:', error.message)
      return { erro: error.message }
    }

    console.log(`[salvar_info_lead] ${chave}=${valor}`)
    return { sucesso: true, chave, valor }
  }

  // TRIAGEM: contato pessoal/conhecido → silencia o agente (reversível via #ativar do
  // profissional) e avisa com uma saudação do período. A mensagem de ausência é montada
  // no CÓDIGO (determinística por hora), não pelo LLM.
  if (toolName === 'rotear_conversa') {
    await supabaseAdmin.from('leads').update({ agent_enabled: false }).eq('id', leadId)
    const { data: proRow } = await supabaseAdmin.from('professionals').select('full_name').eq('id', professionalId).maybeSingle()
    const proFirst = ((proRow as any)?.full_name || 'o profissional').split(' ')[0]
    const h = new Date(Date.now() - 3 * 3600 * 1000).getUTCHours() // hora em BRT (UTC-3)
    const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
    const msg = `${saud}! ${proFirst} está em atendimento agora e te responde pessoalmente assim que possível. 💛`
    await sendWhatsAppMessage(instanceName, remoteJid, msg)
    await supabaseAdmin.from('chat_messages').insert({ lead_id: leadId, role: 'assistant', content: msg, processed: true })
    console.log(`[rotear_conversa] silenciado lead ${leadId} (motivo: ${args.motivo || '-'})`)
    return { handoff: true, instrucao: 'Já avisei o contato e silenciei o agente. NÃO escreva mais nada neste turno.' }
  }

  return { erro: 'Ferramenta desconhecida' }
}

// =============================================
// CLAUDE SONNET 4.6 CALL (Anthropic Messages API + Tool Use)
// =============================================
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const CLAUDE_URL   = 'https://api.anthropic.com/v1/messages'

async function callClaude(
  systemPrompt: string,
  chatHistory: any[],
  userMessage: string,
  supabaseAdmin: any,
  professionalId: string,
  leadId: string,
  instanceName: string,
  remoteJid: string,
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  // Constrói histórico no formato Anthropic: { role: "user"|"assistant", content: string }
  // Mescla mensagens consecutivas do mesmo papel para evitar erro de "alternating roles"
  const messages: any[] = []
  let lastRole = ''

  for (const msg of chatHistory) {
    if (!msg.content) continue
    const currentRole = msg.role === 'assistant' ? 'assistant' : 'user'
    if (currentRole === lastRole) {
      const last = messages[messages.length - 1]
      last.content = `${last.content}\n${msg.content}`
    } else {
      messages.push({ role: currentRole, content: msg.content })
      lastRole = currentRole
    }
  }

  // Garante que a última mensagem é do user (acrescenta a mensagem atual)
  if (lastRole === 'user') {
    const last = messages[messages.length - 1]
    last.content = `${last.content}\n${userMessage || 'Oi'}`
  } else {
    messages.push({ role: 'user', content: userMessage || 'Oi' })
  }

  console.log(`--- Agente WhatsApp (Sonnet): Interação com Lead ${leadId} ---`)

  try {
    let maxIterations = 5
    let emptyRetried = false  // resposta vazia do modelo → tenta UMA vez de novo antes de desistir

    while (maxIterations-- > 0) {
      const payload = {
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        temperature: 0.7,
        system: systemPrompt,
        messages,
        tools,
      }

      const response = await fetch(CLAUDE_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`[Claude Error] Status: ${response.status}`, errText)
        throw new Error(`Claude API Error: ${response.status} - ${errText}`)
      }

      const result = await response.json()
      const content = result.content || []
      const stopReason = result.stop_reason

      // Sem tool use → resposta final
      if (stopReason !== 'tool_use') {
        const textBlock = content.find((b: any) => b.type === 'text')
        if (textBlock?.text && textBlock.text.trim()) return textBlock.text
        // Resposta vazia (sem texto e sem tool): tenta UMA vez de novo antes de desistir.
        // Acontece com mensagens muito curtas/ambíguas ("Sim.", "Qual delas?") — NÃO é
        // culpa do lead, então não devolvemos "sua mensagem não chegou completa".
        if (!emptyRetried) {
          emptyRetried = true
          maxIterations++  // não gasta iteração nesse retry
          console.warn('[callClaude] resposta vazia — tentando de novo')
          continue
        }
        console.error('[callClaude] RESPOSTA SEM TEXTO após retry:', JSON.stringify({ stopReason, content }).slice(0, 800))
        return 'Desculpa, me perdi aqui 🙂 Pode me dizer de novo como posso te ajudar?'
      }

      // Tem tool_use → executa ferramentas e devolve resultados
      const toolUseBlocks = content.filter((b: any) => b.type === 'tool_use')
      const toolResults = []
      let sentDirect = false  // alguma tool já RESPONDEU o lead direto (handoff de agenda)?
      for (const tu of toolUseBlocks) {
        const out = await handleToolCall(tu.name, tu.input, supabaseAdmin, professionalId, leadId, instanceName, remoteJid)
        // Qualquer tool que JÁ respondeu o lead direto (agenda: botões/confirmação; rotear: aviso).
        if ((out as any)?.handoff) {
          sentDirect = true
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(out),
        })
      }

      // Quando o agente já mandou a mensagem (botões enviados via Evolution),
      // não pedimos texto extra do Sonnet — retorna string vazia pra o caller
      // não enviar mensagem duplicada via sendWhatsAppMessage.
      if (sentDirect) {
        console.log('[callClaude] Mensagem enviada via tool — retornando vazio pra evitar dupla')
        return ''
      }

      // Histórico do turno: append do assistant (com tool_use) + user (com tool_result)
      messages.push({ role: 'assistant', content })
      messages.push({ role: 'user', content: toolResults })
    }

    return 'Desculpe, tive um problema ao processar. Tente novamente.'
  } catch (err: any) {
    console.error('Erro fatal:', err)
    return `Erro técnico: ${err.message}`
  }
}

// =============================================
// SEND PRESENCE (DIGITANDO)
// =============================================
async function sendWhatsAppPresence(instanceName: string, remoteJid: string, presence: 'composing' | 'recording' | 'paused') {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey || !instanceName) return

  console.log(`[Presence] Setting ${presence} for ${instanceName}`)
  await fetch(`${evoUrl}/chat/sendPresence/${instanceName}`, {
    method: 'POST',
    headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: remoteJid, presence })
  }).catch(e => console.error('[Presence Error]', e.message))
}

// =============================================
// SEND MESSAGE
// =============================================
// =============================================
// SANITIZADOR WhatsApp — limpa markdown que polui no app.
// O agente fica LIVRE de formatar (ver dossiê 2026-06-08, caso B). Baseado no
// node "FormatarTexto v4.0" do fluxo modelo, adaptado: aqui ** vira *negrito*
// nativo (não remove), e tratamos — / --- que o node não cobria.
// =============================================
function formatarParaWhatsApp(texto: string): string {
  if (!texto) return texto
  return texto
    // **negrito** / __negrito__ -> *negrito* (negrito nativo do WhatsApp)
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '*$1*')
    // títulos markdown (#, ##, …) -> remove o marcador, mantém o texto
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // linha separadora (---, ***, ___) -> remove
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
    // travessão — -> hífen simples
    .replace(/—/g, '-')
    // lista numerada "1. " -> "1- "
    .replace(/^(\s*\d+)\.\s+/gm, '$1- ')
    // caracteres invisíveis (zero-width)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // colapsa quebras de linha excessivas
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function sendWhatsAppMessage(instanceName: string, remoteJid: string, text: string) {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey || !instanceName) {
    console.error('[WhatsApp] Missing Evo config or instance name')
    return
  }

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  for (const paragraph of paragraphs) {
    console.log(`[WhatsApp] Sending to ${remoteJid} via ${instanceName}...`)

    try {
      const response = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': evoKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: remoteJid,
          text: paragraph.trim(),
          options: {
            delay: 1200,
            presence: 'composing'
          }
        })
      })

      const resText = await response.text()
      console.log(`[WhatsApp Status] ${response.status}`)
      console.log(`[WhatsApp Response] ${resText}`)

      if (!response.ok) {
        console.error('[WhatsApp Error] Failed to send message:', resText)
      }
    } catch (e: any) {
      console.error('[WhatsApp Fetch Error]', e.message)
    }

    if (paragraphs.length > 1) await new Promise(r => setTimeout(r, 1000))
  }
}

// =============================================
// MAIN HANDLER
// =============================================
serve(async (req) => {
  console.log(`[Agent] Request received: ${req.method}`)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { lead_id, lead_name, lead_phone, message, remote_jid, professional_id, instance_name, triage, contact_status } = body
    console.log(`[Request] Incoming from ${lead_name} (${lead_phone}). Message: ${message}`)
    console.log(`[Data] lead_id: ${lead_id}, prof_id: ${professional_id}, instance: ${instance_name}`)

    if (!professional_id || !lead_id) {
      console.error("[Error] Missing professional_id or lead_id")
      throw new Error("Missing IDs")
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      console.error("[Error] Supabase env vars missing")
      throw new Error("Supabase config missing")
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    console.log(`[DB] Fetching professional ${professional_id}`)
    const { data: professional, error: profError } = await supabaseAdmin.from('professionals').select('*').eq('id', professional_id).single()
    if (profError || !professional) {
      console.error("[Error] Professional not found:", profError)
      return new Response('Pro not found', { status: 200 })
    }

    console.log(`[DB] Fetching history for lead ${lead_id}`)
    const { data: history, error: histError } = await supabaseAdmin.from('chat_messages').select('role, content').eq('lead_id', lead_id).order('created_at', { ascending: true }).limit(20)
    if (histError) console.error("[Error] History fetch error:", histError)

    const chatHistory = (history || []).slice(0, -1)

    // Estado do agendamento — pro prompt não contradizer o sistema de agenda
    const { data: leadRow } = await supabaseAdmin.from('leads').select('booking_state').eq('id', lead_id).maybeSingle()
    const bookingState = (leadRow?.booking_state) || {}

    // Mostrar "digitando..." enquanto a IA pensa
    await sendWhatsAppPresence(instance_name, remote_jid, 'composing')

    console.log(`[AI] Calling Claude Sonnet 4.6...`)
    const systemPrompt = buildSystemPrompt(professional, lead_name, lead_phone, bookingState, !!triage, contact_status || '')
    let agentReply: string
    try {
      agentReply = await callClaude(systemPrompt, chatHistory, message, supabaseAdmin, professional_id, lead_id, instance_name, remote_jid)
      console.log(`[AI] Reply: ${agentReply}`)
    } catch (aiError: any) {
      console.error(`[AI Error]`, aiError.message)
      agentReply = `Erro na IA (${aiError.message}). Por favor, verifique as chaves e o modelo.`
    }

    // Caso B: limpa markdown que polui no WhatsApp ANTES de salvar/enviar — o agente
    // não se preocupa com formatação (system prompt não pede markdown).
    agentReply = formatarParaWhatsApp(agentReply)

    // Quando agentReply é vazio, significa que o agente já mandou a mensagem
    // via tool (enviar_botoes envia direto pra Evolution). Nesse caso pulamos
    // o sendWhatsAppMessage e o insert no chat_messages (já gravado pela tool).
    if (agentReply && agentReply.trim()) {
      console.log(`[DB] Saving reply and updating lead`)
      await supabaseAdmin.from('chat_messages').insert({ lead_id, role: 'assistant', content: agentReply })
      await supabaseAdmin.from('leads').update({ last_message_at: new Date().toISOString() }).eq('id', lead_id)

      console.log(`[WhatsApp] Sending message via Evolution...`)
      await sendWhatsAppMessage(instance_name, remote_jid, agentReply)
    } else {
      console.log(`[AI] Resposta vazia (tool já enviou). Atualizando só last_message_at.`)
      await supabaseAdmin.from('leads').update({ last_message_at: new Date().toISOString() }).eq('id', lead_id)
    }
    console.log(`[Success] Flow completed for ${lead_name}`)

    return new Response(JSON.stringify({ success: true, reply: agentReply || '(via tool)' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error: any) {
    console.error(`[Fatal Error]`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

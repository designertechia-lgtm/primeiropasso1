// ANCORA-DOC: feature "agenda" — geração de horários livres (F20: buffer + almoço).
// Fonte ÚNICA de verdade no FRONT (telas do paciente). A edge `whatsapp-agent`
// (computeFreeSlots/isSlotFree) espelha esta mesma lógica em Deno — manter em sincronia.
//
// Regras (pedido da Daiane Cenci, 22/06):
//  • passo entre horários = duração do atendimento + buffer (gera "horários quebrados"
//    com a folga pedida; também unifica a antiga divergência front +=60 vs edge +=duração);
//  • buffer = folga mínima dos DOIS lados de cada atendimento já existente;
//  • almoço = intervalo subtraído da janela de disponibilidade (os atendimentos
//    recomeçam logo após o fim do almoço, sem sobrar resto colado nele).

export interface DayWindow { day_of_week: number; start_time: string; end_time: string }
export interface Occupied { start_time: string; end_time: string }
export interface LunchBreak { enabled: boolean; start: string; end: string }

export interface FreeSlotsParams {
  date: Date;
  durationMinutes: number;
  /** Janelas de atendimento do profissional (todos os dias); filtra-se pelo dia da `date`. */
  availability: DayWindow[];
  /** Consultas pending/confirmed do dia. */
  appointments: Occupied[];
  /** Bloqueios do dia (appointment_type = 'block'). */
  blocks?: Occupied[];
  /** Folga (min) exigida antes e depois de cada atendimento existente. */
  bufferMinutes?: number;
  /** Intervalo de almoço, subtraído das janelas. */
  lunch?: LunchBreak | null;
  /** "Agora" para descartar horários passados (default: new Date()). */
  now?: Date;
  /** Janela usada quando o profissional não cadastrou disponibilidade no dia. */
  defaultRange?: { startMin: number; endMin: number };
}

/** "HH:mm" (ou "HH:mm:ss") → minutos desde a meia-noite. Compartilhado com
 *  `agendaValidation.ts`, para o admin e as telas do paciente medirem igual. */
export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (mins: number): string =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Almoço do dia da semana (dow 0=dom … 6=sáb) a partir do jsonb `lunch_breaks`. */
export function lunchForDow(
  lunchBreaks: Record<string, { start?: string; end?: string }> | null | undefined,
  dow: number,
): LunchBreak | null {
  const lb = lunchBreaks?.[String(dow)];
  return lb && lb.start && lb.end ? { enabled: true, start: lb.start, end: lb.end } : null;
}

/** Remove [cutS,cutE) de [s,e), devolvendo 0, 1 ou 2 sub-intervalos. */
function subtract(s: number, e: number, cutS: number, cutE: number): Array<[number, number]> {
  if (cutE <= s || cutS >= e) return [[s, e]]; // sem interseção
  const out: Array<[number, number]> = [];
  if (cutS > s) out.push([s, cutS]);
  if (cutE < e) out.push([cutE, e]);
  return out.filter(([a, b]) => b - a > 0);
}

/** Horários de início disponíveis ("HH:mm") para a `date`, respeitando buffer e almoço. */
export function getFreeSlots(p: FreeSlotsParams): string[] {
  const duration = p.durationMinutes;
  const buffer = Math.max(0, p.bufferMinutes ?? 0);
  const step = duration + buffer;
  if (duration <= 0 || step <= 0) return [];

  const dow = p.date.getDay();
  const dayWindows = p.availability.filter((a) => a.day_of_week === dow);
  let ranges: Array<[number, number]> = dayWindows.length > 0
    ? dayWindows.map((a) => [toMin(a.start_time), toMin(a.end_time)] as [number, number])
    : [p.defaultRange
        ? [p.defaultRange.startMin, p.defaultRange.endMin]
        : [7 * 60, 20 * 60]] as Array<[number, number]>;

  // Subtrai o almoço das janelas (atendimentos recomeçam após o fim do almoço).
  if (p.lunch?.enabled && p.lunch.start && p.lunch.end) {
    const ls = toMin(p.lunch.start);
    const le = toMin(p.lunch.end);
    ranges = ranges.flatMap(([s, e]) => subtract(s, e, ls, le));
  }

  // Ocupações (consultas + bloqueios) expandidas pelo buffer dos dois lados.
  const occ: Array<[number, number]> = [...p.appointments, ...(p.blocks ?? [])]
    .map((o) => [toMin(o.start_time), toMin(o.end_time)] as [number, number]);
  const conflicts = (m: number): boolean =>
    occ.some(([s, e]) => m < e + buffer && m + duration > s - buffer);

  const now = p.now ?? new Date();
  const isToday =
    p.date.getFullYear() === now.getFullYear() &&
    p.date.getMonth() === now.getMonth() &&
    p.date.getDate() === now.getDate();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const slots: string[] = [];
  for (const [rs, re] of ranges) {
    for (let m = rs; m + duration <= re; m += step) {
      if (isToday && m <= nowMin) continue;
      if (conflicts(m)) continue;
      slots.push(fromMin(m));
    }
  }
  return [...new Set(slots)].sort();
}

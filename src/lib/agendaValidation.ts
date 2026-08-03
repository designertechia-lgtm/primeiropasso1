// ANCORA-DOC: feature "agenda" — regra ÚNICA de "esse horário pode?" no admin.
//
// POR QUÊ ESTE ARQUIVO EXISTE: a mesma pergunta tinha três respostas diferentes.
// Arrastar um evento validava almoço e folga; criar pelo formulário validava só
// sobreposição; editar pelo modal não validava nada. Dava para furar a própria
// regra do profissional simplesmente escolhendo o caminho mais permissivo.
//
// A geração de horários LIVRES (telas do paciente e edge do WhatsApp) continua
// em `slots.ts` — são perguntas diferentes: lá é "quais horários oferecer?",
// aqui é "este horário específico pode?". As duas compartilham `toMin` e a
// mesma aritmética de folga, para não divergirem de novo.

import { toMin } from "./slots";

export interface AgendaEntry {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status?: string | null;
  appointment_type?: string | null;
}

export interface LunchByDay {
  [dayOfWeek: number]: { start: string; end: string };
}

export interface ValidateSlotParams {
  /** Data no formato yyyy-MM-dd. */
  date: string;
  /** "HH:mm" ou "HH:mm:ss". */
  startTime: string;
  endTime: string;
  /** Atendimento ocupa contra tudo; bloqueio só contra atendimentos. */
  kind: "booking" | "block";
  /** Registro sendo editado/arrastado — não conflita consigo mesmo. */
  ignoreId?: string | null;
  /** Agendamentos e bloqueios já carregados (o filtro por data é feito aqui). */
  entries: AgendaEntry[];
  lunchByDay?: LunchByDay;
  bufferMinutes?: number;
  /** Evento de dia inteiro (importado do Google): não disputa horário. */
  allDay?: boolean;
  /**
   * Quem está agendando é o DONO da agenda, pelo painel. Nesse caso o próprio
   * almoço e os próprios bloqueios deixam de ser impedimento e viram aviso —
   * são compromissos dele, e encaixar um atendimento por cima é decisão dele.
   * Choque com outro ATENDIMENTO continua barrado: isso é double-booking real,
   * com duas pessoas esperando no mesmo horário.
   */
  overridable?: boolean;
}

// Objeto único em vez de união discriminada de propósito: o projeto compila com
// `strict: false`, e sem strictNullChecks o TypeScript não estreita `{ok:true} |
// {ok:false, reason}` — `check.reason` viraria erro em todo consumidor.
export interface SlotValidation {
  ok: boolean;
  /** Frase pronta para o toast. Sempre presente quando `ok` é false. */
  reason?: string;
  /**
   * Passou, mas vale avisar — o horário cai no almoço ou por cima de um
   * bloqueio. Só aparece com `overridable`.
   */
  warning?: string;
}

/** Status que efetivamente ocupam o horário. Concluído e cancelado liberam a
 *  vaga — mesma regra do índice `unique_appointment_slot` no banco. */
const OCUPA = new Set(["pending", "confirmed"]);

const ddmm = (date: string): string => {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
};

/**
 * Responde se um intervalo pode ser gravado na agenda do profissional.
 *
 * Ordem das checagens: coerência do intervalo → almoço → conflito com o que já
 * está lá. A primeira que falhar devolve uma frase pronta para o toast.
 */
export function validateAgendaSlot(p: ValidateSlotParams): SlotValidation {
  const start = toMin(p.startTime);
  const end = toMin(p.endTime);

  // Sem isto, um intervalo invertido era gravado e ficava invisível: a busca de
  // conflito (start < fim E fim > início) nunca casa com duração negativa.
  if (!p.allDay && end <= start) {
    return { ok: false, reason: "O horário de término precisa ser depois do início." };
  }

  if (p.allDay) return { ok: true };

  // Ressalvas acumuladas: com `overridable`, o que impediria vira aviso.
  const avisos: string[] = [];

  // "T12:00:00" evita o recuo de um dia que o parse UTC causa em fusos negativos.
  const dow = new Date(`${p.date}T12:00:00`).getDay();
  const lunch = p.lunchByDay?.[dow];
  if (lunch?.start && lunch?.end) {
    const ls = toMin(lunch.start);
    const le = toMin(lunch.end);
    if (start < le && end > ls) {
      const texto = `Esse horário cai no intervalo de almoço (${lunch.start}–${lunch.end}).`;
      if (!p.overridable) return { ok: false, reason: texto };
      avisos.push("está no seu horário de almoço");
    }
  }

  const buffer = Math.max(0, p.bufferMinutes ?? 0);

  const colide = (e: AgendaEntry) => {
    if (e.id === p.ignoreId) return false;
    if (e.appointment_date !== p.date) return false;
    if (!OCUPA.has(e.status ?? "pending")) return false;
    const os = toMin(e.start_time);
    const oe = toMin(e.end_time);
    // A folga vale dos dois lados de cada compromisso já existente.
    return start < oe + buffer && end > os - buffer;
  };

  const descreve = (e: AgendaEntry) => {
    const quando = `${e.start_time.slice(0, 5)}–${e.end_time.slice(0, 5)}`;
    const comFolga = buffer > 0 ? ` (considerando a folga de ${buffer} min)` : "";
    return `Conflito em ${ddmm(p.date)}: já existe algo às ${quando}${comFolga}.`;
  };

  const candidatos = p.entries.filter(colide);
  const isBlock = (e: AgendaEntry) => e.appointment_type === "block";

  // Choque com ATENDIMENTO barra sempre: seriam duas pessoas no mesmo horário.
  const comAtendimento = candidatos.find((e) => !isBlock(e));
  if (comAtendimento) return { ok: false, reason: descreve(comAtendimento) };

  const comBloqueio = candidatos.find(isBlock);
  if (comBloqueio) {
    // Bloqueio sobre bloqueio sempre pôde (férias em cima de folga).
    const permitido = p.kind === "block" || p.overridable;
    if (!permitido) return { ok: false, reason: descreve(comBloqueio) };
    if (p.kind !== "block") avisos.push("cai em cima de um bloqueio seu");
  }

  if (avisos.length > 0) {
    return { ok: true, warning: `Atenção: o horário ${avisos.join(" e ")}.` };
  }
  return { ok: true };
}

/**
 * Preto ou branco — o que for legível sobre `hex`, pela luminância relativa da
 * WCAG.
 *
 * Existe porque o texto dos eventos era branco fixo, e branco sobre as cores
 * padrão de status não chega nem perto dos 4.5:1 exigidos para texto pequeno:
 * amarelo "Concluído" 1.92:1, verde "Confirmado" 2.28:1, azul "Pendente"
 * 3.68:1. Com texto escuro as três passam de 5:1.
 *
 * CONSEQUÊNCIA ESPERADA: com a paleta padrão, os eventos ficam com texto
 * ESCURO — o mesmo que o Google Agenda faz em cores claras. Só cores de fato
 * escuras (um azul-marinho, por exemplo) voltam a receber texto branco.
 */
export function readableTextColor(hex: string | null | undefined): string {
  if (!hex) return "#fff";
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return "#fff";
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(full.slice(0, 2), 16));
  const g = channel(parseInt(full.slice(2, 4), 16));
  const b = channel(parseInt(full.slice(4, 6), 16));
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contraste contra branco vs contra preto: fica com o maior.
  return (1.05 / (luminancia + 0.05)) >= ((luminancia + 0.05) / 0.05) ? "#fff" : "#111827";
}

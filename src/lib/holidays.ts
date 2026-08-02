// ANCORA-DOC: feature "agenda" — feriados nacionais brasileiros.
//
// Calculados, não cadastrados: uma tabela de datas fixas venceria todo ano e
// alguém sempre esqueceria de renovar. Aqui só entram os feriados NACIONAIS —
// os municipais e os pessoais o profissional cadastra em `professional_holidays`.
//
// ⚠️ A edge `whatsapp-agent` espelha estas funções em Deno (o Axel precisa saber
// que não pode agendar em feriado). Ao mexer aqui, mexa lá também — o arquivo é
// TypeScript puro, sem dependência, justamente para poder ser copiado.

export interface Holiday {
  /** yyyy-MM-dd */
  date: string;
  name: string;
  /** Ponto facultativo na lei, mas consultório fechado na prática. */
  optional?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher (calendário
 * gregoriano). É a âncora de Carnaval, Sexta-Feira Santa e Corpus Christi.
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  // Meio-dia evita que fuso horário empurre a data para o dia anterior.
  return new Date(year, mes - 1, dia, 12, 0, 0);
}

const somaDias = (base: Date, dias: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
};

const fmt = (d: Date) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());

/** Feriados nacionais de um ano, ordenados por data. */
export function nationalHolidays(year: number): Holiday[] {
  const pascoa = easterSunday(year);

  const lista: Holiday[] = [
    { date: iso(year, 1, 1), name: "Confraternização Universal" },
    { date: fmt(somaDias(pascoa, -48)), name: "Carnaval (segunda)", optional: true },
    { date: fmt(somaDias(pascoa, -47)), name: "Carnaval", optional: true },
    { date: fmt(somaDias(pascoa, -46)), name: "Quarta-feira de Cinzas (até 12h)", optional: true },
    { date: fmt(somaDias(pascoa, -2)), name: "Sexta-feira Santa" },
    { date: iso(year, 4, 21), name: "Tiradentes" },
    { date: iso(year, 5, 1), name: "Dia do Trabalho" },
    { date: fmt(somaDias(pascoa, 60)), name: "Corpus Christi", optional: true },
    { date: iso(year, 9, 7), name: "Independência do Brasil" },
    { date: iso(year, 10, 12), name: "Nossa Senhora Aparecida" },
    { date: iso(year, 11, 2), name: "Finados" },
    { date: iso(year, 11, 15), name: "Proclamação da República" },
    // Feriado nacional desde a Lei 14.759/2023.
    { date: iso(year, 11, 20), name: "Consciência Negra" },
    { date: iso(year, 12, 25), name: "Natal" },
  ];

  return lista.sort((a, b) => a.date.localeCompare(b.date));
}

/** Feriados nacionais de um intervalo de datas (yyyy-MM-dd), inclusive. */
export function nationalHolidaysBetween(inicio: string, fim: string): Holiday[] {
  const anoInicio = Number(inicio.slice(0, 4));
  const anoFim = Number(fim.slice(0, 4));
  const out: Holiday[] = [];
  for (let ano = anoInicio; ano <= anoFim; ano++) {
    out.push(...nationalHolidays(ano).filter((h) => h.date >= inicio && h.date <= fim));
  }
  return out;
}

export interface CustomHoliday {
  date: string;
  name: string;
}

/**
 * Mapa data → nome do feriado, para consulta direta.
 *
 * As datas próprias do profissional entram por último e vencem: quem cadastra
 * "25/12 — plantão de Natal" está dizendo algo mais específico que a regra geral.
 */
export function buildHolidayMap(p: {
  inicio: string;
  fim: string;
  /** Ligar/desligar os feriados nacionais (professionals.skip_national_holidays). */
  nacionais: boolean;
  custom?: CustomHoliday[];
}): Map<string, string> {
  const mapa = new Map<string, string>();
  if (p.nacionais) {
    for (const h of nationalHolidaysBetween(p.inicio, p.fim)) mapa.set(h.date, h.name);
  }
  for (const c of p.custom ?? []) {
    if (c.date >= p.inicio && c.date <= p.fim) mapa.set(c.date, c.name);
  }
  return mapa;
}

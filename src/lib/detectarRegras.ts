// ANCORA-DOC: feature "agenda" — detectar bloqueios que na verdade são REGRA.
//
// Contexto: antes de existir "Quando eu não atendo", a única forma de fechar um
// horário fixo era criar um bloqueio por dia. Um profissional real acumulou
// 3.281 registros repetindo 5 regras (almoço, antes e depois do expediente,
// sábado, domingo) por dois anos.
//
// Esta função LÊ os bloqueios e propõe a regra equivalente. Ela é um palpite
// informado, não a verdade: a tela mostra o resultado para o profissional
// conferir e ajustar antes de qualquer coisa ser apagada.

export interface BlocoSimples {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  notes?: string | null;
}

export interface FaixaRepetida {
  dow: number;
  start: string;
  end: string;
  /** Em quantas datas distintas essa faixa se repete nesse dia da semana. */
  ocorrencias: number;
  ids: string[];
}

export interface RegraSugerida {
  dow: number;
  /** Nenhum atendimento nesse dia da semana. */
  fechado: boolean;
  /** Janela de atendimento sugerida (o que sobra depois dos bloqueios fixos). */
  janelas: Array<{ start: string; end: string }>;
  /** Buraco no meio do dia que parece almoço. */
  almoco: { start: string; end: string } | null;
  /** Bloqueios que a regra substitui — só estes seriam removidos. */
  idsSubstituidos: string[];
  ocorrenciasMax: number;
}

const toMin = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Une intervalos que se tocam ou se sobrepõem. */
function unir(intervalos: Array<[number, number]>): Array<[number, number]> {
  if (intervalos.length === 0) return [];
  const ord = [...intervalos].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [ord[0]];
  for (const [s, e] of ord.slice(1)) {
    const ult = out[out.length - 1];
    if (s <= ult[1]) ult[1] = Math.max(ult[1], e);
    else out.push([s, e]);
  }
  return out;
}

/**
 * Agrupa os bloqueios por (dia da semana, horário) e devolve os que se repetem
 * pelo menos `minOcorrencias` vezes — o que caracteriza regra e não exceção.
 */
export function detectarFaixasRepetidas(
  blocos: BlocoSimples[],
  minOcorrencias = 4,
): FaixaRepetida[] {
  const grupos = new Map<string, { datas: Set<string>; ids: string[] }>();

  for (const b of blocos) {
    if (!b.start_time || !b.end_time) continue;
    // "T12:00:00" evita o recuo de um dia no parse com fuso negativo.
    const dow = new Date(`${b.appointment_date}T12:00:00`).getDay();
    const chave = `${dow}|${b.start_time.slice(0, 5)}|${b.end_time.slice(0, 5)}`;
    if (!grupos.has(chave)) grupos.set(chave, { datas: new Set(), ids: [] });
    const g = grupos.get(chave)!;
    g.datas.add(b.appointment_date);
    g.ids.push(b.id);
  }

  return [...grupos.entries()]
    .map(([chave, g]) => {
      const [dow, start, end] = chave.split("|");
      return { dow: Number(dow), start, end, ocorrencias: g.datas.size, ids: g.ids };
    })
    .filter((f) => f.ocorrencias >= minOcorrencias)
    .sort((a, b) => a.dow - b.dow || toMin(a.start) - toMin(b.start));
}

/**
 * Converte as faixas repetidas na regra semanal equivalente.
 *
 * O raciocínio é o inverso do bloqueio: parte de uma janela ampla (do primeiro
 * ao último minuto tocado pelos bloqueios do dia, com o piso do horário
 * comercial) e SUBTRAI o que está bloqueado. O que sobra é o atendimento.
 */
export function sugerirRegras(
  faixas: FaixaRepetida[],
  opts: { diaComeca?: string; diaTermina?: string } = {},
): RegraSugerida[] {
  const pisoDia = toMin(opts.diaComeca ?? "07:00");
  const tetoDia = toMin(opts.diaTermina ?? "20:00");
  const porDow = new Map<number, FaixaRepetida[]>();
  for (const f of faixas) {
    if (!porDow.has(f.dow)) porDow.set(f.dow, []);
    porDow.get(f.dow)!.push(f);
  }

  const regras: RegraSugerida[] = [];

  for (const [dow, doDia] of porDow) {
    const bloqueado = unir(doDia.map((f) => [toMin(f.start), toMin(f.end)] as [number, number]));
    const ids = doDia.flatMap((f) => f.ids);
    const ocorrenciasMax = Math.max(...doDia.map((f) => f.ocorrencias));

    // A janela candidata vai do início do primeiro bloqueio ao fim do último,
    // ampliada pelo horário comercial — senão um dia com um bloqueio só ficaria
    // com uma janela minúscula e irreal.
    const inicioDia = Math.min(pisoDia, bloqueado[0][0]);
    const fimDia = Math.max(tetoDia, bloqueado[bloqueado.length - 1][1]);

    // Subtrai o bloqueado da janela: o que sobra é quando ele atende.
    const livres: Array<[number, number]> = [];
    let cursor = inicioDia;
    for (const [s, e] of bloqueado) {
      if (s > cursor) livres.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < fimDia) livres.push([cursor, fimDia]);

    // Sobra irrisória não é janela de atendimento — é arredondamento.
    const janelasUteis = livres.filter(([s, e]) => e - s >= 30);

    if (janelasUteis.length === 0) {
      regras.push({
        dow, fechado: true, janelas: [], almoco: null,
        idsSubstituidos: ids, ocorrenciasMax,
      });
      continue;
    }

    // Buraco entre duas janelas, no miolo do dia, é almoço. Só o primeiro:
    // `lunch_breaks` guarda um intervalo por dia.
    let almoco: { start: string; end: string } | null = null;
    for (let i = 0; i < janelasUteis.length - 1; i++) {
      const fimAnterior = janelasUteis[i][1];
      const inicioSeguinte = janelasUteis[i + 1][0];
      const duracao = inicioSeguinte - fimAnterior;
      const noMiolo = fimAnterior >= 10 * 60 && inicioSeguinte <= 16 * 60;
      if (noMiolo && duracao >= 30 && duracao <= 180) {
        almoco = { start: fromMin(fimAnterior), end: fromMin(inicioSeguinte) };
        break;
      }
    }

    // Com o almoço extraído como intervalo, o dia vira UMA janela contínua —
    // é assim que availability + lunch_breaks representam a coisa.
    const janelas = almoco
      ? [{ start: fromMin(janelasUteis[0][0]), end: fromMin(janelasUteis[janelasUteis.length - 1][1]) }]
      : janelasUteis.map(([s, e]) => ({ start: fromMin(s), end: fromMin(e) }));

    regras.push({ dow, fechado: false, janelas, almoco, idsSubstituidos: ids, ocorrenciasMax });
  }

  return regras.sort((a, b) => a.dow - b.dow);
}

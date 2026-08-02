import { describe, it, expect } from "vitest";
import { detectarFaixasRepetidas, sugerirRegras, type BlocoSimples } from "./detectarRegras";

/** Gera N ocorrências semanais de uma faixa, a partir de uma data. */
function semanal(inicioIso: string, semanas: number, start: string, end: string, prefixo: string): BlocoSimples[] {
  const out: BlocoSimples[] = [];
  const d = new Date(`${inicioIso}T12:00:00`);
  for (let i = 0; i < semanas; i++) {
    const data = new Date(d);
    data.setDate(data.getDate() + i * 7);
    out.push({
      id: `${prefixo}-${i}`,
      appointment_date: data.toISOString().slice(0, 10),
      start_time: `${start}:00`,
      end_time: `${end}:00`,
    });
  }
  return out;
}

/** Todos os dias por N semanas (o padrão do almoço bloqueado dia a dia). */
function diario(inicioIso: string, dias: number, start: string, end: string, prefixo: string): BlocoSimples[] {
  const out: BlocoSimples[] = [];
  const d = new Date(`${inicioIso}T12:00:00`);
  for (let i = 0; i < dias; i++) {
    const data = new Date(d);
    data.setDate(data.getDate() + i);
    out.push({
      id: `${prefixo}-${i}`,
      appointment_date: data.toISOString().slice(0, 10),
      start_time: `${start}:00`,
      end_time: `${end}:00`,
    });
  }
  return out;
}

describe("detectarFaixasRepetidas", () => {
  it("separa a regra da exceção", () => {
    const blocos = [
      ...semanal("2026-06-20", 10, "06:00", "23:59", "sabado"), // sábado fechado
      // Uma consulta pontual não é regra.
      { id: "avulso", appointment_date: "2026-06-24", start_time: "09:15:00", end_time: "10:15:00" },
    ];
    const faixas = detectarFaixasRepetidas(blocos);
    expect(faixas).toHaveLength(1);
    expect(faixas[0]).toMatchObject({ dow: 6, start: "06:00", end: "23:59", ocorrencias: 10 });
  });

  it("respeita o mínimo de ocorrências", () => {
    const blocos = semanal("2026-06-20", 3, "06:00", "23:59", "poucas");
    expect(detectarFaixasRepetidas(blocos, 4)).toHaveLength(0);
    expect(detectarFaixasRepetidas(blocos, 3)).toHaveLength(1);
  });

  it("conta datas distintas, não linhas duplicadas", () => {
    // O caso real do banco: o MESMO almoço gravado duas vezes por dia (738 +
    // 731 registros de 11:30–13:30). A contagem tem que enxergar 56 dias, não
    // 112 linhas — senão a tela promete o dobro do que existe.
    const blocos = [
      ...diario("2026-06-22", 56, "11:30", "13:30", "almoco-a"),
      ...diario("2026-06-22", 56, "11:30", "13:30", "almoco-b"),
    ];
    const faixas = detectarFaixasRepetidas(blocos);
    expect(faixas).toHaveLength(7); // uma por dia da semana
    expect(faixas.reduce((s, f) => s + f.ocorrencias, 0)).toBe(56);
    // Cada faixa guarda as duas linhas de cada dia, para as duas serem apagadas.
    expect(faixas.every((f) => f.ids.length === f.ocorrencias * 2)).toBe(true);
  });
});

describe("sugerirRegras — o caso real de produção", () => {
  // Reproduz o padrão encontrado no banco em 02/08/2026: almoço 11:30–13:30,
  // antes (07:00–08:00) e depois (19:30–22:00) do expediente, sábado e domingo
  // fechados o dia inteiro.
  const blocos = [
    ...diario("2026-06-22", 60, "07:00", "08:00", "antes"),
    ...diario("2026-06-22", 60, "11:30", "13:30", "almoco"),
    ...diario("2026-06-22", 60, "19:30", "22:00", "depois"),
    ...semanal("2026-06-27", 9, "06:00", "23:59", "sabado"),
    ...semanal("2026-06-28", 9, "08:00", "22:00", "domingo"),
  ];
  const regras = sugerirRegras(detectarFaixasRepetidas(blocos));

  it("descobre a janela de atendimento e o almoço nos dias úteis", () => {
    const segunda = regras.find((r) => r.dow === 1)!;
    expect(segunda.fechado).toBe(false);
    expect(segunda.janelas).toEqual([{ start: "08:00", end: "19:30" }]);
    expect(segunda.almoco).toEqual({ start: "11:30", end: "13:30" });
  });

  it("reconhece sábado e domingo como dias fechados", () => {
    expect(regras.find((r) => r.dow === 6)!.fechado).toBe(true);
    expect(regras.find((r) => r.dow === 0)!.fechado).toBe(true);
  });

  it("cobre os sete dias e aponta os bloqueios que cada regra substitui", () => {
    expect(regras).toHaveLength(7);
    for (const r of regras) expect(r.idsSubstituidos.length).toBeGreaterThan(0);
  });

  it("um dia sem bloqueio nenhum não vira regra", () => {
    const so6a = sugerirRegras(detectarFaixasRepetidas(semanal("2026-06-22", 8, "07:00", "08:00", "seg")));
    expect(so6a).toHaveLength(1);
    expect(so6a[0].dow).toBe(1);
  });
});

describe("sugerirRegras — formas menos óbvias", () => {
  it("bloqueio só de manhã empurra o início do atendimento", () => {
    const r = sugerirRegras(detectarFaixasRepetidas(semanal("2026-06-22", 8, "07:00", "10:00", "manha")))[0];
    expect(r.fechado).toBe(false);
    expect(r.janelas).toEqual([{ start: "10:00", end: "20:00" }]);
    expect(r.almoco).toBeNull();
  });

  it("buraco fora do miolo do dia não é confundido com almoço", () => {
    const blocos = [
      ...semanal("2026-06-22", 8, "07:00", "08:00", "cedo"),
      ...semanal("2026-06-22", 8, "17:00", "18:00", "fim-tarde"),
    ];
    const r = sugerirRegras(detectarFaixasRepetidas(blocos))[0];
    expect(r.almoco).toBeNull();
    expect(r.janelas).toEqual([{ start: "08:00", end: "17:00" }, { start: "18:00", end: "20:00" }]);
  });
});

import { describe, it, expect } from "vitest";
import {
  easterSunday, nationalHolidays, nationalHolidaysBetween, buildHolidayMap,
} from "./holidays";

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const doAno = (ano: number, nome: string) =>
  nationalHolidays(ano).find((h) => h.name === nome)?.date;

describe("easterSunday — âncora dos feriados móveis", () => {
  // Datas de calendário, conferíveis fora do código.
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2030, "2030-04-21"],
  ])("Páscoa de %i cai em %s", (ano, esperado) => {
    expect(fmt(easterSunday(ano))).toBe(esperado);
  });
});

describe("nationalHolidays — móveis derivados da Páscoa", () => {
  it("Carnaval, Sexta-feira Santa e Corpus Christi de 2026", () => {
    expect(doAno(2026, "Carnaval")).toBe("2026-02-17");
    expect(doAno(2026, "Carnaval (segunda)")).toBe("2026-02-16");
    expect(doAno(2026, "Sexta-feira Santa")).toBe("2026-04-03");
    expect(doAno(2026, "Corpus Christi")).toBe("2026-06-04");
  });

  it("acompanha a Páscoa em outro ano (2025)", () => {
    expect(doAno(2025, "Carnaval")).toBe("2025-03-04");
    expect(doAno(2025, "Sexta-feira Santa")).toBe("2025-04-18");
    expect(doAno(2025, "Corpus Christi")).toBe("2025-06-19");
  });

  it("mantém os fixos e inclui Consciência Negra (Lei 14.759/2023)", () => {
    expect(doAno(2026, "Natal")).toBe("2026-12-25");
    expect(doAno(2026, "Tiradentes")).toBe("2026-04-21");
    expect(doAno(2026, "Consciência Negra")).toBe("2026-11-20");
  });

  it("vem ordenado por data", () => {
    const datas = nationalHolidays(2026).map((h) => h.date);
    expect(datas).toEqual([...datas].sort());
  });
});

describe("nationalHolidaysBetween — recorte por período", () => {
  it("atravessa a virada do ano", () => {
    const r = nationalHolidaysBetween("2026-12-20", "2027-01-05").map((h) => h.date);
    expect(r).toEqual(["2026-12-25", "2027-01-01"]);
  });

  it("devolve vazio num intervalo sem feriado", () => {
    expect(nationalHolidaysBetween("2026-08-03", "2026-08-20")).toEqual([]);
  });
});

describe("buildHolidayMap", () => {
  const janela = { inicio: "2026-01-01", fim: "2026-12-31" };

  it("desligar os nacionais deixa só as datas próprias", () => {
    const m = buildHolidayMap({
      ...janela, nacionais: false,
      custom: [{ date: "2026-03-19", name: "Aniversário da cidade" }],
    });
    expect(m.get("2026-12-25")).toBeUndefined();
    expect(m.get("2026-03-19")).toBe("Aniversário da cidade");
  });

  it("a data própria vence o feriado nacional do mesmo dia", () => {
    const m = buildHolidayMap({
      ...janela, nacionais: true,
      custom: [{ date: "2026-12-25", name: "Plantão de Natal" }],
    });
    expect(m.get("2026-12-25")).toBe("Plantão de Natal");
  });

  it("ignora data própria fora do período pedido", () => {
    const m = buildHolidayMap({
      inicio: "2026-01-01", fim: "2026-06-30", nacionais: false,
      custom: [{ date: "2026-11-05", name: "Fora da janela" }],
    });
    expect(m.size).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { construirEixo, durVisual, paraVisual, paraReal, costurasVisuais, type SegEixo } from "./eixoVisual";

const seg = (start: number, end: number, keep: boolean, dismissed?: boolean): SegEixo =>
  ({ start, end, keep, dismissed });

describe("eixoVisual", () => {
  it("sem excluído de vez o eixo é identidade", () => {
    const eixo = construirEixo([seg(0, 10, true), seg(10, 20, false), seg(20, 30, true)], 40);
    expect(durVisual(eixo)).toBeCloseTo(40);
    for (const t of [0, 5, 10, 15, 25, 39.9]) {
      expect(paraVisual(eixo, t)).toBeCloseTo(t);
      expect(paraReal(eixo, t)).toBeCloseTo(t);
    }
    expect(costurasVisuais(eixo)).toEqual([]);
  });

  it("removido SEM dismissed continua visível (só o excluído de vez colapsa)", () => {
    const eixo = construirEixo([seg(0, 10, true), seg(10, 20, false, false)], 20);
    expect(durVisual(eixo)).toBeCloseTo(20);
  });

  it("colapso no meio: duração encolhe e os dois lados se emendam", () => {
    const eixo = construirEixo(
      [seg(0, 10, true), seg(10, 20, false, true), seg(20, 30, true)], 30);
    expect(durVisual(eixo)).toBeCloseTo(20);
    expect(paraVisual(eixo, 5)).toBeCloseTo(5);
    expect(paraVisual(eixo, 10)).toBeCloseTo(10);
    expect(paraVisual(eixo, 15)).toBeCloseTo(10);   // dentro do colapso → costura
    expect(paraVisual(eixo, 20)).toBeCloseTo(10);
    expect(paraVisual(eixo, 25)).toBeCloseTo(15);
    expect(costurasVisuais(eixo)).toEqual([10]);
  });

  it("paraReal salta a região colapsada", () => {
    const eixo = construirEixo(
      [seg(0, 10, true), seg(10, 20, false, true), seg(20, 30, true)], 30);
    expect(paraReal(eixo, 5)).toBeCloseTo(5);
    expect(paraReal(eixo, 10)).toBeCloseTo(20);     // costura → começo do próximo visível
    expect(paraReal(eixo, 15)).toBeCloseTo(25);
    expect(paraReal(eixo, 999)).toBeCloseTo(30);    // além do fim → fim
  });

  it("ida e volta é estável no domínio visível", () => {
    const eixo = construirEixo(
      [seg(0, 4, true), seg(4, 9, false, true), seg(9, 12, true), seg(12, 14, false, true), seg(14, 30, true)], 34);
    for (const t of [0, 2, 9.5, 11, 15, 29, 33]) {
      expect(paraVisual(eixo, paraReal(eixo, paraVisual(eixo, t)))).toBeCloseTo(paraVisual(eixo, t));
    }
    expect(durVisual(eixo)).toBeCloseTo(34 - 5 - 2);
    expect(costurasVisuais(eixo)).toEqual([4, 4 + 3]);
  });

  it("colapso no início e a cauda dos emendados fica visível", () => {
    const eixo = construirEixo([seg(0, 6, false, true), seg(6, 20, true)], 50);
    expect(durVisual(eixo)).toBeCloseTo(44);        // 14 do principal + 30 da cauda
    expect(paraVisual(eixo, 0)).toBeCloseTo(0);
    expect(paraVisual(eixo, 30)).toBeCloseTo(24);   // cauda: desloca pelos 6 colapsados
    expect(paraReal(eixo, 0)).toBeCloseTo(6);
    expect(costurasVisuais(eixo)).toEqual([0]);
  });

  it("nunca divide por zero mesmo em estado degenerado", () => {
    const eixo = construirEixo([seg(0, 10, false, true)], 10);
    expect(durVisual(eixo)).toBeGreaterThan(0);
  });
});

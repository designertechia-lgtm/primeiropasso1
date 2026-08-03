/**
 * Cortador de clipe da sequência: as janelas que saem daqui viram SeqClips
 * ("parte 1", "parte 2") — se a conta errar, o vídeo montado sai com pedaço a
 * mais ou a menos.
 */
import { describe, it, expect } from "vitest";
import {
  segsIniciais, dividirEm, janelasMantidas, duracaoMantida, MIN_PARTE,
} from "./seqTrim";

const clip = (src_in: number, src_out: number, natural_dur = 10) =>
  ({ src_in, src_out, natural_dur });

describe("segsIniciais — a janela atual do clipe vira partição da fonte", () => {
  it("clipe inteiro: um único pedaço mantido", () => {
    const segs = segsIniciais(clip(0, 10));
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ start: 0, end: 10, keep: true });
  });

  it("janela no miolo: sobras entram como removidas (dá pra restaurar)", () => {
    const segs = segsIniciais(clip(2, 7));
    expect(segs.map((s) => [s.start, s.end, s.keep])).toEqual([
      [0, 2, false], [2, 7, true], [7, 10, false],
    ]);
  });

  it("sobra menor que o piso não vira pedaço", () => {
    const segs = segsIniciais(clip(0.05, 10));
    expect(segs).toHaveLength(1);
    expect(segs[0].start).toBeCloseTo(0.05, 3);
  });

  it("clipe mais longo que o natural_dur informado não perde o fim", () => {
    const segs = segsIniciais(clip(0, 12, 10));
    expect(segs[segs.length - 1].end).toBeCloseTo(12, 3);
  });
});

describe("dividirEm — mesma regra do dividir no cursor da timeline", () => {
  it("divide o pedaço sob o cursor preservando o keep", () => {
    const segs = dividirEm(segsIniciais(clip(0, 10)), 4);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ start: 0, end: 4, keep: true });
    expect(segs[1]).toMatchObject({ start: 4, end: 10, keep: true });
    expect(segs[0].id).not.toBe(segs[1].id);
  });

  it("colado na borda (< 0,2s) ou fora de tudo: não divide", () => {
    const base = segsIniciais(clip(0, 10));
    expect(dividirEm(base, 0.1)).toBe(base);
    expect(dividirEm(base, 9.95)).toBe(base);
    expect(dividirEm(segsIniciais(clip(2, 7)), 20)).toHaveLength(3);
  });
});

describe("janelasMantidas — o que vira parte", () => {
  it("dividir sem remover nada devolve o clipe INTEIRO (não duas partes)", () => {
    const segs = dividirEm(segsIniciais(clip(1, 9)), 5);
    expect(janelasMantidas(segs)).toEqual([{ src_in: 1, src_out: 9 }]);
  });

  it("tirar o miolo devolve duas partes na ordem", () => {
    let segs = dividirEm(segsIniciais(clip(0, 10)), 3);
    segs = dividirEm(segs, 6);
    segs = segs.map((s) => (s.start === 3 ? { ...s, keep: false } : s));
    expect(janelasMantidas(segs)).toEqual([
      { src_in: 0, src_out: 3 }, { src_in: 6, src_out: 10 },
    ]);
    expect(duracaoMantida(segs)).toBeCloseTo(7, 3);
  });

  it("migalha abaixo do piso é descartada", () => {
    const segs = [
      { id: 1, start: 0, end: 4, keep: true },
      { id: 2, start: 4, end: 4 + MIN_PARTE / 2, keep: true },
    ];
    expect(janelasMantidas(segs)).toEqual([{ src_in: 0, src_out: 4 }]);
  });

  it("tudo removido: nenhuma parte (o botão Concluir fica travado)", () => {
    const segs = segsIniciais(clip(0, 10)).map((s) => ({ ...s, keep: false }));
    expect(janelasMantidas(segs)).toEqual([]);
    expect(duracaoMantida(segs)).toBe(0);
  });
});

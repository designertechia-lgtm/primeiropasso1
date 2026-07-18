/**
 * Prova do relógio mestre (Fase C): `avancarPlayhead` tem de reproduzir o
 * comportamento histórico da prévia (onVideoTime) — pular removidos no play,
 * andar na velocidade do trecho, parar no fim — porque o aceite da fase é
 * "prévia idêntica à atual com 1 fonte".
 */
import { describe, it, expect } from "vitest";
import { avancarPlayhead, speedEm } from "./previewClock";
import type { Segment } from "./types";

const seg = (id: number, start: number, end: number, keep: boolean, speed = 1): Segment =>
  ({ id, start, end, keep, speed });

// timeline: [0,4] keep | [4,8] REMOVIDO | [8,12] keep 0,5×
const SEGS = [seg(1, 0, 4, true, 1), seg(2, 4, 8, false), seg(3, 8, 12, true, 0.5)];

describe("avancarPlayhead — o relógio da prévia da edição", () => {
  it("anda 1:1 dentro de trecho normal", () => {
    const r = avancarPlayhead(1.0, 0.016, SEGS, true, 12);
    expect(r.t).toBeCloseTo(1.016, 4);
    expect(r.fim).toBe(false);
  });

  it("PULA o trecho removido ao cruzar a fronteira (skip do onVideoTime)", () => {
    // 3,99 + 0,05s de tick: consome 0,01 até a fronteira (4,0) e o resto
    // já dentro do trecho lento — que anda a 0,5×
    const r = avancarPlayhead(3.99, 0.05, SEGS, true, 12);
    expect(r.t).toBeCloseTo(8 + 0.04 * 0.5, 3);
    expect(r.fim).toBe(false);
  });

  it("câmera lenta: dt real × 0,5 de avanço na fonte", () => {
    const r = avancarPlayhead(9.0, 0.1, SEGS, true, 12);
    expect(r.t).toBeCloseTo(9.05, 4);
  });

  it("cursor JÁ dentro de removido (seek manual) → salta no play", () => {
    const r = avancarPlayhead(5.0, 0.016, SEGS, true, 12);
    expect(r.t).toBeGreaterThanOrEqual(8);
  });

  it("fim do último trecho keep → para", () => {
    const r = avancarPlayhead(11.99, 0.1, SEGS, true, 12);
    expect(r.fim).toBe(true);
  });

  it("prévia crua (previewEdit off): anda 1:1 e ignora cortes/velocidade", () => {
    const r = avancarPlayhead(5.0, 0.1, SEGS, false, 12);
    expect(r.t).toBeCloseTo(5.1, 4);
    expect(r.fim).toBe(false);
  });

  it("segmentos ESTENDIDOS: o play cruza do último keep para o vídeo emendado", () => {
    // main: keep [0,4], resto removido até 10 (duração do principal); o
    // emendado vira um pseudo-keep em [10,13] — o mesmo salto de trecho
    // removido leva o relógio direto para a emenda
    const ext = [seg(1, 0, 4, true, 1), seg(2, 4, 10, false), seg(9, 10, 13, true, 1)];
    const r = avancarPlayhead(3.99, 0.05, ext, true, 13);
    expect(r.t).toBeGreaterThanOrEqual(10);
    expect(r.fim).toBe(false);
    expect(avancarPlayhead(12.99, 0.1, ext, true, 13).fim).toBe(true);
  });

  it("varrer a timeline inteira visita SÓ os trechos keep, na ordem", () => {
    // simula o play tick a tick e confere que nunca paramos DENTRO de removido
    let t = 0;
    let fim = false;
    let visitouRemovido = false;
    for (let i = 0; i < 2000 && !fim; i++) {
      const r = avancarPlayhead(t, 0.016, SEGS, true, 12);
      t = r.t; fim = r.fim;
      if (t > 4.01 && t < 7.99) visitouRemovido = true;
    }
    expect(visitouRemovido).toBe(false);
    expect(fim).toBe(true);
    expect(t).toBeGreaterThanOrEqual(11.9);
  });
});

describe("speedEm", () => {
  it("velocidade do trecho sob o cursor; 1 na prévia crua", () => {
    expect(speedEm(9, SEGS, true)).toBe(0.5);
    expect(speedEm(1, SEGS, true)).toBe(1);
    expect(speedEm(9, SEGS, false)).toBe(1);
  });
});

/**
 * Roteiro escrito → legendas: se a distribuição errar, a legenda aparece fora
 * de sincronia com o vídeo (ou some no fim). É a conta que decide isso.
 */
import { describe, it, expect } from "vitest";
import { distribuirCues, falasDaResposta } from "./roteiro";

describe("distribuirCues — falas ao longo da janela", () => {
  it("cobre a janela INTEIRA, sem fresta nem transbordo", () => {
    const cues = distribuirCues(["uma fala", "outra fala", "a terceira"], 0, 9);
    expect(cues).toHaveLength(3);
    expect(cues[0].start).toBeCloseTo(0, 2);
    expect(cues[cues.length - 1].end).toBeCloseTo(9, 2);   // termina EXATO no fim
  });

  it("as falas ficam contíguas (o fim de uma é o começo da próxima)", () => {
    const cues = distribuirCues(["a", "bb", "ccc"], 0, 6);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].start).toBeCloseTo(cues[i - 1].end, 2);
    }
  });

  it("fala MAIOR fica mais tempo na tela", () => {
    const [curta, longa] = distribuirCues(
      ["oi", "uma frase bem mais longa que a primeira delas"], 0, 10);
    expect(longa.end - longa.start).toBeGreaterThan(curta.end - curta.start);
  });

  it("respeita a janela quando não começa em zero (narração no cursor)", () => {
    const cues = distribuirCues(["um", "dois"], 4, 10);
    expect(cues[0].start).toBeCloseTo(4, 2);
    expect(cues[cues.length - 1].end).toBeCloseTo(10, 2);
  });

  it("texto vazio ou janela curta demais não vira legenda", () => {
    expect(distribuirCues([], 0, 10)).toEqual([]);
    expect(distribuirCues(["   ", ""], 0, 10)).toEqual([]);
    expect(distribuirCues(["oi"], 0, 0.1)).toEqual([]);
  });

  it("fala curtíssima não recebe um piscar de tempo", () => {
    // sem o piso, "Sim." entre falas longas ficaria com ~0,1s — ilegível
    const cues = distribuirCues(
      ["Sim.", "agora uma fala consideravelmente mais longa para puxar o peso"], 0, 12);
    expect(cues[0].end - cues[0].start).toBeGreaterThan(0.5);
  });
});

describe("falasDaResposta — o que a IA devolveu vira lista de falas", () => {
  it("caminho feliz: array JSON de strings", () => {
    expect(falasDaResposta(["primeira", "segunda"])).toEqual(["primeira", "segunda"]);
  });

  it("descarta vazios e espaços", () => {
    expect(falasDaResposta(["ok", "  ", "", "fim"])).toEqual(["ok", "fim"]);
  });

  it("rede de segurança: modelo respondeu texto corrido em vez de JSON", () => {
    expect(falasDaResposta("linha um\nlinha dois")).toEqual(["linha um", "linha dois"]);
  });

  it("tira marcadores de lista que o modelo às vezes inventa", () => {
    expect(falasDaResposta("- primeira\n2. segunda\n• terceira"))
      .toEqual(["primeira", "segunda", "terceira"]);
  });

  it("resposta nula não quebra a tela", () => {
    expect(falasDaResposta(null)).toEqual([]);
    expect(falasDaResposta(undefined)).toEqual([]);
  });
});

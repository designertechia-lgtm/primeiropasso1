/**
 * Contas do ROTEIRO ESCRITO (aba Legendas) — puras, para o teste cobrir sem
 * montar componente.
 *
 * O caminho "texto escrito" existe para vídeo SEM fala (b-roll, tela gravada)
 * ou para quem prefere escrever a legenda em vez de transcrever. A IA devolve
 * as FALAS já quebradas; o TEMPO de cada uma sai daqui, não dela — modelo de
 * linguagem não tem como saber quanto tempo o vídeo tem.
 */
import type { Cue } from "./types";

/** Piso de duração de uma fala na tela: abaixo disso ninguém lê. */
export const MIN_FALA = 0.6;

/**
 * Distribui as falas na janela [inicio, fim], proporcionalmente ao TAMANHO de
 * cada uma — fala maior fica mais tempo na tela, que é como legenda funciona.
 *
 * O piso de 8 caracteres evita que uma fala de 2 letras ("Sim.") receba um
 * piscar de tempo; e a última fala termina EXATAMENTE em `fim` para não sobrar
 * fresta no fim do vídeo por acúmulo de arredondamento.
 */
export function distribuirCues(falas: string[], inicio: number, fim: number): Cue[] {
  const limpas = falas.map((f) => f.trim()).filter(Boolean);
  if (!limpas.length || fim - inicio < 0.3) return [];
  const peso = (t: string) => Math.max(8, t.length);
  const total = limpas.reduce((a, f) => a + peso(f), 0);
  const out: Cue[] = [];
  let t = inicio;
  limpas.forEach((texto, i) => {
    const fatia = (peso(texto) / total) * (fim - inicio);
    const end = i === limpas.length - 1 ? fim : t + fatia;
    out.push({
      start: Number(t.toFixed(2)),
      end: Number(Math.max(end, t + Math.min(MIN_FALA, fim - t)).toFixed(2)),
      text: texto,
    });
    t = end;
  });
  return out;
}

/**
 * O que a IA devolveu vira lista de falas. O caminho feliz é um array JSON de
 * strings; a rede de segurança cobre o modelo que responde texto corrido —
 * aí cada linha é uma fala, e marcadores de lista ("- ", "1. ") saem fora.
 */
export function falasDaResposta(bruto: unknown): string[] {
  if (Array.isArray(bruto)) {
    return bruto.map((f) => String(f ?? "").trim()).filter(Boolean);
  }
  return String(bruto ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

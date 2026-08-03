/**
 * Contas do CORTADOR de clipe da sequência (SeqTrimDialog) — puras, para o teste
 * cobrir sem montar componente.
 *
 * O clipe emendado guarda UMA janela contínua da fonte (src_in/src_out). Cortar
 * o miolo dele produz VÁRIAS janelas — e cada janela vira um SeqClip da mesma
 * fonte ("parte 1", "parte 2"). Nada muda no formato do documento: partes são
 * apenas mais clipes na sequência, e o adaptador já emenda partes da mesma fonte
 * em corte seco (tracksModel.posicionarSeqs).
 */
import type { SeqClip } from "./types";

/** Um pedaço da FONTE dentro do cortador: mantido (entra no vídeo) ou não. */
export type TrimSeg = { id: number; start: number; end: number; keep: boolean };

/** Piso de duração de uma parte — o mesmo do adaptador (docFlatToTracks). */
export const MIN_PARTE = 0.15;
/** Margem mínima para dividir: espelha o splitAtPlayhead da timeline principal. */
export const MARGEM_DIVISAO = 0.2;

/** Partição inicial da fonte a partir da janela atual do clipe: o que está fora
 *  de [src_in, src_out] entra como removido (dá para restaurar dentro do
 *  cortador — reabrir uma "parte" mostra a fonte inteira com a janela dela). */
export function segsIniciais(
  clip: Pick<SeqClip, "src_in" | "src_out" | "natural_dur">,
): TrimSeg[] {
  const dur = Math.max(clip.natural_dur, clip.src_out);
  const a = Math.max(0, Math.min(clip.src_in, dur));
  const b = Math.max(a, Math.min(clip.src_out, dur));
  const segs: TrimSeg[] = [];
  let id = 1;
  if (a > MIN_PARTE) segs.push({ id: id++, start: 0, end: a, keep: false });
  segs.push({ id: id++, start: a, end: b, keep: true });
  if (dur - b > MIN_PARTE) segs.push({ id: id++, start: b, end: dur, keep: false });
  return segs;
}

/** Divide em `t` o pedaço que contém o cursor. Fora de qualquer pedaço, ou colado
 *  demais numa borda, devolve a lista intacta (o chamador avisa o usuário). */
export function dividirEm(segs: TrimSeg[], t: number): TrimSeg[] {
  const alvo = segs.find((s) => t > s.start + MARGEM_DIVISAO && t < s.end - MARGEM_DIVISAO);
  if (!alvo) return segs;
  let nid = Math.max(0, ...segs.map((s) => s.id)) + 1;
  const out: TrimSeg[] = [];
  for (const s of segs) {
    if (s.id === alvo.id) {
      out.push({ ...s, end: t });
      out.push({ id: nid++, start: t, end: s.end, keep: s.keep });
    } else out.push(s);
  }
  return out;
}

/** As janelas que vão virar partes: mantidas, em ordem, sem migalhas. Pedaços
 *  mantidos ENCOSTADOS viram uma janela só (dividir e não remover nada tem de
 *  devolver o clipe inteiro, não duas partes iguais emendadas). */
export function janelasMantidas(segs: TrimSeg[]): { src_in: number; src_out: number }[] {
  const keep = segs.filter((s) => s.keep && s.end - s.start >= MIN_PARTE)
    .sort((a, b) => a.start - b.start);
  const out: { src_in: number; src_out: number }[] = [];
  for (const s of keep) {
    const ultimo = out[out.length - 1];
    if (ultimo && s.start - ultimo.src_out < 1e-3) ultimo.src_out = s.end;
    else out.push({ src_in: s.start, src_out: s.end });
  }
  return out;
}

/** Duração somada das partes mantidas (o "vai ficar com X" do cortador). */
export function duracaoMantida(segs: TrimSeg[]): number {
  return janelasMantidas(segs).reduce((a, j) => a + (j.src_out - j.src_in), 0);
}

/**
 * Filtros de cor (spec 17) e transições (spec 16).
 *
 * ESPELHO de `video-api/services/video_editor.py` (FILTROS, TRANSICOES).
 * Cada preset é a MESMA sequência de operações do CSS filter que o motor
 * aplica como matriz equivalente — por isso a prévia no player (`filter: ...`
 * no <video>) e o render (ffmpeg) dão a mesma cor. Provado pixel a pixel
 * contra o ffmpeg real: desvio máximo de 3/255 nos 10 presets.
 * Mudou no motor, muda aqui.
 */

export type FiltroOp =
  | ["grayscale", number] | ["sepia", number] | ["saturate", number]
  | ["contrast", number] | ["brightness", number];

export const FILTROS: Record<string, { label: string; ops: FiltroOp[] }> = {
  nenhum:   { label: "Sem filtro", ops: [] },
  pb:       { label: "Preto e branco", ops: [["grayscale", 1.0]] },
  cinema:   { label: "Cinema", ops: [["sepia", 0.10], ["saturate", 0.85], ["contrast", 1.15]] },
  retro:    { label: "Retrô", ops: [["sepia", 0.45], ["saturate", 0.90], ["contrast", 1.10]] },
  natureza: { label: "Natureza", ops: [["saturate", 1.35], ["contrast", 1.05]] },
  neon:     { label: "Neon", ops: [["saturate", 1.60], ["contrast", 1.20]] },
  verao:    { label: "Verão", ops: [["sepia", 0.12], ["saturate", 1.25], ["brightness", 1.08]] },
  inverno:  { label: "Inverno", ops: [["saturate", 0.85], ["brightness", 1.06], ["contrast", 1.05]] },
  food:     { label: "Food", ops: [["sepia", 0.08], ["saturate", 1.30], ["contrast", 1.08]] },
  vlog:     { label: "Vlog", ops: [["saturate", 1.15], ["contrast", 1.10], ["brightness", 1.03]] },
};

export const FILTRO_IDS = Object.keys(FILTROS);

/** String pronta para `style.filter` — mesma ordem das ops do motor. */
export function filtroCss(id: string): string {
  const ops = FILTROS[id]?.ops ?? [];
  if (!ops.length) return "none";
  return ops.map(([nome, k]) => `${nome}(${k})`).join(" ");
}

/**
 * Efeitos visuais (spec 15) — espelho de EFEITOS no motor.
 * Diferente dos filtros de cor, estes NÃO têm prévia ao vivo: VHS, granulado e
 * glitch não têm equivalente fiel em CSS, e aproximar faria a prévia mentir.
 * A prévia deles é a AMOSTRA REAL (GET /editor/amostra) — o frame do próprio
 * vídeo passado pelo ffmpeg.
 * Fora de propósito: partículas/chuva/fogo/raios (precisam de vídeos de
 * overlay) e estilo anime (precisa de modelo de IA).
 */
export const EFEITOS: { id: string; label: string }[] = [
  { id: "nenhum", label: "Sem efeito" },
  { id: "blur", label: "Desfoque" },
  { id: "film", label: "Granulado" },
  { id: "vinheta", label: "Vinheta" },
  { id: "rgb", label: "RGB split" },
  { id: "shake", label: "Tremido" },
  { id: "vhs", label: "VHS" },
  { id: "glitch", label: "Glitch" },
];

/** Transições: o painel manda a chave; o motor traduz para o xfade.
 *  "spin" e "3D" da spec não existem no xfade e ficaram de fora. */
export const TRANSICOES: { id: string; label: string }[] = [
  { id: "none", label: "Corte seco" },
  { id: "fade", label: "Suave (crossfade)" },
  { id: "dissolve", label: "Dissolver" },
  { id: "zoom", label: "Zoom" },
  { id: "flash", label: "Flash" },
  { id: "slide", label: "Deslizar" },
  { id: "blur", label: "Desfoque" },
  { id: "warp", label: "Warp" },
  { id: "pixel", label: "Pixelizar" },
];

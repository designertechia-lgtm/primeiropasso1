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

// ── Opções de exportação (spec 22) — espelho de video_editor.py ──
// Resolução vale para o lado MENOR (720p 9:16 = 720x1280). Teto 1080p:
// 2K/4K custam demais no worker e o público posta em rede social.
export const EXPORT_RESOLUCOES = [
  { id: "480p", label: "480p" }, { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p (máx)" },
];
export const EXPORT_FPS = [24, 25, 30, 50, 60];
export const EXPORT_CODECS = [
  { id: "h264", label: "H.264 (compatível com tudo)" },
  { id: "h265", label: "H.265 (menor, mas nem todo app abre)" },
];
export const EXPORT_FORMATOS = [
  { id: "mp4", label: "MP4" }, { id: "mov", label: "MOV" },
  { id: "gif", label: "GIF (sem áudio, curto)" },
];

/** Transições: o painel manda a chave; o motor traduz para o xfade.
 *
 *  ESPELHO de `video-api/services/video_editor.py` (TRANSICOES) — mudou lá,
 *  muda aqui. Cada chave foi PROVADA num render real do ffmpeg antes de entrar
 *  (o frame do meio tem de diferir dos dois lados). Ficaram FORA de propósito:
 *  "fadegrain" (não implementada na build do worker), "distance" (degenerada) e
 *  spin/3D (não existem no xfade) — melhor não ter do que entregar outra coisa.
 *
 *  As 9 primeiras são as chaves HISTÓRICAS: projetos salvos as usam, então os
 *  ids nunca mudam (só o rótulo pode evoluir).
 *
 *  `familia` agrupa os cartões na tela; `anim` é a classe da miniatura animada
 *  (ver `transicaoDemoClass`) — ilustração do movimento, não prévia do vídeo. */
export type TransicaoFamilia = "basica" | "movimento" | "forma" | "efeito";

export const TRANSICOES: {
  id: string; label: string; familia: TransicaoFamilia; anim: string;
}[] = [
  // básicas
  { id: "none", label: "Corte seco", familia: "basica", anim: "corte" },
  { id: "fade", label: "Suave", familia: "basica", anim: "fade" },
  { id: "dissolve", label: "Dissolver", familia: "basica", anim: "fade" },
  { id: "escurecer", label: "Escurecer", familia: "basica", anim: "preto" },
  { id: "flash", label: "Flash", familia: "basica", anim: "branco" },
  // movimento
  { id: "slide", label: "Deslizar ←", familia: "movimento", anim: "desl-esq" },
  { id: "slide_dir", label: "Deslizar →", familia: "movimento", anim: "desl-dir" },
  { id: "slide_cima", label: "Deslizar ↑", familia: "movimento", anim: "desl-cima" },
  { id: "slide_baixo", label: "Deslizar ↓", familia: "movimento", anim: "desl-baixo" },
  { id: "suave_esq", label: "Suave ←", familia: "movimento", anim: "desl-esq" },
  { id: "suave_dir", label: "Suave →", familia: "movimento", anim: "desl-dir" },
  { id: "empurrar", label: "Empurrar", familia: "movimento", anim: "desl-esq" },
  { id: "revelar", label: "Revelar", familia: "movimento", anim: "desl-dir" },
  // formas
  { id: "varrer_esq", label: "Varrer ←", familia: "forma", anim: "varre-esq" },
  { id: "varrer_dir", label: "Varrer →", familia: "forma", anim: "varre-dir" },
  { id: "varrer_cima", label: "Varrer ↑", familia: "forma", anim: "varre-cima" },
  { id: "varrer_baixo", label: "Varrer ↓", familia: "forma", anim: "varre-baixo" },
  { id: "circulo_abre", label: "Círculo abre", familia: "forma", anim: "circ-abre" },
  { id: "circulo_fecha", label: "Círculo fecha", familia: "forma", anim: "circ-fecha" },
  { id: "iris", label: "Íris", familia: "forma", anim: "circ-abre" },
  { id: "radial", label: "Radial", familia: "forma", anim: "varre-dir" },
  { id: "diagonal", label: "Diagonal", familia: "forma", anim: "diag" },
  // efeito
  { id: "zoom", label: "Zoom", familia: "efeito", anim: "zoom" },
  { id: "blur", label: "Desfoque", familia: "efeito", anim: "blur" },
  { id: "pixel", label: "Pixelizar", familia: "efeito", anim: "pixel" },
  { id: "warp", label: "Espremer", familia: "efeito", anim: "espreme" },
  { id: "fatias", label: "Fatias", familia: "efeito", anim: "fatias" },
  { id: "vento", label: "Vento", familia: "efeito", anim: "varre-dir" },
];

export const TRANSICAO_FAMILIAS: { id: TransicaoFamilia; label: string }[] = [
  { id: "basica", label: "Básicas" },
  { id: "movimento", label: "Movimento" },
  { id: "forma", label: "Formas" },
  { id: "efeito", label: "Efeito" },
];

/** Rótulo de uma chave — inclusive de projeto antigo cuja chave saiu do catálogo. */
export function transicaoLabel(id: string): string {
  return TRANSICOES.find((t) => t.id === id)?.label ?? "Corte seco";
}

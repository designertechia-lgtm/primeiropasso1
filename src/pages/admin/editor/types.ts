/**
 * Editor de Vídeo — tipos e helpers puros (Fase 0 das fundações, 14/07).
 * Código SEPARADO do Institucional e do Criar Vídeo (regra do projeto):
 * nada aqui importa de outros motores de vídeo.
 */

export const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";
export const EDITOR_STORAGE_KEY = "pp-editor-video";

// Versão do contrato front ↔ worker (ver EDITOR_CONTRACT_VERSION no video-api).
// Incidente Rodada 8: worker antigo ignorava campos novos do render em
// silêncio — agora o payload declara a versão esperada e o worker recusa o
// que não entende, com mensagem clara.
export const EDITOR_CONTRACT_VERSION = 2;

export type Segment = { id: number; start: number; end: number; keep: boolean };
export type EditMeta = {
  edit_id: string; duration: number; width: number; height: number;
  has_audio: boolean; thumbs: string[]; preview_url?: string;
};
export type Cue = { start: number; end: number; text: string };
export type SubSize = "p" | "m" | "g" | "xg";
export type SubStyle = "outline" | "box";
export type SubPos = "bottom" | "center" | "top";
// Textos aceitam também o canto esquerdo (estilo selo/lower-third — Carlos 06/07)
export type TitlePos = SubPos | "left-bottom" | "left-center" | "left-top";
export type Title = {
  start: number; end: number; text: string; font_id: string;
  size: SubSize; color: string; style: SubStyle; position: TitlePos;
};

// Stickers/sobreposições: imagem, GIF ou WebM-alpha sobre o vídeo, com posição
// (centro em % da tela), tamanho, movimento e loop. id = uuid (Date.now()
// colidia em uploads seguidos).
export type StickerMovement = "none" | "walk-right" | "walk-left";
export type Sticker = {
  id: string; upload_id: string; name: string; animated: boolean;
  natural_dur: number; start: number; end: number;
  x_pct: number; y_pct: number; scale_pct: number;
  movement: StickerMovement; loop: boolean; flip: boolean;
};
// Clipes de áudio POSICIONADOS (efeito sonoro/narração em ponto exato) —
// diferentes da trilha global: cada um tem início/fim/volume próprios.
export type AudioClip = {
  id: string; upload_id: string; name: string; natural_dur: number;
  start: number; end: number; volume: number;
};
// Job de geração de sticker por IA — persistido pra sobreviver à navegação
export type StickerJob = { job_id: string; at: number; desc: string };

export const newId = (): string =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const STICKER_SIZES: { value: number; label: string }[] = [
  { value: 0.12, label: "P" }, { value: 0.22, label: "M" },
  { value: 0.32, label: "G" }, { value: 0.45, label: "XG" },
];
export const STICKER_POSITIONS = [
  { key: "id", label: "Canto inf. direito", x: 0.84, y: 0.76 },
  { key: "ie", label: "Canto inf. esquerdo", x: 0.16, y: 0.76 },
  { key: "sd", label: "Canto sup. direito", x: 0.84, y: 0.18 },
  { key: "se", label: "Canto sup. esquerdo", x: 0.16, y: 0.18 },
  { key: "c", label: "Centro", x: 0.5, y: 0.5 },
  { key: "cb", label: "Centro embaixo", x: 0.5, y: 0.78 },
];

export const SUB_PRESETS = [
  { label: "🔥 Viral amarelo", font: "anton", size: "g" as SubSize, color: "#FFE14D", style: "box" as SubStyle, pos: "bottom" as SubPos },
  { label: "✨ Clean branco", font: "poppins", size: "m" as SubSize, color: "#FFFFFF", style: "outline" as SubStyle, pos: "bottom" as SubPos },
  { label: "📱 TikTok caixa", font: "bevietnam", size: "g" as SubSize, color: "#FFFFFF", style: "box" as SubStyle, pos: "bottom" as SubPos },
  { label: "🎬 Cinema", font: "bebas", size: "m" as SubSize, color: "#F5F5F5", style: "outline" as SubStyle, pos: "bottom" as SubPos },
];

// Espelho do agrupamento do backend — reagrupa words em cues sem nova transcrição
export const groupWords = (ws: Cue[], mode: "frases" | "karaoke"): Cue[] => {
  const maxW = mode === "karaoke" ? 3 : 6;
  const maxC = mode === "karaoke" ? 22 : 42;
  const cues: Cue[] = [];
  let cur: Cue[] = [];
  const flush = () => {
    if (cur.length) cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((x) => x.text).join(" ") });
    cur = [];
  };
  for (const w of ws) {
    if (cur.length && (cur.length >= maxW || w.start - cur[cur.length - 1].end > 0.6 ||
        cur.reduce((a, x) => a + x.text.length + 1, 0) + w.text.length > maxC)) flush();
    cur.push(w);
  }
  flush();
  return cues;
};

export const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toFixed(1).padStart(4, "0")}`;
};
export const parseTime = (v: string): number | null => {
  const t = v.trim().replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const m = t.match(/^(\d+):(\d{1,2}(\.\d+)?)$/);
  if (m) return parseInt(m[1]) * 60 + parseFloat(m[2]);
  return null;
};

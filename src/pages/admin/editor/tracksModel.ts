/**
 * Modelo MULTI-TRACK (Fase A das fundações — reescrita para clipes livres).
 *
 * Hoje o editor é "1 vídeo particionado" (EditorDoc.segments + arrays planos de
 * texto/sticker/áudio, tudo em tempo ABSOLUTO de uma fonte única). O alvo é
 * "N faixas de clipes livres" (tipo CapCut). Este módulo é a PONTE:
 *   - os TIPOS do modelo novo (Track/Clip),
 *   - `timelineFinalDe` = a fórmula histórica original→final (offset + velocidade
 *     + xfade) EXTRAÍDA UMA VEZ, espelhando o motor (remap_cues/_norm_segments/
 *     _concat_fade). Congelada aqui e nunca reimplementada à mão,
 *   - `docFlatToTracks` = converte o doc flat v8 em faixas (adaptador puro),
 *   - `tracksToRenderV9` = payload do render v9.
 *
 * NADA disto está ligado ao editor ainda (Fase A é invisível). Serve para provar
 * que a conversão bate com o motor v8 provado, antes de qualquer troca.
 */
import { XFADE_DUR } from "./types";
import type {
  Segment, Cue, Title, Sticker, AudioClip, SubSize, SubStyle, TitlePos,
  AnimIn, AnimOut, AnimLoop,
} from "./types";
import type { EditorDoc } from "./documentReducer";

// ── Tipos do modelo novo ─────────────────────────────────────────────────────

/** x,y = centro do clipe em fração da tela [0..1]; escala = fração da largura do
 *  canvas; opacidade 0..1; giro em graus. Espelha o que o overlay do motor faz. */
export type Transform = {
  x: number; y: number; escala: number; opacidade: number; giro: number;
};

export const TRANSFORM_NEUTRO: Transform = { x: 0.5, y: 0.5, escala: 1, opacidade: 1, giro: 0 };

/** Posição na timeline FINAL (do vídeo de saída) — é DADO DE ENTRADA, não mais
 *  derivado dos cortes de uma fonte como no modelo flat. */
type ClipBase = { id: string; timeline_start: number; timeline_end: number };

export type VideoClip = ClipBase & {
  kind: "video";
  source_id: string;         // qual fonte (edit_id) este clipe recorta
  src_in: number;            // trim dentro do arquivo-fonte
  src_out: number;
  speed: number;
  volume: number;            // volume do áudio embutido do vídeo
  transform: Transform;      // z=0 (base) usa o neutro; PiP usa posição/escala
  filtro: string;
  efeito: string;
  transition_in?: string;    // emenda com o clipe ANTERIOR da mesma faixa
};

export type AudioClipT = ClipBase & {
  kind: "audio";
  source_id: string;
  src_in: number;
  src_out: number;
  volume: number;
  fadeIn?: boolean;
  fadeOut?: boolean;
  ducking?: boolean;         // esta trilha abaixa quando há voz
  loop?: boolean;
};

export type TextClip = ClipBase & {
  kind: "text";
  text: string;
  font_id: string;
  size: SubSize;
  color: string;
  style: SubStyle;
  position: TitlePos;
  anim_in?: AnimIn;
  anim_out?: AnimOut;
  anim_loop?: AnimLoop;
  karaoke?: boolean;
  words?: Cue[];             // tempos por palavra (já na timeline final)
};

export type Clip = VideoClip | AudioClipT | TextClip;

export type Track = {
  id: string;
  kind: "video" | "audio" | "text";
  z: number;                 // ordem de empilhamento (0 = base)
  mute?: boolean;
  hidden?: boolean;
  locked?: boolean;
  clips: Clip[];
};

const uid = (p: string, i: number) => `${p}${i}`;

// ── timelineFinalDe: a fórmula original→final, CONGELADA (espelha o motor) ────
// _norm_segments (video_editor.py): funde só trechos contíguos de MESMA
// velocidade; _concat_fade: o crossfade encurta a timeline em xf por emenda, e
// xf é clampado ao menor trecho FINAL; remap_cues: offset += (b-a)/speed - xf.

export type SegFinal = {
  seg: Segment;              // o trecho keep original
  finalStart: number;       // onde ele começa na timeline de saída
  speed: number;
};

/** Recebe os segmentos keep (na ordem) + se há transição + a duração da intro,
 *  e devolve, para cada trecho, onde ele cai na timeline final. É a ÚNICA
 *  implementação da conta — front e (na Fase B) o motor v9 leem daqui. */
export function timelineFinalDe(
  keep: Segment[], transitionOn: boolean, introDur = 0,
): { segs: SegFinal[]; xf: number; totalFinal: number } {
  // duração final de cada trecho, já com a velocidade
  const dur = keep.map((s) => (s.end - s.start) / (s.speed ?? 1));
  // xf clampado ao menor trecho final (espelha video_editor.py:1363)
  const xf = transitionOn && keep.length > 1
    ? Math.min(XFADE_DUR, Math.max(0.1, Math.min(...dur) * 0.9))
    : 0;
  // a intro consome xf ao emendar com o 1º trecho (video_editor.py:1387)
  const head = Math.max(0, introDur - (xf && introDur ? xf : 0));

  const segs: SegFinal[] = [];
  let offset = head;
  keep.forEach((s, i) => {
    segs.push({ seg: s, finalStart: offset, speed: s.speed ?? 1 });
    // último trecho não subtrai xf (não há emenda depois) — remap_cues:486
    offset += dur[i] - (i < keep.length - 1 ? xf : 0);
  });
  return { segs, xf, totalFinal: offset };
}

/** Mapeia um instante `t` da timeline ORIGINAL (fonte única) → timeline final,
 *  se ele cai num trecho keep. Espelha remap_cues:469 `(t-a)/speed + finalStart`. */
export function origToFinal(t: number, segs: SegFinal[]): number | null {
  for (const { seg, finalStart, speed } of segs) {
    if (t >= seg.start - 1e-6 && t <= seg.end + 1e-6) {
      return (t - seg.start) / speed + finalStart;
    }
  }
  return null;
}

// ── docFlatToTracks: o doc flat v8 → faixas (adaptador puro) ──────────────────

/** Converte o EditorDoc atual (1 vídeo particionado) no modelo de faixas.
 *  Reversível/derivável: não perde informação, só reexpressa em timeline final.
 *  `sourceId` = a fonte única do doc (meta.edit_id). */
export function docFlatToTracks(doc: EditorDoc, sourceId: string): Track[] {
  const keep = doc.segments.filter((s) => s.keep);
  const introDur = doc.introOn ? doc.introDur : 0;
  const { segs } = timelineFinalDe(keep, doc.transition !== "none", introDur);

  // faixa base de vídeo (z=0): cada trecho keep vira um VideoClip da fonte única
  const videoBase: VideoClip[] = segs.map(({ seg, finalStart, speed }, i) => ({
    id: uid("v", i), kind: "video", source_id: sourceId,
    src_in: seg.start, src_out: seg.end, speed,
    timeline_start: finalStart,
    timeline_end: finalStart + (seg.end - seg.start) / speed,
    volume: doc.originalVolume / 100,
    transform: { ...TRANSFORM_NEUTRO },
    filtro: doc.filtro, efeito: doc.efeito,
    transition_in: i > 0 ? doc.transition : undefined,
  }));

  // textos e legendas → TextClips (posição já na timeline final).
  // origToFinal em start E end aplica a velocidade nos dois (esticam com o
  // trecho, como remap_cues). Caso raro de item ATRAVESSANDO um corte (o motor
  // quebra em pedaços) fica para a Fase B — aqui vale o caso que cabe num
  // trecho, que é o comum.
  const textClips: TextClip[] = [];
  const push = (start: number, end: number, base: Omit<TextClip, "id" | "kind" | "timeline_start" | "timeline_end">) => {
    const fs = origToFinal(start, segs);
    if (fs === null) return;
    const fe = origToFinal(end, segs);
    textClips.push({
      ...base, id: uid("t", textClips.length), kind: "text",
      timeline_start: fs, timeline_end: fe ?? fs + (end - start),
    });
  };
  for (const t of doc.titles as Title[]) {
    push(t.start, t.end, {
      text: t.text, font_id: t.font_id, size: t.size, color: t.color,
      style: t.style, position: t.position,
      anim_in: t.anim_in, anim_out: t.anim_out, anim_loop: t.anim_loop,
    });
  }
  if (doc.subsOn) {
    for (const c of doc.cues as Cue[]) {
      push(c.start, c.end, {
        text: c.text, font_id: doc.subFont, size: doc.subSize, color: doc.subColor,
        style: doc.subStyle, position: doc.subPos as TitlePos,
        karaoke: doc.cueMode === "karaoke",
        words: doc.cueMode === "karaoke"
          ? doc.words.filter((w) => w.start >= c.start - 0.01 && w.end <= c.end + 0.01)
          : undefined,
      });
    }
  }

  // stickers → clipes de vídeo PiP. estica=True no motor: o sticker acompanha a
  // velocidade do trecho — por isso o fim também passa por origToFinal.
  const stickerClips: VideoClip[] = (doc.stickers as Sticker[]).map((s, i) => {
    const fs = origToFinal(s.start, segs);
    const fe = origToFinal(s.end, segs);
    const start = fs ?? s.start;
    return {
      id: uid("s", i), kind: "video", source_id: s.upload_id,
      src_in: 0, src_out: s.natural_dur || (s.end - s.start), speed: 1, volume: 0,
      timeline_start: start,
      timeline_end: fe ?? start + (s.end - s.start),
      transform: { x: s.x_pct, y: s.y_pct, escala: s.scale_pct, opacidade: 1,
                   giro: s.flip ? 180 : 0 },
      filtro: "nenhum", efeito: "nenhum",
    };
  });

  // áudio: clipes posicionados (narração/efeito) — 1 span contínuo por clipe
  const audioClips: AudioClipT[] = (doc.audioClips as AudioClip[]).map((c, i) => {
    const fs = origToFinal(c.start, segs);
    return {
      id: uid("a", i), kind: "audio", source_id: c.upload_id,
      src_in: 0, src_out: c.natural_dur || (c.end - c.start),
      timeline_start: fs ?? c.start,
      timeline_end: (fs ?? c.start) + (c.end - c.start),
      volume: c.volume,
    };
  });

  const tracks: Track[] = [{ id: "video-base", kind: "video", z: 0, clips: videoBase }];
  if (stickerClips.length) tracks.push({ id: "video-pip", kind: "video", z: 1, clips: stickerClips });
  if (textClips.length) tracks.push({ id: "text", kind: "text", z: 2, clips: textClips });
  if (audioClips.length) tracks.push({ id: "audio", kind: "audio", z: 0, clips: audioClips });
  return tracks;
}

/** Payload do render v9 (Fase B). Por ora só serializa o modelo; o worker v9
 *  ainda não existe — isto é a forma que ele vai receber. */
export function tracksToRenderV9(doc: EditorDoc, sourceId: string, canvasW: number, canvasH: number) {
  return {
    canvas_w: canvasW,
    canvas_h: canvasH,
    tracks: docFlatToTracks(doc, sourceId),
  };
}

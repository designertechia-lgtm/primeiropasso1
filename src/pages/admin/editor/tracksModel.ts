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
  Segment, Cue, Title, Sticker, AudioClip, PipClip, SubSize, SubStyle, TitlePos,
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
  // herança do sticker (PiP): travessia da tela e loop do gif/webm — o motor
  // v9 usa para reproduzir o overlay do v8 tal e qual
  movement?: string;
  loop?: boolean;
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
  extraDurs: number[] = [],
): { segs: SegFinal[]; xf: number; totalFinal: number } {
  // duração final de cada trecho, já com a velocidade
  const dur = keep.map((s) => (s.end - s.start) / (s.speed ?? 1));
  // xf clampado ao menor trecho final (espelha video_editor.py:1405). No motor
  // a capa de entrada é um PART: com intro ligada, até 1 trecho só crossfada
  // (parts > 1) — e a intro (>= 1s) nunca é quem clampa (0,9s > XFADE 0,4s).
  // extraDurs = vídeos EMENDADOS no fim: também são parts — um emendado curto
  // clampa o xf de TODAS as emendas, como no motor (min sobre todas as parts).
  const xf = transitionOn && (keep.length + extraDurs.length > 1 || introDur > 0)
    ? Math.min(XFADE_DUR, Math.max(0.1, Math.min(...dur, ...extraDurs) * 0.9))
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
  const seqs = (doc.seqClips ?? []).filter((c) => c.src_out - c.src_in >= 0.15);
  const { segs, xf, totalFinal } = timelineFinalDe(
    keep, doc.transition !== "none", introDur,
    seqs.map((c) => c.src_out - c.src_in));

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

  // vídeos EMENDADOS no fim (Fase F): continuam a faixa base depois do último
  // trecho. Cada emenda desconta xf (o remap não subtraía no ÚLTIMO keep
  // porque não havia nada depois — agora há). Filtro/efeito/volume globais
  // valem para eles também (a edição é uma só).
  let cursorSeq = totalFinal - (seqs.length && xf ? xf : 0);
  seqs.forEach((c, i) => {
    const d = c.src_out - c.src_in;
    videoBase.push({
      id: uid("q", i), kind: "video", source_id: c.edit_id,
      src_in: c.src_in, src_out: c.src_out, speed: 1,
      timeline_start: cursorSeq, timeline_end: cursorSeq + d,
      volume: doc.originalVolume / 100,
      transform: { ...TRANSFORM_NEUTRO },
      filtro: doc.filtro, efeito: doc.efeito,
      transition_in: doc.transition !== "none" ? doc.transition : undefined,
    });
    cursorSeq += d - (i < seqs.length - 1 ? xf : 0);
  });

  // textos e legendas → TextClips (posição já na timeline final), em FAIXAS
  // SEPARADAS: "text" = títulos (estilo por clipe + animações), "subs" =
  // legendas (estilo único + karaokê) — o motor v9 trata cada papel como o v8.
  // ESPELHO EXATO do remap_cues: o item é recortado POR TRECHO keep — item
  // atravessando um corte vira pedaços (contíguos na timeline final) e item
  // começando dentro de removido preserva só a parte visível (antes o adaptador
  // descartava — divergia do v8).
  const textClips: TextClip[] = [];
  const subClips: TextClip[] = [];
  const push = (alvo: TextClip[], start: number, end: number, words: Cue[] | undefined,
                base: Omit<TextClip, "id" | "kind" | "timeline_start" | "timeline_end" | "words">) => {
    for (const { seg, finalStart, speed } of segs) {
      const s = Math.max(start, seg.start);
      const e = Math.min(end, seg.end);
      if (e - s < 0.15) continue;   // mesmo piso do remap_cues (:510)
      // words presas à janela do pedaço e na timeline FINAL (remap_cues:520);
      // pedaço sem palavra vai SEM words — o \k cai na divisão proporcional
      const dentro = (words ?? []).filter((w) => w.end > s && w.start < e);
      alvo.push({
        ...base, id: uid(alvo === subClips ? "c" : "t", alvo.length), kind: "text",
        timeline_start: (s - seg.start) / speed + finalStart,
        timeline_end: (e - seg.start) / speed + finalStart,
        words: dentro.length
          ? dentro.map((w) => ({
              start: (Math.max(w.start, s) - seg.start) / speed + finalStart,
              end: (Math.min(w.end, e) - seg.start) / speed + finalStart,
              text: w.text,
            }))
          : undefined,
      });
    }
  };
  for (const t of doc.titles as Title[]) {
    push(textClips, t.start, t.end, undefined, {
      text: t.text, font_id: t.font_id, size: t.size, color: t.color,
      style: t.style, position: t.position,
      anim_in: t.anim_in, anim_out: t.anim_out, anim_loop: t.anim_loop,
    });
  }
  if (doc.subsOn) {
    for (const c of doc.cues as Cue[]) {
      push(subClips, c.start, c.end,
        doc.cueMode === "karaoke"
          ? doc.words.filter((w) => w.start >= c.start - 0.01 && w.end <= c.end + 0.01)
          : undefined,
        {
          text: c.text, font_id: doc.subFont, size: doc.subSize, color: doc.subColor,
          style: doc.subStyle, position: doc.subPos as TitlePos,
          karaoke: doc.cueMode === "karaoke",
        });
    }
  }

  // stickers → clipes de vídeo PiP. ESPELHO do remap_spans (estica=True): o
  // sticker acompanha os cortes E a velocidade — atravessado por um corte vira
  // PEDAÇOS (src_in retoma no ponto certo), num trecho lento estica junto.
  const stickerClips: VideoClip[] = [];
  for (const s of doc.stickers as Sticker[]) {
    for (const { seg, finalStart, speed } of segs) {
      const a = Math.max(s.start, seg.start);
      const b = Math.min(s.end, seg.end);
      if (b - a < 0.15) continue;   // mesmo piso do remap_spans (:575)
      stickerClips.push({
        id: uid("s", stickerClips.length), kind: "video", source_id: s.upload_id,
        src_in: Math.round((a - s.start) * 1000) / 1000,
        src_out: s.natural_dur || (s.end - s.start), speed: 1, volume: 0,
        timeline_start: (a - seg.start) / speed + finalStart,
        timeline_end: (b - seg.start) / speed + finalStart,
        transform: { x: s.x_pct, y: s.y_pct, escala: s.scale_pct, opacidade: 1,
                     giro: s.flip ? 180 : 0 },
        filtro: "nenhum", efeito: "nenhum",
        movement: s.movement, loop: s.loop,
      });
    }
  }

  // áudio: clipes posicionados (narração) — ESPELHO do remap_spans
  // (estica=False): UM span contínuo a partir do primeiro momento visível, na
  // duração da janela ORIGINAL (não estica nem quebra; src_in compensa o
  // pedaço que caiu em trecho removido)
  const audioClips: AudioClipT[] = [];
  for (const c of doc.audioClips as AudioClip[]) {
    for (const { seg, finalStart, speed } of segs) {
      const a = Math.max(c.start, seg.start);
      const b = Math.min(c.end, seg.end);
      if (b - a < 0.15) continue;
      const ini = (a - seg.start) / speed + finalStart;
      audioClips.push({
        id: uid("a", audioClips.length), kind: "audio", source_id: c.upload_id,
        src_in: Math.round((a - c.start) * 1000) / 1000,
        src_out: Math.round((a - c.start) * 1000) / 1000 + (c.end - c.start),
        timeline_start: ini,
        timeline_end: ini + (c.end - c.start),
        volume: c.volume,
      });
      break;   // só o primeiro trecho onde o clipe aparece (1 span por clipe)
    }
  }

  // PiP de VÍDEO (Fase F): como o clipe de áudio (estica=False) — 1 span
  // contínuo a partir do primeiro momento visível, duração da janela original,
  // src_in compensa o pedaço que caiu em trecho removido. NÃO estica com a
  // velocidade (o áudio próprio soaria grave).
  const userPips: VideoClip[] = [];
  for (const p of (doc.pipClips ?? []) as PipClip[]) {
    for (const { seg, finalStart, speed } of segs) {
      const a = Math.max(p.start, seg.start);
      const b = Math.min(p.end, seg.end);
      if (b - a < 0.15) continue;
      const compensa = Math.round((a - p.start) * 1000) / 1000;
      const ini = (a - seg.start) / speed + finalStart;
      userPips.push({
        id: uid("p", userPips.length), kind: "video", source_id: p.edit_id,
        src_in: p.src_in + compensa,
        src_out: p.src_in + compensa + (p.end - p.start),
        speed: 1, volume: p.volume,
        timeline_start: ini, timeline_end: ini + (p.end - p.start),
        transform: { x: p.x_pct, y: p.y_pct, escala: p.scale_pct,
                     opacidade: p.opacity, giro: 0 },
        filtro: "nenhum", efeito: "nenhum", loop: false,
      });
      break;   // 1 span por clipe (como remap_spans estica=False)
    }
  }

  const tracks: Track[] = [{ id: "video-base", kind: "video", z: 0, clips: videoBase }];
  if (stickerClips.length) tracks.push({ id: "video-pip", kind: "video", z: 1, clips: stickerClips });
  if (userPips.length) tracks.push({ id: "pip", kind: "video", z: 2, clips: userPips });
  if (textClips.length) tracks.push({ id: "text", kind: "text", z: 3, clips: textClips });
  if (subClips.length) tracks.push({ id: "subs", kind: "text", z: 4, clips: subClips });
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

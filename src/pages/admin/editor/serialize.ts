/**
 * Serialização do Editor de Vídeo (Fase 0 das fundações).
 *
 * - buildRenderPayload: o payload de POST /editor/render nasce SEMPRE daqui,
 *   a partir do EditorDoc — garantia estrutural de que render e persistência
 *   leem a mesma fonte (nada de montar payload à mão no componente).
 * - ProjectSnapshot: o que vai pro localStorage e pro banco (editor_projects.doc).
 * - snapshotFromStored: aceita o formato NOVO (v2, com doc aninhado) e MIGRA o
 *   formato antigo (flat, ids numéricos) — quem tinha edição em andamento não
 *   perde nada no deploy desta fase.
 */
import { EDITOR_CONTRACT_VERSION, type EditMeta, type StickerJob } from "./types";
import { emptyDoc, type EditorDoc } from "./documentReducer";

export type ProjectSnapshot = {
  v: 2;
  meta: EditMeta | null;
  sourceLabel: string;
  /** URL re-carregável da fonte (embed_url da galeria ou preview do draft) —
   *  permite reabrir um projeto mesmo depois do draft expirar no servidor. */
  sourceUrl: string;
  resultUrl: string;
  renderJobId: string;
  stickerJob: StickerJob | null;
  projectId: number | null;
  projectName: string;
  doc: EditorDoc;
};

export function buildRenderPayload(
  doc: EditorDoc,
  meta: EditMeta,
  professionalSlug: string,
  perfilLogo: string,
) {
  const keep = doc.segments.filter((s) => s.keep);
  return {
    contract_version: EDITOR_CONTRACT_VERSION,
    professional_slug: professionalSlug,
    edit_id: meta.edit_id,
    keep_segments: keep.map((s) => ({ start: s.start, end: s.end })),
    music_id: doc.musicUploadId ? "" : doc.musicId,
    music_upload_id: doc.musicUploadId,
    music_volume: doc.musicVolume / 100,
    original_volume: doc.originalVolume / 100,
    fade_out: doc.fadeOut,
    titulo: doc.titulo.trim(),
    subtitles: doc.subsOn && doc.cues.length
      ? { cues: doc.cues, font_id: doc.subFont, size: doc.subSize, color: doc.subColor, style: doc.subStyle, position: doc.subPos }
      : undefined,
    titles: doc.titles.length ? doc.titles : undefined,
    stickers: doc.stickers.length ? doc.stickers.map((s) => ({
      sticker_upload_id: s.upload_id, start: s.start, end: s.end,
      x_pct: s.x_pct, y_pct: s.y_pct, scale_pct: s.scale_pct,
      movement: s.movement, loop: s.loop, flip: s.flip,
    })) : undefined,
    audio_clips: doc.audioClips.length ? doc.audioClips.map((c) => ({
      upload_id: c.upload_id, start: c.start, end: c.end, volume: c.volume,
    })) : undefined,
    transition: doc.transition,
    ducking: doc.ducking,
    punch_in: doc.punchIn,
    intro: doc.introOn && (doc.introSource === "upload" ? doc.introUploadId : perfilLogo)
      ? {
          ...(doc.introSource === "upload"
            ? { logo_upload_id: doc.introUploadId }
            : { image_url: perfilLogo }),
          duration: doc.introDur,
          bg: doc.introBg,
          effect: doc.introEffect,
        }
      : undefined,
  };
}

/** Interpreta o que estiver salvo (localStorage OU editor_projects.doc):
 *  formato v2 volta como está; formato antigo (flat) é migrado. */
export function snapshotFromStored(raw: unknown): ProjectSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, any>;
  if (s.v === 2 && s.doc) {
    return { ...emptySnapshot(), ...s, doc: { ...emptyDoc(), ...s.doc } } as ProjectSnapshot;
  }
  if (!s.meta?.edit_id) return null;
  // ── migração do formato antigo (estado flat, ids numéricos) ──
  const doc: EditorDoc = {
    ...emptyDoc(),
    segments: Array.isArray(s.segments) ? s.segments : [],
    musicId: s.musicId || "",
    musicUploadId: s.musicUploadId || "",
    musicUploadName: s.musicUploadName || "",
    musicVolume: s.musicVolume ?? 20,
    originalVolume: s.originalVolume ?? 100,
    fadeOut: s.fadeOut ?? true,
    subsOn: !!s.subsOn,
    cues: s.cues || [],
    words: s.words || [],
    cueMode: s.cueMode || "frases",
    subFont: s.subFont || "bevietnam",
    subSize: s.subSize || "m",
    subColor: s.subColor || "#FFFFFF",
    subStyle: s.subStyle || "outline",
    subPos: s.subPos || "bottom",
    titles: s.titles || [],
    stickers: (s.stickers || []).map((x: any) => ({ ...x, id: String(x.id) })),
    audioClips: (s.audioClips || []).map((x: any) => ({ ...x, id: String(x.id) })),
    transition: s.transition || "none",
    ducking: s.ducking ?? true,
    punchIn: !!s.punchIn,
    introOn: !!s.introOn,
    introSource: s.introSource || "perfil",
    introUploadId: s.introUploadId || "",
    introUploadName: s.introUploadName || "",
    introDur: s.introDur ?? 2,
    introBg: s.introBg || "#FFFFFF",
    introEffect: s.introEffect || "zoom",
    titulo: s.titulo || "",
  };
  return {
    v: 2,
    meta: s.meta,
    sourceLabel: s.sourceLabel || "",
    sourceUrl: s.meta?.preview_url || "",
    resultUrl: s.resultUrl || "",
    renderJobId: s.renderJobId || "",
    stickerJob: s.stickerJob?.job_id ? s.stickerJob : null,
    projectId: null,
    projectName: "",
    doc,
  };
}

export const emptySnapshot = (): ProjectSnapshot => ({
  v: 2,
  meta: null,
  sourceLabel: "",
  sourceUrl: "",
  resultUrl: "",
  renderJobId: "",
  stickerJob: null,
  projectId: null,
  projectName: "",
  doc: emptyDoc(),
});

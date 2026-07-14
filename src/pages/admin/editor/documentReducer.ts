/**
 * EditorDoc — a FONTE ÚNICA DE VERDADE da edição (Fase 0 das fundações).
 *
 * Antes o "documento" eram ~30 useState paralelos e o Desfazer cobria só os
 * cortes (segments); excluir um sticker era irreversível. Agora todo o
 * conteúdo da edição vive num objeto serializável: o undo é genérico (snapshot
 * do doc), o localStorage/banco persistem o mesmo objeto e o payload do render
 * nasce de serialize.ts — preview, persistência e render leem a MESMA fonte.
 *
 * Convenção de undo:
 *   - "patch"/"apply"  → mudanças DISCRETAS (adicionar/remover/dividir/toggle)
 *                        empurram snapshot → 1 clique em Desfazer reverte.
 *   - "update"/"applyLive" → mudanças CONTÍNUAS (slider, digitação, arrasto)
 *                        NÃO empurram snapshot a cada pixel/tecla.
 *   - "checkpoint"     → chame no INÍCIO de um gesto contínuo (pointerdown de
 *                        um arrasto) para o gesto inteiro virar 1 passo de undo.
 */
import type {
  AudioClip, Cue, Segment, Sticker, SubPos, SubSize, SubStyle, Title,
} from "./types";

export type EditorDoc = {
  segments: Segment[];
  musicId: string;
  musicUploadId: string;
  musicUploadName: string;
  musicVolume: number;          // 0-100 (UI)
  originalVolume: number;       // 0-150 (UI)
  fadeOut: boolean;
  subsOn: boolean;
  cues: Cue[];
  words: Cue[];
  cueMode: "frases" | "karaoke";
  subFont: string;
  subSize: SubSize;
  subColor: string;
  subStyle: SubStyle;
  subPos: SubPos;
  titles: Title[];
  stickers: Sticker[];
  audioClips: AudioClip[];
  transition: "none" | "fade";
  ducking: boolean;
  punchIn: boolean;
  introOn: boolean;
  introSource: "perfil" | "upload";
  introUploadId: string;
  introUploadName: string;
  introDur: number;
  introBg: string;
  introEffect: "zoom" | "slide" | "fade";
  titulo: string;
};

export const emptyDoc = (): EditorDoc => ({
  segments: [],
  musicId: "",
  musicUploadId: "",
  musicUploadName: "",
  musicVolume: 20,
  originalVolume: 100,
  fadeOut: true,
  subsOn: false,
  cues: [],
  words: [],
  cueMode: "frases",
  subFont: "bevietnam",
  subSize: "m",
  subColor: "#FFFFFF",
  subStyle: "outline",
  subPos: "bottom",
  titles: [],
  stickers: [],
  audioClips: [],
  transition: "none",
  ducking: true,
  punchIn: false,
  introOn: false,
  introSource: "perfil",
  introUploadId: "",
  introUploadName: "",
  introDur: 2,
  introBg: "#FFFFFF",
  introEffect: "zoom",
  titulo: "",
});

export type EditorState = { doc: EditorDoc; past: EditorDoc[] };

export type EditorAction =
  | { type: "reset"; doc: EditorDoc }                                 // troca tudo, zera o undo
  // Nova fonte carregada NO MESMO projeto: zera o conteúdo preso ao vídeo
  // (cortes/legendas/textos/stickers/áudios) e preserva as escolhas globais
  // (música, volumes, estilo de legenda, intro, acabamento) — comportamento
  // herdado do resetEditor original.
  | { type: "resetSource"; duration: number }
  | { type: "patch"; changes: Partial<EditorDoc> }                    // discreta (com undo)
  | { type: "apply"; fn: (d: EditorDoc) => Partial<EditorDoc> }       // discreta com updater
  | { type: "update"; changes: Partial<EditorDoc> }                   // contínua (sem undo)
  | { type: "applyLive"; fn: (d: EditorDoc) => Partial<EditorDoc> }   // contínua com updater
  | { type: "checkpoint" }                                            // início de gesto contínuo
  | { type: "undo" };

const HISTORY_MAX = 50;

const push = (past: EditorDoc[], doc: EditorDoc): EditorDoc[] =>
  [...past.slice(-(HISTORY_MAX - 1)), doc];

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "reset":
      return { doc: action.doc, past: [] };
    case "resetSource":
      return {
        doc: {
          ...state.doc,
          // duration <= 0 = "sem fonte" (Recomeçar/Novo projeto): limpa o
          // conteúdo mas preserva as preferências globais, como o original
          segments: action.duration > 0
            ? [{ id: 1, start: 0, end: action.duration, keep: true }]
            : [],
          cues: [], words: [], subsOn: false,
          titles: [], stickers: [], audioClips: [],
        },
        past: [],
      };
    case "patch":
      return { doc: { ...state.doc, ...action.changes }, past: push(state.past, state.doc) };
    case "apply":
      return { doc: { ...state.doc, ...action.fn(state.doc) }, past: push(state.past, state.doc) };
    case "update":
      return { ...state, doc: { ...state.doc, ...action.changes } };
    case "applyLive":
      return { ...state, doc: { ...state.doc, ...action.fn(state.doc) } };
    case "checkpoint":
      // clique sem gesto de verdade não vira passo de undo (dedup por referência)
      if (state.past.length && state.past[state.past.length - 1] === state.doc) return state;
      return { ...state, past: push(state.past, state.doc) };
    case "undo": {
      // pula snapshots idênticos ao doc atual (checkpoints de gestos que não
      // mudaram nada) — Desfazer sempre reverte uma mudança REAL
      let past = state.past;
      while (past.length && past[past.length - 1] === state.doc) past = past.slice(0, -1);
      if (!past.length) return { ...state, past };
      const prev = past[past.length - 1];
      return { doc: prev, past: past.slice(0, -1) };
    }
    default:
      return state;
  }
}

export const initialEditorState: EditorState = { doc: emptyDoc(), past: [] };

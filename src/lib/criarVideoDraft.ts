import type { Script } from "@/pages/admin/AdminEstudioViral";

// Chave de handoff do wizard "Criar Vídeo" (AdminEstudioViral). Um draft PARCIAL
// é suficiente — cada useState do wizard já tem fallback próprio (saved?.x ?? default).
export const STORAGE_KEY = "pp-criar-video";

// Usado pelo fluxo de "Clonar vídeo" (tela própria) para entregar o roteiro já
// analisado direto no Estúdio de Cenas (Step 2, tier PRO), sem duplicar o resto
// do wizard. Mesmo mecanismo de handoff já usado por MetaCampaignEditor.tsx.
export function saveClonedVideoDraft(script: Script, opts: { tom: string; objetivo?: string }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    step: 2,
    videoModel: "pro",
    creationPath: "estudio",
    script,
    objetivo: opts.objetivo,
    tom: opts.tom,
  }));
}

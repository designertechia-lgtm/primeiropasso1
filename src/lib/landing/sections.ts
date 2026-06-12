// Fonte única de verdade do ritmo vertical da landing do profissional.
// Centraliza a escala de espaçamento (grade 8pt), os tons de fundo (zebra) e o scroll-mt
// que compensa o header sticky. Consumido por <Section> e por ProfessionalLanding.
// Ver _docs/PLANO_LANDING_PAGES.md (Fase 0).

// Escala única de padding vertical das seções — grade 8pt (80px / 112px).
// Mantém o ar generoso; é a zebra (não a compactação) que dá o ritmo. Ajustável aqui num lugar só.
export const SECTION_PADDING = "py-20 md:py-28";

// Compensa o header sticky (h-16 = 64px) ao rolar para uma âncora, pra o título não ficar escondido.
export const SECTION_SCROLL_MT = "scroll-mt-16";

export type SectionTone = "base" | "alt" | "accent" | "none";

// Classes de fundo por tom. 'base' e 'alt' alternam na zebra das seções de conteúdo;
// 'accent' = seção de contato; 'none' = sem fundo próprio (ex. hero, que usa imagem/vídeo).
export const TONE_BG: Record<SectionTone, string> = {
  base: "bg-background",
  alt: "bg-muted/40",
  accent: "bg-primary/5",
  none: "",
};

// Dado o índice da seção dentro do grupo "zebra", devolve o tom alternado.
// Preparado para a Fase 1 (reordenação): o tom segue a POSIÇÃO, não a seção.
export function zebraTone(index: number): SectionTone {
  return index % 2 === 0 ? "base" : "alt";
}

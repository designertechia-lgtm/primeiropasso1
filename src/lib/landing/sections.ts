// Fonte única de verdade do ritmo vertical da landing do profissional.
// Centraliza a escala de espaçamento (grade 8pt), os tons de fundo (zebra) e o scroll-mt
// que compensa o header sticky. Consumido por <Section> e por ProfessionalLanding.
// Ver _docs/PLANO_LANDING_PAGES.md (Fase 0).

// Escala única de padding vertical das seções — grade 8pt (48px / 64px).
// Mais enxuto: o conteúdo fica perto do topo da seção (não "solto"); a zebra é que marca o ritmo.
// Simétrico de propósito (reduzir só o topo deixaria o conteúdo colado em cima e vazio embaixo).
// Ajustável aqui num lugar só.
export const SECTION_PADDING = "py-12 md:py-16";

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

// Seções de conteúdo entre o Hero (fixo no topo) e o Contato (fixo no fim).
// Ordem canônica (default quando o profissional nunca reordenou). Tier Grátis (Fase 1).
export const CONTENT_SECTION_KEYS = ["pain", "solution", "about", "content"] as const;
export type ContentSectionKey = (typeof CONTENT_SECTION_KEYS)[number];

// Aplica a ordem salva pelo profissional + remove as ocultas, mantendo só as chaves que existem
// nesta landing (ex.: 'content' some quando não há artigos/vídeos). Chaves novas no futuro que
// não estejam em `order` entram no fim, na ordem canônica — à prova de evolução do schema.
// O resultado é a lista VISÍVEL e ORDENADA: o índice dela alimenta zebraTone (sem faixa vazia).
export function orderContentSections(
  available: string[],
  order?: string[] | null,
  hidden?: string[] | null,
): string[] {
  const hide = new Set(hidden ?? []);
  const base = (order ?? []).filter((k) => available.includes(k));
  const rest = CONTENT_SECTION_KEYS.filter((k) => available.includes(k) && !base.includes(k));
  return [...base, ...rest].filter((k) => !hide.has(k));
}

// Divide o título da seção em [lead, accent] pra colorir a 2ª parte (formato "frase. complemento colorido").
// 1) Se há uma sentença completa seguida de mais texto, divide ali. 2) Senão, divide ~na metade das palavras.
// 3) Título curto (até 3 palavras) fica inteiro no lead, sem destaque.
export function splitHeadline(text: string): [string, string] {
  const t = (text ?? "").trim();
  const sentence = t.match(/^(.*?[.!?])\s+(.+)$/s);
  if (sentence) return [sentence[1], sentence[2]];
  const words = t.split(/\s+/);
  if (words.length >= 4) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }
  return [t, ""];
}

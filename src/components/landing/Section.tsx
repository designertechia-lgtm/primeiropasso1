import { TONE_BG, SECTION_PADDING, SECTION_SCROLL_MT, type SectionTone } from "@/lib/landing/sections";

interface SectionProps {
  id?: string;
  tone?: SectionTone;
  className?: string;
  // clip=false libera o overflow para permitir `position: sticky` no conteúdo (ex.: coluna do Sobre).
  // Quem passa clip=false precisa recortar as próprias auras num wrapper interno overflow-hidden.
  clip?: boolean;
  children: React.ReactNode;
}

// Wrapper único das seções da landing: centraliza padding (escala 8pt), fundo (zebra via `tone`),
// scroll-mt de âncora e o `id`. As seções viram só o "miolo" (auras + container + conteúdo).
// Ver _docs/PLANO_LANDING_PAGES.md (Fase 0).
export default function Section({ id, tone = "base", className = "", clip = true, children }: SectionProps) {
  return (
    <section
      id={id}
      className={`relative ${clip ? "overflow-hidden" : ""} ${SECTION_PADDING} ${id ? SECTION_SCROLL_MT : ""} ${TONE_BG[tone]} ${className}`}
    >
      {children}
    </section>
  );
}

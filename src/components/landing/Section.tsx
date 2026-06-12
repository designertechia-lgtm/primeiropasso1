import { TONE_BG, SECTION_PADDING, SECTION_SCROLL_MT, type SectionTone } from "@/lib/landing/sections";

interface SectionProps {
  id?: string;
  tone?: SectionTone;
  className?: string;
  children: React.ReactNode;
}

// Wrapper único das seções da landing: centraliza padding (escala 8pt), fundo (zebra via `tone`),
// scroll-mt de âncora e o `id`. As seções viram só o "miolo" (auras + container + conteúdo).
// Ver _docs/PLANO_LANDING_PAGES.md (Fase 0).
export default function Section({ id, tone = "base", className = "", children }: SectionProps) {
  return (
    <section
      id={id}
      className={`relative overflow-hidden ${SECTION_PADDING} ${id ? SECTION_SCROLL_MT : ""} ${TONE_BG[tone]} ${className}`}
    >
      {children}
    </section>
  );
}

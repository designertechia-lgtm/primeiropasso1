// Fonte ÚNICA de verdade do CSS da landing.
// Antes existiam duas implementações divergentes do mesmo CSS:
//   - editor/preview: `buildPreviewVars` (completa: 10 fontes, --font-heading, fundo)
//   - página pública: `customStyles` (incompleta: 5 fontes, sem heading, fundo bloqueado no dark)
// Elas divergiram e o que o profissional via no preview não batia com a página real.
// Este helper centraliza tudo: o editor e a `ProfessionalLanding` consomem o MESMO código.

// Dark mode da landing pública: DESATIVADO. Enquanto for false, a página renderiza SEMPRE claro,
// o botão de tema não aparece e o EDITOR esconde os controles de tema/cores escuras (senão o editor
// prometeria algo que o visitante nunca vê — auditoria C3). Para reativar, basta voltar a true.
export const DARK_MODE_ENABLED = false;

export const FONTS = [
  { value: "inter",        label: "Inter",            desc: "Moderno e neutro",      style: { fontFamily: "'Inter', system-ui, sans-serif" } },
  { value: "poppins",      label: "Poppins",          desc: "Geométrico e amigável", style: { fontFamily: "'Poppins', sans-serif" } },
  { value: "lato",         label: "Lato",             desc: "Limpo e profissional",  style: { fontFamily: "'Lato', sans-serif" } },
  { value: "montserrat",   label: "Montserrat",       desc: "Forte e contemporâneo", style: { fontFamily: "'Montserrat', sans-serif" } },
  { value: "raleway",      label: "Raleway",          desc: "Fino e estiloso",       style: { fontFamily: "'Raleway', sans-serif" } },
  { value: "roboto",       label: "Roboto",           desc: "Universal e técnico",   style: { fontFamily: "'Roboto', sans-serif" } },
  { value: "opensans",     label: "Open Sans",        desc: "Acolhedor e neutro",    style: { fontFamily: "'Open Sans', sans-serif" } },
  { value: "playfair",     label: "Playfair Display", desc: "Elegante e clássico",   style: { fontFamily: "'Playfair Display', serif" } },
  { value: "merriweather", label: "Merriweather",     desc: "Legível e confiável",   style: { fontFamily: "'Merriweather', serif" } },
  { value: "lora",         label: "Lora",             desc: "Editorial e sereno",    style: { fontFamily: "'Lora', serif" } },
] as const;

export const FONT_SIZES = [
  { value: "sm", label: "Pequeno", scale: "0.9" },
  { value: "md", label: "Normal",  scale: "1.0" },
  { value: "lg", label: "Grande",  scale: "1.1" },
  { value: "xl", label: "Maior",   scale: "1.2" },
] as const;

// Carrega as fontes das landings (inclui Roboto e Lora). O index.html global agora tem só
// Lora + Plus Jakarta Sans (fonte da plataforma/admin); a landing é autossuficiente aqui.
// Precisa ser injetado tanto no preview do editor quanto na página pública,
// senão a fonte escolhida cai no fallback do sistema.
export const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Lato:wght@400;700&family=Montserrat:wght@400;500;600;700&family=Raleway:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;600;700&family=Playfair+Display:wght@400;600;700&family=Merriweather:wght@400;700&family=Lora:wght@400;500;600;700&display=swap";

export type LandingThemeInput = {
  primary_color?: string | null;
  secondary_color?: string | null;
  background_color?: string | null;
  dark_primary_color?: string | null;
  dark_secondary_color?: string | null;
  dark_background_color?: string | null;
  font_family?: string | null;
  heading_font_family?: string | null;
  font_size_scale?: string | null;
};

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const contrastFg = (l: number) => (l > 55 ? "220 15% 10%" : "210 40% 98%");

/**
 * Devolve o objeto de CSS vars (HSL "h s% l%") + fontes para a landing.
 *
 * Regra de cores por modo:
 *  - light: usa as cores claras; campo vazio é OMITIDO (herda o tema :root).
 *  - dark:  primary/secondary usam a versão dark_* se houver, senão reaproveitam
 *           a cor clara (identidade da marca). O FUNDO no dark só é aplicado se
 *           houver `dark_background_color`; sem ela, é OMITIDO → herda o fundo
 *           escuro padrão do tema `.dark`. (NUNCA usa a cor de fundo clara no escuro.)
 */
export function buildLandingVars(prof: LandingThemeInput, mode: "light" | "dark"): Record<string, string> {
  const isDark = mode === "dark";
  const vars: Record<string, string> = {};

  const primaryHex   = isDark ? (prof.dark_primary_color   || prof.primary_color)   : prof.primary_color;
  const secondaryHex = isDark ? (prof.dark_secondary_color || prof.secondary_color) : prof.secondary_color;
  const bgHex        = isDark ? prof.dark_background_color : prof.background_color;

  const p = primaryHex ? hexToHsl(primaryHex) : null;
  if (p) {
    const primaryHSL = `${p.h} ${p.s}% ${p.l}%`;
    const accentL = Math.max(p.l - 15, 10);
    vars["--primary"] = primaryHSL;
    vars["--primary-foreground"] = contrastFg(p.l);
    vars["--accent"] = `${p.h} ${Math.min(p.s + 6, 100)}% ${accentL}%`;
    vars["--accent-foreground"] = contrastFg(accentL);
    vars["--ring"] = primaryHSL;
  }

  const sec = secondaryHex ? hexToHsl(secondaryHex) : null;
  if (sec) {
    vars["--secondary"] = `${sec.h} ${sec.s}% ${sec.l}%`;
    vars["--secondary-foreground"] = contrastFg(sec.l);
  }

  const b = bgHex ? hexToHsl(bgHex) : null;
  if (b) {
    const card = `${b.h} ${Math.max(b.s - 5, 0)}% ${Math.min(b.l + 2, 100)}%`;
    const borderInput = `${b.h} ${Math.max(b.s - 10, 0)}% ${Math.max(b.l - 10, 0)}%`;
    const fg = b.l < 50 ? `${b.h} ${Math.max(b.s - 15, 0)}% 90%` : `${b.h} ${Math.min(b.s + 10, 100)}% 15%`;
    const mutedFg = b.l < 50 ? `${b.h} ${Math.max(b.s - 15, 0)}% 60%` : `${b.h} ${Math.max(b.s - 5, 0)}% 45%`;
    vars["--background"] = `${b.h} ${b.s}% ${b.l}%`;
    vars["--card"] = card;
    vars["--popover"] = card;
    vars["--muted"] = `${b.h} ${Math.max(b.s - 10, 0)}% ${Math.max(b.l - 5, 0)}%`;
    vars["--border"] = borderInput;
    vars["--input"] = borderInput;
    vars["--foreground"] = fg;
    vars["--card-foreground"] = fg;
    vars["--popover-foreground"] = fg;
    vars["--muted-foreground"] = mutedFg;
  }

  const bodyDef    = FONTS.find((f) => f.value === prof.font_family)         ?? FONTS[0];
  const headingDef = FONTS.find((f) => f.value === prof.heading_font_family) ?? bodyDef;
  vars["--font-body"]    = bodyDef.style.fontFamily;
  vars["--font-heading"] = headingDef.style.fontFamily;
  // camelCase: forma canônica que o React aplica no style inline sem ambiguidade.
  // O corpo usa fontFamily direto no container; os títulos usam .font-heading → var(--font-heading).
  vars["fontFamily"]     = bodyDef.style.fontFamily;
  // NOTA: o "Tamanho do texto" (font_size_scale) NÃO entra aqui de propósito. Setar font-size no
  // container não escala os utilitários text-* do Tailwind (são `rem`, relativos ao <html>). Use
  // getFontScale() para ajustar o root font-size na pública e o transform no preview do editor.

  return vars;
}

/** Fator do "Tamanho do texto" (0.9–1.2). Aplicado no root font-size (pública) e no transform (preview). */
export function getFontScale(value?: string | null): number {
  const def = FONT_SIZES.find((s) => s.value === value) ?? FONT_SIZES[1];
  return Number(def.scale);
}

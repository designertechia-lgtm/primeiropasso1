import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hexToHSL(hex: string): string | null {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!r) return null;
  const rv = parseInt(r[1], 16) / 255;
  const g  = parseInt(r[2], 16) / 255;
  const b  = parseInt(r[3], 16) / 255;
  const max = Math.max(rv, g, b), min = Math.min(rv, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rv: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g:  h = ((b - rv) / d + 2) / 6; break;
      case b:  h = ((rv - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export const FONT_STACKS: Record<string, string> = {
  inter:        "'Inter', system-ui, sans-serif",
  poppins:      "'Poppins', system-ui, sans-serif",
  lato:         "'Lato', system-ui, sans-serif",
  playfair:     "'Playfair Display', Georgia, serif",
  merriweather: "'Merriweather', Georgia, serif",
  montserrat:   "'Montserrat', system-ui, sans-serif",
  raleway:      "'Raleway', system-ui, sans-serif",
  roboto:       "'Roboto', system-ui, sans-serif",
  opensans:     "'Open Sans', system-ui, sans-serif",
  lora:         "'Lora', Georgia, serif",
};

export function buildProfessionalThemeVars(opts: {
  primary_color?: string | null;
  background_color?: string | null;
  font_family?: string | null;        // body
  heading_font_family?: string | null; // h1..h6
  /** Quando true, NÃO sobrescreve --background/--card/--foreground (deixa o .dark cuidar). */
  skipBackground?: boolean;
}): Record<string, string> | undefined {
  const styles: Record<string, string> = {};
  if (opts.primary_color) {
    const hsl = hexToHSL(opts.primary_color);
    if (hsl) {
      styles["--primary"] = hsl;
      styles["--ring"]    = hsl;
      const l = parseInt(hsl.split(" ")[2]);
      styles["--primary-foreground"] = l > 55 ? "220 15% 10%" : "210 40% 98%";
    }
  }
  if (opts.background_color && !opts.skipBackground) {
    const hsl = hexToHSL(opts.background_color);
    if (hsl) {
      const parts = hsl.split(" ");
      const h = parts[0], s = parseInt(parts[1]), l = parseInt(parts[2]);
      styles["--background"]       = hsl;
      styles["--card"]             = `${h} ${Math.max(s - 5, 0)}% ${Math.min(l + 2, 100)}%`;
      styles["--foreground"]       = l < 50 ? `${h} ${Math.max(s - 15, 0)}% 90%` : `${h} ${Math.min(s + 10, 100)}% 15%`;
      styles["--muted-foreground"] = `${h} ${Math.max(s - 5, 0)}% 45%`;
      styles["--border"]           = `${h} ${Math.max(s - 10, 0)}% ${Math.max(l - 10, 0)}%`;
    }
  }
  const bodyKey    = (opts.font_family ?? "").toLowerCase();
  const headingKey = (opts.heading_font_family ?? "").toLowerCase();
  if (FONT_STACKS[bodyKey])    styles["--font-body"]    = FONT_STACKS[bodyKey];
  if (FONT_STACKS[headingKey]) styles["--font-heading"] = FONT_STACKS[headingKey];
  return Object.keys(styles).length > 0 ? styles : undefined;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Formata telefone para exibição: 55 ## # ####-####
 * Aceita string com ou sem formatação, extrai só dígitos.
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13) {
    // 55 11 9 1234-5678 (Brasil com código do país)
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 5)} ${digits.slice(5, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12) {
    // 55 11 1234-5678 (fixo)
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    // 11 9 1234-5678 (sem país)
    return `${digits.slice(0, 2)} ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    // 11 1234-5678 (fixo sem país)
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

/**
 * Remove toda formatação, mantém apenas dígitos.
 */
export function unformatPhone(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

/**
 * Normaliza um telefone brasileiro para o formato canônico de discagem:
 * apenas dígitos e SEMPRE com o código do país "55".
 *
 * Sem o "55" o WhatsApp interpreta o DDD como código de país
 * (ex.: DDD 49 vira +49 Alemanha → "número não está no WhatsApp").
 * É idempotente: se já tiver o 55, mantém; nunca duplica.
 *
 * - 12 díg. (55 + DDD + fixo) ou 13 díg. (55 + DDD + 9 + celular) iniciando em 55 → já tem país
 * - 10/11 díg. (DDD + número) ou qualquer outro tamanho → prefixa 55
 *   (cobre o caso-armadilha do DDD 55 de Santa Maria, que só é "país" com 12/13 díg.)
 * - vazio → retorna "" (chamadores devem checar antes de montar link)
 */
export function toWhatsAppNumber(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits;
  }
  return `55${digits}`;
}

/**
 * Monta o link wa.me com o código do país garantido (via toWhatsAppNumber)
 * e a mensagem sempre encodada. Fonte única para todos os CTAs de WhatsApp.
 */
export function buildWhatsAppLink(raw: string, message: string): string {
  return `https://wa.me/${toWhatsAppNumber(raw)}?text=${encodeURIComponent(message)}`;
}

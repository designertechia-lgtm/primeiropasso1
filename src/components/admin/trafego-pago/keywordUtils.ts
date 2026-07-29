// Sanitização de keywords — espelho da lógica das edges ads-campaign-generator e
// google-ads-proxy. O Google rejeita keywords com pontuação (?, !, @, %, vírgula,
// aspas, colchetes…), mais de 80 caracteres ou mais de 10 palavras.
const KW_MAX_CHARS = 80;
const KW_MAX_WORDS = 10;

export function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Devolve o texto limpo, ou "" se a keyword for inviável (descartar). */
export function sanitizeKeywordText(s: string): string {
  const clean = (s ?? "")
    .toLowerCase()
    // whitelist: letras (com acento), números, espaço, hífen, & e apóstrofo
    .replace(/[^\p{L}\p{N}\s\-&']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean || clean.length > KW_MAX_CHARS || clean.split(" ").length > KW_MAX_WORDS) return "";
  return clean;
}

/**
 * Negativas não têm close variants no Google: "grátis" NÃO bloqueia a busca
 * "gratis" (sem acento). Expande cada negativa com a variante sem acento e deduplica.
 */
export function expandNegatives(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const text = sanitizeKeywordText(raw);
    if (!text) continue;
    for (const v of [text, deaccent(text)]) {
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  }
  return out;
}

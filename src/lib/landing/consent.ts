// Consentimento LGPD do visitante da landing. Guardado em localStorage por slug
// (cada profissional é um controlador de dados distinto). Enquanto não houver
// consentimento "granted", NENHUM script de rastreamento (pixel/tag) é carregado.

export type ConsentValue = "granted" | "denied";

const keyFor = (slug?: string | null) => `pp_consent_${slug ?? "site"}`;

export function getConsent(slug?: string | null): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(keyFor(slug));
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(slug: string | null | undefined, value: ConsentValue): void {
  try {
    localStorage.setItem(keyFor(slug), value);
  } catch {
    /* localStorage indisponível (modo privado); ignora */
  }
}

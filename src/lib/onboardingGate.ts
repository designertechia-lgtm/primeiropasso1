// Critério ÚNICO do gating progressivo do painel: Formulário (/bem-vindo) → DNA da Marca →
// Landing/Campanhas. Todo gate de UI lê daqui; as edges (generate-brand-bible,
// ads-campaign-generator, axel-agent) aplicam o MESMO critério server-side — a UI é
// conveniência, o servidor é a verdade (gate só de UI falha com cache/estado velho).
//
// "Formulário preenchido" = o mínimo que produz um DNA fiel (não genérico):
// profissão + ≥1 abordagem + público-alvo + transformação. O restante segue opcional.

/** Rótulos humanos do que falta no formulário mínimo. Vazio = formulário ok. */
export function formMissing(professional: unknown): string[] {
  const p = (professional ?? {}) as any;
  const dna = p.dna_inputs && typeof p.dna_inputs === "object" ? p.dna_inputs : {};
  const faltam: string[] = [];
  // Profissão: texto livre do formulário OU categoria clínica já salva (usuários antigos
  // têm category sem category_custom — não travar quem já se identificou pelo dropdown).
  const temProfissao = !!(String(p.category_custom ?? "").trim() || (p.category && p.category !== "outro"));
  if (!temProfissao) faltam.push("sua profissão");
  if (!(Array.isArray(p.approaches) && p.approaches.length > 0)) faltam.push("suas abordagens");
  if (!String(dna.publico_alvo ?? "").trim()) faltam.push("seu público-alvo");
  if (!String(dna.transformacao ?? "").trim()) faltam.push("a transformação que você entrega");
  return faltam;
}

export function formOk(professional: unknown): boolean {
  return formMissing(professional).length === 0;
}

/** Tem DNA da Marca salvo = alguma das 11 seções de brand_bible com texto (ignora
 *  markdown/_meta: o markdown é remontado com os cabeçalhos mesmo com seções vazias). */
export function hasDna(professional: unknown): boolean {
  const bb = (professional as any)?.brand_bible;
  if (!bb || typeof bb !== "object") return false;
  return Object.entries(bb).some(
    ([k, v]) => k !== "markdown" && k !== "_meta" && typeof v === "string" && v.trim() !== "",
  );
}

import { describe, it, expect } from "vitest";
import { formMissing, formOk, hasDna } from "@/lib/onboardingGate";

// Critério do gating progressivo (Formulário → DNA → Landing/Campanhas).
// As edges (generate-brand-bible, ads-campaign-generator, axel-agent) espelham
// estas regras server-side — se o critério mudar aqui, mudar lá também.

const formCompleto = {
  category_custom: "Psicóloga clínica",
  category: "psicologo",
  approaches: ["TCC"],
  dna_inputs: { publico_alvo: "Mulheres 30-45 sobrecarregadas", transformacao: "Clareza para decidir" },
};

describe("formOk / formMissing", () => {
  it("aceita o formulário mínimo completo", () => {
    expect(formOk(formCompleto)).toBe(true);
    expect(formMissing(formCompleto)).toEqual([]);
  });

  it("lista tudo que falta num perfil vazio", () => {
    expect(formOk({})).toBe(false);
    expect(formMissing({})).toEqual([
      "sua profissão",
      "suas abordagens",
      "seu público-alvo",
      "a transformação que você entrega",
    ]);
    expect(formOk(null)).toBe(false); // professional ainda carregando não explode
  });

  it("aceita profissão via categoria clínica salva (usuário antigo sem category_custom)", () => {
    const p = { ...formCompleto, category_custom: "", category: "psicologo" };
    expect(formMissing(p)).toEqual([]);
    // category "outro" sem texto livre NÃO conta como profissão informada
    expect(formMissing({ ...p, category: "outro" })).toContain("sua profissão");
  });

  it("exige público-alvo e transformação do dna_inputs (espaços não contam)", () => {
    expect(formMissing({ ...formCompleto, dna_inputs: { publico_alvo: "  ", transformacao: "x" } }))
      .toEqual(["seu público-alvo"]);
    expect(formMissing({ ...formCompleto, dna_inputs: null }))
      .toEqual(["seu público-alvo", "a transformação que você entrega"]);
  });

  it("exige ao menos uma abordagem", () => {
    expect(formMissing({ ...formCompleto, approaches: [] })).toEqual(["suas abordagens"]);
  });
});

describe("hasDna", () => {
  it("true quando alguma seção do brand_bible tem texto", () => {
    expect(hasDna({ brand_bible: { essencia: "Propósito claro." } })).toBe(true);
  });

  it("false sem brand_bible ou com seções vazias", () => {
    expect(hasDna({})).toBe(false);
    expect(hasDna(null)).toBe(false);
    expect(hasDna({ brand_bible: null })).toBe(false);
    expect(hasDna({ brand_bible: { essencia: "", posicionamento: "   " } })).toBe(false);
  });

  it("ignora markdown e _meta (o markdown é remontado com cabeçalhos mesmo vazio)", () => {
    expect(hasDna({ brand_bible: { markdown: "## Essência da marca\n\n## Posicionamento", _meta: { conselho: "CFP" } } })).toBe(false);
  });
});

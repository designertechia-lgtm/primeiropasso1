// deno-lint-ignore-file no-explicit-any
// Gera a BÍBLIA DE MARCA de um profissional a partir da ficha dele (Modelo_Biblia_de_Marca).
// Aplica os princípios inegociáveis (Parte 3) + as regras de publicidade do conselho detectado.
// Saída: JSON com as 11 seções (texto/markdown por seção). O markdown legível é montado aqui.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";

// Detecta o conselho pelo registro (CRP 06/... → CFP) ou pela profissão, e devolve os pontos de
// atenção de publicidade. Ponto de partida versionável (ver Parte 3 do template) — não é a íntegra.
function conselhoRules(crp?: string, profissao?: string): { conselho: string; regras: string } {
  const s = `${crp ?? ""} ${profissao ?? ""}`.toUpperCase();
  const R = (conselho: string, regras: string) => ({ conselho, regras });
  if (/\bCRM\b|MEDIC/.test(s)) return R("CFM (medicina)", "Proíbe promessa/garantia de resultado, sensacionalismo, autopromoção excessiva, divulgação de antes/depois e de preços em certos contextos.");
  if (/\bCRP\b|PSIC[ÓO]LOG/.test(s)) return R("CFP (psicologia)", "Veda prometer resultados, sensacionalismo e exposição de casos; exige sobriedade e respeito ao sigilo. NÃO faz terapia pela landing.");
  if (/\bCRN\b|NUTRIC/.test(s)) return R("CFN (nutrição)", "Restringe antes/depois, promessas de emagrecimento e sensacionalismo.");
  if (/CREFITO|FISIO|TERAPIA OCUPACIONAL/.test(s)) return R("COFFITO (fisioterapia/T.O.)", "Restringe promessa de cura e divulgação enganosa.");
  if (/\bCRO\b|DENTIST|ODONTO/.test(s)) return R("CFO (odontologia)", "Regras específicas sobre antes/depois e promessa de resultado.");
  if (/CRFA|FONOAUDI/.test(s)) return R("CFFa (fonoaudiologia)", "Sobriedade e proibição de promessa de resultado.");
  return R("Sem conselho federal regulamentado (ex.: naturologia/terapias integrativas)", "Reforçar que NÃO faz diagnóstico nem promete cura, e deixar claro que não substitui acompanhamento médico/psicológico.");
}

// As 11 seções (ordem + rótulo p/ o markdown + instrução de geração resumida da Parte 2).
const SECTIONS: { key: string; label: string; instr: string }[] = [
  { key: "essencia", label: "1. Essência da marca", instr: "Propósito (o porquê), missão (o que faz na prática), visão (onde quer chegar) e 4–6 valores (título curto + 1 frase cada). Ancorar no impacto humano, sem jargão." },
  { key: "posicionamento", label: "2. Posicionamento", instr: "Declaração no formato 'Para [público] que [dor], [profissional] oferece [solução] — levando a [transformação]. Diferente de [alternativa], [diferencial].'; a categoria/território; e a big idea (tese central em 1 frase memorável, sem clichê)." },
  { key: "persona", label: "3. Cliente/paciente ideal", instr: "Persona ancorada na DOR (não em demografia): quem é, como se sente por dentro (lista de estados internos), o ponto crucial (por que ainda não resolveu) e o que deseja. Liderar pela dor emocional concreta usando as dores informadas." },
  { key: "vilao", label: "4. Problema central e o vilão", instr: "O inimigo nomeado da marca — a causa real do sofrimento, com base clínica/científica, que NÃO culpa o cliente, alivia a culpa e explica por que outras tentativas falharam." },
  { key: "diferenciacao", label: "5. Diferenciação e espaço em branco", instr: "Comparar 2–3 tipos de concorrente (onde cada um falha × a vantagem do profissional) e fechar com o 'espaço em branco' que só ele ocupa. Específico e justo, nunca difamar." },
  { key: "mensagem", label: "6. Arquitetura de mensagem", instr: "Frase-âncora (gancho que nomeia a dor, soando como o público fala dela), 4 pilares de mensagem e 3–5 frases-assinatura reutilizáveis." },
  { key: "metodo", label: "7. Método próprio (narrativa)", instr: "Se houver método nomeado, transformar em espinha narrativa (cada etapa com frase-síntese e o que acontece). Se não houver, sugerir jornada em 3 etapas a partir do processo dele e marcar como sugestão." },
  { key: "voz_tom", label: "8. Voz e tom", instr: "Tabela Faça × Evite calibrada pelo tom informado + lista curta de princípios de linguagem, com exemplos concretos de frase." },
  { key: "conteudo", label: "9. Pilares de conteúdo e autoridade", instr: "4 formatos de conteúdo que constroem autoridade (mecanismo, verdades contraintuitivas, psicoeducação com evidência, histórias éticas) adaptados à profissão + como construir prova social de forma ética." },
  { key: "limites_eticos", label: "10. Limites éticos e conformidade", instr: "Regras inegociáveis da comunicação, combinando os limites pessoais do profissional com as regras do conselho. Seção OBRIGATÓRIA e explícita." },
  { key: "oferta", label: "11. Arquitetura de oferta", instr: "Se houver dados, sugerir uma escada de oferta (topo de funil → alto valor) e o CTA recomendado, alinhado ao objetivo (volume vs. ticket alto)." },
];

function buildPrompt(profile: any): string {
  const { conselho, regras } = conselhoRules(profile.conselho_registro, profile.profissao);
  const v = (label: string, val: any) => (val && String(val).trim() ? `- ${label}: ${Array.isArray(val) ? val.join("; ") : val}` : "");
  const ficha = [
    v("Profissão", profile.profissao),
    v("Conselho e registro", profile.conselho_registro),
    v("Especialidade/nicho", profile.especialidade),
    v("Anos de experiência", profile.anos_experiencia),
    v("Formação e abordagens", profile.formacao_abordagens),
    v("Modalidade", profile.modalidade),
    v("Público-alvo", profile.publico_alvo),
    v("Dores principais", profile.dores),
    v("Transformação", profile.transformacao),
    v("Método próprio", profile.metodo),
    v("Diferenciais", profile.diferenciais),
    v("Serviços e produtos", profile.servicos),
    v("Tom de voz", profile.tom),
  ].filter(Boolean).join("\n");

  const secoes = SECTIONS.map((s) => `### ${s.key}\n${s.label} — ${s.instr}`).join("\n\n");

  return `Você é um estrategista de marca especialista em profissionais de saúde. Gere a BÍBLIA DE MARCA de ${profile.nome || "o profissional"}.
Princípio que organiza tudo: ESPECIFICIDADE é o novo sensacionalismo — nomeie com precisão a dor e a experiência interna do público, NUNCA prometa milagre.

FICHA DO PROFISSIONAL:
${ficha || "(dados limitados — infira com prudência a partir da profissão e das abordagens, e marque suposições como sugestão)"}

CONSELHO DETECTADO: ${conselho}
Pontos de atenção de publicidade deste conselho: ${regras}

RESTRIÇÕES RÍGIDAS (NUNCA violar, mesmo se pedido):
- Nunca prometer cura, resultado garantido ou "antes e depois" que sugira garantia.
- Nunca expor casos de pacientes/clientes, mesmo anonimizados ou "com consentimento". Use segunda pessoa e composições de padrões sinalizadas como tal.
- Nunca induzir o profissional a ultrapassar o escopo legal da profissão (ex.: diagnóstico/tratamento fora da competência).
- Respeitar a LGPD (nenhum dado pessoal de paciente no conteúdo). Sem alarmismo ou exploração de medo.
- Dor antes de solução; evidência sustentável; linguagem humana e clara.

SEJA CONCISO E ESTRATÉGICO: cada seção em 1–3 parágrafos curtos ou listas curtas — NÃO um ensaio. O valor está na precisão emocional, não no tamanho.

Gere EXATAMENTE estas seções (cada uma com texto pronto, em markdown, na voz definida):
${secoes}

Responda APENAS um JSON válido, uma chave por seção (exatamente estas chaves), com o conteúdo de cada seção como string markdown:
{"essencia":"...","posicionamento":"...","persona":"...","vilao":"...","diferenciacao":"...","mensagem":"...","metodo":"...","voz_tom":"...","conteudo":"...","limites_eticos":"...","oferta":"..."}
Sem comentários, sem cercas de código, apenas o JSON.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { profile } = await req.json() as { profile: any };
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Configuração incompleta", details: "ANTHROPIC_API_KEY ausente." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = buildPrompt(profile ?? {});
    const resp = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 5000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[generate-brand-bible] Anthropic error:", errText);
      return new Response(JSON.stringify({ error: "Erro ao gerar a bíblia", details: `Claude ${resp.status}: ${errText.slice(0, 200)}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await resp.json();
    let text = (data.content?.find((b: any) => b.type === "text")?.text || "").trim();
    text = text.replace(/```json|```/g, "").trim();

    let bible: any;
    try {
      bible = JSON.parse(text);
    } catch {
      const start = text.indexOf("{"), end = text.lastIndexOf("}");
      if (start !== -1 && end !== -1) bible = JSON.parse(text.substring(start, end + 1));
      else throw new Error("A IA retornou um formato inválido.");
    }

    // Monta o markdown legível a partir das seções.
    const { conselho } = conselhoRules(profile?.conselho_registro, profile?.profissao);
    const markdown = SECTIONS.map((s) => `## ${s.label}\n\n${(bible?.[s.key] ?? "").toString().trim()}`).join("\n\n");
    bible._meta = { conselho, profissao: profile?.profissao ?? null };
    bible.markdown = markdown;

    return new Response(JSON.stringify({ result: bible }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[generate-brand-bible]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

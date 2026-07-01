// deno-lint-ignore-file no-explicit-any
// Gera TODAS as seções da landing a partir da BÍBLIA DE MARCA (contexto único),
// numa voz coesa e dentro dos limites éticos. Devolve JSON estruturado pronto para
// preencher as colunas de professionals. O editor mostra um preview antes de aplicar.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";

function buildPrompt(bibleMarkdown: string, profile: any): string {
  return `Você é um redator de conversão especialista em profissionais de saúde. Escreva a copy de TODAS as seções da landing page de ${profile?.nome || "o profissional"} A PARTIR DA BÍBLIA DE MARCA abaixo — mantendo a MESMA voz, o mesmo posicionamento e o mesmo vilão da bíblia.

=== BÍBLIA DE MARCA (fonte única) ===
${(bibleMarkdown || "").slice(0, 12000)}
=== FIM DA BÍBLIA ===

Dados do profissional: ${[profile?.nome, profile?.conselho_registro, profile?.especialidade].filter(Boolean).join(" · ") || "(não informado)"}

RESTRIÇÕES RÍGIDAS (nunca violar): não prometer cura/resultado garantido; não expor pacientes; não ultrapassar o escopo da profissão; sem alarmismo. Dor antes de solução; especificidade, não sensacionalismo.

Gere a copy de cada seção. Regras de tamanho:
- hero_title: ≤ 10 palavras (a frase-âncora da bíblia). hero_subtitle: 10–20 palavras.
- pain: título reflexivo + subtítulo empático + EXATAMENTE 6 itens (frases curtas de identificação).
- villain: título em pergunta + corpo em 2 parágrafos (nomeia a causa real sem culpar o cliente + a virada).
- solution: título + subtítulo + EXATAMENTE 6 cards (title 2–4 palavras + desc ≤ 20 palavras).
- offer: título + descrição de UMA oferta principal + 3 passos de "como funciona" (title + desc).
- audience: título + 4 itens "é para você se…" + 3 itens "talvez não seja o momento se…".
- faq: título + 5 perguntas; a PRIMEIRA obrigatoriamente "Isto substitui acompanhamento médico ou psicológico?" com resposta responsável (complementa, não substitui; urgência → SAMU 192 / CVV 188).
- testimonials: título + subtítulo (a seção de prova social; NÃO invente depoimentos).

Responda APENAS um JSON válido com EXATAMENTE estas chaves:
{"hero_title":"","hero_subtitle":"","pain_title":"","pain_subtitle":"","pain_items":[{"text":""}],"villain_title":"","villain_body":"","solution_title":"","solution_subtitle":"","solution_items":[{"title":"","desc":""}],"offer_title":"","offer_description":"","offer_steps":[{"title":"","desc":""}],"audience_title":"","audience_for":[""],"audience_not_for":[""],"faq_title":"","faq_items":[{"q":"","a":""}],"testimonials_title":"","testimonials_subtitle":""}
Sem comentários, sem cercas de código, apenas o JSON.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { bible, profile } = await req.json() as { bible: any; profile: any };
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Configuração incompleta", details: "ANTHROPIC_API_KEY ausente." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aceita a bíblia como objeto (usa .markdown) ou como string markdown já pronta.
    const bibleMarkdown = typeof bible === "string" ? bible : (bible?.markdown || JSON.stringify(bible ?? {}));
    if (!bibleMarkdown || bibleMarkdown.length < 40) {
      return new Response(JSON.stringify({ error: "Bíblia vazia", details: "Gere e salve a bíblia de marca antes." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 5000, messages: [{ role: "user", content: buildPrompt(bibleMarkdown, profile ?? {}) }] }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[generate-landing] Anthropic error:", errText);
      return new Response(JSON.stringify({ error: "Erro ao gerar a landing", details: `Claude ${resp.status}: ${errText.slice(0, 200)}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await resp.json();
    let text = (data.content?.find((b: any) => b.type === "text")?.text || "").trim();
    text = text.replace(/```json|```/g, "").trim();

    let sections: any;
    try {
      sections = JSON.parse(text);
    } catch {
      const start = text.indexOf("{"), end = text.lastIndexOf("}");
      if (start !== -1 && end !== -1) sections = JSON.parse(text.substring(start, end + 1));
      else throw new Error("A IA retornou um formato inválido.");
    }

    return new Response(JSON.stringify({ result: sections }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[generate-landing]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

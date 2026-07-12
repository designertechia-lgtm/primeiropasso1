// deno-lint-ignore-file no-explicit-any
// Gera TODAS as seções da landing a partir da BÍBLIA DE MARCA (contexto único),
// numa voz coesa e dentro dos limites éticos. Devolve JSON estruturado pronto para
// preencher as colunas de professionals. O editor mostra um preview antes de aplicar.
// JSON garantido por structured outputs (output_config.format) — o modelo não devolve mais JSON quebrado.
// Cada chamada ao Claude custa dinheiro real: exige usuário autenticado (ou service role) antes de gerar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";

// A edge roda com verify_jwt desligado no gateway — o bloqueio é aqui.
// Aceita usuário logado (JWT da sessão, que o supabase.functions.invoke manda sozinho)
// ou a service role (chamadas server-to-server / testes).
// A env SUPABASE_SERVICE_ROLE_KEY nem sempre bate com a legacy key em uso (projeto tem
// as API keys novas), então a service role é provada no GoTrue: só ela passa no /admin.
async function isServiceRole(token: string): Promise<boolean> {
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users?per_page=1`, {
      headers: { Authorization: `Bearer ${token}`, apikey: token },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

// Além de validar, devolve o userId quando o caller é um usuário logado — é ele que
// permite atribuir o consumo de tokens ao profissional dono (aba usuários do admin).
async function requireCaller(req: Request): Promise<{ unauthorized: Response | null; userId: string | null }> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (token) {
    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    if (!error && user) return { unauthorized: null, userId: user.id };
    if (await isServiceRole(token)) return { unauthorized: null, userId: null };
  }
  return {
    unauthorized: new Response(JSON.stringify({ error: "Faça login para gerar a landing." }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
    userId: null,
  };
}

// ─── Consumo de tokens por profissional (admin-gerente → aba usuários) ───
// Soma o usage das tentativas (1 + retry) e grava 1 linha. Best-effort: NUNCA derruba a geração.
// Preços Sonnet 4.6 (USD/M): $3 in, $15 out, $3.75 cache write, $0.30 cache read.
async function recordLlmUsage(admin: any, professionalId: string | null, usages: any[]) {
  if (!professionalId || usages.length === 0) return;
  let inTok = 0, outTok = 0, cacheR = 0, costUsd = 0;
  for (const u of usages) {
    const i = u.input_tokens || 0, w = u.cache_creation_input_tokens || 0, r = u.cache_read_input_tokens || 0, o = u.output_tokens || 0;
    inTok += i + w + r; outTok += o; cacheR += r;
    costUsd += (i * 3 + w * 3.75 + r * 0.3 + o * 15) / 1e6;
  }
  try {
    const { error } = await admin.from("llm_usage").insert({
      professional_id: professionalId, source: "generate_landing", model: CLAUDE_MODEL, calls: usages.length,
      input_tokens: inTok, output_tokens: outTok, cached_tokens: cacheR, cost_usd: Number(costUsd.toFixed(6)),
    });
    if (error) console.warn("[llm_usage] insert falhou:", error.message);
  } catch (e: any) { console.warn("[llm_usage] insert falhou:", e?.message); }
}

// Schema das seções da landing (espelha o template do prompt). Passado em output_config.format,
// a API garante JSON válido por construção. Contagens exatas (6 itens etc.) seguem no prompt —
// o schema JSON da API não suporta minItems/maxItems.
const str = { type: "string" };
const arrOf = (props: Record<string, any>) => ({
  type: "array",
  items: { type: "object", properties: props, required: Object.keys(props), additionalProperties: false },
});
const LANDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    hero_title: str, hero_subtitle: str,
    pain_title: str, pain_subtitle: str, pain_items: arrOf({ text: str }),
    villain_title: str, villain_body: str,
    solution_title: str, solution_subtitle: str, solution_items: arrOf({ title: str, desc: str }),
    offer_title: str, offer_description: str, offer_steps: arrOf({ title: str, desc: str }),
    audience_title: str, audience_for: { type: "array", items: str }, audience_not_for: { type: "array", items: str },
    faq_title: str, faq_items: arrOf({ q: str, a: str }),
    testimonials_title: str, testimonials_subtitle: str,
  },
  required: [
    "hero_title", "hero_subtitle", "pain_title", "pain_subtitle", "pain_items", "villain_title", "villain_body",
    "solution_title", "solution_subtitle", "solution_items", "offer_title", "offer_description", "offer_steps",
    "audience_title", "audience_for", "audience_not_for", "faq_title", "faq_items", "testimonials_title", "testimonials_subtitle",
  ],
};

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

// Uma chamada ao Claude que já devolve as seções parseadas (lança em falha).
// usages: coletor de consumo — recebe o usage de CADA tentativa (inclusive as que falham depois).
async function callClaude(prompt: string, apiKey: string, usages: any[]): Promise<any> {
  const resp = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 5000,
      output_config: { format: { type: "json_schema", schema: LANDING_SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[generate-landing] Anthropic error:", errText);
    throw new Error(`Claude ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  if (data.usage) usages.push(data.usage);
  if (data.stop_reason === "max_tokens") throw new Error("Resposta truncada (max_tokens) — o JSON veio incompleto.");
  const text = (data.content?.find((b: any) => b.type === "text")?.text || "").trim();
  try {
    return JSON.parse(text);
  } catch (parseErr) {
    console.error("[generate-landing] JSON inválido apesar do schema:", String(parseErr), "| bruto:", text.slice(0, 500));
    throw new Error("A IA retornou um formato inválido.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const caller = await requireCaller(req);
    if (caller.unauthorized) return caller.unauthorized;

    const { bible, profile, professional_id } = await req.json() as { bible: any; profile: any; professional_id?: string };
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

    const prompt = buildPrompt(bibleMarkdown, profile ?? {});
    const usages: any[] = [];
    let sections: any;
    try {
      sections = await callClaude(prompt, apiKey, usages);
    } catch (firstErr) {
      // 1 retry para falha transitória (rede/overload) — evita perder o clique do usuário.
      console.warn("[generate-landing] 1ª tentativa falhou, retentando:", String(firstErr));
      sections = await callClaude(prompt, apiKey, usages);
    }

    // Contabiliza o consumo no dono: usuário logado (via JWT) ou professional_id do body
    // (chamada interna com service role). Sem dono → não grava (best-effort).
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      let ownerId: string | null = professional_id || null;
      if (caller.userId) {
        const { data: prof } = await admin.from("professionals").select("id").eq("user_id", caller.userId).maybeSingle();
        if (prof?.id) ownerId = prof.id;
      }
      if (ownerId) await recordLlmUsage(admin, ownerId, usages);
      else console.warn("[llm_usage] generate-landing sem dono identificável — consumo não gravado");
    } catch (e: any) { console.warn("[llm_usage] contabilização falhou:", e?.message); }

    return new Response(JSON.stringify({ result: sections }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    // Erro técnico fica no log; o profissional recebe uma mensagem acionável.
    console.error("[generate-landing]", err);
    return new Response(JSON.stringify({ error: "A geração falhou desta vez. Aguarde alguns segundos e tente novamente." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPTS: Record<string, (ctx: Context) => string> = {
  hero_title: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Crie UM título impactante para a página inicial de ${ctx.name}${ctx.crp ? `, ${ctx.crp}` : ""}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
O título deve ser inspirador, empático, direto e ter no máximo 10 palavras.
Responda APENAS com o título, sem aspas, sem explicações.`,

  hero_subtitle: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Crie UM subtítulo complementar para a página de ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
O subtítulo deve ter de 10 a 20 palavras, ser acolhedor e transmitir confiança.
Responda APENAS com o subtítulo, sem aspas, sem explicações.`,

  bio: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Escreva uma biografia profissional em primeira pessoa para ${ctx.name}${ctx.crp ? ` (${ctx.crp})` : ""}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
A bio deve ter 3 a 4 parágrafos curtos, ser calorosa, humana e profissional.
Mencione a especialidade, a abordagem terapêutica e o cuidado com o paciente.
Responda APENAS com o texto da bio, sem títulos nem explicações.`,

  pain_title: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Crie UM título para a seção "dores/problemas" da página de ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
O título deve fazer o visitante se identificar com uma pergunta ou afirmação reflexiva.
Máximo de 12 palavras. Responda APENAS com o título, sem aspas.`,

  pain_subtitle: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Crie UM subtítulo empático para a seção de dores da página de ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
Deve ter 15 a 25 palavras, acolher o visitante e motivá-lo a continuar lendo.
Responda APENAS com o subtítulo, sem aspas.`,

  pain_items: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Crie uma lista de 5 sintomas/dores emocionais que os pacientes de ${ctx.name}${ctx.specialty ? ` (${ctx.specialty})` : ""} costumam sentir.
Cada item deve ser uma frase curta (máx 12 palavras), em primeira ou segunda pessoa, que gere identificação imediata.
Responda APENAS um JSON válido no formato: [{"text":"..."},{"text":"..."},{"text":"..."},{"text":"..."},{"text":"..."}]
Sem comentários, sem markdown, apenas o JSON.`,

  solution_title: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Crie UM título para a seção "como posso ajudar" da página de ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
Deve ser positivo, transmitir esperança e ter no máximo 10 palavras.
Responda APENAS com o título, sem aspas.`,

  solution_subtitle: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Crie UM subtítulo para a seção de soluções de ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
Deve explicar brevemente a abordagem em 15 a 25 palavras.
Responda APENAS com o subtítulo, sem aspas.`,

  solution_items: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Crie 4 cards de benefícios do trabalho de ${ctx.name}${ctx.specialty ? ` (${ctx.specialty})` : ""}.
Cada card tem um título curto (2-4 palavras) e uma descrição (1-2 frases, máx 20 palavras).
Responda APENAS um JSON válido: [{"title":"...","desc":"..."},{"title":"...","desc":"..."},{"title":"...","desc":"..."},{"title":"...","desc":"..."}]
Sem comentários, sem markdown, apenas o JSON.`,
};

interface Context {
  name: string;
  crp?: string;
  specialty?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { field, context } = await req.json() as { field: string; context: Context };

    const promptFn = PROMPTS[field];
    if (!promptFn) {
      return new Response(JSON.stringify({ error: "Campo inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: promptFn(context) }],
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const raw = data.error?.message ?? "";
      let friendly = "Erro ao conectar com a IA. Tente novamente.";
      if (/rate.?limit|quota|too many/i.test(raw)) {
        friendly = "Limite de requisições atingido. Aguarde alguns instantes e tente novamente.";
      } else if (/invalid.?api.?key|incorrect.?api.?key|no such/i.test(raw)) {
        friendly = "Chave de API inválida. Verifique as configurações.";
      } else if (/billing|insufficient_quota/i.test(raw)) {
        friendly = "Créditos da OpenAI esgotados. Verifique sua conta em platform.openai.com.";
      }
      return new Response(JSON.stringify({ error: friendly }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (!text) {
      return new Response(JSON.stringify({ error: "Resposta vazia da IA. Tente novamente." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (field === "pain_items" || field === "solution_items") {
      try {
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        return new Response(JSON.stringify({ result: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "IA retornou formato inválido, tente novamente." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ result: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

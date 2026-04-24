import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Context {
  name: string;
  crp?: string;
  specialty?: string;
  title?: string;
  topic?: string;
}

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

  article_with_carousel: (ctx) =>
    `Você é um redator especialista em saúde mental e criação de conteúdo digital.
Crie um rascunho de artigo para ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
${ctx.title ? `O título ou tema sugerido é: "${ctx.title}"` : "Crie um tema relevante para o público do profissional."}

O artigo deve ter:
- Um título chamativo e otimizado para SEO (máximo 15 palavras).
- Um parágrafo de introdução (3-4 frases).
- Um parágrafo de desenvolvimento (5-7 frases).
- Um parágrafo de conclusão (2-3 frases).
- Uma sugestão de imagem de capa (palavras-chave em INGLÊS para busca em bancos de imagens).
- Um carrossel com 3 a 5 imagens com legendas curtas e uma sugestão de imagem (palavras-chave em INGLÊS) para cada uma.

Responda APENAS com um JSON válido no formato:
{"title": "...", "content": "...", "cover_image_suggestion": "palavras-chave em inglês", "carousel_items": [{"image_suggestion": "palavras-chave em inglês", "caption": "..."}, {"image_suggestion": "...", "caption": "..."}]}
Sem comentários, sem markdown, apenas o JSON.`,
};

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

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const apiKey = geminiKey || openaiKey;

    if (!apiKey) {
      console.error("Nenhuma API Key encontrada no ambiente.");
      return new Response(JSON.stringify({ 
        error: "Configuração incompleta", 
        details: "As chaves de API (GEMINI_API_KEY ou OPENAI_API_KEY) não foram configuradas nas Secrets do Supabase." 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se tivermos GEMINI_API_KEY, usamos Gemini. Senão, tentamos OpenAI como fallback se a chave existir.
    const isGemini = !!geminiKey;
    
    async function callGemini(key: string, prompt: string) {
      const model = "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7 }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini Error: ${errorText}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    }

    async function callOpenAI(key: string, prompt: string) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Error: ${errorText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() ?? "";
    }

    let text = "";
    const prompt = promptFn(context);

    try {
      if (isGemini) {
        console.log("Tentando Gemini...");
        text = await callGemini(geminiKey!, prompt);
      } else {
        console.log("Tentando OpenAI...");
        text = await callOpenAI(openaiKey!, prompt);
      }
    } catch (err) {
      console.error("Provedor principal falhou:", err);
      if (isGemini && openaiKey) {
        console.log("Gemini falhou, tentando OpenAI como fallback...");
        try {
          text = await callOpenAI(openaiKey, prompt);
        } catch (openaiErr) {
          const geminiMsg = err instanceof Error ? err.message : String(err);
          const openaiMsg = openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
          throw new Error(`Ambos os provedores falharam. Gemini: ${geminiMsg}. OpenAI: ${openaiMsg}`);
        }
      } else {
        throw err;
      }
    }
    
    // Remover blocos de código se a IA retornar markdown
    text = text.replace(/```json|```/g, "").trim();

    if (!text) {
      return new Response(JSON.stringify({ error: "Resposta vazia da IA." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se for um dos campos que espera JSON, tenta parsear
    const jsonFields = ["pain_items", "solution_items", "article_with_carousel"];
    if (jsonFields.includes(field)) {
      try {
        console.log(`Tentando parsear JSON para o campo: ${field}`);
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);

        // Automação de imagens para artigos
        if (field === "article_with_carousel" && parsed.carousel_items) {
          const pexelsKey = Deno.env.get("PEXELS_API_KEY");
          
          const searchImage = async (query: string) => {
            if (pexelsKey) {
              try {
                console.log(`Buscando no Pexels: ${query}`);
                const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
                  headers: { Authorization: pexelsKey }
                });
                const data = await res.json();
                if (data.photos?.[0]?.src?.large) return data.photos[0].src.large;
              } catch (e) {
                console.error("Pexels error:", e);
              }
            }
            // Fallback para Unsplash Source / LoremFlickr
            const fallbacks = [
              `https://source.unsplash.com/featured/1080x1080/?${query.replace(/ /g, ",")}`,
              `https://loremflickr.com/1080/1080/${query.replace(/ /g, ",")}`
            ];
            return fallbacks[Math.floor(Math.random() * fallbacks.length)];
          };

          if (parsed.cover_image_suggestion) {
            parsed.cover_image_url = await searchImage(parsed.cover_image_suggestion);
          }

          // Buscar imagens para o carrossel em paralelo
          const imagePromises = parsed.carousel_items.map(async (item: any) => {
             const img = await searchImage(item.image_suggestion || "mental health");
             return { ...item, image_url: img };
          });
          
          parsed.carousel_items = await Promise.all(imagePromises);
        }

        return new Response(JSON.stringify({ result: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error("JSON Parse error:", e, "Raw Text:", text);
        
        // Tentar extrair apenas o conteúdo entre chaves { } ou colchetes [ ]
        try {
           const startChar = field === "article_with_carousel" ? '{' : '[';
           const endChar = field === "article_with_carousel" ? '}' : ']';
           
           const start = text.indexOf(startChar);
           const end = text.lastIndexOf(endChar);
           
           if (start !== -1 && end !== -1) {
             const jsonPart = text.substring(start, end + 1);
             const parsed = JSON.parse(jsonPart);
             return new Response(JSON.stringify({ result: parsed }), {
               headers: { ...corsHeaders, "Content-Type": "application/json" },
             });
           }
        } catch (e2) {
           console.error("Second attempt JSON Parse error:", e2);
        }
        
        return new Response(JSON.stringify({ 
          error: "IA retornou formato inválido", 
          details: "Não foi possível extrair um JSON válido da resposta da IA.",
          raw: text.substring(0, 500) 
        }), {
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

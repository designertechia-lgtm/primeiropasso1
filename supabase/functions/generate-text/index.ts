// deno-lint-ignore-file no-explicit-any

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
  existing_titles?: string[];
  existing_cover_urls?: string[];
  existing_carousel_urls?: string[];
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

  article_with_carousel: (ctx) => {
    const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const existingList = ctx.existing_titles?.length
      ? `\nARTIGOS JÁ EXISTENTES — NÃO repita estes temas nem títulos parecidos:\n${ctx.existing_titles.map(t => `- ${t}`).join("\n")}\n`
      : "";
    const topicHint = (ctx as any).topic
      ? `\nSUGESTÃO DO PROFISSIONAL (priorize este tema e tom):\n"${(ctx as any).topic}"\n`
      : "";
    return `Você é um redator especialista em saúde mental e criação de conteúdo para Instagram.
Data de hoje: ${today}
Profissional: ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
${ctx.title ? `Título sugerido: "${ctx.title}"` : ""}
${topicHint}
${existingList}
Crie um carrossel ORIGINAL para Instagram com tema DIFERENTE de todos os já existentes acima.
${ (ctx as any).topic ? "Use o tema sugerido pelo profissional como base principal." : "Escolha UM dos seguintes ângulos (varie sempre, nunca repita o mesmo ângulo):"}
- Autoconhecimento e emoções
- Relacionamentos e vínculos afetivos
- Ansiedade, estresse e burnout
- Sono, energia e rotina saudável
- Limites pessoais e assertividade
- Traumas e processo de cura
- Autoestima e autocuidado
- Comunicação não violenta
- Mindfulness e presença
- Parentalidade e vínculos familiares

Regras obrigatórias:
- Título: máximo 12 palavras, impactante, SEM mencionar ano
- Legenda Instagram: 3-4 parágrafos curtos, 150-200 palavras no total, termina com chamada para ação
- Carrossel: 5 a 7 slides, cada legenda com no máximo 15 palavras, direto e impactante
- Sugestões de imagem sempre em INGLÊS (palavras-chave para banco de imagens)

Responda APENAS com JSON válido no formato:
{"title":"...","content":"...","cover_image_suggestion":"...","carousel_items":[{"image_suggestion":"...","caption":"..."}]}
Sem comentários, sem markdown, apenas o JSON.`;
  },
};

Deno.serve(async (req) => {
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

          // Extrai IDs do Pexels de URLs já usadas em outros artigos (formato: /photos/1234567/)
          const extractPexelsId = (url: string): number | null => {
            const m = url.match(/\/photos\/(\d+)\//);
            return m ? parseInt(m[1]) : null;
          };

          // Coleta todas as URLs usadas (capas + carrossel de artigos existentes)
          const allExistingUrls = new Set<string>(context.existing_cover_urls ?? []);
          for (const u of context.existing_carousel_urls ?? []) allExistingUrls.add(u);

          const usedImageIds = new Set<number>();
          for (const url of allExistingUrls) {
            const id = extractPexelsId(url);
            if (id) usedImageIds.add(id);
          }

          // Seeds usados nesta geração para o fallback picsum
          const usedPicsumSeeds = new Set<number>();

          const searchImage = async (query: string, fallbackSeed?: number): Promise<string> => {
            if (pexelsKey) {
              try {
                console.log(`Buscando no Pexels: ${query}`);
                // Tenta até 5 páginas (range 1-20) para encontrar foto não usada
                for (let attempt = 0; attempt < 5; attempt++) {
                  const page = Math.floor(Math.random() * 20) + 1;
                  const res = await fetch(
                    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=30&page=${page}`,
                    { headers: { Authorization: pexelsKey } }
                  );
                  if (!res.ok) break;
                  const data = await res.json();
                  const photos = (data.photos ?? []).filter(
                    (p: any) => !usedImageIds.has(p.id) && !allExistingUrls.has(p.src.large2x ?? p.src.large)
                  );
                  if (photos.length > 0) {
                    const pick = photos[Math.floor(Math.random() * photos.length)];
                    usedImageIds.add(pick.id);
                    allExistingUrls.add(pick.src.large2x ?? pick.src.large);
                    return pick.src.large2x ?? pick.src.large;
                  }
                }
              } catch (e) {
                console.error("Pexels error:", e);
              }
            }
            // Fallback: picsum.photos com seed único — sem loremflickr
            let seed = fallbackSeed ?? Math.floor(Math.random() * 99999);
            while (usedPicsumSeeds.has(seed)) seed = Math.floor(Math.random() * 99999);
            usedPicsumSeeds.add(seed);
            console.log(`Usando picsum fallback: seed=${seed} query=${query}`);
            return `https://picsum.photos/seed/${seed}/1080/1080`;
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

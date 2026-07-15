// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Consumo de tokens por profissional (admin-gerente → aba usuários) ───
// Dono do consumo: JWT de usuário logado (front) OU professional_id do body
// (chamada interna do axel-agent, que vem com a anon key). Sem dono → não grava.
// Best-effort: contabilidade NUNCA derruba a geração.
async function resolveProfessionalId(req: Request, admin: any, bodyProfessionalId?: string): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (token) {
    try {
      const { data } = await admin.auth.getUser(token);
      const uid = data?.user?.id;
      if (uid) {
        const { data: prof } = await admin.from("professionals").select("id").eq("user_id", uid).maybeSingle();
        if (prof?.id) return prof.id;
      }
    } catch (_) { /* anon/service key não é JWT de usuário — tenta o body */ }
  }
  return bodyProfessionalId || null;
}

// Preços Sonnet 4.6 (USD/M): $3 in, $15 out, $3.75 cache write, $0.30 cache read.
async function recordLlmUsage(admin: any, professionalId: string | null, source: string, model: string, usage: any) {
  if (!professionalId || !usage) return;
  const inTok = usage.input_tokens || 0;
  const cacheW = usage.cache_creation_input_tokens || 0;
  const cacheR = usage.cache_read_input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const costUsd = (inTok * 3 + cacheW * 3.75 + cacheR * 0.3 + outTok * 15) / 1e6;
  try {
    const { error } = await admin.from("llm_usage").insert({
      professional_id: professionalId, source, model, calls: 1,
      input_tokens: inTok + cacheW + cacheR, output_tokens: outTok, cached_tokens: cacheR,
      cost_usd: Number(costUsd.toFixed(6)),
    });
    if (error) console.warn("[llm_usage] insert falhou:", error.message);
  } catch (e: any) { console.warn("[llm_usage] insert falhou:", e?.message); }
}

interface Context {
  name: string;
  crp?: string;
  specialty?: string;
  title?: string;
  topic?: string;
  existing_titles?: string[];
  existing_cover_urls?: string[];
  existing_carousel_urls?: string[];
  items?: string[]; // textos já existentes (modos pain_icons / solution_icons)
}

// Ícones aceitos nos cards de Dores e Soluções.
// ESPELHO de ICON_NAMES em `src/lib/landing/icons.ts` (a edge roda em Deno e não importa o módulo
// do front). Ao mexer lá, atualize aqui. Divergir não quebra: nome fora desta lista é descartado
// em sanitizeIcons() e o front cai no ícone por posição.
// Ao contrário de generate-landing, aqui não há structured output para prender o modelo ao enum —
// por isso a lista vai no prompt E o resultado é validado contra ela antes de sair da edge.
const ICON_NAMES = [
  "brain", "heart", "heart-crack", "cloud", "cloud-rain", "moon", "sparkles", "frown",
  "smile", "activity", "heart-pulse", "stethoscope", "bed", "dumbbell", "leaf", "flower",
  "clock", "timer", "calendar", "calendar-clock", "hourglass", "alarm-clock", "repeat",
  "refresh", "users", "user", "user-plus", "message-circle", "message-square", "handshake",
  "home", "baby", "briefcase", "laptop", "code", "bug", "server", "database", "settings",
  "wrench", "terminal", "git-branch", "alert-triangle", "alert-circle", "alert-octagon",
  "x-circle", "ban", "flame", "trending-down", "thumbs-down", "battery-low", "lightbulb",
  "target", "check-circle", "shield", "shield-check", "rocket", "trending-up", "award",
  "trophy", "key", "compass", "thumbs-up", "zap", "book-open", "graduation-cap", "eye",
  "search", "map", "footprints",
];
const ICON_SET = new Set(ICON_NAMES);

const ICON_RULE = `Cada item tem um campo "icon": escolha o ícone que representa o CONTEÚDO daquele item específico, não o tema da seção. Prefira o mais literal ao mais poético (item sobre sono → "moon"; sobre prazo → "clock"; sobre falha técnica → "bug"; sobre cansaço → "battery-low"). Não repita o mesmo ícone em dois itens.
Use EXCLUSIVAMENTE um destes nomes, exatamente como escritos: ${ICON_NAMES.join(", ")}.`;

// Descarta ícone que não está no catálogo (o modelo pode inventar — aqui não há enum prendendo).
// Item fica sem `icon` e o front usa o ícone por posição: some o ícone errado, nunca a tela.
function sanitizeIcons(parsed: any, field: string): any {
  if (field === "pain_icons" || field === "solution_icons") {
    return Array.isArray(parsed) ? parsed.map((n: any) => (ICON_SET.has(n) ? n : null)) : parsed;
  }
  if ((field === "pain_items" || field === "solution_items") && Array.isArray(parsed)) {
    return parsed.map((it: any) => {
      if (!it || typeof it !== "object" || ICON_SET.has(it.icon)) return it;
      const { icon: _descartado, ...resto } = it;
      return resto;
    });
  }
  return parsed;
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
Crie uma lista de EXATAMENTE 6 sintomas/dores emocionais que os pacientes de ${ctx.name}${ctx.specialty ? ` (${ctx.specialty})` : ""} costumam sentir.
Cada item deve ser uma frase curta (máx 12 palavras), em primeira ou segunda pessoa, que gere identificação imediata.
${ICON_RULE}
Responda APENAS um JSON válido com 6 itens no formato: [{"text":"...","icon":"..."},{"text":"...","icon":"..."},{"text":"...","icon":"..."},{"text":"...","icon":"..."},{"text":"...","icon":"..."},{"text":"...","icon":"..."}]
Sem comentários, sem markdown, apenas o JSON.`,

  // Só os ícones, a partir dos textos que já existem — para landings publicadas antes do campo
  // `icon` existir. NÃO reescreve o texto: o profissional não perde a copy que já aprovou.
  pain_icons: (ctx) =>
    `Você escolhe ícones para os cards da seção "dores" de uma landing page.
${ICON_RULE}
Estes são os itens, na ordem (use o texto de cada um para escolher o ícone do problema que ele descreve):
${(ctx.items ?? []).map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}
Responda APENAS um JSON válido — um array com EXATAMENTE ${(ctx.items ?? []).length} nomes de ícone, na mesma ordem dos itens acima.
Formato: ["nome-do-icone","nome-do-icone",...]
Sem comentários, sem markdown, apenas o JSON.`,

  solution_icons: (ctx) =>
    `Você escolhe ícones para os cards da seção "soluções/benefícios" de uma landing page.
${ICON_RULE}
Estes são os cards, na ordem (use o título e a descrição para escolher o ícone do GANHO que ele entrega):
${(ctx.items ?? []).map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}
Responda APENAS um JSON válido — um array com EXATAMENTE ${(ctx.items ?? []).length} nomes de ícone, na mesma ordem dos cards acima.
Formato: ["nome-do-icone","nome-do-icone",...]
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
Crie EXATAMENTE 6 cards de benefícios do trabalho de ${ctx.name}${ctx.specialty ? ` (${ctx.specialty})` : ""}.
Cada card tem um título curto (2-4 palavras) e uma descrição (1-2 frases, máx 20 palavras).
${ICON_RULE}
Responda APENAS um JSON válido com 6 cards: [{"title":"...","desc":"...","icon":"..."},{"title":"...","desc":"...","icon":"..."},{"title":"...","desc":"...","icon":"..."},{"title":"...","desc":"...","icon":"..."},{"title":"...","desc":"...","icon":"..."},{"title":"...","desc":"...","icon":"..."}]
Sem comentários, sem markdown, apenas o JSON.`,

  // Vilão — "por que nada funcionou": nomeia a causa-raiz sem culpar o cliente + a virada.
  villain_body: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Escreva o corpo da seção "por que nada do que a pessoa tentou funcionou até agora" da página de ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
Explique a CAUSA REAL do problema SEM culpar o leitor (o problema não é falta de esforço nem "falha" dele), e termine deixando claro que isso tem saída quando se olha para a raiz certa.
Escreva 2 parágrafos curtos, acolhedores, separados por uma linha em branco. Máx 90 palavras no total.
Responda APENAS com o texto, sem título, sem aspas.`,

  // Para quem é / para quem não é — qualifica o lead.
  audience_lists: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Para a página de ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}, crie duas listas curtas que qualificam o público.
"for": 4 frases de "este acompanhamento é para você se..." (quem se beneficia).
"not_for": 3 frases de "talvez não seja o momento se..." (respeitosas, sem julgar).
Cada frase com no máx 12 palavras, em segunda pessoa.
Responda APENAS um JSON válido: {"for":["...","...","...","..."],"not_for":["...","...","..."]}
Sem comentários, sem markdown, apenas o JSON.`,

  // FAQ — quebra objeção e protege limites éticos.
  faq_items: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Crie 5 perguntas frequentes com respostas para a página de ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
O PRIMEIRO item DEVE ser obrigatoriamente a pergunta "Isto substitui acompanhamento médico ou psicológico?" com resposta responsável (complementa e não substitui tratamento médico/psiquiátrico/psicológico; em urgência, procurar serviços de emergência como SAMU 192 ou CVV 188).
Os outros 4: dúvidas de tempo/duração, formato (online/presencial), "já tentei de tudo e não funcionou" e como começar. NUNCA prometa cura.
Cada resposta com 2 a 3 frases, acolhedora.
Responda APENAS um JSON válido: [{"q":"...","a":"..."},{"q":"...","a":"..."},{"q":"...","a":"..."},{"q":"...","a":"..."},{"q":"...","a":"..."}]
Sem comentários, sem markdown, apenas o JSON.`,

  // Oferta única — a seção decisiva de conversão.
  offer_description: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Descreva de forma clara UMA oferta/serviço principal de ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""} (ex.: primeira sessão, acompanhamento contínuo).
2 a 3 frases, específica e honesta, SEM promessa de cura nem resultado garantido, focada em como dar o primeiro passo.
Responda APENAS com o texto, sem título, sem aspas.`,

  // Oferta — "como funciona" em passos.
  offer_steps: (ctx) =>
    `Você é um redator especialista em marketing para profissionais de saúde mental.
Crie 3 passos de "como funciona" para começar o acompanhamento com ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""} (ex.: 1. Contato, 2. Primeira conversa, 3. Plano/acompanhamento).
Cada passo tem um título curto (2-4 palavras) e uma descrição (1 frase, máx 18 palavras).
Responda APENAS um JSON válido: [{"title":"...","desc":"..."},{"title":"...","desc":"..."},{"title":"...","desc":"..."}]
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

  // Roteiro de narração para vídeo curto viral (aba "Conteúdo Viral").
  // Texto corrido pronto para ser narrado / colado no gerador de vídeo.
  viral_video_script: (ctx) =>
    `Você é um roteirista especialista em vídeos curtos virais (Reels, TikTok, YouTube Shorts) para profissionais de saúde mental.
Profissional: ${ctx.name}${ctx.specialty ? `, especialista em ${ctx.specialty}` : ""}.
Tema/briefing do vídeo: "${ctx.topic || ctx.title || ""}".
Escreva o ROTEIRO DE NARRAÇÃO de um vídeo curto vertical (9:16), em português do Brasil.
Regras:
- Comece com um GANCHO forte nos 3 primeiros segundos.
- Linguagem falada, acolhedora e direta; frases curtas.
- Entre 70 e 110 palavras (cerca de 30 a 45 segundos de narração).
- Entregue UMA ideia central com valor prático para quem assiste.
- Termine com uma chamada para ação suave (ex.: convidar a cuidar da saúde mental ou buscar apoio).
- NÃO use emojis, hashtags, marcações de cena, nome de locutor nem títulos.
Responda APENAS com o texto corrido do roteiro que será narrado, sem aspas e sem explicações.`,
};

// Geração de texto via Anthropic (Claude) — mesmo padrão das demais edge functions do projeto.
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { field, context, professional_id } = await req.json() as { field: string; context: Context; professional_id?: string };

    const promptFn = PROMPTS[field];
    if (!promptFn) {
      return new Response(JSON.stringify({ error: "Campo inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY não configurada no ambiente.");
      return new Response(JSON.stringify({
        error: "Configuração incompleta",
        details: "A chave ANTHROPIC_API_KEY não foi configurada nas Secrets do Supabase.",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let text = "";
    const prompt = promptFn(context);

    // 1 chamada à Anthropic (Claude) — mesmo padrão das demais edge functions do projeto.
    const claudeResp = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      console.error("[generate-text] Anthropic error:", errText);
      return new Response(JSON.stringify({
        error: "Erro ao gerar texto com IA",
        details: `Claude ${claudeResp.status}: ${errText.slice(0, 200)}`,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claudeData = await claudeResp.json();

    // Contabiliza o consumo no dono (o custo aconteceu mesmo se o texto vier vazio).
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const ownerId = await resolveProfessionalId(req, admin, professional_id);
      if (ownerId) await recordLlmUsage(admin, ownerId, "generate_text", CLAUDE_MODEL, claudeData.usage);
      else console.warn("[llm_usage] generate-text sem dono identificável — consumo não gravado");
    } catch (e: any) { console.warn("[llm_usage] contabilização falhou:", e?.message); }

    text = (claudeData.content?.find((b: any) => b.type === "text")?.text || "").trim();

    // Remover blocos de código se a IA retornar markdown
    text = text.replace(/```json|```/g, "").trim();

    if (!text) {
      return new Response(JSON.stringify({ error: "Resposta vazia da IA." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se for um dos campos que espera JSON, tenta parsear
    const jsonFields = ["pain_items", "solution_items", "pain_icons", "solution_icons", "article_with_carousel", "faq_items", "offer_steps", "audience_lists"];
    if (jsonFields.includes(field)) {
      try {
        console.log(`Tentando parsear JSON para o campo: ${field}`);
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = sanitizeIcons(JSON.parse(clean), field);

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
           const objectField = field === "article_with_carousel" || field === "audience_lists";
           const startChar = objectField ? '{' : '[';
           const endChar = objectField ? '}' : ']';
           
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

// Dispara automações PRO cujo proximo_run_at <= agora.
// Gera o vídeo via video-api e agenda um social_post para publicação imediata.
// Invocado pelo Supabase Cron a cada hora: "0 * * * *"
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VIDEO_API_URL = Deno.env.get("VIDEO_API_URL") ?? "https://video-api.primeiropasso.online";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const db = (path: string, opts?: RequestInit) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Prefer": "return=representation",
      ...(opts?.headers ?? {}),
    },
  });

function nextRunAt(frequencia: string, hora: string): string {
  const now   = new Date();
  const [h, m] = hora.split(":").map(Number);
  const next  = new Date(now);
  next.setHours(h, m, 0, 0);

  const daysMap: Record<string, number> = { diario: 1, semanal: 7, quinzenal: 14 };
  const days = daysMap[frequencia] ?? 7;
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

async function getProfessionalSlug(professionalId: string): Promise<string | null> {
  const res  = await db(`professionals?id=eq.${professionalId}&select=slug&limit=1`);
  const rows = await res.json();
  return rows?.[0]?.slug ?? null;
}

async function generateVideo(slug: string, tema: string): Promise<{ jobId: string }> {
  // 1. Gera roteiro via video-api
  const roteiroRes = await fetch(`${VIDEO_API_URL}/gerar-roteiro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      professional_slug: slug,
      tema_sugerido: tema,
      tom: "acolhedor",
      plataforma: "geral",
    }),
  });
  if (!roteiroRes.ok) throw new Error(`Roteiro: ${roteiroRes.status}`);
  const roteiro = await roteiroRes.json();

  // 2. Dispara geração do vídeo (gratuito — Pexels)
  const videoRes = await fetch(`${VIDEO_API_URL}/gerar-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      professional_slug: slug,
      video_type: "objetivo_livre",
      objetivo: tema,
      script: roteiro,
      voice: "pt-BR-FranciscaNeural",
      voice_provider: "edge",
      format: "portrait",
      model: "gratuito",
      visual_style: "images",
    }),
  });
  if (!videoRes.ok) throw new Error(`Geração: ${videoRes.status}`);
  const videoData = await videoRes.json();
  return { jobId: videoData.job_id };
}

async function pollUntilDone(jobId: string, timeoutMs = 300_000): Promise<{ videoId: string; videoUrl: string; titulo: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000));
    const res  = await fetch(`${VIDEO_API_URL}/status/${jobId}`);
    const data = await res.json();
    if (data.status === "done")   return { videoId: data.video_id, videoUrl: data.video_url, titulo: data.titulo ?? "" };
    if (data.status === "error")  throw new Error(data.message ?? "Erro no job");
    if (data.status === "cancelled") throw new Error("Job cancelado");
  }
  throw new Error("Timeout ao aguardar vídeo (5 min)");
}

async function schedulePost(
  professionalId: string,
  videoId: string,
  platform: string,
  postType: string,
  description: string,
): Promise<void> {
  const scheduledAt = new Date(Date.now() + 60_000).toISOString(); // 1 min no futuro
  await db("social_posts", {
    method: "POST",
    body: JSON.stringify({
      professional_id: professionalId,
      video_id:        videoId,
      platform,
      post_type:       postType,
      scheduled_at:    scheduledAt,
      description,
      status:          "pending",
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const now = new Date().toISOString();

    // Buscar automações devidas
    const autoRes = await db(
      `social_automations?status=eq.active&proximo_run_at=lte.${now}&select=*`
    );
    const automations = await autoRes.json();

    if (!Array.isArray(automations) || automations.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "Nenhuma automação devida" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const automation of automations) {
      try {
        // 1. Marcar como em execução (atualiza ultimo_run_at imediatamente)
        await db(`social_automations?id=eq.${automation.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ultimo_run_at: now }),
        });

        const slug = await getProfessionalSlug(automation.professional_id);
        if (!slug) throw new Error("Profissional não encontrado");

        // 2. Gerar vídeo
        const { jobId } = await generateVideo(slug, automation.tema);
        const { videoId, titulo } = await pollUntilDone(jobId);

        // 3. Agendar publicação
        await schedulePost(
          automation.professional_id,
          videoId,
          automation.platform,
          automation.post_type,
          `${titulo} — ${automation.tema}`,
        );

        // 4. Calcular próximo run
        const proximoRunAt = nextRunAt(automation.frequencia, automation.hora_publicacao);
        await db(`social_automations?id=eq.${automation.id}`, {
          method: "PATCH",
          body: JSON.stringify({ proximo_run_at: proximoRunAt }),
        });

        results.push({ id: automation.id, status: "ok" });

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Automation ${automation.id} falhou:`, msg);
        results.push({ id: automation.id, status: "error", error: msg });
        // Não pausa a automação por falha pontual — só registra
      }
    }

    // Disparar publish-social-posts para publicar o que foi agendado agora
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/publish-social-posts`, {
        method: "POST",
        headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` },
      });
    } catch (_) { /* ignora falha no publish — cron vai tentar novamente */ }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

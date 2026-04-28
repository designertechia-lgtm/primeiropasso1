// Publica os social_posts com status='pending' e scheduled_at <= agora.
// Suporta Instagram Reels (MP4 via Supabase Storage) e Feed (IMAGE).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function updatePost(id: string, status: string, error?: string) {
  const body: Record<string, string> = { status };
  if (error) body.error_message = error.slice(0, 500);
  await db(`social_posts?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

async function publishInstagramReel(
  igUserId: string,
  accessToken: string,
  videoUrl: string,
  caption: string,
): Promise<void> {
  // 1. Criar container Reels
  const createRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type:   "REELS",
        video_url:    videoUrl,
        caption:      caption,
        access_token: accessToken,
      }),
    }
  );
  const createData = await createRes.json();
  if (!createData.id) {
    throw new Error(createData.error?.message ?? `Container creation failed: ${JSON.stringify(createData)}`);
  }
  const creationId = createData.id as string;

  // 2. Aguardar processamento (até 90s, poll a cada 5s)
  let statusCode = "";
  for (let i = 0; i < 18; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://graph.instagram.com/v21.0/${creationId}?fields=status_code,status&access_token=${accessToken}`
    );
    const statusData = await statusRes.json();
    statusCode = statusData.status_code ?? "";
    if (statusCode === "FINISHED") break;
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(`Processamento falhou: ${statusData.status ?? statusCode}`);
    }
  }

  if (statusCode !== "FINISHED") {
    throw new Error("Timeout: vídeo ainda processando após 90s. Tente republicar.");
  }

  // 3. Publicar
  const publishRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id:  creationId,
        access_token: accessToken,
      }),
    }
  );
  const publishData = await publishRes.json();
  if (!publishData.id) {
    throw new Error(publishData.error?.message ?? `Publish failed: ${JSON.stringify(publishData)}`);
  }
}

async function publishInstagramImage(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
): Promise<void> {
  // 1. Criar container IMAGE
  const createRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type:   "IMAGE",
        image_url:    imageUrl,
        caption:      caption,
        access_token: accessToken,
      }),
    }
  );
  const createData = await createRes.json();
  if (!createData.id) {
    throw new Error(createData.error?.message ?? `Container creation failed: ${JSON.stringify(createData)}`);
  }
  const creationId = createData.id as string;

  // 2. Poll curto para imagens (processamento rápido, até 30s)
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://graph.instagram.com/v21.0/${creationId}?fields=status_code,status&access_token=${accessToken}`
    );
    const statusData = await statusRes.json();
    const statusCode = statusData.status_code ?? "FINISHED";
    if (statusCode === "FINISHED") break;
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      throw new Error(`Processamento falhou: ${statusData.status ?? statusCode}`);
    }
  }

  // 3. Publicar
  const publishRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id:  creationId,
        access_token: accessToken,
      }),
    }
  );
  const publishData = await publishRes.json();
  if (!publishData.id) {
    throw new Error(publishData.error?.message ?? `Publish failed: ${JSON.stringify(publishData)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // 1. Buscar posts pendentes com scheduled_at <= agora
    const now = new Date().toISOString();
    const postsRes = await db(
      `social_posts?status=eq.pending&scheduled_at=lte.${now}&select=*,videos!inner(id,title,embed_url)`
    );
    const posts = await postsRes.json();

    if (!Array.isArray(posts) || posts.length === 0) {
      return new Response(JSON.stringify({ published: 0, message: "Nenhum post pendente" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const post of posts) {
      const postType: string = post.post_type ?? "reels";

      // 2. Buscar conta social do profissional para esta plataforma
      const accountRes = await db(
        `social_accounts?professional_id=eq.${post.professional_id}&platform=eq.${post.platform}&limit=1`
      );
      const accounts = await accountRes.json();
      const account = accounts?.[0];

      if (!account?.access_token) {
        await updatePost(post.id, "failed", "Conta não conectada. Conecte o Instagram em Configurações.");
        results.push({ id: post.id, status: "failed", error: "Conta não conectada" });
        continue;
      }

      // Verificar expiração do token
      if (account.expires_at && new Date(account.expires_at) < new Date()) {
        await updatePost(post.id, "failed", "Token expirado. Reconecte o Instagram em Configurações.");
        results.push({ id: post.id, status: "failed", error: "Token expirado" });
        continue;
      }

      try {
        if (post.platform === "instagram") {
          if (postType === "feed") {
            const imageUrl: string = post.image_url ?? "";
            if (!imageUrl) {
              await updatePost(post.id, "failed", "URL da imagem não encontrada para post de Feed.");
              results.push({ id: post.id, status: "failed", error: "Sem image_url" });
              continue;
            }
            await publishInstagramImage(
              account.account_id,
              account.access_token,
              imageUrl,
              post.description ?? post.videos?.title ?? "",
            );
          } else {
            // Reels: post de vídeo
            const videoUrl: string = post.videos?.embed_url ?? "";
            if (!videoUrl || /youtube|youtu\.be/i.test(videoUrl)) {
              await updatePost(post.id, "failed", "URL do vídeo inválida ou YouTube (não suportado para publicação automática)");
              results.push({ id: post.id, status: "failed", error: "YouTube URL" });
              continue;
            }
            await publishInstagramReel(
              account.account_id,
              account.access_token,
              videoUrl,
              post.description ?? post.videos?.title ?? "",
            );
          }
        } else {
          await updatePost(post.id, "failed", `Plataforma ${post.platform} ainda não suportada`);
          results.push({ id: post.id, status: "failed", error: "Plataforma não suportada" });
          continue;
        }

        await updatePost(post.id, "published");
        results.push({ id: post.id, status: "published" });

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await updatePost(post.id, "failed", msg);
        results.push({ id: post.id, status: "failed", error: msg });
      }
    }

    const published = results.filter((r) => r.status === "published").length;
    const failed    = results.filter((r) => r.status === "failed").length;

    return new Response(JSON.stringify({ published, failed, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

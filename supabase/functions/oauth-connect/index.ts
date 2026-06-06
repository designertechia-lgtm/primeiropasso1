// Gera a URL OAuth para Meta (Instagram Login direto), Facebook Pages, Threads e LinkedIn.
// Autentica o usuário via JWT, resolve o professional_id dele e embute no state.
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY  = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY        = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_APP_ID        = Deno.env.get("META_APP_ID") ?? "";
// Cada produto Meta usa o App ID do SEU próprio app — Instagram, Facebook e Threads
// têm IDs distintos. Caem em META_APP_ID se a variável específica não estiver setada.
const INSTAGRAM_APP_ID   = Deno.env.get("INSTAGRAM_APP_ID") ?? META_APP_ID;
const FACEBOOK_APP_ID    = Deno.env.get("FACEBOOK_APP_ID")  ?? META_APP_ID;
const THREADS_APP_ID     = Deno.env.get("THREADS_APP_ID")   ?? META_APP_ID;
const LINKEDIN_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID") ?? "";

const REDIRECT_BASE = `${SUPABASE_URL}/functions/v1`;

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError("Não autorizado", 401);

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return jsonError("Não autorizado", 401);
  const user = await userRes.json();

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/professionals?user_id=eq.${user.id}&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const profs = await profRes.json();
  if (!profs?.[0]?.id) return jsonError("Profissional não encontrado", 404);
  const professional_id = profs[0].id as string;

  const { platform } = (await req.json()) as { platform: string };
  let url: string;

  if (platform === "meta" || platform === "instagram") {
    if (!INSTAGRAM_APP_ID) return jsonError("INSTAGRAM_APP_ID não configurado", 500);
    const params = new URLSearchParams({
      force_reauth:  "true",
      client_id:     INSTAGRAM_APP_ID,
      redirect_uri:  `${REDIRECT_BASE}/oauth-meta-callback`,
      response_type: "code",
      scope: [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments",
        "instagram_business_content_publish",
        "instagram_business_manage_insights",
      ].join(","),
      state: professional_id,
    });
    url = `https://www.instagram.com/oauth/authorize?${params}`;

  } else if (platform === "facebook") {
    if (!FACEBOOK_APP_ID) return jsonError("FACEBOOK_APP_ID não configurado", 500);
    const params = new URLSearchParams({
      client_id:     FACEBOOK_APP_ID,
      redirect_uri:  `${REDIRECT_BASE}/oauth-facebook-callback`,
      response_type: "code",
      scope: [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "pages_manage_metadata",
        "business_management",
      ].join(","),
      state: professional_id,
      auth_type: "rerequest",
    });
    url = `https://www.facebook.com/v21.0/dialog/oauth?${params}`;

  } else if (platform === "threads") {
    if (!THREADS_APP_ID) return jsonError("THREADS_APP_ID não configurado", 500);
    const params = new URLSearchParams({
      client_id:     THREADS_APP_ID,
      redirect_uri:  `${REDIRECT_BASE}/oauth-threads-callback`,
      response_type: "code",
      scope: [
        "threads_basic",
        "threads_content_publish",
        "threads_manage_replies",
        "threads_read_replies",
      ].join(","),
      state: professional_id,
    });
    url = `https://threads.net/oauth/authorize?${params}`;

  } else if (platform === "linkedin") {
    if (!LINKEDIN_CLIENT_ID) return jsonError("LINKEDIN_CLIENT_ID não configurado", 500);
    const params = new URLSearchParams({
      response_type: "code",
      client_id:     LINKEDIN_CLIENT_ID,
      redirect_uri:  `${REDIRECT_BASE}/oauth-linkedin-callback`,
      state:         professional_id,
      scope:         "w_member_social r_basicprofile",
    });
    url = `https://www.linkedin.com/oauth/v2/authorization?${params}`;

  } else {
    return jsonError("Plataforma inválida", 400);
  }

  return new Response(JSON.stringify({ url }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

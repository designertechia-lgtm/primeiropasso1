// Gera a URL OAuth para Meta (Instagram) ou LinkedIn.
// Autentica o usuário via JWT, resolve o professional_id dele e embute no state.
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_APP_ID       = Deno.env.get("META_APP_ID") ?? "";
const LINKEDIN_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID") ?? "";

const REDIRECT_BASE = `${SUPABASE_URL}/functions/v1`;

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Verificar JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const user = await userRes.json();

  // Resolver professional_id
  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/professionals?user_id=eq.${user.id}&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const profs = await profRes.json();
  if (!profs?.[0]?.id) {
    return new Response(JSON.stringify({ error: "Profissional não encontrado" }), {
      status: 404, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const professional_id = profs[0].id as string;

  const { platform } = await req.json() as { platform: string };
  let url: string;

  if (platform === "meta") {
    if (!META_APP_ID) {
      return new Response(JSON.stringify({ error: "META_APP_ID não configurado" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const params = new URLSearchParams({
      client_id:     META_APP_ID,
      redirect_uri:  `${REDIRECT_BASE}/oauth-meta-callback`,
      scope:         "instagram_basic,instagram_content_publish,pages_manage_posts,pages_read_engagement",
      state:         professional_id,
      response_type: "code",
    });
    url = `https://www.facebook.com/v21.0/dialog/oauth?${params}`;

  } else if (platform === "linkedin") {
    if (!LINKEDIN_CLIENT_ID) {
      return new Response(JSON.stringify({ error: "LINKEDIN_CLIENT_ID não configurado" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const params = new URLSearchParams({
      response_type: "code",
      client_id:     LINKEDIN_CLIENT_ID,
      redirect_uri:  `${REDIRECT_BASE}/oauth-linkedin-callback`,
      state:         professional_id,
      scope:         "w_member_social r_basicprofile",
    });
    url = `https://www.linkedin.com/oauth/v2/authorization?${params}`;

  } else {
    return new Response(JSON.stringify({ error: "Plataforma inválida" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ url }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

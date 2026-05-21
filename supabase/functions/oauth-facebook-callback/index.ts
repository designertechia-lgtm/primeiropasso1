// Callback OAuth do Facebook (Login). Troca code por token, lista páginas e salva
// a primeira em social_accounts como platform='facebook'.
// Se o usuário tiver várias páginas, vamos salvar todas como linhas separadas
// no futuro — por enquanto, salva só a primeira pra simplificar.
const META_APP_ID     = Deno.env.get("META_APP_ID")!;
const META_APP_SECRET = Deno.env.get("META_APP_SECRET")!;
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REDIRECT_URI    = `${SUPABASE_URL}/functions/v1/oauth-facebook-callback`;

function htmlPage(success: boolean, error?: string): string {
  const message = success
    ? `<p style="color:#16a34a;font-size:1.1rem;margin:0">✓ Facebook conectado!</p>`
    : `<p style="color:#dc2626;font-size:1rem;margin:0">Erro: ${error ?? "Falha na autenticação"}</p>`;
  const payload = JSON.stringify({
    type:     success ? "OAUTH_SUCCESS" : "OAUTH_ERROR",
    platform: "facebook",
    error:    error ?? null,
  });
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Conectando Facebook...</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc}.box{text-align:center;padding:2rem}.sub{color:#6b7280;font-size:.875rem;margin-top:.75rem}</style>
</head><body><div class="box">${message}<p class="sub">Esta janela será fechada automaticamente.</p></div>
<script>try{if(window.opener)window.opener.postMessage(${payload},'*');}catch(_){}setTimeout(()=>window.close(),1800);</script>
</body></html>`;
}

Deno.serve(async (req) => {
  const url   = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err   = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (err)   return new Response(htmlPage(false, err), { headers: { "Content-Type": "text/html" } });
  if (!code || !state) return new Response(htmlPage(false, "Parâmetros inválidos"), { headers: { "Content-Type": "text/html" } });
  const professional_id = state;

  try {
    // 1. Code -> short-lived user token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` + new URLSearchParams({
        client_id:     META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri:  REDIRECT_URI,
        code,
      })
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message ?? "Token não obtido");
    }

    // 2. Short-lived -> long-lived user token (~60 dias)
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` + new URLSearchParams({
        grant_type:        "fb_exchange_token",
        client_id:         META_APP_ID,
        client_secret:     META_APP_SECRET,
        fb_exchange_token: tokenData.access_token,
      })
    );
    const longData  = await longRes.json();
    const userToken = longData.access_token ?? tokenData.access_token;
    const expiresIn = longData.expires_in as number | undefined;

    // 3. Listar páginas que o user gerencia
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,tasks&access_token=${userToken}`
    );
    const pagesData = await pagesRes.json();
    const pages: Array<{ id: string; name: string; access_token: string; tasks?: string[] }> =
      pagesData.data ?? [];

    if (pages.length === 0) {
      throw new Error("Você não administra nenhuma Página do Facebook. Crie uma página antes de conectar.");
    }

    // 4. Pega a primeira página com permissão CREATE_CONTENT (ou só a primeira)
    const page =
      pages.find((p) => p.tasks?.includes("CREATE_CONTENT")) ??
      pages.find((p) => p.tasks?.includes("MANAGE")) ??
      pages[0];

    // Page Access Token vindo de long-lived user token NÃO expira por tempo.
    // Mas guardamos expires_at do user token como referência.
    const expires_at = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    // 5. Upsert
    const supaRes = await fetch(
      `${SUPABASE_URL}/rest/v1/social_accounts?on_conflict=professional_id,platform`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "apikey":        SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Prefer":        "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          professional_id,
          platform:     "facebook",
          access_token: page.access_token,
          account_name: page.name,
          account_id:   page.id,
          page_id:      page.id,
          expires_at,
        }),
      }
    );
    if (!supaRes.ok) {
      const txt = await supaRes.text();
      throw new Error(`DB error: ${txt}`);
    }

    return new Response(htmlPage(true), { headers: { "Content-Type": "text/html" } });
  } catch (e) {
    return new Response(htmlPage(false, String(e)), { headers: { "Content-Type": "text/html" } });
  }
});

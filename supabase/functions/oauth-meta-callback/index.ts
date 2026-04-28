// Recebe o callback OAuth da nova Instagram API (Instagram Login).
// Troca o code por token, busca o perfil Instagram e salva em social_accounts.
const META_APP_ID      = Deno.env.get("META_APP_ID")!;
const META_APP_SECRET  = Deno.env.get("META_APP_SECRET")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REDIRECT_URI     = `${SUPABASE_URL}/functions/v1/oauth-meta-callback`;

function htmlPage(success: boolean, error?: string): string {
  const message = success
    ? `<p style="color:#16a34a;font-size:1.1rem;margin:0">✓ Instagram conectado!</p>`
    : `<p style="color:#dc2626;font-size:1rem;margin:0">Erro: ${error ?? "Falha na autenticação"}</p>`;

  const payload = JSON.stringify({
    type:     success ? "OAUTH_SUCCESS" : "OAUTH_ERROR",
    platform: "instagram",
    error:    error ?? null,
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Conectando Instagram...</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center;
           height: 100vh; margin: 0; background: #f8fafc; }
    .box { text-align: center; padding: 2rem; }
    .sub { color: #6b7280; font-size: .875rem; margin-top: .75rem; }
  </style>
</head>
<body>
  <div class="box">
    ${message}
    <p class="sub">Esta janela será fechada automaticamente.</p>
  </div>
  <script>
    try { if (window.opener) window.opener.postMessage(${payload}, '*'); } catch(_) {}
    setTimeout(() => window.close(), 1800);
  </script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const url   = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");   // professional_id
  const err   = url.searchParams.get("error");

  if (err) {
    return new Response(htmlPage(false, err), { headers: { "Content-Type": "text/html" } });
  }
  if (!code || !state) {
    return new Response(htmlPage(false, "Parâmetros inválidos"), { headers: { "Content-Type": "text/html" } });
  }

  const professional_id = state;

  try {
    // 1. Trocar code por short-lived token (nova Instagram API)
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        client_id:     META_APP_ID,
        client_secret: META_APP_SECRET,
        grant_type:    "authorization_code",
        redirect_uri:  REDIRECT_URI,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_message ?? tokenData.error?.message ?? "Token não obtido");
    }

    const igUserId = tokenData.user_id as string;

    // 2. Trocar por long-lived token (60 dias)
    const longRes = await fetch(
      `https://graph.instagram.com/access_token` +
      `?grant_type=ig_exchange_token` +
      `&client_secret=${META_APP_SECRET}` +
      `&access_token=${tokenData.access_token}`
    );
    const longData  = await longRes.json();
    const longToken = longData.access_token ?? tokenData.access_token;
    const expiresIn = longData.expires_in as number | undefined;

    // 3. Buscar username do Instagram
    const igRes  = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}?fields=username,name&access_token=${longToken}`
    );
    const igData = await igRes.json();
    const accountName = igData.username ? `@${igData.username}` : (igData.name ?? "Instagram");

    const expires_at = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    // 4. Upsert em social_accounts
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
          platform:      "instagram",
          access_token:  longToken,
          account_name:  accountName,
          account_id:    igUserId,
          page_id:       null,
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

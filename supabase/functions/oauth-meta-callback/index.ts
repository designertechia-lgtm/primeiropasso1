// Recebe o callback OAuth do Meta (Facebook/Instagram).
// Troca o code por token, resolve a conta Instagram Business e salva na tabela social_accounts.
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
    // 1. Trocar code por short-lived token
    const tokenRes = await fetch("https://graph.facebook.com/v21.0/oauth/access_token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        client_id:     META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri:  REDIRECT_URI,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message ?? "Token não obtido");
    }

    // 2. Trocar por long-lived token (60 dias)
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token` +
      `?grant_type=fb_exchange_token&client_id=${META_APP_ID}` +
      `&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    );
    const longData  = await longRes.json();
    const longToken = longData.access_token ?? tokenData.access_token;
    const expiresIn = longData.expires_in as number | undefined;

    // 3. Listar páginas do Facebook do usuário (com conta Instagram Business vinculada)
    const pagesRes  = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longToken}`
    );
    const pagesData = await pagesRes.json();
    const pages: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }>
      = pagesData.data ?? [];

    // 4. Encontrar a primeira página com conta Instagram Business
    let igAccountId:   string | null = null;
    let igAccountName: string | null = null;
    let pageId:        string | null = null;
    let pageToken:     string        = longToken;

    for (const page of pages) {
      if (page.instagram_business_account?.id) {
        pageId        = page.id;
        pageToken     = page.access_token ?? longToken;
        igAccountId   = page.instagram_business_account.id;

        const igRes  = await fetch(
          `https://graph.facebook.com/v21.0/${igAccountId}?fields=username,name&access_token=${pageToken}`
        );
        const igData = await igRes.json();
        igAccountName = igData.username ? `@${igData.username}` : (igData.name ?? page.name);
        break;
      }
    }

    if (!igAccountId || !pageId) {
      return new Response(
        htmlPage(false,
          "Nenhuma conta Instagram Business/Creator vinculada a uma Página do Facebook foi encontrada. " +
          "Certifique-se de que sua conta Instagram é Business ou Creator e está vinculada a uma Página."
        ),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const expires_at = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    // 5. Upsert em social_accounts
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
          access_token:  pageToken,
          account_name:  igAccountName,
          account_id:    igAccountId,
          page_id:       pageId,
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

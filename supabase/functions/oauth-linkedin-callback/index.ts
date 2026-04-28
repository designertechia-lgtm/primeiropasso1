// Recebe o callback OAuth do LinkedIn.
// Troca o code por token, busca o perfil e salva em social_accounts.
const LINKEDIN_CLIENT_ID     = Deno.env.get("LINKEDIN_CLIENT_ID")!;
const LINKEDIN_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET")!;
const SUPABASE_URL           = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY            = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REDIRECT_URI           = `${SUPABASE_URL}/functions/v1/oauth-linkedin-callback`;

function htmlPage(success: boolean, error?: string): string {
  const message = success
    ? `<p style="color:#16a34a;font-size:1.1rem;margin:0">✓ LinkedIn conectado!</p>`
    : `<p style="color:#dc2626;font-size:1rem;margin:0">Erro: ${error ?? "Falha na autenticação"}</p>`;

  const payload = JSON.stringify({
    type:     success ? "OAUTH_SUCCESS" : "OAUTH_ERROR",
    platform: "linkedin",
    error:    error ?? null,
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Conectando LinkedIn...</title>
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
    return new Response(htmlPage(false, url.searchParams.get("error_description") ?? err), {
      headers: { "Content-Type": "text/html" },
    });
  }
  if (!code || !state) {
    return new Response(htmlPage(false, "Parâmetros inválidos"), { headers: { "Content-Type": "text/html" } });
  }

  const professional_id = state;

  try {
    // 1. Trocar code por access_token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        grant_type:    "authorization_code",
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description ?? tokenData.error ?? "Token não obtido");
    }

    // 2. Buscar perfil básico
    const profileRes = await fetch(
      "https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const profile = await profileRes.json();
    const firstName   = profile.localizedFirstName ?? "";
    const lastName    = profile.localizedLastName  ?? "";
    const accountName = `${firstName} ${lastName}`.trim() || "LinkedIn";
    const accountId   = profile.id as string | undefined;

    const expires_at = tokenData.expires_in
      ? new Date(Date.now() + (tokenData.expires_in as number) * 1000).toISOString()
      : null;

    // 3. Upsert em social_accounts
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
          platform:      "linkedin",
          access_token:  tokenData.access_token,
          refresh_token: tokenData.refresh_token ?? null,
          account_name:  accountName,
          account_id:    accountId ?? null,
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

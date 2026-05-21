// Renova long-lived tokens de Instagram e Threads que estão prestes a expirar.
// Roda via pg_cron (uma vez por dia). Critério: expires_at < now + 14 dias.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Account {
  id: string;
  platform: string;
  access_token: string;
  expires_at: string | null;
}

async function refreshInstagram(token: string): Promise<{ token: string; expires_in?: number }> {
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`
  );
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error?.message ?? "IG refresh failed");
  return { token: data.access_token, expires_in: data.expires_in };
}

async function refreshThreads(token: string): Promise<{ token: string; expires_in?: number }> {
  const res = await fetch(
    `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`
  );
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error?.message ?? "Threads refresh failed");
  return { token: data.access_token, expires_in: data.expires_in };
}

async function updateAccount(id: string, newToken: string, expiresIn?: number) {
  const expires_at = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;
  await fetch(`${SUPABASE_URL}/rest/v1/social_accounts?id=eq.${id}`, {
    method:  "PATCH",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ access_token: newToken, expires_at }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const cutoff = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const listRes = await fetch(
      `${SUPABASE_URL}/rest/v1/social_accounts?` +
      `select=id,platform,access_token,expires_at` +
      `&platform=in.(instagram,threads)` +
      `&expires_at=not.is.null` +
      `&expires_at=lt.${encodeURIComponent(cutoff)}`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    );
    const accounts = (await listRes.json()) as Account[];

    const results: Array<{ id: string; platform: string; status: string; error?: string }> = [];

    for (const acc of accounts) {
      try {
        const refreshed = acc.platform === "instagram"
          ? await refreshInstagram(acc.access_token)
          : await refreshThreads(acc.access_token);
        await updateAccount(acc.id, refreshed.token, refreshed.expires_in);
        results.push({ id: acc.id, platform: acc.platform, status: "refreshed" });
      } catch (e) {
        results.push({
          id: acc.id,
          platform: acc.platform,
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return new Response(JSON.stringify({
      checked: accounts.length,
      refreshed: results.filter((r) => r.status === "refreshed").length,
      failed:    results.filter((r) => r.status === "failed").length,
      results,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

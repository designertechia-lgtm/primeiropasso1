// Edge "impersonate-user": permite que um super-admin (designertech) obtenha uma
// SESSÃO REAL de um profissional, para entrar no painel/Axel como se fosse ele.
//
// Segurança: só age se o CHAMADOR for super-admin (checado com o JWT do chamador
// via is_super_admin()). Gera um magic-link do alvo, VERIFICA o OTP no próprio
// servidor (caminho comprovadamente estável) e devolve os tokens da sessão para o
// cliente aplicar com setSession. Deployada com verify_jwt=false → validamos o JWT.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "No auth header" }, 401)

    // Cliente no contexto do CHAMADOR (para validar identidade e super-admin).
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const token = authHeader.replace("Bearer ", "")
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser(token)
    if (authError || !caller) return json({ error: "Unauthorized" }, 401)

    // GUARD: só super-admin pode emprestar a sessão de outra conta.
    const { data: isSuper, error: superErr } = await callerClient.rpc("is_super_admin")
    if (superErr) return json({ error: `guard check failed: ${superErr.message}` }, 500)
    if (isSuper !== true) return json({ error: "forbidden: super_admin only" }, 403)

    const { target_user_id } = await req.json().catch(() => ({}))
    if (!target_user_id) return json({ error: "target_user_id obrigatório" }, 400)
    if (target_user_id === caller.id) return json({ error: "não faz sentido entrar na própria conta" }, 400)

    // Service role: pega o e-mail do alvo e gera o magic-link.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: targetData, error: getErr } = await admin.auth.admin.getUserById(target_user_id)
    const targetEmail = targetData?.user?.email
    if (getErr || !targetEmail) return json({ error: "usuário-alvo não encontrado" }, 404)

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
    })
    const emailOtp = linkData?.properties?.email_otp
    if (linkErr || !emailOtp) {
      return json({ error: `falha ao gerar link: ${linkErr?.message ?? "sem email_otp"}` }, 500)
    }

    // Verifica o OTP no SERVIDOR com um cliente anon limpo (sem sessão) → sessão real.
    const anon = createClient(SUPABASE_URL, ANON_KEY)
    const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
      email: targetEmail,
      token: emailOtp,
      type: "email",
    })
    const session = verifyData?.session
    if (verifyErr || !session?.access_token || !session?.refresh_token) {
      return json({ error: `falha ao verificar sessão: ${verifyErr?.message ?? "sem sessão"}` }, 500)
    }

    return json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      email: targetEmail,
      target_name: (targetData?.user?.user_metadata?.full_name as string | undefined) ?? null,
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

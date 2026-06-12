import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ELEVENLABS_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const BASE_URL = "https://api.elevenlabs.io/v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Debita créditos do profissional autenticado antes do TTS (service_key elevenlabs_tts).
// Chamadas server-to-server (video-api com service role) NÃO passam aqui — a cobrança
// delas fica no fluxo chamador (ex.: vídeo institucional cobra kling_premium/pro).
async function consumeCreditsForTTS(
  authHeader: string,
  charCount: number,
  referenceId: string,
): Promise<{ allowed: boolean; reason?: string; balance?: number; required?: number }> {
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (authErr || !user) return { allowed: false, reason: "unauthorized" };

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: pro } = await admin
    .from("professionals")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!pro) return { allowed: false, reason: "professional_not_found" };

  const idempotency_key = `${pro.id}|elevenlabs_tts|${referenceId}`;

  const { data: result, error: rpcErr } = await admin.rpc("consume_credits", {
    p_professional_id: pro.id,
    p_service_key: "elevenlabs_tts",
    p_units: charCount,
    p_description: `Áudio ElevenLabs — ${charCount} caracteres`,
    p_reference_id: referenceId,
    p_idempotency_key: idempotency_key,
  });

  if (rpcErr) return { allowed: false, reason: String(rpcErr.message) };
  return result as { allowed: boolean; reason?: string; balance?: number; required?: number };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!ELEVENLABS_KEY) {
    return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY não configurada no Vault" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action"); // clone | generate | delete

  try {
    // ── Clone de voz ─────────────────────────────────────────
    if (action === "clone") {
      const form = await req.formData();
      const audio = form.get("audio") as File;
      const nome  = form.get("nome")?.toString() ?? "PrimeiroPasso";

      const body = new FormData();
      body.append("name", nome);
      body.append("files", audio, audio.name);

      const res = await fetch(`${BASE_URL}/voices/add`, {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_KEY },
        body,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message ?? JSON.stringify(data));
      return new Response(JSON.stringify({ voice_id: data.voice_id }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Gerar áudio com voz clonada ───────────────────────────
    if (action === "generate") {
      const authHeader = req.headers.get("Authorization") ?? "";
      const { text, voice_id } = await req.json();

      // Service role (video-api/workers) NÃO debita aqui — a cobrança é do fluxo chamador.
      const token = authHeader.replace("Bearer ", "");
      const isServiceRole = !!token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      // Usuário autenticado: verifica e debita créditos antes de chamar ElevenLabs
      if (authHeader && !isServiceRole) {
        const referenceId = `tts_${Date.now()}_${voice_id}`;
        const creditResult = await consumeCreditsForTTS(authHeader, text.length, referenceId);
        if (!creditResult.allowed) {
          const status = creditResult.reason === "insufficient_credits" ? 402 : 401;
          return new Response(JSON.stringify({
            error: creditResult.reason === "insufficient_credits"
              ? `Créditos insuficientes. Saldo: ${creditResult.balance}, necessário: ${creditResult.required}`
              : "Não autorizado para usar ElevenLabs TTS",
            reason: creditResult.reason,
            balance: creditResult.balance,
            required: creditResult.required,
          }), { status, headers: { ...cors, "Content-Type": "application/json" } });
        }
      }

      const res = await fetch(`${BASE_URL}/text-to-speech/${voice_id}`, {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.45, similarity_boost: 0.80 },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail?.message ?? JSON.stringify(err));
      }

      const audio = await res.arrayBuffer();
      return new Response(audio, {
        headers: { ...cors, "Content-Type": "audio/mpeg" },
      });
    }

    // ── Deletar voz clonada ───────────────────────────────────
    if (action === "delete") {
      const { voice_id } = await req.json();
      await fetch(`${BASE_URL}/voices/${voice_id}`, {
        method: "DELETE",
        headers: { "xi-api-key": ELEVENLABS_KEY },
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "action inválida. Use: clone | generate | delete" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

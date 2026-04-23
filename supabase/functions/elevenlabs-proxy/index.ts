import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ELEVENLABS_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";
const BASE_URL = "https://api.elevenlabs.io/v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      const { text, voice_id } = await req.json();

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

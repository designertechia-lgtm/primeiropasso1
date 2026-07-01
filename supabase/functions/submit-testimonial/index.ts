// Recebe um depoimento enviado pelo LEAD na landing pública e grava como 'pending'.
// É a ÚNICA porta de entrada para depoimentos do público: a tabela `testimonials` não
// tem policy de INSERT anônimo (só SELECT dos aprovados). Aqui validamos e inserimos com
// service role, sempre status='pending' e source='lead' — o profissional aprova depois.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const {
      professional_id,
      author_name,
      author_context,
      text,
      rating,
      consent,
      website, // honeypot: campo escondido no form; bot preenche, humano não.
    } = body ?? {};

    // Honeypot: finge sucesso sem gravar (não dá pista pro bot).
    if (typeof website === "string" && website.trim() !== "") {
      return json({ ok: true });
    }

    // Validação
    const name = typeof author_name === "string" ? author_name.trim() : "";
    const msg = typeof text === "string" ? text.trim() : "";
    const ctx = typeof author_context === "string" ? author_context.trim() : "";

    if (!professional_id || typeof professional_id !== "string") {
      return json({ error: "Profissional inválido." }, 400);
    }
    if (name.length < 2 || name.length > 80) {
      return json({ error: "Informe seu nome (2 a 80 caracteres)." }, 400);
    }
    if (msg.length < 10 || msg.length > 1500) {
      return json({ error: "O depoimento deve ter entre 10 e 1500 caracteres." }, 400);
    }
    if (consent !== true) {
      return json({ error: "É necessário autorizar a publicação do depoimento." }, 400);
    }
    let ratingVal: number | null = null;
    if (rating !== undefined && rating !== null && rating !== "") {
      const r = Number(rating);
      if (!Number.isInteger(r) || r < 1 || r > 5) {
        return json({ error: "Nota inválida." }, 400);
      }
      ratingVal = r;
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Confirma que o profissional existe (evita lixo por FK / professional_id chutado).
    const { data: prof, error: profErr } = await admin
      .from("professionals")
      .select("id")
      .eq("id", professional_id)
      .maybeSingle();
    if (profErr) return json({ error: "Erro ao validar profissional." }, 500);
    if (!prof) return json({ error: "Profissional não encontrado." }, 404);

    const { error: insErr } = await admin.from("testimonials").insert({
      professional_id,
      author_name: name,
      author_context: ctx || null,
      text: msg,
      rating: ratingVal,
      consent: true,
      status: "pending",
      source: "lead",
    });
    if (insErr) {
      console.error("[submit-testimonial] insert error:", insErr.message);
      return json({ error: "Não foi possível enviar o depoimento." }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("[submit-testimonial]", err);
    return json({ error: String(err) }, 500);
  }
});

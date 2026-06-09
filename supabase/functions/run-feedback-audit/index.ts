// Edge Function: run-feedback-audit
//
// Roda uma auditoria de feedbacks usando Claude Opus 4.7.
// Busca todos os feedbacks com status='novo', envia pra IA classificar e clusterizar
// contra a Visão de Produto, persiste em feedback_audits + feedback_audit_items,
// e move os feedbacks pra status='em_analise'.
//
// POST sem body. Auth: JWT do super-admin (verify_jwt=true, checa is_super_admin no DB).
// Retorna { audit_id, feedback_count, clusters_count, ... } ou { status: 'no_pending' }.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ============================================================
// Config
// ============================================================
const CLAUDE_MODEL = "claude-opus-4-7";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Opus 4.7 pricing (USD per million tokens)
const PRICE_INPUT_PER_M = 15.0;
const PRICE_OUTPUT_PER_M = 75.0;
const PRICE_CACHE_WRITE_PER_M = 18.75; // input x 1.25
const PRICE_CACHE_READ_PER_M = 1.5;    // input x 0.1

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// System prompt (cacheable)
// ============================================================
const SYSTEM_PROMPT = `Voce e um analista de produto senior da plataforma Primeiro Passo, um SaaS B2B para terapeutas.

# Missao da plataforma
Ser o colaborador ativo do terapeuta -- gerenciando marketing, agenda, relacionamento com pacientes e crescimento profissional, para que o terapeuta foque no que sabe fazer: ajudar pessoas.

# 6 Pilares
1. **Conteudo & Campanhas Virais** -- videos curtos, carrosseis, flyers, agendamento de publicacao
2. **Funil de Vendas + CRM + Agente de Leads** -- captacao, qualificacao, conversao via WhatsApp/landing
3. **Colaborador IA com Memoria Persistente** -- IA evolui com o profissional, mantem arq.md
4. **Desenvolvimento Profissional** -- metricas pessoais, benchmarking, sugestoes baseadas em tendencias
5. **Agente WhatsApp + Agenda Inteligente** -- fromMe=true para comandos internos, lembretes, confirmacoes
6. **Analytics Integrado** -- Meta/Google/TikTok Ads, relatorios em linguagem simples

# Roadmap por Fases
- Fase 1: Video & Conteudo (P1) -- EM FINALIZACAO
- Fase 2: Presenca Publica (P2 parcial) -- EM PAUSA, volta apos 18/05
- Fase 3: Agente WhatsApp (P5) -- proxima grande entrega
- Fase 4: CRM + Leads (P2 completo) -- futuro
- Fase 5: Analytics (P6) -- futuro
- Fase 6: Colaborador Pleno (P3 + P4) -- evolui em paralelo

# Seu trabalho
Voce recebe uma lista de feedbacks de usuarios (terapeutas) e deve:

1. **Clusterizar** feedbacks por tema (ex: "bugs no agendamento", "pedido de templates de video", "duvidas sobre PIX")
2. **Classificar** cada cluster:
   - **pilar**: 1-6 (qual pilar da plataforma o tema toca)
   - **fase**: 1-6 (qual fase do roadmap absorve o tema)
   - **relevancia**: alta/media/baixa
   - **type_pred** e **severity_pred**: tipo e severidade predominante
3. **Recomendar** acoes:
   - **approve**: vale entrar no backlog (status -> aprovado)
   - **discard**: descartavel, fora do roadmap ou ruido (status -> arquivado)
   - **investigate**: precisa conversar com o usuario antes de decidir
4. **Resumir** em markdown executivo curto (3-6 bullets)
5. **Calcular** NPS snapshot se houver nps_score nos feedbacks (promoters=9-10, neutrals=7-8, detractors=0-6)

# Formato de saida OBRIGATORIO
Responda APENAS com um JSON valido, sem markdown ao redor, com esta estrutura exata:

\`\`\`json
{
  "summary_md": "string em markdown",
  "nps_snapshot": { "avg": number, "promoters": int, "neutrals": int, "detractors": int, "total_with_nps": int } ou null,
  "clusters": [
    {
      "label": "string curta",
      "qty": int,
      "type_pred": "bug" | "sugestao" | "duvida" | "elogio" | "outro",
      "severity_pred": "baixa" | "media" | "alta" | "critica",
      "feedback_ids": ["uuid", ...],
      "pilar": int (1-6),
      "fase": int (1-6),
      "relevancia": "alta" | "media" | "baixa"
    }
  ],
  "recommendations": [
    {
      "cluster_label": "string (deve casar com label acima)",
      "action": "approve" | "discard" | "investigate",
      "target_phase": int (1-6),
      "effort": "PP" | "P" | "M" | "G" | "GG",
      "priority": int (1-10),
      "rationale": "string curta justificando"
    }
  ]
}
\`\`\`

Regras:
- Todos os feedback_ids da entrada devem aparecer em exatamente UM cluster
- Cada cluster precisa ter pelo menos UMA recommendation
- Seja honesto: se um pedido nao casa com o roadmap, marque discard ou investigate
- effort: PP=horas, P=1-2d, M=3-5d, G=1-2sem, GG=>2sem
- priority: 10 = critico, 1 = baixa`;

// ============================================================
// Tipos
// ============================================================
interface FeedbackRow {
  id: string;
  type: string;
  severity: string;
  status: string;
  message: string;
  nps_score: number | null;
  created_at: string;
  author?: { full_name: string | null; email: string | null } | null;
}

interface AuditPayload {
  summary_md: string;
  nps_snapshot: Record<string, number> | null;
  clusters: Array<{
    label: string;
    qty: number;
    type_pred: string;
    severity_pred: string;
    feedback_ids: string[];
    pilar: number;
    fase: number;
    relevancia: string;
  }>;
  recommendations: Array<{
    cluster_label: string;
    action: string;
    target_phase: number;
    effort: string;
    priority: number;
    rationale: string;
  }>;
}

// ============================================================
// Helpers
// ============================================================
function formatFeedbacksForPrompt(feedbacks: FeedbackRow[]): string {
  return feedbacks
    .map((f, idx) => {
      const author = f.author?.full_name ?? "Anonimo";
      const nps = f.nps_score !== null ? ` | NPS: ${f.nps_score}` : "";
      return `### Feedback ${idx + 1}
- id: ${f.id}
- type: ${f.type} | severity: ${f.severity}${nps}
- author: ${author}
- created_at: ${f.created_at}
- message: ${f.message.replace(/\n/g, " ").slice(0, 800)}`;
    })
    .join("\n\n");
}

function extractJson(text: string): AuditPayload {
  // Tenta parse direto
  try {
    return JSON.parse(text);
  } catch (_) {
    // Procura primeiro bloco JSON valido
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("resposta sem JSON detectavel");
    return JSON.parse(match[0]);
  }
}

function calcCost(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}): number {
  const inp = usage.input_tokens ?? 0;
  const out = usage.output_tokens ?? 0;
  const cw = usage.cache_creation_input_tokens ?? 0;
  const cr = usage.cache_read_input_tokens ?? 0;
  const cost =
    (inp * PRICE_INPUT_PER_M +
      out * PRICE_OUTPUT_PER_M +
      cw * PRICE_CACHE_WRITE_PER_M +
      cr * PRICE_CACHE_READ_PER_M) /
    1_000_000;
  return Math.round(cost * 10000) / 10000;
}

// ============================================================
// Handler
// ============================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startMs = Date.now();
  try {
    // ---- Auth: cliente com JWT do usuario pra checar super-admin
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing bearer token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "invalid token", detail: userErr?.message }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const userId = userData.user.id;

    const { data: isAdmin, error: adminErr } = await supabaseUser.rpc("is_super_admin");
    if (adminErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "not super admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Service client pra escrever bypassing RLS
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // ---- Busca feedbacks pendentes
    const { data: feedbacks, error: fbErr } = await supabaseAdmin
      .from("feedbacks")
      .select(`id, type, severity, status, message, nps_score, created_at,
               author:professionals(full_name, email)`)
      .eq("status", "novo")
      .order("created_at", { ascending: true });

    if (fbErr) throw new Error(`erro buscando feedbacks: ${fbErr.message}`);

    if (!feedbacks || feedbacks.length === 0) {
      const { data: lastAudit } = await supabaseAdmin
        .from("feedback_audits")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          status: "no_pending",
          message: "Nenhum feedback novo pra auditar",
          latest_audit_id: lastAudit?.id ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Monta prompt
    const userMessage = `Audite os ${feedbacks.length} feedbacks abaixo seguindo as regras do system prompt.

${formatFeedbacksForPrompt(feedbacks as unknown as FeedbackRow[])}

Responda APENAS com o JSON estruturado, sem texto adicional.`;

    // ---- Chama Claude
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY nao configurada");

    const claudeBody = {
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    };

    const claudeResp = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(claudeBody),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      throw new Error(`Claude API ${claudeResp.status}: ${errText.slice(0, 500)}`);
    }

    const claudeJson = await claudeResp.json();
    const rawText: string = claudeJson?.content?.[0]?.text ?? "";
    if (!rawText) throw new Error("Claude retornou content vazio");

    const payload = extractJson(rawText);
    const usage = claudeJson?.usage ?? {};
    const costUsd = calcCost(usage);

    // ---- Persiste audit
    const feedbackIds = feedbacks.map((f) => f.id);

    const { data: auditRow, error: auditErr } = await supabaseAdmin
      .from("feedback_audits")
      .insert({
        created_by: userId,
        model: CLAUDE_MODEL,
        feedback_count: feedbacks.length,
        feedback_ids: feedbackIds,
        summary_md: payload.summary_md,
        clusters: payload.clusters,
        recommendations: payload.recommendations,
        nps_snapshot: payload.nps_snapshot,
        cost_usd: costUsd,
        duration_ms: Date.now() - startMs,
      })
      .select("id")
      .single();

    if (auditErr || !auditRow) {
      throw new Error(`erro inserindo audit: ${auditErr?.message}`);
    }

    // ---- Persiste items (granular cluster->feedback)
    const items: Array<Record<string, unknown>> = [];
    for (const cluster of payload.clusters) {
      const classification = {
        pilar: cluster.pilar,
        fase: cluster.fase,
        relevancia: cluster.relevancia,
        severity_pred: cluster.severity_pred,
        type_pred: cluster.type_pred,
      };
      for (const fid of cluster.feedback_ids) {
        items.push({
          audit_id: auditRow.id,
          feedback_id: fid,
          cluster_label: cluster.label,
          classification,
        });
      }
    }
    if (items.length > 0) {
      const { error: itemsErr } = await supabaseAdmin
        .from("feedback_audit_items")
        .insert(items);
      if (itemsErr) console.warn(`erro itens: ${itemsErr.message}`);
    }

    // ---- Move feedbacks pra em_analise
    const { error: updErr } = await supabaseAdmin
      .from("feedbacks")
      .update({ status: "em_analise", updated_at: new Date().toISOString() })
      .in("id", feedbackIds);

    if (updErr) console.warn(`erro update feedbacks: ${updErr.message}`);

    return new Response(
      JSON.stringify({
        status: "ok",
        audit_id: auditRow.id,
        feedback_count: feedbacks.length,
        clusters_count: payload.clusters.length,
        recommendations_count: payload.recommendations.length,
        cost_usd: costUsd,
        duration_ms: Date.now() - startMs,
        usage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[run-feedback-audit] erro:", msg);
    return new Response(
      JSON.stringify({ error: msg, duration_ms: Date.now() - startMs }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

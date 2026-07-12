-- Consumo de tokens LLM por profissional (admin-gerente, aba usuários).
-- 1 linha por TURNO/request — agrega TODAS as chamadas LLM da interação (loop de
-- tools, retries, geradores). Escrita: edges com service_role (best-effort, nunca
-- derruba o turno). Leitura: super-admin via owner_llm_usage_by_user abaixo.
-- Campanhas de ads ficam FORA por decisão (11/07): a criação já debita créditos.

CREATE TABLE public.llm_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('axel_web','axel_whatsapp','axel_whatsapp_admin','generate_text','generate_landing')),
  model text NOT NULL,
  calls integer NOT NULL DEFAULT 1,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cached_tokens bigint NOT NULL DEFAULT 0,
  -- Custo em USD congelado no momento do uso (OpenRouter devolve exato; Anthropic é calculado).
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_llm_usage_prof_date ON public.llm_usage (professional_id, created_at DESC);
CREATE INDEX idx_llm_usage_date ON public.llm_usage (created_at);

-- RLS ligada SEM policies: só service_role escreve; o admin lê pela RPC SECURITY DEFINER.
ALTER TABLE public.llm_usage ENABLE ROW LEVEL SECURITY;

-- Consumo por usuário no período, com o valor da assinatura pra comparar (molde
-- owner_list_all_users: LATERAL na assinatura mais recente).
CREATE OR REPLACE FUNCTION public.owner_llm_usage_by_user(days_back integer DEFAULT 30)
RETURNS TABLE(
  professional_id uuid, full_name text, email text,
  web_calls bigint, web_input_tokens bigint, web_output_tokens bigint,
  wpp_calls bigint, wpp_input_tokens bigint, wpp_output_tokens bigint,
  gen_calls bigint, gen_input_tokens bigint, gen_output_tokens bigint,
  cached_tokens bigint, total_cost_usd numeric, last_used_at timestamptz,
  monthly_price_brl numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super-admin';
  END IF;

  RETURN QUERY
  SELECT
    p.id                                                                                          AS professional_id,
    p.full_name                                                                                   AS full_name,
    p.email                                                                                       AS email,
    COALESCE(SUM(u.calls)         FILTER (WHERE u.source = 'axel_web'), 0)::bigint                AS web_calls,
    COALESCE(SUM(u.input_tokens)  FILTER (WHERE u.source = 'axel_web'), 0)::bigint                AS web_input_tokens,
    COALESCE(SUM(u.output_tokens) FILTER (WHERE u.source = 'axel_web'), 0)::bigint                AS web_output_tokens,
    COALESCE(SUM(u.calls)         FILTER (WHERE u.source IN ('axel_whatsapp','axel_whatsapp_admin')), 0)::bigint AS wpp_calls,
    COALESCE(SUM(u.input_tokens)  FILTER (WHERE u.source IN ('axel_whatsapp','axel_whatsapp_admin')), 0)::bigint AS wpp_input_tokens,
    COALESCE(SUM(u.output_tokens) FILTER (WHERE u.source IN ('axel_whatsapp','axel_whatsapp_admin')), 0)::bigint AS wpp_output_tokens,
    COALESCE(SUM(u.calls)         FILTER (WHERE u.source IN ('generate_text','generate_landing')), 0)::bigint    AS gen_calls,
    COALESCE(SUM(u.input_tokens)  FILTER (WHERE u.source IN ('generate_text','generate_landing')), 0)::bigint    AS gen_input_tokens,
    COALESCE(SUM(u.output_tokens) FILTER (WHERE u.source IN ('generate_text','generate_landing')), 0)::bigint    AS gen_output_tokens,
    COALESCE(SUM(u.cached_tokens), 0)::bigint                                                     AS cached_tokens,
    COALESCE(SUM(u.cost_usd), 0)::numeric                                                         AS total_cost_usd,
    MAX(u.created_at)                                                                             AS last_used_at,
    s.monthly_price_brl                                                                           AS monthly_price_brl
  FROM public.llm_usage u
  JOIN public.professionals p ON p.id = u.professional_id
  LEFT JOIN LATERAL (
    SELECT s2.monthly_price_brl
    FROM public.subscriptions s2
    WHERE s2.professional_id = p.id
    ORDER BY s2.created_at DESC
    LIMIT 1
  ) s ON TRUE
  WHERE u.created_at >= now() - make_interval(days => days_back)
  GROUP BY p.id, p.full_name, p.email, s.monthly_price_brl
  ORDER BY SUM(u.cost_usd) DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.owner_llm_usage_by_user(integer) TO authenticated;

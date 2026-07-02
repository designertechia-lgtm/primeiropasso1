-- F1: o funil de Relatórios prometia (na UI do editor Meta) mostrar leads Click-to-WhatsApp,
-- mas a RPC filtrava platform='google_ads' e as campanhas Meta nunca apareciam. Passa a incluir
-- meta_ads. Métricas do Google (impressões/cliques/custo) ficam 0 para Meta (sem metrics-sync
-- Meta); visitas/leads/conversas/agendamentos vêm da atribuição por utm_campaign (webhook CTWA).
CREATE OR REPLACE FUNCTION public.get_ads_funnel_for(p_professional_id uuid)
 RETURNS TABLE(campaign_id uuid, campaign_name text, campaign_status text, daily_budget_brl numeric, start_date date, end_date date, impressions bigint, clicks bigint, cost_brl numeric, visitas bigint, leads bigint, conversas bigint, agendamentos bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.name, c.status, c.daily_budget_brl, c.start_date, c.end_date,
    COALESCE(m.impressions, 0), COALESCE(m.clicks, 0), COALESCE(m.cost_brl, 0),
    COALESCE(v.visitas, 0), COALESCE(l.leads, 0), COALESCE(l.conversas, 0), COALESCE(a.agendamentos, 0)
  FROM ads_campaigns c
  LEFT JOIN LATERAL (
    SELECT SUM(impressions)::bigint AS impressions, SUM(clicks)::bigint AS clicks, SUM(cost_brl) AS cost_brl
    FROM ads_campaign_metrics WHERE campaign_id = c.id
  ) m ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS visitas FROM landing_visits
    WHERE professional_id = c.professional_id AND utm->>'utm_campaign' = c.id::text
  ) v ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS leads,
           COUNT(*) FILTER (WHERE last_message_at IS NOT NULL) AS conversas
    FROM leads
    WHERE professional_id = c.professional_id AND utm->>'utm_campaign' = c.id::text
  ) l ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS agendamentos
    FROM appointments ap
    WHERE ap.professional_id = c.professional_id
      AND ap.status <> 'cancelled'
      AND ap.lead_id IN (
        SELECT id FROM leads
        WHERE professional_id = c.professional_id AND utm->>'utm_campaign' = c.id::text
      )
  ) a ON true
  WHERE c.professional_id = p_professional_id
    AND c.platform IN ('google_ads', 'meta_ads')
    AND c.status <> 'archived'
  ORDER BY c.created_at DESC;
$function$;

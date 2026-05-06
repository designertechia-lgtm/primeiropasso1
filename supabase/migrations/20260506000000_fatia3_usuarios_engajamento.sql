-- Fatia 3: Usuários + Engajamento
-- SQL functions gated por is_super_admin()

-- 1. Crescimento semanal de cadastros
CREATE OR REPLACE FUNCTION owner_user_growth(weeks_back int DEFAULT 12)
RETURNS TABLE(week_start date, new_total bigint, cumulative_total bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    date_trunc('week', created_at)::date AS week_start,
    COUNT(*)::bigint AS new_total,
    SUM(COUNT(*)) OVER (ORDER BY date_trunc('week', created_at)::date)::bigint AS cumulative_total
  FROM professionals
  WHERE is_super_admin()
    AND created_at >= NOW() - (weeks_back * INTERVAL '1 week')
  GROUP BY date_trunc('week', created_at)::date
  ORDER BY week_start;
$$;

-- 2. Funil de ativação
CREATE OR REPLACE FUNCTION owner_activation_funnel()
RETURNS TABLE(step text, step_order int, user_count bigint)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v1 bigint; v2 bigint; v3 bigint; v4 bigint; v5 bigint;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT COUNT(*) INTO v1 FROM professionals;
  SELECT COUNT(*) INTO v2 FROM professionals
    WHERE photo_url IS NOT NULL AND full_name IS NOT NULL AND phone IS NOT NULL;
  SELECT COUNT(DISTINCT professional_id) INTO v3 FROM social_posts WHERE status = 'published';
  SELECT COUNT(DISTINCT professional_id) INTO v4 FROM leads;
  SELECT COUNT(DISTINCT professional_id) INTO v5 FROM subscriptions;
  RETURN QUERY SELECT * FROM (VALUES
    ('Cadastrou'::text,      1, v1),
    ('Perfil completo',      2, v2),
    ('Publicou post',        3, v3),
    ('Recebeu lead',         4, v4),
    ('Assinou plano',        5, v5)
  ) AS t(step, step_order, user_count) ORDER BY 2;
END;
$$;

-- 3. Segmentação heavy/medio/dormente (via last_sign_in_at de auth.users)
CREATE OR REPLACE FUNCTION owner_user_segments()
RETURNS TABLE(segment text, user_count bigint)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  WITH segs AS (
    SELECT
      CASE
        WHEN au.last_sign_in_at >= NOW() - INTERVAL '7 days'  THEN 'heavy'
        WHEN au.last_sign_in_at >= NOW() - INTERVAL '30 days' THEN 'medio'
        ELSE 'dormente'
      END AS seg
    FROM professionals p
    JOIN auth.users au ON au.id = p.user_id
  )
  SELECT seg::text, COUNT(*)::bigint FROM segs GROUP BY 1;
END;
$$;

-- 4. Posts publicados por semana (com breakdown por tipo)
CREATE OR REPLACE FUNCTION owner_posts_per_week(weeks_back int DEFAULT 8)
RETURNS TABLE(week_start date, total_count bigint, reels_count bigint, feed_count bigint, carousel_count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    date_trunc('week', created_at)::date AS week_start,
    COUNT(*)::bigint AS total_count,
    COUNT(*) FILTER (WHERE post_type = 'reels')::bigint    AS reels_count,
    COUNT(*) FILTER (WHERE post_type = 'feed')::bigint     AS feed_count,
    COUNT(*) FILTER (WHERE post_type = 'carousel')::bigint AS carousel_count
  FROM social_posts
  WHERE is_super_admin()
    AND created_at >= NOW() - (weeks_back * INTERVAL '1 week')
    AND status = 'published'
  GROUP BY 1
  ORDER BY 1;
$$;

-- 5. Distribuição por tipo de post
CREATE OR REPLACE FUNCTION owner_post_type_breakdown()
RETURNS TABLE(post_type text, post_count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(post_type, 'outros')::text, COUNT(*)::bigint
  FROM social_posts
  WHERE is_super_admin()
    AND status = 'published'
  GROUP BY 1;
$$;

-- 6. Top N usuários mais ativos (por posts publicados + leads recebidos)
CREATE OR REPLACE FUNCTION owner_top_active_users(top_n int DEFAULT 10)
RETURNS TABLE(
  professional_id uuid,
  full_name       text,
  email           text,
  post_count      bigint,
  lead_count      bigint,
  last_active_at  timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT
    p.id                                            AS professional_id,
    p.full_name,
    p.email,
    COUNT(DISTINCT sp.id)::bigint                  AS post_count,
    COUNT(DISTINCT l.id)::bigint                   AS lead_count,
    GREATEST(MAX(sp.created_at), MAX(l.created_at)) AS last_active_at
  FROM professionals p
  LEFT JOIN social_posts sp ON sp.professional_id = p.id AND sp.status = 'published'
  LEFT JOIN leads        l  ON l.professional_id  = p.id
  GROUP BY p.id, p.full_name, p.email
  ORDER BY post_count DESC, lead_count DESC
  LIMIT top_n;
END;
$$;

-- 7. Créditos consumidos por service_key
CREATE OR REPLACE FUNCTION owner_credits_by_service()
RETURNS TABLE(service_key text, total_consumed bigint, use_count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(service_key, 'outros')::text,
    ABS(SUM(amount))::bigint AS total_consumed,
    COUNT(*)::bigint         AS use_count
  FROM credit_ledger
  WHERE is_super_admin()
    AND amount < 0
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

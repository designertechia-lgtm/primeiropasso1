-- =============================================================================
-- Axel — Base de Conhecimento SECCIONADA (mapa do site)
--
-- Decisões (08/06/2026, ver _docs/PLANO_AXEL_AUDITORIA_AGENTE.md):
--  - Conhecimento seccionado (não blob): cada tela/how-to é uma seção identificável.
--  - Schema dedicado `axel` no projeto pp (não projeto Supabase separado).
--  - Acesso via RPCs em `public` (SECURITY DEFINER): PostgREST não expõe schema
--    custom por padrão; as RPCs evitam depender disso. Mesmo padrão de consume_credits.
--  - Multi-tenant via coluna `scope` ('platform' = base global; ou professional_id).
--  - Filtragem por CÓDIGO (keywords/category/route), não vetorial. Vetorial é
--    evolução futura por-seção (ADD COLUMN embedding) sem retrabalho.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS axel;

CREATE TABLE IF NOT EXISTS axel.knowledge_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL DEFAULT 'platform',
  key         text NOT NULL,
  title       text NOT NULL,
  category    text,
  route       text,
  keywords    text[] NOT NULL DEFAULT '{}',
  body        text NOT NULL,
  priority    int  NOT NULL DEFAULT 100,
  enabled     boolean NOT NULL DEFAULT true,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, key)
);

CREATE INDEX IF NOT EXISTS idx_aks_scope_enabled ON axel.knowledge_sections (scope, enabled);

ALTER TABLE axel.knowledge_sections ENABLE ROW LEVEL SECURITY;
-- Sem policy de acesso direto: o acesso é só via RPCs SECURITY DEFINER abaixo.
-- (service_role bypassa RLS; usuários normais não tocam a tabela diretamente.)

GRANT USAGE ON SCHEMA axel TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON axel.knowledge_sections TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: leitura pelo AGENTE (índice + corpo das seções habilitadas de um scope)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.axel_kb_sections(p_scope text DEFAULT 'platform')
RETURNS TABLE (
  id uuid, key text, title text, category text, route text,
  keywords text[], body text, priority int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = axel, public
AS $$
  SELECT id, key, title, category, route, keywords, body, priority
  FROM axel.knowledge_sections
  WHERE scope = p_scope AND enabled = true
  ORDER BY priority ASC, title ASC;
$$;

-- ---------------------------------------------------------------------------
-- RPCs ADMIN (editor na ConhecimentoTab) — exigem super-admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.axel_kb_admin_list(p_scope text DEFAULT 'platform')
RETURNS TABLE (
  id uuid, scope text, key text, title text, category text, route text,
  keywords text[], body text, priority int, enabled boolean,
  updated_by uuid, updated_at timestamptz, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = axel, public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;
  RETURN QUERY
    SELECT k.id, k.scope, k.key, k.title, k.category, k.route,
           k.keywords, k.body, k.priority, k.enabled,
           k.updated_by, k.updated_at, k.created_at
    FROM axel.knowledge_sections k
    WHERE k.scope = p_scope
    ORDER BY k.priority ASC, k.title ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.axel_kb_admin_upsert(
  p_key      text,
  p_title    text,
  p_body     text,
  p_category text    DEFAULT NULL,
  p_route    text    DEFAULT NULL,
  p_keywords text[]  DEFAULT '{}',
  p_priority int     DEFAULT 100,
  p_enabled  boolean DEFAULT true,
  p_scope    text    DEFAULT 'platform'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = axel, public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;
  INSERT INTO axel.knowledge_sections
    (scope, key, title, category, route, keywords, body, priority, enabled, updated_by, updated_at)
  VALUES
    (p_scope, p_key, p_title, p_category, p_route,
     COALESCE(p_keywords, '{}'), p_body, COALESCE(p_priority, 100),
     COALESCE(p_enabled, true), auth.uid(), now())
  ON CONFLICT (scope, key) DO UPDATE SET
     title      = EXCLUDED.title,
     category   = EXCLUDED.category,
     route      = EXCLUDED.route,
     keywords   = EXCLUDED.keywords,
     body       = EXCLUDED.body,
     priority   = EXCLUDED.priority,
     enabled    = EXCLUDED.enabled,
     updated_by = auth.uid(),
     updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.axel_kb_admin_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = axel, public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;
  DELETE FROM axel.knowledge_sections WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.axel_kb_sections(text)        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.axel_kb_admin_list(text)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.axel_kb_admin_upsert(text,text,text,text,text,text[],int,boolean,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.axel_kb_admin_delete(uuid)    TO authenticated, service_role;

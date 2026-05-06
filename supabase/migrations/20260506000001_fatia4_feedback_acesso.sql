-- Fatia 4: Feedback e Ajustes de Acesso

-- 1. Tabela de Feedbacks
CREATE TABLE IF NOT EXISTS feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES professionals(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('bug', 'sugestao', 'duvida', 'elogio', 'outro')),
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_analise', 'resolvido', 'arquivado')),
  severity text NOT NULL DEFAULT 'baixa' CHECK (severity IN ('baixa', 'media', 'alta', 'critica')),
  message text NOT NULL,
  screenshot_url text,
  nps_score int CHECK (nps_score >= 0 AND nps_score <= 10),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS Feedback
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;

-- Usuários podem criar feedback
CREATE POLICY "feedbacks_insert_policy" ON feedbacks
  FOR INSERT TO authenticated
  WITH CHECK (true); -- o ideal seria check author_id, mas deixamos aberto para profissionais

-- Apenas super admins podem ler/atualizar feedback
CREATE POLICY "feedbacks_select_policy" ON feedbacks
  FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY "feedbacks_update_policy" ON feedbacks
  FOR UPDATE TO authenticated
  USING (is_super_admin());

-- 2. Tabela de Avisos Globais (App Announcements)
CREATE TABLE IF NOT EXISTS app_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error')),
  is_active boolean NOT NULL DEFAULT true,
  end_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- RLS Announcements
ALTER TABLE app_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_read_policy" ON app_announcements
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "announcements_write_policy" ON app_announcements
  FOR ALL TO authenticated
  USING (is_super_admin());

-- 3. Tabela de Feature Flags
CREATE TABLE IF NOT EXISTS feature_flags (
  key text PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- RLS Feature Flags
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flags_read_policy" ON feature_flags
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "flags_write_policy" ON feature_flags
  FOR ALL TO authenticated
  USING (is_super_admin());

-- Atualizar RLS de super_admin_access para permitir CRUD
-- A tabela super_admin_access já deve ter sido criada, vamos garantir as políticas:
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'super_admin_access') THEN
    ALTER TABLE super_admin_access ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "super_admin_access_select" ON super_admin_access;
    CREATE POLICY "super_admin_access_select" ON super_admin_access
      FOR SELECT TO authenticated
      USING (is_super_admin());

    DROP POLICY IF EXISTS "super_admin_access_insert" ON super_admin_access;
    CREATE POLICY "super_admin_access_insert" ON super_admin_access
      FOR INSERT TO authenticated
      WITH CHECK (is_super_admin());

    DROP POLICY IF EXISTS "super_admin_access_update" ON super_admin_access;
    CREATE POLICY "super_admin_access_update" ON super_admin_access
      FOR UPDATE TO authenticated
      USING (is_super_admin());
      
    DROP POLICY IF EXISTS "super_admin_access_delete" ON super_admin_access;
    CREATE POLICY "super_admin_access_delete" ON super_admin_access
      FOR DELETE TO authenticated
      USING (is_super_admin());
  END IF;
END $$;

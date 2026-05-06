-- SUPER REPAIR SQL v2
-- Esta migração resolve os problemas de acesso e permite conceder permissão via e-mail.

-- 1. Tabela de acessos
CREATE TABLE IF NOT EXISTS public.super_admin_access (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMPTZ DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    scopes TEXT[] DEFAULT '{view}',
    notes TEXT
);

-- 2. Tabela de Feature Flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
    key TEXT PRIMARY KEY,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- 3. Função is_super_admin aprimorada
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Se o e-mail do usuário for um dos administradores mestres
    IF (SELECT email FROM auth.users WHERE id = auth.uid()) IN ('designertech.ia@gmail.com', 'daiane.naturologia@gmail.com') THEN
        RETURN TRUE;
    END IF;

    -- 2. Se o usuário tem a role 'admin' na tabela user_roles
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
        RETURN TRUE;
    END IF;

    -- 3. Se o usuário está na tabela de acessos e não foi revogado
    RETURN EXISTS (
        SELECT 1 FROM public.super_admin_access
        WHERE user_id = auth.uid() AND (revoked_at IS NULL OR revoked_at > now())
    );
END;
$$;

-- 4. Função para conceder acesso via E-mail (RPC)
CREATE OR REPLACE FUNCTION public.grant_super_admin_by_email(
    target_email TEXT,
    target_scopes TEXT[] DEFAULT '{view}',
    target_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Verificação de segurança: apenas super admins podem conceder acesso
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas super administradores podem conceder acesso.';
    END IF;

    -- Buscar o ID do usuário pelo e-mail
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário com o e-mail % não encontrado.', target_email;
    END IF;

    -- Inserir ou atualizar o acesso
    INSERT INTO public.super_admin_access (user_id, granted_by, scopes, notes, revoked_at)
    VALUES (target_user_id, auth.uid(), target_scopes, target_notes, NULL)
    ON CONFLICT (user_id) DO UPDATE
    SET granted_by = auth.uid(),
        scopes = target_scopes,
        notes = target_notes,
        revoked_at = NULL,
        granted_at = now();

    RETURN json_build_object('success', true, 'user_id', target_user_id);
END;
$$;

-- 5. Habilitar Segurança (RLS)
ALTER TABLE public.super_admin_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_access_all" ON public.super_admin_access;
CREATE POLICY "super_admin_access_all" ON public.super_admin_access
    FOR ALL TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "feature_flags_read" ON public.feature_flags;
CREATE POLICY "feature_flags_read" ON public.feature_flags
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "feature_flags_write" ON public.feature_flags;
CREATE POLICY "feature_flags_write" ON public.feature_flags
    FOR ALL TO authenticated USING (is_super_admin());

-- 6. Flags Iniciais
INSERT INTO public.feature_flags (key, is_enabled, description)
VALUES 
    ('maintenance_mode', false, 'Modo de manutenção global'),
    ('new_editor_v2', true, 'Novo editor de artigos'),
    ('ai_video_v3', false, 'Motor de vídeo IA experimental')
ON CONFLICT (key) DO NOTHING;

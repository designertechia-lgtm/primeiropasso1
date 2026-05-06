-- Fatia 4 - Fix: adiciona user_email à super_admin_access
-- e atualiza a função de concessão para persistir o e-mail

ALTER TABLE public.super_admin_access
  ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Repopular user_email para linhas já existentes (best-effort)
UPDATE public.super_admin_access s
SET user_email = u.email
FROM auth.users u
WHERE u.id = s.user_id
  AND s.user_email IS NULL;

-- Atualizar a função para persistir o e-mail na concessão
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
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado. Apenas super administradores podem conceder acesso.';
    END IF;

    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário com o e-mail % não encontrado.', target_email;
    END IF;

    INSERT INTO public.super_admin_access (user_id, granted_by, scopes, notes, revoked_at, user_email)
    VALUES (target_user_id, auth.uid(), target_scopes, target_notes, NULL, target_email)
    ON CONFLICT (user_id) DO UPDATE
    SET granted_by  = auth.uid(),
        scopes      = target_scopes,
        notes       = target_notes,
        revoked_at  = NULL,
        granted_at  = now(),
        user_email  = target_email;

    RETURN json_build_object('success', true, 'user_id', target_user_id);
END;
$$;

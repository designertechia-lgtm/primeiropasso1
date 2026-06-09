-- ============================================================
-- RPC owner_delete_professional — Primeiro Passo — 2026-06-09
-- Exclusão DEFINITIVA de um profissional pelo super-admin (tab Assinaturas).
-- Diferente de owner_cancel_subscription (que só marca cancelled_at): esta
-- apaga auth.users do profissional e CASCATEIA para professionals + ~18 tabelas
-- filhas (subscriptions, leads, chat_messages via lead, appointments, credit_ledger,
-- social_*, videos, articles, axel_*, availability, settings, services, documents…).
--
-- Bloqueador tratado: pix_payments.professional_id é NO ACTION (não cascateia);
-- precisa ser apagado antes ou o DELETE do professional falha por violação de FK.
-- Idem refs *_updated_by / granted_by / reviewed_by para auth.users (NO ACTION):
-- zeradas se apontarem ao usuário-alvo.
--
-- SECURITY DEFINER (roda como dono → consegue deletar de auth.users).
-- Travas: bloqueia auto-exclusão e exclusão de quem tem super_admin_access ativo.
-- Aplicar: py C:\tmp\apply_migration.py <caminho deste arquivo>
-- ============================================================

CREATE OR REPLACE FUNCTION public.owner_delete_professional(p_professional_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email   text;
  v_pix     int := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super-admin';
  END IF;

  SELECT p.user_id INTO v_user_id
  FROM public.professionals p
  WHERE p.id = p_professional_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'professional_not_found';
  END IF;

  -- Trava 1: não deixar o super-admin apagar a própria conta por engano.
  IF v_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_delete_self';
  END IF;

  -- Trava 2: não apagar quem ainda tem acesso super-admin ativo.
  IF EXISTS (
    SELECT 1 FROM public.super_admin_access
    WHERE user_id = v_user_id AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'cannot_delete_super_admin';
  END IF;

  SELECT u.email::text INTO v_email FROM auth.users u WHERE u.id = v_user_id;

  -- Remove o bloqueador de FK (pix_payments NÃO cascateia ao deletar o professional).
  DELETE FROM public.pix_payments WHERE professional_id = p_professional_id;
  GET DIAGNOSTICS v_pix = ROW_COUNT;

  -- Zera referências de auditoria a auth.users (NO ACTION) que apontem ao alvo,
  -- pra não bloquear o DELETE de auth.users.
  UPDATE public.app_announcements       SET updated_by = NULL WHERE updated_by = v_user_id;
  UPDATE public.feature_flags           SET updated_by = NULL WHERE updated_by = v_user_id;
  UPDATE public.platform_landing_content SET updated_by = NULL WHERE updated_by = v_user_id;
  UPDATE public.subscription_plans      SET updated_by = NULL WHERE updated_by = v_user_id;
  UPDATE public.super_admin_access      SET granted_by = NULL WHERE granted_by = v_user_id;
  UPDATE public.pix_payments            SET reviewed_by = NULL WHERE reviewed_by = v_user_id;

  -- Apaga o usuário → cascateia professionals e todas as filhas com ON DELETE CASCADE.
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'deleted_user_id', v_user_id,
    'deleted_email',   v_email,
    'deleted_pix_payments', v_pix
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_delete_professional(uuid) TO authenticated;

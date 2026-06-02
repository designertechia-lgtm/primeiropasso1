-- ============================================================
-- Fatia: Auditoria de Feedbacks (Fase 3.5 -- exclusao de arquivados)
-- Data: 2026-05-25
-- ============================================================

-- 1. Hard delete unitario (apenas se status='arquivado')
CREATE OR REPLACE FUNCTION owner_delete_archived_feedback(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'apenas super admin';
  END IF;

  SELECT status INTO v_status FROM feedbacks WHERE id = p_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'feedback nao encontrado';
  END IF;
  IF v_status != 'arquivado' THEN
    RAISE EXCEPTION 'so e possivel excluir feedbacks arquivados (status atual: %)', v_status;
  END IF;

  DELETE FROM feedbacks WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION owner_delete_archived_feedback FROM public;
GRANT EXECUTE ON FUNCTION owner_delete_archived_feedback TO authenticated;

-- 2. Purge bulk: deleta todos arquivados (com filtro de idade opcional)
CREATE OR REPLACE FUNCTION owner_purge_archived_feedbacks(p_older_than_days int DEFAULT 0)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'apenas super admin';
  END IF;
  IF p_older_than_days < 0 THEN
    RAISE EXCEPTION 'older_than_days deve ser >= 0';
  END IF;

  DELETE FROM feedbacks
  WHERE status = 'arquivado'
    AND updated_at < (now() - make_interval(days => p_older_than_days));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION owner_purge_archived_feedbacks FROM public;
GRANT EXECUTE ON FUNCTION owner_purge_archived_feedbacks TO authenticated;

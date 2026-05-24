-- RPC para super-admin liberar créditos de vídeo IA manualmente
-- (cortesia, parceria, compensação por falha de geração).
-- Insere uma linha em credit_ledger com type='bonus' e amount positivo.

CREATE OR REPLACE FUNCTION public.owner_grant_credits(
  p_professional_id uuid,
  p_amount          numeric,
  p_reason          text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM professionals WHERE id = p_professional_id) THEN
    RAISE EXCEPTION 'professional not found';
  END IF;

  INSERT INTO credit_ledger (
    professional_id, type, amount, description, idempotency_key
  )
  VALUES (
    p_professional_id,
    'bonus',
    p_amount,
    COALESCE(NULLIF(btrim(p_reason), ''), 'Crédito manual concedido pelo super-admin'),
    'bonus|' || p_professional_id || '|' || extract(epoch from clock_timestamp())::bigint
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.owner_grant_credits(uuid, numeric, text) TO authenticated;

-- ============================================================
-- Asaas como meio de pagamento de ASSINATURA e CRÉDITOS da plataforma.
-- Distinto do marketplace (asaas-create-charge), onde o profissional RECEBE via
-- subconta/split (asaas_account_id/asaas_wallet_id). Aqui o profissional é CLIENTE
-- da plataforma e PAGA a mensalidade / compra créditos na conta-mãe (sem split).
-- Idempotente.
-- ============================================================

-- 1. professionals: o profissional como CLIENTE Asaas da plataforma + cortesia.
--    asaas_customer_id  -> id do customer na conta-mãe (NÃO confundir com a subconta de recebimento).
--    billing_exempt     -> isenção de cobrança (cortesia), controlada pelos proprietários no painel gerente.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS billing_exempt    boolean NOT NULL DEFAULT false;

-- 2. subscriptions: vínculo com a assinatura recorrente do Asaas + método/dados do cartão.
--    payment_method: credit_card (débito automático) | pix | boleto (cobrança recorrente paga manualmente).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS payment_method        text,
  ADD COLUMN IF NOT EXISTS card_last4            text,
  ADD COLUMN IF NOT EXISTS card_brand            text;

-- 3. pix_payments: reusada para as cobranças avulsas (créditos) e renovações via Asaas,
--    mantendo o histórico unificado em useMyPayments. provider distingue do fluxo manual.
ALTER TABLE public.pix_payments
  ADD COLUMN IF NOT EXISTS provider          text NOT NULL DEFAULT 'manual',  -- manual | asaas
  ADD COLUMN IF NOT EXISTS asaas_payment_id  text,
  ADD COLUMN IF NOT EXISTS asaas_invoice_url text,
  ADD COLUMN IF NOT EXISTS paid_at           timestamptz;

-- 3a. Idempotência do webhook: cada cobrança do Asaas entra no máximo uma vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pix_payments_asaas_payment
  ON public.pix_payments (asaas_payment_id) WHERE asaas_payment_id IS NOT NULL;

-- 3b. Novos status: 'pending' (aguardando pagamento no Asaas) e 'paid' (confirmado pelo webhook).
ALTER TABLE public.pix_payments DROP CONSTRAINT IF EXISTS pix_payments_status_check;
ALTER TABLE public.pix_payments
  ADD CONSTRAINT pix_payments_status_check
  CHECK (status IN ('awaiting_proof','pending_review','approved','rejected','expired','cancelled','pending','paid'));

-- 4. owner_list_all_users: expõe cortesia (billing_exempt) + método de pagamento no painel gerente.
--    Recriada (DROP+CREATE) porque o RETURNS TABLE muda de assinatura.
DROP FUNCTION IF EXISTS public.owner_list_all_users();
CREATE FUNCTION public.owner_list_all_users()
 RETURNS TABLE(
   user_id uuid, professional_id uuid, email text, full_name text, slug text, whatsapp text,
   user_created_at timestamptz, subscription_status text, monthly_price_brl numeric,
   current_period_end timestamptz, cancelled_at timestamptz, days_until_expiry integer,
   auto_renew boolean, billing_exempt boolean, payment_method text
 )
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super-admin';
  END IF;

  RETURN QUERY
  SELECT
    u.id                              AS user_id,
    p.id                              AS professional_id,
    u.email::text                     AS email,
    p.full_name                       AS full_name,
    p.slug                            AS slug,
    p.whatsapp                        AS whatsapp,
    u.created_at                      AS user_created_at,
    s.status                          AS subscription_status,
    s.monthly_price_brl               AS monthly_price_brl,
    s.current_period_end              AS current_period_end,
    s.cancelled_at                    AS cancelled_at,
    CASE
      WHEN s.current_period_end IS NULL THEN NULL
      ELSE EXTRACT(DAY FROM s.current_period_end - now())::integer
    END                               AS days_until_expiry,
    COALESCE(s.auto_renew, false)     AS auto_renew,
    COALESCE(p.billing_exempt, false) AS billing_exempt,
    s.payment_method                  AS payment_method
  FROM public.professionals p
  JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN LATERAL (
    SELECT s2.status, s2.monthly_price_brl, s2.current_period_end, s2.cancelled_at, s2.auto_renew, s2.payment_method
    FROM public.subscriptions s2
    WHERE s2.professional_id = p.id
    ORDER BY s2.created_at DESC
    LIMIT 1
  ) s ON TRUE
  ORDER BY u.created_at DESC NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.owner_list_all_users() TO authenticated;

-- 5. RPC: super-admin liga/desliga a cortesia (isenção de cobrança) de um profissional.
CREATE OR REPLACE FUNCTION public.owner_set_billing_exempt(
  p_professional_id uuid,
  p_exempt          boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM professionals WHERE id = p_professional_id) THEN
    RAISE EXCEPTION 'professional not found';
  END IF;

  UPDATE professionals SET billing_exempt = COALESCE(p_exempt, false) WHERE id = p_professional_id;
  RETURN COALESCE(p_exempt, false);
END $$;

GRANT EXECUTE ON FUNCTION public.owner_set_billing_exempt(uuid, boolean) TO authenticated;

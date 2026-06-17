-- ============================================================
-- Marketplace — Fase 2 (fundação): pedidos do cliente final
-- Tabela de pedidos (produto OU sessão), agnóstica ao gateway, + campos
-- Asaas no professional (subconta/split). A cobrança/webhook entram depois.
-- Idempotente.
-- ============================================================

-- 1. Dados Asaas do profissional (subconta white-label + carteira p/ split)
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS asaas_wallet_id  TEXT,
  ADD COLUMN IF NOT EXISTS asaas_account_id TEXT;

-- 2. Pedidos
CREATE TABLE IF NOT EXISTS public.product_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,

  -- item comprado (produto OU sessão); snapshot do título p/ histórico
  item_type        TEXT NOT NULL CHECK (item_type IN ('product','service')),
  product_id       UUID REFERENCES public.professional_products(id) ON DELETE SET NULL,
  service_id       UUID REFERENCES public.professional_services(id) ON DELETE SET NULL,
  item_title       TEXT NOT NULL,
  amount_brl       NUMERIC(10,2) NOT NULL,
  platform_fee_brl NUMERIC(10,2),                 -- split retido pela plataforma

  -- comprador (não-logado)
  buyer_name       TEXT NOT NULL,
  buyer_email      TEXT,
  buyer_phone      TEXT,

  -- envio (produto físico; null p/ digital/sessão)
  shipping_address JSONB,

  -- pagamento (Asaas) — preenchido pela edge function de cobrança/webhook
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','failed','cancelled','refunded','delivered')),
  asaas_payment_id TEXT,
  asaas_invoice_url TEXT,                          -- link de checkout/fatura do Asaas
  payment_method   TEXT,                           -- pix / credit_card / boleto
  paid_at          TIMESTAMPTZ,

  -- entrega digital (download protegido do PDF)
  delivery_token   TEXT UNIQUE,
  delivered_at     TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_product_orders_professional ON public.product_orders (professional_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_orders_asaas       ON public.product_orders (asaas_payment_id);

DROP TRIGGER IF EXISTS update_product_orders_updated_at ON public.product_orders;
CREATE TRIGGER update_product_orders_updated_at
  BEFORE UPDATE ON public.product_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RLS: só o dono lê os próprios pedidos. Escrita é exclusiva das edge functions
-- (service_role ignora RLS); o comprador não-logado nunca acessa a tabela direto —
-- cria o pedido e acompanha/baixa via edge function por token.
DROP POLICY IF EXISTS "orders_owner_read" ON public.product_orders;
CREATE POLICY "orders_owner_read"
  ON public.product_orders FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_id AND p.user_id = auth.uid()
    )
  );

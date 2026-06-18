-- ============================================================
-- Peça 6 — Carteira/Saque do profissional.
-- ============================================================

-- 1. Credenciais da subconta Asaas. A apiKey é devolvida UMA ÚNICA VEZ na criação
-- da subconta (não dá pra recuperar depois) e é a chave que movimenta o dinheiro do
-- profissional → guardada aqui + a chave PIX de saque preferida dele.
-- SEM nenhuma policy de RLS de propósito: anon/authenticated NÃO acessam; só as edge
-- functions (service_role, que ignora RLS) leem/escrevem. O navegador nunca toca nesta tabela.
CREATE TABLE IF NOT EXISTS public.asaas_subaccount_credentials (
  professional_id     UUID PRIMARY KEY REFERENCES public.professionals(id) ON DELETE CASCADE,
  api_key             TEXT NOT NULL,
  payout_pix_key      TEXT,
  payout_pix_key_type TEXT CHECK (payout_pix_key_type IN ('CPF','CNPJ','EMAIL','PHONE','EVP')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.asaas_subaccount_credentials ENABLE ROW LEVEL SECURITY;
-- (intencionalmente sem CREATE POLICY → tabela só-servidor)

-- 2. Histórico de saques (o dono lê os próprios; escrita só via service_role/edge).
CREATE TABLE IF NOT EXISTS public.payout_transfers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  amount_brl        NUMERIC(10,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'requested'
                      CHECK (status IN ('requested','done','failed')),
  asaas_transfer_id TEXT,
  pix_key           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payout_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout_owner_read" ON public.payout_transfers;
CREATE POLICY "payout_owner_read"
  ON public.payout_transfers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = professional_id AND p.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_payout_transfers_prof
  ON public.payout_transfers (professional_id, created_at DESC);

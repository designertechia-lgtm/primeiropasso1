-- Como o cliente contrata cada sessão (escolha do profissional):
--   schedule = só "Agendar" (WhatsApp/agenda) — comportamento atual
--   pay      = só "Pagar" online (checkout Asaas)
--   both     = os dois botões
-- Default 'schedule' para não mudar as sessões já existentes; o profissional opta no editor.
ALTER TABLE public.professional_services
  ADD COLUMN IF NOT EXISTS checkout_mode TEXT NOT NULL DEFAULT 'schedule'
    CHECK (checkout_mode IN ('schedule', 'pay', 'both'));

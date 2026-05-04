-- ============================================================
-- Fatia 4: Fluxo PIX manual (comprovante + validação manual)
-- ============================================================

-- 1. Adiciona colunas de papel e principal na tabela professionals
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'professional'
    CHECK (role IN ('professional','super_admin')),
  ADD COLUMN IF NOT EXISTS is_principal boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_principal_unique
  ON professionals (is_principal) WHERE is_principal = true;

-- 2. Tabela de configuração PIX (chave única id='main')
CREATE TABLE IF NOT EXISTS pix_settings (
  id text PRIMARY KEY DEFAULT 'main',
  pix_key text NOT NULL,
  pix_key_type text NOT NULL CHECK (pix_key_type IN ('cpf','cnpj','phone','email','random')),
  beneficiary_name text NOT NULL,
  bank_name text,
  instructions text,
  updated_at timestamptz DEFAULT now()
);

-- 3. Refatoração de pix_payments: remove colunas MP, adiciona colunas de comprovante/revisão

-- 3a. Remove restrição antiga de status
ALTER TABLE pix_payments DROP CONSTRAINT IF EXISTS pix_payments_status_check;

-- 3b. Remove colunas do fluxo Mercado Pago
ALTER TABLE pix_payments
  DROP COLUMN IF EXISTS mp_payment_id,
  DROP COLUMN IF EXISTS external_reference,
  DROP COLUMN IF EXISTS qr_code_base64,
  DROP COLUMN IF EXISTS qr_code_text,
  DROP COLUMN IF EXISTS approved_at;

-- 3c. Adiciona colunas do fluxo manual
ALTER TABLE pix_payments
  ADD COLUMN IF NOT EXISTS proof_url text,
  ADD COLUMN IF NOT EXISTS proof_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 3d. Novo conjunto de status + novo default
ALTER TABLE pix_payments
  ALTER COLUMN status SET DEFAULT 'awaiting_proof',
  ADD CONSTRAINT pix_payments_status_check
    CHECK (status IN ('awaiting_proof','pending_review','approved','rejected','expired','cancelled'));

-- Atualiza linhas existentes que ainda tenham status antigo
UPDATE pix_payments SET status = 'awaiting_proof'
  WHERE status NOT IN ('awaiting_proof','pending_review','approved','rejected','expired','cancelled');

-- 4. RLS para pix_settings (só super_admin altera; todos autenticados leem)
ALTER TABLE pix_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pix_settings_read" ON pix_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pix_settings_write" ON pix_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM professionals
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- 5. Seed inicial de pix_settings (pode alterar no painel super_admin)
INSERT INTO pix_settings (id, pix_key, pix_key_type, beneficiary_name, bank_name, instructions)
VALUES (
  'main',
  'designertech.ia@gmail.com',
  'email',
  'Daiane Cenci',
  'C6 Bank PJ',
  'Após o pagamento, envie o comprovante nesta tela. A validação ocorre em até 24 h úteis.'
)
ON CONFLICT (id) DO NOTHING;

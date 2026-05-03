-- Item 3a: Kanban CRM - Pipeline stages for leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'novo';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS agent_enabled boolean DEFAULT true;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origin_platform text DEFAULT 'whatsapp';

-- Constraint for valid pipeline stages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_pipeline_stage_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_pipeline_stage_check
      CHECK (pipeline_stage IN ('novo','em_conversa','proposta_feita','agendado','cliente_ativo','inativo'));
  END IF;
END $$;

-- Indexes for Kanban queries
CREATE INDEX IF NOT EXISTS idx_leads_pipeline ON leads (professional_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_last_message ON leads (last_message_at DESC NULLS LAST);

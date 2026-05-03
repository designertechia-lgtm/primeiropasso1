-- Tabela de memória de conversa (substitui o memoryPostgresChat do n8n)
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_lead ON chat_messages(lead_id, created_at DESC);

-- Habilitar RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Política: profissional só vê mensagens dos seus leads
CREATE POLICY "Professional can view own lead messages"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN professionals p ON l.professional_id = p.id
      WHERE l.id = chat_messages.lead_id
        AND p.user_id = auth.uid()
    )
  );

-- Campos de valores do profissional para o agente usar na negociação
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS price_first_session DECIMAL(10,2);
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS price_min DECIMAL(10,2);
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS price_max DECIMAL(10,2);
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS agent_system_prompt TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Habilitar Realtime na tabela chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
-- Habilitar Realtime na tabela leads (para o Kanban)
ALTER PUBLICATION supabase_realtime ADD TABLE leads;

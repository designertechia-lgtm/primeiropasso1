-- Automações PRO: geração automática + publicação periódica de vídeos
CREATE TABLE IF NOT EXISTS social_automations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID        NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  platform        TEXT        NOT NULL DEFAULT 'instagram'
                              CHECK (platform IN ('instagram', 'linkedin', 'tiktok')),
  post_type       TEXT        NOT NULL DEFAULT 'reels'
                              CHECK (post_type IN ('reels', 'feed')),
  tema            TEXT        NOT NULL,
  frequencia      TEXT        NOT NULL DEFAULT 'semanal'
                              CHECK (frequencia IN ('diario', 'semanal', 'quinzenal')),
  hora_publicacao TIME        NOT NULL DEFAULT '09:00',
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'paused')),
  ultimo_run_at   TIMESTAMPTZ,
  proximo_run_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE social_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professionals_manage_own_automations"
  ON social_automations FOR ALL
  USING (
    professional_id IN (
      SELECT id FROM professionals WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    professional_id IN (
      SELECT id FROM professionals WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_social_automations_professional ON social_automations (professional_id);
CREATE INDEX idx_social_automations_next_run     ON social_automations (proximo_run_at, status);

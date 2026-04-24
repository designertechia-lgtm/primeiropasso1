CREATE TABLE IF NOT EXISTS social_posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID        NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  video_id        UUID        NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  platform        TEXT        NOT NULL CHECK (platform IN ('instagram', 'linkedin', 'tiktok')),
  scheduled_at    TIMESTAMPTZ NOT NULL,
  description     TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'published', 'failed', 'cancelled')),
  n8n_execution_id TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professionals_manage_own_social_posts"
  ON social_posts
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

CREATE INDEX idx_social_posts_professional ON social_posts (professional_id);
CREATE INDEX idx_social_posts_status       ON social_posts (status, scheduled_at);

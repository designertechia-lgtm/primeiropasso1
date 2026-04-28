-- Garante que social_posts existe antes de adicionar colunas
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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'social_posts'
      AND policyname = 'professionals_manage_own_social_posts'
  ) THEN
    CREATE POLICY "professionals_manage_own_social_posts"
      ON social_posts
      USING (professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid()))
      WITH CHECK (professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_social_posts_professional ON social_posts (professional_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_status       ON social_posts (status, scheduled_at);

-- Add feed post support (image posts)
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'reels'
  CHECK (post_type IN ('reels', 'feed'));

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS image_url TEXT;

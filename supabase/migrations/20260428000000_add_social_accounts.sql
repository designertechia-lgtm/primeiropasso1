CREATE TABLE IF NOT EXISTS social_accounts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   uuid        NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  platform          text        NOT NULL,   -- 'instagram' | 'linkedin'
  access_token      text        NOT NULL,
  refresh_token     text,
  expires_at        timestamptz,
  account_name      text,                   -- @handle ou nome do perfil
  account_id        text,                   -- ID na plataforma
  page_id           text,                   -- Facebook Page ID (obrigatório Instagram)
  created_at        timestamptz DEFAULT now(),
  UNIQUE (professional_id, platform)
);

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professional manages own social accounts"
  ON social_accounts
  FOR ALL
  USING (
    professional_id IN (
      SELECT id FROM professionals WHERE user_id = auth.uid()
    )
  );

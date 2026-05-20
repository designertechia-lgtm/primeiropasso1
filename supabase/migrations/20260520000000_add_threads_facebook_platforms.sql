-- Habilita Threads e Facebook em social_posts e social_automations.
-- Necessário pro Calendário de Publicações (entrega 2026-05-20) e pro
-- novo motor de publicação Meta-direto (IG + FB + Threads) — workflow 2026-05-21.

ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_platform_check;
ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_platform_check
  CHECK (platform IN ('instagram', 'linkedin', 'tiktok', 'threads', 'facebook'));

ALTER TABLE social_automations DROP CONSTRAINT IF EXISTS social_automations_platform_check;
ALTER TABLE social_automations
  ADD CONSTRAINT social_automations_platform_check
  CHECK (platform IN ('instagram', 'linkedin', 'tiktok', 'threads', 'facebook'));

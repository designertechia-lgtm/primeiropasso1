-- Cron diário (03:00 UTC = 00:00 BRT) que renova tokens Instagram/Threads
-- prestes a expirar. Usa as GUCs já configuradas pra publish-social-posts.
-- ATENÇÃO: se as GUCs app.supabase_url / app.service_role_key não estiverem
-- setadas, o cron mostra "succeeded" mas não faz nada. Conferir com:
--   SELECT current_setting('app.supabase_url', true);
--   SELECT current_setting('app.service_role_key', true);

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('oauth-meta-refresh')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'oauth-meta-refresh');

SELECT cron.schedule(
  'oauth-meta-refresh',
  '0 3 * * *',
  $$
  SELECT
    net.http_post(
      url    := current_setting('app.supabase_url') || '/functions/v1/oauth-meta-refresh',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body   := '{}'::jsonb
    )
  $$
);

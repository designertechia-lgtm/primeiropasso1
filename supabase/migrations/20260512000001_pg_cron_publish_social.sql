-- ============================================================
-- pg_cron: Dispara publish-social-posts a cada 5 minutos
-- Data: 2026-05-12
--
-- PRÉ-REQUISITO: extensão pg_cron habilitada no Supabase
-- (Dashboard → Database → Extensions → pg_cron → Enable)
--
-- COMO APLICAR:
-- 1. Habilite pg_cron nas Extensions do Supabase Dashboard
-- 2. Execute este script no SQL Editor do Supabase
-- 3. Confirme com: SELECT * FROM cron.job;
-- ============================================================

-- Habilita a extensão (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove job anterior se existir (evita duplicata)
SELECT cron.unschedule('publish-social-posts')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'publish-social-posts'
);

-- Cria o job: a cada 5 minutos, chama a Edge Function via HTTP
-- A URL deve ser atualizada com o Project Ref correto do Supabase
SELECT cron.schedule(
  'publish-social-posts',          -- nome do job
  '*/5 * * * *',                   -- cron: a cada 5 minutos
  $$
  SELECT
    net.http_post(
      url    := current_setting('app.supabase_url') || '/functions/v1/publish-social-posts',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body   := '{}'::jsonb
    )
  $$
);

-- Verificar jobs ativos após execução:
-- SELECT jobid, jobname, schedule, active FROM cron.job;

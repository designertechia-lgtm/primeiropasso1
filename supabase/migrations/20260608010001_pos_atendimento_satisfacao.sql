-- ============================================================
-- Pós-atendimento (caso H) — Primeiro Passo — 2026-06-08
-- Aplicar via: py C:\tmp\apply_migration.py C:\tmp\_pp_satisfaction_migration.sql
-- (Também commitar em primeiropasso/supabase/migrations)
-- ============================================================

-- 1) Reusa appointment_reminders pra pesquisa de satisfação: libera kind='satisfaction'
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.appointment_reminders'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%kind%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.appointment_reminders DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.appointment_reminders
  ADD CONSTRAINT appointment_reminders_kind_check
  CHECK (kind IN ('24h', '1h', 'satisfaction'));

-- 2) Função do cron (espelho de process_appointment_reminders)
CREATE OR REPLACE FUNCTION public.process_satisfaction_surveys()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url TEXT := 'https://lpqkkbtadnqkbathdvzb.supabase.co';
  v_appt   RECORD;
  v_rem    RECORD;
  v_sent   INT := 0;
  v_inact  INT := 0;
  v_now    TIMESTAMPTZ := now();
BEGIN
  -- PARTE A: ~30min após o FIM do atendimento (não cancelado, sem pesquisa ainda)
  FOR v_appt IN
    SELECT a.id
    FROM public.appointments a
    WHERE a.status IN ('pending', 'confirmed')
      AND a.appointment_type = 'booking'
      AND a.end_time IS NOT NULL
      AND ((a.appointment_date + a.end_time) AT TIME ZONE 'America/Sao_Paulo')
            BETWEEN (v_now - INTERVAL '90 minutes') AND (v_now - INTERVAL '30 minutes')
      AND NOT EXISTS (
        SELECT 1 FROM public.appointment_reminders r
        WHERE r.appointment_id = a.id AND r.kind = 'satisfaction'
      )
  LOOP
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-satisfaction-survey',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer internal-cron-call'),
      body := jsonb_build_object('appointment_id', v_appt.id)
    );
    v_sent := v_sent + 1;
  END LOOP;

  -- PARTE B: 24h sem resposta -> lead 'inativo' + fecha o registro (não re-processa)
  FOR v_rem IN
    SELECT r.id, r.appointment_id, a.professional_id
    FROM public.appointment_reminders r
    JOIN public.appointments a ON a.id = r.appointment_id
    WHERE r.kind = 'satisfaction'
      AND r.patient_response IS NULL
      AND r.sent_at < v_now - INTERVAL '24 hours'
  LOOP
    UPDATE public.leads l
      SET pipeline_stage = 'inativo'
      WHERE l.professional_id = v_rem.professional_id
        AND l.booking_state->>'appointment_id' = v_rem.appointment_id::text
        AND l.pipeline_stage <> 'inativo';
    UPDATE public.appointment_reminders
      SET patient_response = 'sem_resposta', response_at = v_now
      WHERE id = v_rem.id;
    v_inact := v_inact + 1;
  END LOOP;

  RETURN jsonb_build_object('surveys_sent', v_sent, 'marked_inactive', v_inact, 'at', v_now);
END;
$function$;

-- 3) ATIVAÇÃO DO CRON — rodar SÓ quando aprovado (espelha o tick de 10min dos lembretes):
-- SELECT cron.schedule('satisfaction-surveys', '*/10 * * * *', $$SELECT public.process_satisfaction_surveys();$$);

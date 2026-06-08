-- ============================================================
-- Crons respeitam as preferências do agente (professionals.agent_preferences)
-- master 'enabled' off  -> nem lembrete nem pós-atendimento
-- 'reminders'/'satisfaction' off -> desliga só aquele fluxo
-- Chave ausente = default ligado (COALESCE(..., true))
-- Aplicar via: py C:\tmp\apply_migration.py C:\tmp\_pp_agent_prefs_crons.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_appointment_reminders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url TEXT := 'https://lpqkkbtadnqkbathdvzb.supabase.co';
  v_appt         RECORD;
  v_kind         TEXT;
  v_processed    INT := 0;
  v_skipped      INT := 0;
  v_dispatched   jsonb := '[]'::jsonb;
  v_now          TIMESTAMPTZ := now();
BEGIN
  FOR v_appt IN
    SELECT
      a.id,
      a.appointment_date,
      a.start_time,
      ((a.appointment_date + a.start_time) AT TIME ZONE 'America/Sao_Paulo') AS appointment_at
    FROM public.appointments a
    JOIN public.professionals p ON p.id = a.professional_id
    WHERE a.status IN ('pending', 'confirmed')
      AND a.appointment_type = 'booking'
      AND COALESCE((p.agent_preferences->>'enabled')::boolean, true)
      AND COALESCE((p.agent_preferences->>'reminders')::boolean, true)
      AND (
        ((a.appointment_date + a.start_time) AT TIME ZONE 'America/Sao_Paulo')
          BETWEEN (v_now + INTERVAL '23 hours 55 minutes')
              AND (v_now + INTERVAL '24 hours 5 minutes')
        OR
        ((a.appointment_date + a.start_time) AT TIME ZONE 'America/Sao_Paulo')
          BETWEEN (v_now + INTERVAL '55 minutes')
              AND (v_now + INTERVAL '65 minutes')
      )
  LOOP
    IF v_appt.appointment_at > v_now + INTERVAL '23 hours' THEN
      v_kind := '24h';
    ELSE
      v_kind := '1h';
    END IF;

    IF EXISTS (SELECT 1 FROM public.appointment_reminders WHERE appointment_id = v_appt.id AND kind = v_kind) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-appointment-reminder',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer internal-cron-call'),
      body := jsonb_build_object('appointment_id', v_appt.id, 'kind', v_kind)
    );

    v_processed := v_processed + 1;
    v_dispatched := v_dispatched || jsonb_build_object('appointment_id', v_appt.id, 'kind', v_kind);
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'skipped', v_skipped, 'dispatched', v_dispatched, 'at', v_now);
END;
$function$;


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
  -- PARTE A: ~30min após o FIM, respeitando master 'enabled' + 'satisfaction'
  FOR v_appt IN
    SELECT a.id
    FROM public.appointments a
    JOIN public.professionals p ON p.id = a.professional_id
    WHERE a.status IN ('pending', 'confirmed')
      AND a.appointment_type = 'booking'
      AND a.end_time IS NOT NULL
      AND COALESCE((p.agent_preferences->>'enabled')::boolean, true)
      AND COALESCE((p.agent_preferences->>'satisfaction')::boolean, true)
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

  -- PARTE B: 24h sem resposta -> lead 'inativo' (atua só sobre pesquisas já enviadas)
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

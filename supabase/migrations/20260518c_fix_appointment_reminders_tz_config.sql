-- Fix process_appointment_reminders: timezone BRT + remove dependência de current_setting.
--
-- Bug 1 (timezone): (date + time)::timestamptz interpretava start_time como UTC,
--   fazendo o cron procurar appointments 3h fora do esperado. Fix: AT TIME ZONE 'America/Sao_Paulo'.
--
-- Bug 2 (config missing): current_setting('app.settings.supabase_url') nunca foi
--   configurado no banco, fazendo a função retornar {error:'config missing'} em toda execução
--   do cron sem nunca disparar o envio. Fix: URL hardcoded (é pública) + Bearer dummy
--   (Edge function send-appointment-reminder tem verify_jwt=false).
--
-- Retorno enriquecido com 'dispatched' listando ids/kinds processados pra debug.

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
    WHERE a.status IN ('pending', 'confirmed')
      AND a.appointment_type = 'booking'
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
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer internal-cron-call'
      ),
      body := jsonb_build_object(
        'appointment_id', v_appt.id,
        'kind', v_kind
      )
    );

    v_processed := v_processed + 1;
    v_dispatched := v_dispatched || jsonb_build_object('appointment_id', v_appt.id, 'kind', v_kind);
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'skipped', v_skipped, 'dispatched', v_dispatched, 'at', v_now);
END;
$function$;

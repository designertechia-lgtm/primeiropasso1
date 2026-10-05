-- ============================================================
-- Auditoria do fluxo de agendamento (Drika) — 2026-10-05
-- Ver auditorias/2026-10-05_auditoria_fluxo_agendamento_drika.md
-- Aplicar via: py C:\tmp\apply_migration.py <este arquivo>   (NÃO aplicada na sessão da auditoria)
--
-- 1) Pesquisa de satisfação também para atendimento CONCLUÍDO.
--    auto_complete_appointments (a cada 15 min) passa 'confirmed' → 'completed' logo depois do fim;
--    a pesquisa só olhava pending/confirmed entre 30 e 90 min após o fim → quem CONFIRMOU presença
--    nunca recebia pesquisa (só os 'pending', que incluem as faltas).
-- 2) Parte B não marca 'inativo' quem tem sessão FUTURA marcada (paciente recorrente que só não
--    respondeu a pesquisa voltava a ser tratado como lead não-cliente pelo webhook).
-- 3) Remarcar pelo PAINEL re-arma os lembretes 24h/1h (o cron deduplica por appointment_id+kind;
--    o registro do horário antigo impedia o lembrete do horário novo). A edge whatsapp-agent já faz
--    isso na remarcação pelo WhatsApp; o trigger cobre qualquer caminho.
-- ============================================================

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
    WHERE a.status IN ('pending', 'confirmed', 'completed')   -- (1) inclui 'completed'
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
        AND l.pipeline_stage <> 'inativo'
        -- (2) quem tem sessão futura ativa não é inativo
        AND NOT EXISTS (
          SELECT 1 FROM public.appointments f
          WHERE f.professional_id = l.professional_id
            AND f.lead_id = l.id
            AND f.status IN ('pending', 'confirmed')
            AND (f.appointment_date + f.start_time) > (v_now AT TIME ZONE 'America/Sao_Paulo')
        );
    UPDATE public.appointment_reminders
      SET patient_response = 'sem_resposta', response_at = v_now
      WHERE id = v_rem.id;
    v_inact := v_inact + 1;
  END LOOP;

  RETURN jsonb_build_object('surveys_sent', v_sent, 'marked_inactive', v_inact, 'at', v_now);
END;
$function$;

-- (3) Re-arma lembretes quando o horário muda (qualquer origem: painel, agente, SQL)
CREATE OR REPLACE FUNCTION public.reset_reminders_on_reschedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.appointment_date IS DISTINCT FROM OLD.appointment_date
     OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    DELETE FROM public.appointment_reminders
      WHERE appointment_id = NEW.id AND kind IN ('24h', '1h');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reset_reminders_on_reschedule ON public.appointments;
CREATE TRIGGER trg_reset_reminders_on_reschedule
  AFTER UPDATE OF appointment_date, start_time ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.reset_reminders_on_reschedule();

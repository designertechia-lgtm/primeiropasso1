-- ============================================================
-- RPCs de exclusão (menu na tab Conversas) — Primeiro Passo — 2026-06-08
-- SECURITY DEFINER + validação de dono (professionals.user_id = auth.uid()).
-- appointment_reminders cascateia ao deletar o appointment (FK ON DELETE CASCADE).
-- Aplicar: py C:\tmp\apply_migration.py C:\tmp\_pp_delete_lead_rpcs.sql
-- ============================================================

-- Apaga só as mensagens (limpa o histórico de conversa do lead)
CREATE OR REPLACE FUNCTION public.owner_clear_lead_messages(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_deleted int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.professionals p ON p.id = l.professional_id
    WHERE l.id = p_lead_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  DELETE FROM public.chat_messages WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deleted_messages', v_deleted);
END;
$function$;

-- Apaga o lead por completo: agendamento (último, via booking_state) + mensagens + lead
CREATE OR REPLACE FUNCTION public.owner_delete_lead(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appt_txt text;
  v_appt     uuid;
  v_msgs     int := 0;
  v_appts    int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.professionals p ON p.id = l.professional_id
    WHERE l.id = p_lead_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  -- Agendamento vinculado (último, via booking_state). Deleta appointment ->
  -- appointment_reminders some por CASCADE.
  SELECT NULLIF(booking_state->>'appointment_id', '') INTO v_appt_txt
  FROM public.leads WHERE id = p_lead_id;
  IF v_appt_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_appt := v_appt_txt::uuid;
    DELETE FROM public.appointments WHERE id = v_appt;
    GET DIAGNOSTICS v_appts = ROW_COUNT;
  END IF;

  DELETE FROM public.chat_messages WHERE lead_id = p_lead_id;
  GET DIAGNOSTICS v_msgs = ROW_COUNT;

  DELETE FROM public.leads WHERE id = p_lead_id;

  RETURN jsonb_build_object('deleted_lead', p_lead_id, 'deleted_messages', v_msgs, 'deleted_appointments', v_appts);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.owner_clear_lead_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_delete_lead(uuid) TO authenticated;

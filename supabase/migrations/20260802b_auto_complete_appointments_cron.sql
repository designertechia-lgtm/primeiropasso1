-- ── Auto-concluir atendimentos vencidos, no servidor ─────────────────────────
-- POR QUÊ: até aqui isso só acontecia no navegador, quando alguém abria a tela
-- da agenda (useAutoCompleteAppointments). Consequência: o Axel no WhatsApp lia
-- "confirmed" de consulta que já tinha terminado, e a agenda que ninguém abriu
-- ficava congelada. Agora o banco resolve sozinho, a cada 15 minutos.
--
-- FUSO: appointment_date/end_time são HORA DE PAREDE do profissional (sem tz).
-- Comparar com now() em UTC concluiria tudo 3h cedo em São Paulo — por isso a
-- comparação usa now() convertido para o fuso local.

CREATE OR REPLACE FUNCTION public.auto_complete_appointments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  afetados integer;
BEGIN
  UPDATE appointments
  SET status = 'completed'
  WHERE status = 'confirmed'
    -- Só atendimentos: bloqueio não "conclui". O IS NULL cobre os registros
    -- anteriores ao default 'booking' da coluna.
    AND (appointment_type IS NULL OR appointment_type = 'booking')
    AND (appointment_date + end_time) < (now() AT TIME ZONE 'America/Sao_Paulo');

  GET DIAGNOSTICS afetados = ROW_COUNT;
  RETURN afetados;
END;
$$;

COMMENT ON FUNCTION public.auto_complete_appointments() IS
  'Marca como concluídos os atendimentos confirmados cujo horário já terminou.
   Roda a cada 15 min pelo pg_cron; o hook do front virou apenas um reforço.';

SELECT cron.schedule(
  'auto-complete-appointments',
  '*/15 * * * *',
  $$SELECT public.auto_complete_appointments();$$
);

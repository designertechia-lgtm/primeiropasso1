-- ============================================================
-- CORREÇÃO CRÍTICA: Anti-Double-Booking na Agenda
-- Data: 2026-05-12
-- Impede 2 agendamentos no mesmo profissional + data + hora_inicio
-- com status ativo (pending ou confirmed).
-- Cancelados e concluídos não bloqueiam o horário.
-- ============================================================

-- Índice único parcial (mais eficiente que constraint pura para filtragem de status)
CREATE UNIQUE INDEX IF NOT EXISTS unique_appointment_slot
  ON appointments (professional_id, appointment_date, start_time)
  WHERE status IN ('pending', 'confirmed')
    AND (appointment_type IS NULL OR appointment_type = 'booking');

-- Comentário explicativo para futuros devs
COMMENT ON INDEX unique_appointment_slot IS
  'Garante que um profissional não tenha dois agendamentos (bookings) ativos
   no mesmo dia e horário de início. Cancelados e concluídos são ignorados.
   Bloqueios de agenda (appointment_type = block) também são ignorados.';

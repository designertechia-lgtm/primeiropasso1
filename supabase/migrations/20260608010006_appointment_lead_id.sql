-- Vínculo estável agendamento -> lead — Primeiro Passo — 2026-06-08
-- ON DELETE CASCADE: apagar o lead apaga seus agendamentos (e os reminders cascateiam).
-- Resolve o órfão que sobrava ao limpar o booking_state (handler de satisfação / reagendamento).
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON public.appointments(lead_id);

COMMENT ON COLUMN public.appointments.lead_id IS
  'Lead (WhatsApp) que originou o agendamento. ON DELETE CASCADE: apagar o lead apaga o agendamento. NULL para agendamentos criados manualmente pelo profissional.';

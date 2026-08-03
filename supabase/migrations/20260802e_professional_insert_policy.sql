-- ── O profissional não conseguia criar atendimento na própria agenda ─────────
-- SINTOMA: "new row violates row-level security policy for table appointments"
-- ao confirmar um agendamento pelo painel.
--
-- CAUSA: a única policy de INSERT era a dos PACIENTES:
--   (appointment_type='booking' AND auth.uid() = patient_id)
--   OR (appointment_type='block'  AND é o profissional dono)
--
-- Ou seja, criar um 'booking' exigia que o autor fosse o próprio paciente. Isso
-- funcionava enquanto o painel gravava tudo como 'block'; quando "Atendimento x
-- Bloqueio" virou escolha explícita (27/07), o painel passou a gravar
-- appointment_type='booking' com patient_id NULL — o cliente é um lead, não um
-- usuário cadastrado — e nenhuma das duas condições passava.
--
-- Policies de INSERT se combinam por OR, então basta acrescentar o caminho do
-- profissional; o do paciente continua valendo como está.

DROP POLICY IF EXISTS "Professionals can create own appointments" ON public.appointments;
CREATE POLICY "Professionals can create own appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = appointments.professional_id
      AND p.user_id = auth.uid()
  ));

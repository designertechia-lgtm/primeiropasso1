-- Cancelar passou a EXCLUIR o agendamento (painel admin, área do paciente e Axel).
--
-- Até aqui a única policy de DELETE em appointments era "Professionals can delete
-- own blocks", restrita a appointment_type = 'block'. Ou seja: o profissional não
-- conseguia apagar um ATENDIMENTO, e o paciente não podia apagar nada. Como o
-- PostgREST devolve 200 com zero linhas quando a RLS barra a operação, o app
-- exibia "removido com sucesso" sem ter removido coisa alguma.

-- 1) Profissional: pode excluir qualquer agendamento seu, não apenas bloqueios.
DROP POLICY IF EXISTS "Professionals can delete own blocks" ON public.appointments;

CREATE POLICY "Professionals can delete own appointments"
ON public.appointments
FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = appointments.professional_id
      AND p.user_id = auth.uid()
  )
);

-- 2) Paciente: pode remover o próprio agendamento enquanto ainda está pendente.
--    Mesmo escopo da antiga policy de UPDATE ("Patients can cancel own
--    appointments"), que só permitia cancelar em status 'pending' — aqui a ação
--    apenas passa a apagar em vez de marcar como cancelado.
DROP POLICY IF EXISTS "Patients can delete own appointments" ON public.appointments;

CREATE POLICY "Patients can delete own appointments"
ON public.appointments
FOR DELETE
TO public
USING (
  auth.uid() = patient_id
  AND status = 'pending'::appointment_status
);

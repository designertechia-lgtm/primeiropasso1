
DROP POLICY "Patients can cancel own appointments" ON public.appointments;

CREATE POLICY "Patients can cancel own appointments"
ON public.appointments
FOR UPDATE
TO public
USING (auth.uid() = patient_id AND status = 'pending'::appointment_status)
WITH CHECK (auth.uid() = patient_id AND status = 'cancelled'::appointment_status);

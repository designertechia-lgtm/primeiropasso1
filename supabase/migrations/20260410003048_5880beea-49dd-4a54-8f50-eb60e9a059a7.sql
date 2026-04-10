
-- Add appointment_type and block_type columns
ALTER TABLE public.appointments 
ADD COLUMN appointment_type TEXT NOT NULL DEFAULT 'booking',
ADD COLUMN block_type TEXT;

-- Make patient_id nullable for blocks
ALTER TABLE public.appointments ALTER COLUMN patient_id DROP NOT NULL;

-- Drop existing INSERT policy and recreate to allow blocks (no patient_id)
DROP POLICY IF EXISTS "Patients can create appointments" ON public.appointments;

CREATE POLICY "Patients can create appointments"
ON public.appointments
FOR INSERT
TO public
WITH CHECK (
  (appointment_type = 'booking' AND auth.uid() = patient_id)
  OR
  (appointment_type = 'block' AND EXISTS (
    SELECT 1 FROM professionals p WHERE p.id = appointments.professional_id AND p.user_id = auth.uid()
  ))
);

-- Allow professionals to delete their own blocks
CREATE POLICY "Professionals can delete own blocks"
ON public.appointments
FOR DELETE
TO public
USING (
  appointment_type = 'block' AND EXISTS (
    SELECT 1 FROM professionals p WHERE p.id = appointments.professional_id AND p.user_id = auth.uid()
  )
);

-- Migrate existing schedule_blocks data into appointments
INSERT INTO public.appointments (professional_id, appointment_date, start_time, end_time, status, appointment_type, block_type, notes, patient_id)
SELECT 
  professional_id,
  block_date,
  start_time,
  end_time,
  'confirmed'::appointment_status,
  'block',
  block_type,
  title,
  NULL
FROM public.schedule_blocks;

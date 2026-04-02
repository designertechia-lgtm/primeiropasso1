
-- Create patient_professionals junction table
CREATE TABLE public.patient_professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(patient_id, professional_id)
);

ALTER TABLE public.patient_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can view own links" ON public.patient_professionals
  FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "Professionals can view own patients" ON public.patient_professionals
  FOR SELECT USING (EXISTS (SELECT 1 FROM professionals p WHERE p.id = patient_professionals.professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Anyone authenticated can insert" ON public.patient_professionals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = patient_id);

-- Update handle_new_user trigger to auto-link patient to professional
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _role text;
  _slug text;
  _ref_slug text;
  _prof_id uuid;
BEGIN
  -- Create profile with phone
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.raw_user_meta_data->>'phone');

  -- Assign role
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'patient');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role::app_role);

  -- Create professional record and assign admin role if applicable
  IF _role = 'professional' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role);

    _slug := NEW.raw_user_meta_data->>'slug';
    IF _slug IS NOT NULL AND _slug <> '' THEN
      INSERT INTO public.professionals (user_id, slug)
      VALUES (NEW.id, _slug);
    END IF;
  END IF;

  -- Link patient to professional if ref_slug is present
  IF _role = 'patient' THEN
    _ref_slug := NEW.raw_user_meta_data->>'ref_slug';
    IF _ref_slug IS NOT NULL AND _ref_slug <> '' THEN
      SELECT id INTO _prof_id FROM public.professionals WHERE slug = _ref_slug LIMIT 1;
      IF _prof_id IS NOT NULL THEN
        INSERT INTO public.patient_professionals (patient_id, professional_id)
        VALUES (NEW.id, _prof_id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

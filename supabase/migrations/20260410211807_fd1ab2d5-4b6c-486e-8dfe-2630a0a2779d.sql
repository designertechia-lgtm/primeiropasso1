
-- Create documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true);

-- Storage policies
CREATE POLICY "Documents are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents');

CREATE POLICY "Professionals can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Professionals can delete own documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Professional documents table
CREATE TABLE public.professional_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  webhook_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals can view own documents"
ON public.professional_documents FOR SELECT
USING (EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_documents.professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Professionals can insert own documents"
ON public.professional_documents FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_documents.professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Professionals can update own documents"
ON public.professional_documents FOR UPDATE
USING (EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_documents.professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Professionals can delete own documents"
ON public.professional_documents FOR DELETE
USING (EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_documents.professional_id AND p.user_id = auth.uid()));

-- Professional settings table
CREATE TABLE public.professional_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL UNIQUE REFERENCES public.professionals(id) ON DELETE CASCADE,
  webhook_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals can view own settings"
ON public.professional_settings FOR SELECT
USING (EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_settings.professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Professionals can insert own settings"
ON public.professional_settings FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_settings.professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Professionals can update own settings"
ON public.professional_settings FOR UPDATE
USING (EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_settings.professional_id AND p.user_id = auth.uid()));

CREATE TRIGGER update_professional_settings_updated_at
BEFORE UPDATE ON public.professional_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Imagem de capa das sessões de terapia (exibida no card da vitrine, como os produtos).
ALTER TABLE public.professional_services
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

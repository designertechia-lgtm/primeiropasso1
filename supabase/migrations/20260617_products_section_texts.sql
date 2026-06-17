-- Textos editáveis da seção "Produtos e Serviços" da landing (como as demais seções:
-- pain_title/subtitle, solution_title/subtitle, etc.). Null = usa o default do componente.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS products_title TEXT,
  ADD COLUMN IF NOT EXISTS products_subtitle TEXT;

-- Descrição completa do produto (accordion "Ver mais"); description fica como a curta (card).
ALTER TABLE public.professional_products
  ADD COLUMN IF NOT EXISTS description_full TEXT;

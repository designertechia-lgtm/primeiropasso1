-- Separa a seção "Produtos e Serviços" em DUAS seções independentes na landing:
-- "Sessões de terapia" (professional_services) e "Produtos/Materiais" (professional_products).
-- Cada uma passa a ter título/subtítulo próprios. Os textos de produtos já existiam
-- (products_title/products_subtitle); aqui adicionamos os de serviços.
alter table public.professionals
  add column if not exists services_title text,
  add column if not exists services_subtitle text;

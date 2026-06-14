-- Landing 3 tiers — Fase 1 (Grátis): reordenar + ocultar seções de conteúdo.
-- section_order: ordem das seções de conteúdo (chaves: pain | solution | about | content).
--   NULL = ordem canônica → landings existentes ficam idênticas.
-- section_hidden: chaves ocultas pelo profissional. Default [] = nada oculto.
-- Hero e Contato são fixos (topo/fim) e não entram nessas listas.
alter table public.professionals
  add column if not exists section_order  jsonb,
  add column if not exists section_hidden jsonb not null default '[]'::jsonb;

comment on column public.professionals.section_order  is 'Ordem das seções de conteúdo da landing (pain|solution|about|content). NULL = ordem canônica.';
comment on column public.professionals.section_hidden is 'Seções de conteúdo ocultas pelo profissional. [] = nada oculto.';

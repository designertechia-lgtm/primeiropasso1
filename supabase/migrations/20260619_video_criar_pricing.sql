-- =============================================================================
-- Preço do caminho "Criar personagem animado" (vídeo institucional estilizado).
--
-- Custo real medido (19/06): Kling AI Avatar 2.0 $1,54 (~R$8,3) + seedream do
-- personagem (~$0,02) + voz clonada (TTS) + transcrição (Scribe) ≈ R$8,5 por vídeo.
-- Markup: 50% PROMOCIONAL (o padrão "normal" do projeto é 100% — trocar markup_pct
-- para 100 quando encerrar a promo). 50% → ~13 créditos; 100% → ~17 créditos.
--
-- service_key = 'video_criar' (o mesmo que o endpoint /criar-institucional cobra via
-- consume_credits e que o calculate-credits expõe — fonte única de verdade do preço,
-- pro botão E pro Axel informarem o MESMO valor).
-- =============================================================================
insert into public.service_pricing
  (service_key, display_name, unit, base_cost_brl, markup_pct, description, active)
select
  'video_criar', 'Criar personagem animado', 'video', 8.5, 50,
  'Video institucional: personagem 3D animado (Kling Avatar) + voz clonada + legenda + trilha',
  true
where not exists (
  select 1 from public.service_pricing where service_key = 'video_criar'
);

-- Se já existir, atualiza custo/markup (idempotente em re-rodadas):
update public.service_pricing
   set base_cost_brl = 8.5, markup_pct = 50, active = true,
       display_name = 'Criar personagem animado', unit = 'video'
 where service_key = 'video_criar';

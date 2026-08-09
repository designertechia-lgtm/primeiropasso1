-- =============================================================================
-- Leva 0 do Diretor IA — preços reais no service_pricing (decisões Carlos 08/08).
--
-- 1) kling_pro: o valor base era R$8 (era Kling direto, pré-FAL). O custo real do
--    Kling 3.0 via fal.ai é US$0,20/s → ~30s ≈ US$6 ≈ R$33. Estava DANDO PREJUÍZO
--    (16 créditos cobrados vs R$33 de custo). Decisão: base 33,00 + markup 50%
--    → vídeo ~30s = 50 créditos; cena 10s = 17; cena 5s = 9.
--    (O worker cobra frações: units = segundos/30 — video-api/main.py ~1679.)
--
-- 2) kling_premium: base atualizada pro custo real do Kling v1.6 standard via
--    fal.ai (US$0,028/s → ~30s ≈ R$4,60). Markup segue 100% → ~30s = 10 créditos.
--
-- 3) Linhas que o código JÁ DEBITA mas não existiam no banco (RPC devolvia
--    service_not_found → fluxo quebrava com 402):
--    - editor_sticker_ia (main.py:3484) — sticker por IA no Editor de Vídeo.
--    - video_edicao (main.py:1260) — edição institucional por IA
--      (/editar-institucional; vira o botão "Editar com IA" do Diretor).
--    (video_criar tem migration própria: 20260619_video_criar_pricing.sql.)
-- =============================================================================

update public.service_pricing
   set base_cost_brl = 33.00, markup_pct = 50,
       display_name = 'Vídeo PRO — Kling 3.0 (~30s de cenas)',
       updated_at = now()
 where service_key = 'kling_pro';

update public.service_pricing
   set base_cost_brl = 4.60,
       display_name = 'Vídeo Premium — Kling 1.6 (~30s de cenas)',
       updated_at = now()
 where service_key = 'kling_premium';

insert into public.service_pricing
  (service_key, display_name, unit, base_cost_brl, markup_pct, description, active)
select
  'editor_sticker_ia', 'Sticker por IA (Editor de Vídeo)', 'sticker', 0.20, 100,
  'Sticker gerado por IA com fundo removido, no Editor de Vídeo', true
where not exists (
  select 1 from public.service_pricing where service_key = 'editor_sticker_ia'
);

insert into public.service_pricing
  (service_key, display_name, unit, base_cost_brl, markup_pct, description, active)
select
  'video_edicao', 'Edição de vídeo por IA', 'video', 2.00, 100,
  'Edição por instrução: transcrição + IA escolhe os trechos + remontagem', true
where not exists (
  select 1 from public.service_pricing where service_key = 'video_edicao'
);

-- Idempotência em re-rodadas (mesmos valores decididos em 08/08):
update public.service_pricing
   set base_cost_brl = 0.20, markup_pct = 100, active = true
 where service_key = 'editor_sticker_ia';

update public.service_pricing
   set base_cost_brl = 2.00, markup_pct = 100, active = true
 where service_key = 'video_edicao';

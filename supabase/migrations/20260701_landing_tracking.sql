-- ============================================================
-- Tier 1 — Medição / tráfego pago: IDs de pixel/tag por profissional.
-- Cada profissional pluga seus próprios IDs; a landing só carrega os scripts
-- APÓS o consentimento LGPD (ver CookieConsent). Idempotente.
-- ============================================================
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS meta_pixel_id               text,  -- Meta (Facebook/Instagram) Pixel ID
  ADD COLUMN IF NOT EXISTS ga4_measurement_id          text,  -- Google Tag / GA4 (G-XXXXXXX)
  ADD COLUMN IF NOT EXISTS google_ads_conversion_id    text,  -- Google Ads (AW-XXXXXXXXX)
  ADD COLUMN IF NOT EXISTS google_ads_conversion_label text;  -- rótulo da conversão do Google Ads

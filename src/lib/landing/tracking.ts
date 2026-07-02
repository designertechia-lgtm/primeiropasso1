// Carregamento de pixels/tags e disparo de eventos de conversão da landing.
// IMPORTANTE: só deve ser chamado APÓS o consentimento LGPD do visitante (ver consent.ts).
// Idempotente: cada script carrega uma única vez por sessão de página.

/* eslint-disable @typescript-eslint/no-explicit-any */
const w = () => window as any;

let metaLoaded = false;
let googleLoaded = false;

export interface TrackingIds {
  metaPixelId?: string | null;
  ga4MeasurementId?: string | null;
  googleAdsConversionId?: string | null;
  googleAdsConversionLabel?: string | null;
}

/** Meta (Facebook/Instagram) Pixel — carrega o fbevents e dispara o PageView. */
export function loadMetaPixel(pixelId?: string | null): void {
  if (metaLoaded || !pixelId || typeof window === "undefined") return;
  metaLoaded = true;
  /* snippet oficial do Meta Pixel */
  (function (f: any, b: any, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    const t = b.createElement(e); t.async = true; t.src = v;
    const s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(w(), document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  w().fbq("init", pixelId);
  w().fbq("track", "PageView");
}

/** Google Tag (GA4 e/ou Google Ads) — carrega o gtag.js e configura os IDs presentes. */
export function loadGoogleTag(ga4Id?: string | null, adsId?: string | null): void {
  const primary = ga4Id || adsId;
  if (googleLoaded || !primary || typeof window === "undefined") return;
  googleLoaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${primary}`;
  document.head.appendChild(s);
  w().dataLayer = w().dataLayer || [];
  function gtag(...args: any[]) { w().dataLayer.push(args); }
  w().gtag = gtag;
  gtag("js", new Date());
  if (ga4Id) gtag("config", ga4Id);
  if (adsId) gtag("config", adsId);
}

/** Carrega tudo o que estiver configurado (chamar só após consentimento). */
export function loadTrackers(ids: TrackingIds): void {
  loadMetaPixel(ids.metaPixelId);
  loadGoogleTag(ids.ga4MeasurementId, ids.googleAdsConversionId);
}

/** Dispara o evento de conversão (Lead) nos pixels carregados. No-op se nada carregou. */
export function trackLead(ids?: TrackingIds, variant?: string): void {
  if (typeof window === "undefined") return;
  const meta = variant ? { variant } : {};
  if (w().fbq) w().fbq("track", "Lead", meta);
  if (w().gtag) {
    w().gtag("event", "generate_lead", meta);
    if (ids?.googleAdsConversionId && ids?.googleAdsConversionLabel) {
      w().gtag("event", "conversion", {
        send_to: `${ids.googleAdsConversionId}/${ids.googleAdsConversionLabel}`,
        ...meta,
      });
    }
  }
}

// Fonte ÚNICA de verdade para converter um link de vídeo (YouTube/Vimeo) em URL de embed.
// Antes o editor (AdminLandingPage.toVideoEmbedUrl) e a pública (AboutSection.getEmbedUrl)
// tinham lógicas divergentes: nenhuma tratava youtube.com/shorts|/live e a pública não limpava
// a query "?si=..." do youtu.be → o vídeo funcionava no preview e quebrava na página (auditoria C5).

/**
 * True se a URL é YouTube ou Vimeo — as únicas fontes que viram <iframe> de embed. Serve de allowlist:
 * qualquer outra URL não deve ser embutida num iframe arbitrário na landing (auditoria §5, iframe sem allowlist).
 */
export function isYouTubeOrVimeo(url: string | null | undefined): boolean {
  if (!url) return false;
  return /(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(url);
}

/** Extrai o ID do vídeo do YouTube de todas as formas de URL (watch, youtu.be, shorts, live, embed). */
function extractYouTubeId(url: string): string | null {
  const clean = (s?: string) => (s ? s.split(/[?&/]/)[0] : "") || null;
  if (url.includes("youtu.be/")) return clean(url.split("youtu.be/")[1]);
  if (url.includes("youtube.com")) {
    if (url.includes("/shorts/")) return clean(url.split("/shorts/")[1]);
    if (url.includes("/live/"))   return clean(url.split("/live/")[1]);
    if (url.includes("/embed/"))  return clean(url.split("/embed/")[1]);
    const v = url.split("v=")[1]?.split("&")[0];
    return v || null;
  }
  return null;
}

/**
 * Converte um link do YouTube/Vimeo em URL de embed. Para qualquer outra coisa (arquivo direto,
 * link desconhecido) devolve a própria URL. `autoplay` só é usado na página pública.
 */
export function toVideoEmbedUrl(url: string, opts?: { autoplay?: boolean }): string {
  if (!url) return "";
  const qs = opts?.autoplay ? "?autoplay=1" : "";
  const ytId = extractYouTubeId(url);
  if (ytId) return `https://www.youtube.com/embed/${ytId}${qs}`;
  if (url.includes("vimeo.com")) {
    const id = url.split("vimeo.com/")[1]?.split(/[?&/]/)[0];
    if (id) return `https://player.vimeo.com/video/${id}${qs}`;
  }
  return url;
}

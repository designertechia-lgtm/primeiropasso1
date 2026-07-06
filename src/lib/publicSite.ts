/**
 * Base ÚNICA dos links públicos compartilhados (Carlos 06/07: todo
 * "Compartilhar" entrega o link na estrutura oficial do site, independente do
 * endereço em que o admin foi aberto — preview/www/localhost geram o MESMO
 * link canônico).
 */
export const PUBLIC_SITE_URL =
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://primeiropasso.online";

export const publicLandingUrl = (slug: string) => `${PUBLIC_SITE_URL}/${slug}`;

export const publicVideoUrl = (slug: string, videoId: string) =>
  `${PUBLIC_SITE_URL}/${slug}/video/${videoId}`;

export const publicVideosUrl = (slug: string) => `${PUBLIC_SITE_URL}/${slug}/videos`;

export const publicArticleUrl = (slug: string, articleSlug: string) =>
  `${PUBLIC_SITE_URL}/${slug}/artigo/${articleSlug}`;

export const publicArticlesUrl = (slug: string) => `${PUBLIC_SITE_URL}/${slug}/artigos`;

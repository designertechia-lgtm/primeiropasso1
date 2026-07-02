// Servidor de produção do front (substitui `npx serve -s dist`).
// Serve o site estático IGUAL ao `serve` (mesma engine: serve-handler) e, SÓ para robôs de
// preview de link (WhatsApp/Facebook/LinkedIn/etc.) numa rota de landing "/:slug", injeta as
// tags Open Graph da marca do profissional — resolvendo o preview social (o SPA não serve og:*).
// Humanos: comportamento 100% idêntico ao de hoje. Qualquer erro cai no estático.
//
// Ativação (EasyPanel → primeiro-passo-site → Fonte → Comando de Início):
//   npx serve -s dist -l 3000   →   node server.js
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import handler from "serve-handler";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "dist");
const INDEX = readFileSync(join(DIST, "index.html"), "utf8");
const PORT = process.env.PORT || 3000;

// Valores PÚBLICOS (o anon key já viaja no bundle do cliente). Env tem prioridade se existir.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://lpqkkbtadnqkbathdvzb.supabase.co";
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwcWtrYnRhZG5xa2JhdGhkdnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzM0NzcsImV4cCI6MjA5MDcwOTQ3N30.yqiVSCRPvJpLBklJ7W-svZadFyfua9W8D7tw6UJAAvY";

// User-agents dos robôs de preview de link.
const BOT = /facebookexternalhit|Facebot|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest|redditbot|SkypeUriPreview|vkShare|Applebot|Googlebot|bingbot|Embedly|Iframely|Baiduspider|YandexBot|Qwantify|W3C_Validator|Google-InspectionTool|GoogleOther|Bluesky|Mastodon/i;

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function fetchProfessional(slug) {
  const url = `${SUPABASE_URL}/rest/v1/professionals?slug=eq.${encodeURIComponent(slug)}&select=full_name,hero_title,hero_subtitle,bio,photo_url,hero_image_url,logo_url&limit=1`;
  const r = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function injectOg(html, prof, canonical) {
  const name = prof.full_name || "Profissional";
  const title = `${name}${prof.hero_title ? " — " + prof.hero_title : ""}`.slice(0, 70);
  const desc = String(prof.hero_subtitle || prof.bio || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const image = prof.hero_image_url || prof.photo_url || prof.logo_url || "";
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${esc(desc)}">`);
  const extras = [
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:site_name" content="Primeiro Passo">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    image ? `<meta name="twitter:image" content="${esc(image)}">` : "",
  ].filter(Boolean).join("\n    ");
  return out.replace("</head>", `    ${extras}\n  </head>`);
}

// Rotas que NÃO são landing de profissional (não injetar OG nelas).
const RESERVED = new Set(["login", "cadastro", "reset", "admin", "admin-gerente", "minha-conta", "pedido", "politica-privacidade"]);

const serveStatic = (req, res) => handler(req, res, {
  public: DIST,
  rewrites: [{ source: "**", destination: "/index.html" }],
  headers: [
    { source: "index.html", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    { source: "**/*.@(js|css|woff2|woff|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
  ],
});

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent((req.url || "/").split("?")[0]);
    const seg = path.replace(/^\/+/, "").replace(/\/+$/, "");
    const isSlug = seg && !seg.includes("/") && !seg.includes(".") && !RESERVED.has(seg);
    if (isSlug && BOT.test(req.headers["user-agent"] || "")) {
      const prof = await fetchProfessional(seg);
      if (prof) {
        const proto = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers["host"] || "primeiropasso.online";
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.end(injectOg(INDEX, prof, `${proto}://${host}/${seg}`));
        return;
      }
    }
  } catch (e) {
    console.warn("[og] fallback:", e?.message);
  }
  return serveStatic(req, res);
}).listen(PORT, () => console.log(`[server] ouvindo em :${PORT}`));

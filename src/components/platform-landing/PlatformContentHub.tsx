import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Play, Image as ImageIcon } from "lucide-react";

/**
 * Central de conteúdo da landing institucional.
 * Vitrine VIVA: mostra os vídeos reais publicados pela conta oficial da plataforma
 * (mesma regra da landing profissional — ProfessionalLanding: top 3 publicados por data).
 * Se a conta ainda não tiver vídeos publicados, cai nos cards de exemplo.
 */
const SHOWCASE_SLUG = "designertech-io";

interface ShowcaseVideo {
  id: string;
  title: string;
  description: string | null;
  embed_url: string;
  thumbnail_url: string | null;
  published_at: string | null;
  created_at: string | null;
  published?: boolean;
}

function getYoutubeThumbnail(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return `https://img.youtube.com/vi${u.pathname}/hqdefault.jpg`;
    const id = u.searchParams.get("v");
    if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  } catch {
    /* url inválida — sem thumbnail derivada */
  }
  return null;
}

function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return `https://www.youtube.com/embed${u.pathname}?autoplay=1`;
    const id = u.searchParams.get("v");
    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1`;
  } catch {
    /* mantém a url original */
  }
  return url;
}

function isFileUrl(url: string): boolean {
  return url.includes("supabase") || url.endsWith(".mp4") || url.endsWith(".webm");
}

/** Mesma regra da landing profissional: vídeos publicados, mais recentes primeiro, top 3. */
function useShowcaseVideos() {
  const { data: professional } = useQuery({
    queryKey: ["platform-showcase-pro", SHOWCASE_SLUG],
    queryFn: async () => {
      const { data } = await supabase
        .from("professionals")
        .select("id, slug")
        .eq("slug", SHOWCASE_SLUG)
        .maybeSingle();
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: rawVideos = [] } = useQuery({
    queryKey: ["platform-showcase-videos", professional?.id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("videos")
        .select("id, title, description, embed_url, thumbnail_url, published_at, created_at, published")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as ShowcaseVideo[];
    },
    enabled: !!professional?.id,
    staleTime: 10 * 60 * 1000,
  });

  const videos = rawVideos
    .filter((v) => v.published)
    .sort(
      (a, b) =>
        new Date(b.published_at ?? b.created_at ?? 0).getTime() -
        new Date(a.published_at ?? a.created_at ?? 0).getTime(),
    )
    .slice(0, 3);

  return { slug: professional?.slug ?? SHOWCASE_SLUG, videos };
}

function VideoCard({ video }: { video: ShowcaseVideo }) {
  const [playing, setPlaying] = useState(false);
  const thumb = video.thumbnail_url || getYoutubeThumbnail(video.embed_url);

  return (
    <article className="overflow-hidden rounded-[20px] border border-pp-border bg-pp-card">
      <div className="relative h-[190px] bg-pp-forest">
        {playing ? (
          isFileUrl(video.embed_url) ? (
            <video
              src={video.embed_url}
              controls
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full bg-black object-contain"
            />
          ) : (
            <iframe
              src={toEmbedUrl(video.embed_url)}
              title={video.title}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Assistir: ${video.title}`}
            className="group absolute inset-0 h-full w-full"
          >
            {thumb ? (
              <img src={thumb} alt={video.title} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-pp-surface to-pp-sage/20" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
              <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[rgba(28,42,30,.6)] backdrop-blur-[2px]">
                <Play className="ml-0.5 h-[26px] w-[26px] fill-white text-white" aria-hidden="true" />
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="p-[22px]">
        <span className="mb-[9px] inline-block text-[11px] font-semibold uppercase tracking-[0.1em] text-pp-accent">
          Vídeo
        </span>
        <h3 className="mb-2 line-clamp-2 font-display text-[19px] font-semibold leading-[1.25] text-pp-ink">
          {video.title}
        </h3>
        {video.description && (
          <p className="line-clamp-2 text-[14px] leading-[1.5] text-pp-muted">
            {video.description}
          </p>
        )}
      </div>
    </article>
  );
}

/** Cards de exemplo (fallback quando a conta vitrine ainda não tem vídeos publicados). */
function PlaceholderCards() {
  const items = [
    { tag: "Reels · 0:45", eyebrow: "Vídeo · Ansiedade", title: "3 sinais de que sua ansiedade está falando por você", text: "Gerado com seu avatar e sua voz. Publicado automaticamente nas suas redes." },
    { tag: "Blog · SEO", eyebrow: "Artigo · Autoestima", title: "Por que a autocrítica não é a mesma coisa que disciplina", text: "Artigo de 800 palavras otimizado para busca, com a mesma ideia do vídeo da semana." },
    { tag: "Carrossel · Feed", eyebrow: "Notícia · Relacionamentos", title: "O ciclo invisível que sabota suas relações", text: "Carrossel de 7 slides para o feed profissional — distribuído pelo calendário editorial." },
  ];
  return (
    <>
      {items.map((it) => (
        <article key={it.title} className="overflow-hidden rounded-[20px] border border-pp-border bg-pp-card">
          <div className="relative h-[190px] bg-gradient-to-br from-pp-surface to-pp-sage/20">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <ImageIcon className="h-14 w-14 text-pp-sage/30" aria-hidden="true" />
            </div>
            <span className="absolute left-3 top-3 rounded-full bg-[rgba(28,42,30,.7)] px-[11px] py-[5px] text-[11.5px] font-semibold text-white backdrop-blur-[4px]">
              {it.tag}
            </span>
          </div>
          <div className="p-[22px]">
            <span className="mb-[9px] inline-block text-[11px] font-semibold uppercase tracking-[0.1em] text-pp-accent">
              {it.eyebrow}
            </span>
            <h3 className="mb-2 line-clamp-2 font-display text-[19px] font-semibold leading-[1.25] text-pp-ink">
              {it.title}
            </h3>
            <p className="line-clamp-2 text-[14px] leading-[1.5] text-pp-muted">{it.text}</p>
          </div>
        </article>
      ))}
    </>
  );
}

export default function PlatformContentHub() {
  const { slug, videos } = useShowcaseVideos();
  const hasVideos = videos.length > 0;

  return (
    <section id="conteudo" className="bg-pp-bg py-24 px-7">
      <div className="mx-auto max-w-[1200px]">
        {/* Header */}
        <div className="mb-11 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-[600px]">
            <p className="mb-[14px] text-[13px] font-semibold uppercase tracking-[0.18em] text-pp-accent">
              Central de conteúdo
            </p>
            <h2 className="font-display text-[clamp(30px,4vw,46px)] font-bold leading-[1.08] tracking-[-0.01em] text-pp-ink">
              Vídeos, artigos e notícias{" "}
              <span className="text-pp-accent">publicados por você sem você.</span>
            </h2>
          </div>
          <a
            href={hasVideos ? `/${slug}/videos` : "/cadastro"}
            target={hasVideos ? "_blank" : undefined}
            rel={hasVideos ? "noopener noreferrer" : undefined}
            className="inline-flex items-center gap-2 text-[15px] font-semibold text-pp-accent no-underline"
          >
            Ver tudo
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        {/* Cards grid */}
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
          {hasVideos ? (
            videos.map((v) => <VideoCard key={v.id} video={v} />)
          ) : (
            <PlaceholderCards />
          )}
        </div>
      </div>
    </section>
  );
}

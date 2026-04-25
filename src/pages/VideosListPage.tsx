import { useParams, Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Play, MessageCircle, Calendar, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

function hexToHSL(hex: string): string | null {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!r) return null;
  let rv = parseInt(r[1], 16) / 255;
  let g = parseInt(r[2], 16) / 255;
  let b = parseInt(r[3], 16) / 255;
  const max = Math.max(rv, g, b), min = Math.min(rv, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rv: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g:  h = ((b - rv) / d + 2) / 6; break;
      case b:  h = ((rv - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return `https://www.youtube.com/embed${u.pathname}?autoplay=1`;
    const videoId = u.searchParams.get("v");
    if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  } catch {}
  return url;
}

function getYoutubeThumbnail(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return `https://img.youtube.com/vi${u.pathname}/hqdefault.jpg`;
    const videoId = u.searchParams.get("v");
    if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  } catch {}
  return null;
}

function isSupabaseUrl(url: string) {
  return url.includes("supabase") || url.endsWith(".mp4") || url.endsWith(".webm");
}

interface Video {
  id: string;
  title: string;
  description: string | null;
  embed_url: string;
  thumbnail_url?: string | null;
  published_at?: string | null;
  published?: boolean;
}

function VideoCard({ video, whatsapp, slug, isDraft }: { video: Video; whatsapp?: string | null; slug?: string; isDraft?: boolean }) {
  const [playing, setPlaying] = useState(false);

  const thumbnail = video.thumbnail_url || getYoutubeThumbnail(video.embed_url);

  const waLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Olá! Vi um vídeo seu e gostaria de saber mais sobre o seu trabalho.")}`
    : `/${slug}#agendar`;
  const isWa = !!whatsapp;

  return (
    <div className={`rounded-2xl overflow-hidden border bg-card transition-all duration-300 flex flex-col ${isDraft ? "opacity-70" : "hover:shadow-lg hover:-translate-y-0.5"}`}>
      {/* Player */}
      <div className="aspect-video relative group bg-black overflow-hidden">
        {!isDraft && playing ? (
          isSupabaseUrl(video.embed_url) ? (
            <video src={video.embed_url} controls autoPlay className="w-full h-full" />
          ) : (
            <iframe
              src={toEmbedUrl(video.embed_url)}
              title={video.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )
        ) : (
          <div
            className={`w-full h-full ${!isDraft ? "cursor-pointer" : "cursor-default"}`}
            onClick={!isDraft ? () => setPlaying(true) : undefined}
          >
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={video.title}
                className={`w-full h-full object-cover ${!isDraft ? "group-hover:scale-105 transition-transform duration-500" : "grayscale"}`}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/30 to-accent/30" />
            )}
            {!isDraft && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Play className="h-6 w-6 text-primary fill-primary ml-1" />
                </div>
              </div>
            )}
            {isDraft && (
              <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
                <Lock className="h-2.5 w-2.5" /> Rascunho
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-5 flex flex-col flex-1">
        {video.published_at && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Calendar className="h-3 w-3" />
            {new Date(video.published_at).toLocaleDateString("pt-BR", {
              day: "numeric", month: "long", year: "numeric",
            })}
          </div>
        )}
        <h2 className="font-serif text-lg font-semibold text-foreground leading-snug mb-2 line-clamp-2">
          {video.title}
        </h2>
        {video.description && (
          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed flex-1">
            {video.description}
          </p>
        )}
        {!isDraft && (
          <Button asChild className="w-full gap-2 mt-4" size="sm">
            <a href={waLink} target={isWa ? "_blank" : undefined} rel={isWa ? "noopener noreferrer" : undefined}>
              {isWa
                ? <><MessageCircle className="h-4 w-4" /> Falar pelo WhatsApp</>
                : <><Calendar className="h-4 w-4" /> Agendar uma conversa</>
              }
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function VideosListPage() {
  const { slug } = useParams<{ slug: string }>();
  const dark = slug ? localStorage.getItem(`dark_${slug}`) === "1" : false;

  const { data: professional, isLoading: loadingProf } = useQuery({
    queryKey: ["professional", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, slug, full_name, primary_color, secondary_color, background_color, whatsapp")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: allVideos = [], isLoading: loadingVideos } = useQuery({
    queryKey: ["videos-all", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, title, description, embed_url, thumbnail_url, published_at, published, created_at")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const videos = useMemo(() => {
    const published = allVideos
      .filter((v) => v.published)
      .sort((a, b) => {
        const da = new Date(a.published_at ?? a.created_at ?? 0).getTime();
        const db = new Date(b.published_at ?? b.created_at ?? 0).getTime();
        return db - da;
      });
    const drafts = allVideos
      .filter((v) => !v.published)
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());

    if (published.length === 0) return drafts.slice(0, 3);
    return [...published, ...drafts];
  }, [allVideos]);

  const hasPublished = allVideos.some((v) => v.published);

  const customStyles = useMemo(() => {
    if (!professional) return undefined;
    const styles: Record<string, string> = {};
    const primary = professional.primary_color;
    const bg = (professional as any).background_color;
    if (primary) {
      const hsl = hexToHSL(primary);
      if (hsl) {
        styles["--primary"] = hsl;
        styles["--ring"] = hsl;
        const l = parseInt(hsl.split(" ")[2]);
        styles["--primary-foreground"] = l > 55 ? "220 15% 10%" : "210 40% 98%";
      }
    }
    if (bg) {
      const hsl = hexToHSL(bg);
      if (hsl) {
        const parts = hsl.split(" ");
        const h = parts[0], s = parseInt(parts[1]), l = parseInt(parts[2]);
        styles["--background"] = hsl;
        styles["--card"] = `${h} ${Math.max(s - 5, 0)}% ${Math.min(l + 2, 100)}%`;
        styles["--foreground"] = l < 50 ? `${h} ${Math.max(s - 15, 0)}% 90%` : `${h} ${Math.min(s + 10, 100)}% 15%`;
        styles["--muted-foreground"] = `${h} ${Math.max(s - 5, 0)}% 45%`;
        styles["--border"] = `${h} ${Math.max(s - 10, 0)}% ${Math.max(l - 10, 0)}%`;
      }
    }
    return Object.keys(styles).length > 0 ? styles : undefined;
  }, [professional]);

  const isLoading = loadingProf || loadingVideos;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!professional) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Profissional não encontrado.</p>
      </div>
    );
  }

  const name = (professional as any).full_name || "Profissional";

  return (
    <div className={`min-h-screen bg-background${dark ? " dark" : ""}`} style={customStyles as React.CSSProperties}>
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            to={`/${slug}`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para o site
          </Link>
          <span className="font-serif font-semibold text-foreground text-sm">{name}</span>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-primary/5 border-b">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <div className="flex items-center gap-3 mb-3">
            <Play className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-primary uppercase tracking-widest">Vídeos</span>
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-bold text-foreground mb-3">
            Vídeos para você
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Conteúdo em vídeo sobre saúde mental e bem-estar por {name}.
          </p>
          {!hasPublished && allVideos.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground/70 italic">
              Em breve novos conteúdos publicados aqui.
            </p>
          )}
        </div>
      </div>

      {/* Grid de vídeos */}
      <main className="container mx-auto px-4 py-12">
        {videos.length === 0 ? (
          <div className="text-center py-24">
            <Play className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum vídeo ainda.</p>
          </div>
        ) : (
          <>
            {!hasPublished && (
              <p className="text-xs text-muted-foreground mb-6">
                Mostrando os {videos.length} rascunho{videos.length > 1 ? "s" : ""} mais recentes.
              </p>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  whatsapp={professional.whatsapp}
                  slug={professional.slug}
                  isDraft={!video.published}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-8">
        <div className="container mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
          <Link to={`/${slug}`} className="hover:text-primary transition-colors">
            ← Voltar para o site de {name}
          </Link>
        </div>
      </footer>
    </div>
  );
}

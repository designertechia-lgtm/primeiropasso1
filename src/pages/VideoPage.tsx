import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Play, MessageCircle, Calendar, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

function hexToHSL(hex: string): string | null {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!r) return null;
  let rv = parseInt(r[1], 16) / 255;
  let g  = parseInt(r[2], 16) / 255;
  let b  = parseInt(r[3], 16) / 255;
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

function isSupabaseUrl(url: string) {
  return url.includes("supabase") || url.endsWith(".mp4") || url.endsWith(".webm");
}

export default function VideoPage() {
  const { slug, videoId } = useParams<{ slug: string; videoId: string }>();
  const dark = slug ? localStorage.getItem(`dark_${slug}`) === "1" : false;
  const [playing, setPlaying]   = useState(false);
  const [copied,  setCopied]    = useState(false);

  const { data: professional } = useQuery({
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

  const { data: video, isLoading, error } = useQuery({
    queryKey: ["video", videoId, professional?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("id, title, description, embed_url, thumbnail_url, published_at, published")
        .eq("id", videoId!)
        .eq("professional_id", professional!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id && !!videoId,
  });

  const customStyles: Record<string, string> = {};
  if (professional?.primary_color) {
    const hsl = hexToHSL(professional.primary_color);
    if (hsl) {
      customStyles["--primary"] = hsl;
      customStyles["--ring"] = hsl;
      const l = parseInt(hsl.split(" ")[2]);
      customStyles["--primary-foreground"] = l > 55 ? "220 15% 10%" : "210 40% 98%";
    }
  }
  if ((professional as any)?.background_color) {
    const hsl = hexToHSL((professional as any).background_color);
    if (hsl) {
      const parts = hsl.split(" ");
      const h = parts[0], s = parseInt(parts[1]), l = parseInt(parts[2]);
      customStyles["--background"] = hsl;
      customStyles["--card"] = `${h} ${Math.max(s - 5, 0)}% ${Math.min(l + 2, 100)}%`;
      customStyles["--foreground"] = l < 50 ? `${h} ${Math.max(s - 15, 0)}% 90%` : `${h} ${Math.min(s + 10, 100)}% 15%`;
      customStyles["--muted-foreground"] = `${h} ${Math.max(s - 5, 0)}% 45%`;
      customStyles["--border"] = `${h} ${Math.max(s - 10, 0)}% ${Math.max(l - 10, 0)}%`;
    }
  }

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const waLink = professional?.whatsapp
    ? `https://wa.me/${professional.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Olá! Vi um vídeo seu e gostaria de saber mais sobre o seu trabalho.")}`
    : `/${slug}#agendar`;

  const name = (professional as any)?.full_name || "Profissional";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Vídeo não encontrado.</p>
          <Link to={`/${slug}/videos`}>
            <Button variant="outline">Ver todos os vídeos</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background${dark ? " dark" : ""}`} style={customStyles as React.CSSProperties}>
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            to={`/${slug}/videos`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Todos os vídeos
          </Link>
          <span className="font-serif font-semibold text-foreground text-sm">{name}</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-3xl">
        {/* Player */}
        <div className="rounded-2xl overflow-hidden border bg-black aspect-video relative group mb-6 shadow-lg">
          {playing ? (
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
            <div className="w-full h-full cursor-pointer" onClick={() => setPlaying(true)}>
              {video.thumbnail_url ? (
                <img
                  src={video.thumbnail_url}
                  alt={video.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/30 to-accent/30" />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Play className="h-7 w-7 text-primary fill-primary ml-1" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-4">
          {video.published_at && (
            <p className="text-xs text-muted-foreground">
              {new Date(video.published_at).toLocaleDateString("pt-BR", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          )}

          <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground leading-snug">
            {video.title}
          </h1>

          {video.description && (
            <p className="text-muted-foreground leading-relaxed">{video.description}</p>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button asChild className="flex-1 gap-2" size="lg">
              <a
                href={waLink}
                target={professional?.whatsapp ? "_blank" : undefined}
                rel={professional?.whatsapp ? "noopener noreferrer" : undefined}
              >
                {professional?.whatsapp
                  ? <><MessageCircle className="h-5 w-5" /> Falar pelo WhatsApp</>
                  : <><Calendar className="h-5 w-5" /> Agendar uma conversa</>
                }
              </a>
            </Button>
            <Button variant="outline" className="gap-2 sm:w-auto" onClick={handleShare}>
              {copied
                ? <><Check className="h-4 w-4 text-green-500" /> Link copiado!</>
                : <><Share2 className="h-4 w-4" /> Compartilhar</>
              }
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
          <Link to={`/${slug}`} className="hover:text-primary transition-colors">
            ← Voltar para o site de {name}
          </Link>
        </div>
      </footer>
    </div>
  );
}

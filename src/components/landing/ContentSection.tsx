import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Play, MessageCircle, Calendar, Lock } from "lucide-react";

interface Article {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  published_at: string | null;
  published?: boolean;
}

interface Video {
  id: string;
  title: string;
  description: string | null;
  embed_url: string;
  thumbnail_url?: string | null;
  published?: boolean;
}

interface ContentSectionProps {
  articles: Article[];
  videos: Video[];
  slug?: string;
  whatsapp?: string | null;
}

function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${u.pathname}?autoplay=1`;
    }
    const videoId = u.searchParams.get("v");
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }
  } catch {}
  return url;
}

function getYoutubeThumbnail(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return `https://img.youtube.com/vi${u.pathname}/hqdefault.jpg`;
    }
    const videoId = u.searchParams.get("v");
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
  } catch {}
  return null;
}

function isSupabaseUrl(url: string): boolean {
  return url.includes("supabase") || url.endsWith(".mp4") || url.endsWith(".webm");
}

function VideoCard({ video, isDraft }: { video: Video; isDraft?: boolean }) {
  const [playing, setPlaying] = useState(false);

  const thumbnail = video.thumbnail_url || getYoutubeThumbnail(video.embed_url);

  if (!isDraft && playing) {
    if (isSupabaseUrl(video.embed_url)) {
      return (
        <div className="aspect-video bg-black">
          <video src={video.embed_url} controls autoPlay className="w-full h-full" />
        </div>
      );
    }
    return (
      <div className="aspect-video">
        <iframe
          src={toEmbedUrl(video.embed_url)}
          title={video.title}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div
      className={`aspect-video relative bg-black group ${!isDraft ? "cursor-pointer" : "cursor-default"}`}
      onClick={!isDraft ? () => setPlaying(true) : undefined}
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={video.title}
          className={`w-full h-full object-cover ${isDraft ? "grayscale" : ""}`}
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
  );
}

function buildContactHref(whatsapp: string | null | undefined, slug: string | undefined): { href: string; isWa: boolean } {
  if (whatsapp) {
    const digits = whatsapp.replace(/\D/g, "");
    const number = digits.startsWith("55") ? digits : `55${digits}`;
    const msg = encodeURIComponent("Olá! Vi um vídeo seu e gostaria de saber mais sobre o seu trabalho.");
    return { href: `https://wa.me/${number}?text=${msg}`, isWa: true };
  }
  return { href: `/${slug}#agendar`, isWa: false };
}

export default function ContentSection({ articles, videos, slug, whatsapp }: ContentSectionProps) {
  const contact = buildContactHref(whatsapp, slug);
  if (articles.length === 0 && videos.length === 0) return null;

  return (
    <section id="content" className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
            Conteúdos para você
          </h2>
          <p className="text-muted-foreground text-lg">
            Artigos e vídeos para ajudar no seu dia a dia emocional.
          </p>
        </div>

        {articles.length > 0 && (
          <div id="artigos" className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" /> Artigos
              </h3>
              <Link
                to={`/${slug}/artigos`}
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                Ver todos →
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((a) => {
                const isDraft = !a.published;
                const card = (
                  <Card className={`overflow-hidden transition-shadow cursor-pointer relative ${isDraft ? "opacity-70 grayscale" : "hover:shadow-md"}`}>
                    {a.cover_image_url && (
                      <img src={a.cover_image_url} alt={a.title} className="w-full h-40 object-cover" />
                    )}
                    {isDraft && (
                      <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
                        <Lock className="h-2.5 w-2.5" /> Rascunho
                      </div>
                    )}
                    <CardHeader>
                      <CardTitle className="font-serif text-lg">{a.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        {a.published_at ? new Date(a.published_at).toLocaleDateString("pt-BR") : ""}
                      </p>
                    </CardContent>
                  </Card>
                );
                return isDraft
                  ? <div key={a.id}>{card}</div>
                  : <Link key={a.id} to={`/${slug}/artigo/${a.slug}`}>{card}</Link>;
              })}
            </div>
          </div>
        )}

        {videos.length > 0 && (
          <div id="videos">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
                <Play className="h-5 w-5 text-primary" /> Vídeos
              </h3>
              <Link
                to={`/${slug}/videos`}
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                Ver todos →
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((v) => {
                const isDraft = !v.published;
                return (
                  <Card key={v.id} className={`overflow-hidden transition-shadow flex flex-col ${isDraft ? "opacity-70" : "hover:shadow-md"}`}>
                    <VideoCard video={v} isDraft={isDraft} />
                    <CardHeader className="pb-2">
                      <CardTitle className="font-serif text-base">{v.title}</CardTitle>
                      {v.description && (
                        <p className="text-sm text-muted-foreground line-clamp-3">{v.description}</p>
                      )}
                    </CardHeader>
                    {!isDraft && (
                      <CardContent className="pt-0 mt-auto">
                        <Button asChild className="w-full gap-2" size="sm">
                          <a
                            href={contact.href}
                            target={contact.isWa ? "_blank" : undefined}
                            rel={contact.isWa ? "noopener noreferrer" : undefined}
                          >
                            {contact.isWa
                              ? <><MessageCircle className="h-4 w-4" /> Falar pelo WhatsApp</>
                              : <><Calendar className="h-4 w-4" /> Agendar uma conversa</>
                            }
                          </a>
                        </Button>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

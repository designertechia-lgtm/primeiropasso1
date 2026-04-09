import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Play } from "lucide-react";

interface Article {
  id: string;
  title: string;
  slug: string;
  image_url: string | null;
  published_at: string | null;
}

interface Video {
  id: string;
  title: string;
  description: string | null;
  embed_url: string;
}

interface ContentSectionProps {
  articles: Article[];
  videos: Video[];
  slug?: string;
}

function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    const videoId = u.searchParams.get("v");
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }
  } catch {}
  return url;
}

export default function ContentSection({ articles, videos, slug }: ContentSectionProps) {
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
          <div className="mb-12">
            <h3 className="font-serif text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /> Artigos
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((a) => (
                <Link key={a.id} to={`/${slug}/artigo/${a.slug}`}>
                  <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                    {a.image_url && (
                      <img src={a.image_url} alt={a.title} className="w-full h-40 object-cover" />
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
                </Link>
              ))}
            </div>
          </div>
        )}

        {videos.length > 0 && (
          <div>
            <h3 className="font-serif text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" /> Vídeos
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((v) => (
                <Card key={v.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <div className="aspect-video">
                    <iframe
                      src={toEmbedUrl(v.embed_url)}
                      title={v.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <CardHeader>
                    <CardTitle className="font-serif text-base">{v.title}</CardTitle>
                    {v.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{v.description}</p>
                    )}
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

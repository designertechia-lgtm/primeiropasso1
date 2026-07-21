// ÂNCORA: página pública de "watch" branded para vídeos compartilháveis.
// Rota: /v/:videoSlug (ex.: /v/tour). Vídeos ficam no bucket público `videos` do Supabase.
// Serve pra mandar link bonito (primeiropasso.online/v/tour) no WhatsApp/redes.
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Leaf, ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

// Catálogo de vídeos compartilháveis (slug -> arquivo no bucket `videos` + textos).
// Adicionar aqui novos vídeos conforme forem publicados.
// `ver` = cache-buster: incrementar quando o arquivo do vídeo for sobrescrito no
// bucket (o CDN do Supabase cacheia a URL pública por ~1h; ?v= força a versão nova).
const VIDEOS: Record<
  string,
  { file: string; ver: number; title: string; subtitle: string; cta: string }
> = {
  tour: {
    file: "tour-primeiro-passo.mp4",
    ver: 2,
    title: "Conheça o Primeiro Passo",
    subtitle:
      "Do primeiro passo ao cliente atendido: sua marca, sua página, seu conteúdo, sua agenda e um agente de IA — tudo numa plataforma só.",
    cta: "Quero começar agora",
  },
};

export default function PublicVideoPage() {
  const { videoSlug } = useParams<{ videoSlug: string }>();
  const video = videoSlug ? VIDEOS[videoSlug] : undefined;

  useEffect(() => {
    if (video) document.title = `${video.title} · Primeiro Passo`;
  }, [video]);

  if (!video) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Leaf className="h-10 w-10 text-primary" />
        <h1 className="font-heading text-2xl font-bold">Vídeo não encontrado</h1>
        <p className="text-muted-foreground max-w-md">
          Esse link de vídeo não existe ou foi removido.
        </p>
        <Button asChild>
          <Link to="/">Ir para o Primeiro Passo</Link>
        </Button>
      </div>
    );
  }

  const baseUrl = supabase.storage.from("videos").getPublicUrl(video.file).data
    .publicUrl;
  const publicUrl = `${baseUrl}?v=${video.ver}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Cabeçalho da marca */}
      <header className="mx-auto max-w-5xl px-5 pt-6 md:pt-8">
        <Link to="/" className="inline-flex items-center gap-2">
          <Leaf className="h-6 w-6 text-primary" />
          <span className="font-heading text-lg font-semibold">Primeiro Passo</span>
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-16 pt-8 md:pt-12">
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl md:text-5xl font-bold tracking-tight mb-4">
            {video.title}
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            {video.subtitle}
          </p>
        </div>

        {/* Player */}
        <div className="rounded-2xl overflow-hidden border border-border shadow-2xl bg-black">
          <video
            className="w-full aspect-video block"
            controls
            playsInline
            preload="metadata"
            src={publicUrl}
          >
            Seu navegador não suporta vídeo HTML5.
          </video>
        </div>

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <p className="text-muted-foreground">
            Gostou do que viu? Monte tudo isso para o seu negócio.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/cadastro">
                {video.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link to="/">
                <Play className="h-4 w-4" />
                Ver a plataforma
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-4xl px-5 pb-10 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Primeiro Passo ·{" "}
          <Link to="/politica-privacidade" className="hover:text-primary">
            Política de Privacidade
          </Link>
        </p>
      </footer>
    </div>
  );
}

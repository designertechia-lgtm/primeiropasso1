import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

export default function ArticlePage() {
  const { slug, articleSlug } = useParams<{ slug: string; articleSlug: string }>();

  const { data: professional } = useQuery({
    queryKey: ["professional", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, slug, primary_color, secondary_color, background_color")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: article, isLoading, error } = useQuery({
    queryKey: ["article", professional?.id, articleSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("professional_id", professional!.id)
        .eq("slug", articleSlug!)
        .eq("published", true)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id && !!articleSlug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="font-serif text-2xl font-bold text-foreground">Artigo não encontrado</h1>
          <Link to={`/${slug}`}>
            <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
          </Link>
        </div>
      </div>
    );
  }

  const carouselItems = Array.isArray(article.carousel_items) ? article.carousel_items : [];

  const primaryColor = professional?.primary_color || "#9b87f5";
  const secondaryColor = professional?.secondary_color || "#7E69AF";

  const fontStyles = [
    "font-serif italic font-medium tracking-tight",
    "font-serif font-black uppercase tracking-tighter",
    "font-sans font-black tracking-tight",
    "font-serif font-semibold italic tracking-normal"
  ];

  const articleFont = fontStyles[article.id.charCodeAt(0) % fontStyles.length];

  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});

  const handleImageError = (index: number) => {
    setImageErrors((prev) => ({ ...prev, [index]: true }));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link to={`/${slug}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Link>

        {carouselItems.length > 0 ? (
          <div className="mb-8 relative group">
            <Carousel className="w-full shadow-2xl rounded-2xl overflow-hidden border-none">
              <CarouselContent>
                {carouselItems.map((item: any, index: number) => {
                  const hasImage = item.image_url && !imageErrors[index];
                  
                  return (
                    <CarouselItem key={index}>
                      <div 
                        className="relative aspect-square overflow-hidden flex items-center justify-center bg-muted"
                        style={!hasImage ? { 
                          background: `radial-gradient(circle at top left, ${primaryColor}, ${secondaryColor})` 
                        } : {}}
                      >
                        {hasImage && (
                          <>
                            <img
                              src={item.image_url}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={() => handleImageError(index)}
                            />
                            {/* Overlay sutil apenas para garantir leitura em fotos muito claras */}
                            <div className="absolute inset-0 bg-black/10" />
                          </>
                        )}
                        
                        {item.caption && (
                          <div className="absolute inset-0 flex items-center justify-center p-10 text-center">
                            <p className={`text-3xl md:text-5xl text-white drop-shadow-[0_4px_15px_rgba(0,0,0,1)] font-bold leading-[1.1] ${articleFont}`}>
                              {item.caption}
                            </p>
                          </div>
                        )}

                      {/* Contador Estilizado */}
                      <div className="absolute top-6 right-6 bg-white/10 backdrop-blur-xl border border-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                        {index + 1} / {carouselItems.length}
                      </div>
                    </div>
                  </CarouselItem>
                );
              })}
              </CarouselContent>
              <div className="md:block hidden opacity-0 group-hover:opacity-100 transition-opacity">
                <CarouselPrevious className="left-6 h-12 w-12 bg-white/10 backdrop-blur-xl border-white/20 text-white hover:bg-white/30" />
                <CarouselNext className="right-6 h-12 w-12 bg-white/10 backdrop-blur-xl border-white/20 text-white hover:bg-white/30" />
              </div>
            </Carousel>
            
            <div className="flex justify-center gap-2 mt-6">
              {carouselItems.map((_: any, i: number) => (
                <div key={i} className="h-1 w-8 rounded-full bg-primary/20 overflow-hidden">
                  <div className="h-full bg-primary opacity-50" />
                </div>
              ))}
            </div>
          </div>
        ) : article.cover_image_url && (
          <img
            src={article.cover_image_url}
            alt={article.title}
            className="w-full h-64 md:h-80 object-cover rounded-lg mb-8"
          />
        )}

        <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
          {article.title}
        </h1>

        {article.published_at && (
          <p className="text-sm text-muted-foreground mb-8">
            {new Date(article.published_at).toLocaleDateString("pt-BR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}

        <div className="prose prose-lg max-w-none text-foreground">
          {article.content?.split("\n").map((paragraph: string, i: number) => (
            <p key={i} className="mb-4 text-foreground/90 leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

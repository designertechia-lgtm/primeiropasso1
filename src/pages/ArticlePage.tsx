import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ArticlePage() {
  const { slug, articleSlug } = useParams<{ slug: string; articleSlug: string }>();

  const { data: professional } = useQuery({
    queryKey: ["professional", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, full_name, slug")
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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link to={`/${slug}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Link>

        {article.image_url && (
          <img
            src={article.image_url}
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
          {article.content?.split("\n").map((paragraph, i) => (
            <p key={i} className="mb-4 text-foreground/90 leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

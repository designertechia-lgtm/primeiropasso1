import { useParams, Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, BookOpen, Calendar, Lock, Share2, Check } from "lucide-react";
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

function ShareArticleButton({ slug, articleSlug }: { slug: string; articleSlug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/${slug}/artigo/${articleSlug}`;
  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button
      size="sm" variant="ghost"
      className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground px-2 shrink-0"
      onClick={handleShare}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Share2 className="h-3 w-3" />}
      {copied ? "Copiado" : "Compartilhar"}
    </Button>
  );
}

export default function ArticlesListPage() {
  const { slug } = useParams<{ slug: string }>();
  const dark = slug ? localStorage.getItem(`dark_${slug}`) === "1" : false;

  const { data: professional, isLoading: loadingProf } = useQuery({
    queryKey: ["professional", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, slug, full_name, primary_color, background_color")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: allArticles = [], isLoading: loadingArticles } = useQuery({
    queryKey: ["articles-all", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("articles")
        .select("id, title, slug, cover_image_url, published_at, created_at, content, published")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  // Publicados ordenados pelo mais recente, depois rascunhos
  const articles = useMemo(() => {
    const published = allArticles
      .filter((a) => a.published)
      .sort((a, b) => {
        const da = new Date(a.published_at ?? a.created_at ?? 0).getTime();
        const db = new Date(b.published_at ?? b.created_at ?? 0).getTime();
        return db - da;
      });
    const drafts = allArticles
      .filter((a) => !a.published)
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());

    // Sem publicados → mostra apenas os 3 mais recentes (rascunhos)
    if (published.length === 0) return drafts.slice(0, 3);

    return [...published, ...drafts];
  }, [allArticles]);

  const hasPublished = allArticles.some((a) => a.published);

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
        styles["--primary-foreground"] = parseInt(hsl.split(" ")[2]) > 55 ? "220 15% 10%" : "210 40% 98%";
      }
    }
    if (bg) {
      const hsl = hexToHSL(bg);
      if (hsl) {
        const [h, sv, lv] = hsl.split(" ");
        const s = parseInt(sv), l = parseInt(lv);
        styles["--background"] = hsl;
        styles["--card"] = `${h} ${Math.max(s - 5, 0)}% ${Math.min(l + 2, 100)}%`;
        styles["--foreground"] = l < 50 ? `${h} ${Math.max(s - 15, 0)}% 90%` : `${h} ${Math.min(s + 10, 100)}% 15%`;
        styles["--muted-foreground"] = `${h} ${Math.max(s - 5, 0)}% 45%`;
        styles["--border"] = `${h} ${Math.max(s - 10, 0)}% ${l < 50 ? Math.min(l + 22, 55) : Math.max(l - 10, 0)}%`;
      }
    }
    return Object.keys(styles).length > 0 ? styles : undefined;
  }, [professional]);

  const isLoading = loadingProf || loadingArticles;

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
            to={`/${slug}#artigos`}
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
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-primary uppercase tracking-widest">Artigos</span>
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-bold text-foreground mb-3">
            Conteúdo para você
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Reflexões, dicas e perspectivas sobre saúde mental e bem-estar por {name}.
          </p>
          {!hasPublished && allArticles.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground/70 italic">
              Em breve novos conteúdos publicados aqui.
            </p>
          )}
        </div>
      </div>

      {/* Grid */}
      <main className="container mx-auto px-4 py-12">
        {articles.length === 0 ? (
          <div className="text-center py-24">
            <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum conteúdo ainda.</p>
          </div>
        ) : (
          <>
            {!hasPublished && (
              <p className="text-xs text-muted-foreground mb-6">
                Mostrando os {articles.length} rascunho{articles.length > 1 ? "s" : ""} mais recentes.
              </p>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((article) => {
                const isDraft = !article.published;
                const articleUrl = `/${slug}/artigo/${article.slug}`;

                return (
                  // Card nunca é um Link inteiro — evita conflito com botão compartilhar
                  <div
                    key={article.id}
                    className={`group rounded-2xl overflow-hidden border bg-card transition-all duration-300 flex flex-col ${
                      isDraft ? "opacity-70" : "hover:shadow-lg hover:-translate-y-0.5"
                    }`}
                  >
                    {/* Imagem clicável */}
                    {isDraft ? (
                      <div className="aspect-[4/3] overflow-hidden bg-muted relative">
                        {article.cover_image_url ? (
                          <img src={article.cover_image_url} alt={article.title} className="w-full h-full object-cover grayscale" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary/5">
                            <BookOpen className="h-10 w-10 text-primary/20" />
                          </div>
                        )}
                        <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
                          <Lock className="h-2.5 w-2.5" /> Rascunho
                        </div>
                      </div>
                    ) : (
                      <Link to={articleUrl} className="block aspect-[4/3] overflow-hidden bg-muted relative">
                        {article.cover_image_url ? (
                          <img src={article.cover_image_url} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary/5">
                            <BookOpen className="h-10 w-10 text-primary/20" />
                          </div>
                        )}
                      </Link>
                    )}

                    {/* Conteúdo */}
                    <div className="p-5 flex flex-col flex-1">
                      {article.published_at && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                          <Calendar className="h-3 w-3" />
                          {new Date(article.published_at).toLocaleDateString("pt-BR", {
                            day: "numeric", month: "long", year: "numeric",
                          })}
                        </div>
                      )}
                      {isDraft ? (
                        <h2 className="font-serif text-lg font-semibold text-foreground leading-snug mb-2 line-clamp-2">
                          {article.title}
                        </h2>
                      ) : (
                        <Link to={articleUrl}>
                          <h2 className="font-serif text-lg font-semibold text-foreground leading-snug mb-2 line-clamp-2 hover:text-primary transition-colors">
                            {article.title}
                          </h2>
                        </Link>
                      )}
                      {article.content && (
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed flex-1">
                          {article.content}
                        </p>
                      )}
                      {!isDraft && (
                        <div className="flex items-center justify-between mt-4">
                          <Link to={articleUrl} className="text-xs font-medium text-primary hover:underline">
                            Ler artigo →
                          </Link>
                          <ShareArticleButton slug={slug!} articleSlug={article.slug} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-8">
        <div className="container mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
          <Link to={`/${slug}#artigos`} className="hover:text-primary transition-colors">
            ← Voltar para o site de {name}
          </Link>
        </div>
      </footer>
    </div>
  );
}

import { useParams, Link } from "react-router-dom";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download, Loader2, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import html2canvas from "html2canvas";

export default function ArticlePage() {
  const { slug, articleSlug } = useParams<{ slug: string; articleSlug: string }>();
  const dark = slug ? localStorage.getItem(`dark_${slug}`) === "1" : false;
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { data: professional } = useQuery({
    queryKey: ["professional", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, slug, primary_color, secondary_color, background_color, full_name, whatsapp, contact_title")
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
          <Link to={`/${slug}#artigos`}>
            <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
          </Link>
        </div>
      </div>
    );
  }

  const carouselItems = Array.isArray(article.carousel_items) ? article.carousel_items : [];

  const primaryColor = professional?.primary_color || "#9b87f5";
  const secondaryColor = professional?.secondary_color || "#7E69AF";

  const FONT_CLASS_MAP: Record<string, string> = {
    "serif-italic":  "font-serif italic font-medium tracking-tight",
    "serif-bold":    "font-serif font-black uppercase tracking-tighter",
    "sans-bold":     "font-sans font-black tracking-tight",
    "serif-elegant": "font-serif font-semibold italic tracking-normal",
  };
  const FONT_SIZE_MAP: Record<string, string> = {
    "sm": "text-2xl md:text-3xl",
    "md": "text-3xl md:text-5xl",
    "lg": "text-4xl md:text-6xl",
  };
  const articleFont = FONT_CLASS_MAP[(article as any).font_style] ?? "font-serif italic font-medium tracking-tight";
  const articleSize = FONT_SIZE_MAP[(article as any).font_size] ?? "text-3xl md:text-5xl";

  const handleImageError = (index: number) => {
    setImageErrors((prev) => ({ ...prev, [index]: true }));
  };

  const downloadSlide = async (index: number) => {
    const el = slideRefs.current[index];
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true });
    const link = document.createElement("a");
    link.download = `slide-${index + 1}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const downloadAllSlides = async () => {
    setDownloading(true);
    for (let i = 0; i <= carouselItems.length; i++) {
      await downloadSlide(i);
      await new Promise((r) => setTimeout(r, 400));
    }
    setDownloading(false);
  };

  const whatsappNumber = professional?.whatsapp?.replace(/\D/g, "") ?? "";
  const whatsappLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Olá! Gostaria de agendar uma consulta.")}`
    : null;
  const siteLink = `https://primeiropasso.online/${slug}`;

  const contactSlideTitle = (professional as any)?.contact_title || "Dê o primeiro passo.\nAgende sua conversa.";

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`min-h-screen bg-background${dark ? " dark" : ""}`}>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <Link to={`/${slug}#artigos`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Link>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleShare}>
            {copied
              ? <><Check className="h-3.5 w-3.5 text-green-500" /> Link copiado!</>
              : <><Share2 className="h-3.5 w-3.5" /> Compartilhar</>
            }
          </Button>
        </div>

        {carouselItems.length > 0 ? (
          <div className="mb-8 relative group">
            <Carousel className="w-full shadow-2xl rounded-2xl overflow-hidden border-none">
              <CarouselContent>
                {carouselItems.map((item: any, index: number) => {
                  const hasImage = item.image_url && !imageErrors[index];
                  const total = carouselItems.length + 1;
                  return (
                    <CarouselItem key={index}>
                      <div
                        ref={(el) => { slideRefs.current[index] = el; }}
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
                            <div className="absolute inset-0 bg-black/10" />
                          </>
                        )}

                        {item.caption && (
                          <div className="absolute inset-0 flex items-center justify-center p-10 text-center">
                            <p className={`${articleSize} text-white drop-shadow-[0_4px_15px_rgba(0,0,0,1)] font-bold leading-[1.1] ${articleFont}`}>
                              {item.caption}
                            </p>
                          </div>
                        )}

                        <div className="absolute top-6 right-6 bg-white/10 backdrop-blur-xl border border-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                          {index + 1} / {total}
                        </div>

                        <button
                          onClick={() => downloadSlide(index)}
                          className="absolute bottom-4 right-4 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          title={`Baixar slide ${index + 1}`}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </CarouselItem>
                  );
                })}

                {/* Último slide: card de contato */}
                <CarouselItem>
                  <div
                    ref={(el) => { slideRefs.current[carouselItems.length] = el; }}
                    className="relative aspect-square overflow-hidden flex flex-col items-center justify-center"
                    style={{ background: "radial-gradient(ellipse at top, #1a2e1a, #0a120a)" }}
                  >
                    <div className="flex flex-col items-center justify-center gap-6 px-10 text-center">
                      <p className="text-white font-serif font-bold leading-tight text-3xl md:text-4xl drop-shadow-lg whitespace-pre-line">
                        {contactSlideTitle}
                      </p>

                      <div
                        className="h-1 w-16 rounded-full"
                        style={{ background: primaryColor }}
                      />

                      {professional?.full_name && (
                        <p className="text-white/80 text-lg font-medium tracking-wide">
                          {(professional as any).full_name}
                        </p>
                      )}

                      {whatsappLink ? (
                        <a
                          href={whatsappLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-6 py-3 rounded-full text-white font-semibold text-base shadow-lg transition-opacity hover:opacity-90"
                          style={{ background: "#25D366" }}
                        >
                          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.856L.063 23.25a.75.75 0 00.916.916l5.395-1.469A11.953 11.953 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.667-.5-5.201-1.375l-.373-.215-3.864 1.052 1.052-3.864-.215-.373A9.953 9.953 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                          </svg>
                          {professional.whatsapp}
                        </a>
                      ) : null}

                      <a
                        href={siteLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-2.5 rounded-full text-white/90 font-medium text-sm border border-white/30 hover:bg-white/20 transition-colors"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        primeiropasso.online/{slug}
                      </a>
                    </div>

                    <div className="absolute top-6 right-6 bg-white/10 backdrop-blur-xl border border-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                      {carouselItems.length + 1} / {carouselItems.length + 1}
                    </div>

                    <button
                      onClick={() => downloadSlide(carouselItems.length)}
                      className="absolute bottom-4 right-4 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Baixar slide de contato"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </CarouselItem>
              </CarouselContent>
              <div className="md:block hidden opacity-0 group-hover:opacity-100 transition-opacity">
                <CarouselPrevious className="left-6 h-12 w-12 bg-white/10 backdrop-blur-xl border-white/20 text-white hover:bg-white/30" />
                <CarouselNext className="right-6 h-12 w-12 bg-white/10 backdrop-blur-xl border-white/20 text-white hover:bg-white/30" />
              </div>
            </Carousel>

            {/* Rodapé do carrossel */}
            <div className="flex items-center justify-between mt-6">
              <div className="flex gap-2">
                {[...carouselItems, "contact"].map((_: any, i: number) => (
                  <div key={i} className="h-1 w-8 rounded-full bg-primary/20 overflow-hidden">
                    <div className="h-full bg-primary opacity-50" />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadAllSlides}
                  disabled={downloading}
                  className="gap-2"
                >
                  {downloading
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Baixando...</>
                    : <><Download className="h-4 w-4" />Baixar todos</>
                  }
                </Button>
              </div>
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

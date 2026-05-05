import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Instagram, Loader2, X, Calendar, Clock, Send, Link2, Images } from "lucide-react";
import html2canvas from "html2canvas";
import ArticleSlides, { SlideArticle, SlideProfessional, getSlideCount } from "./ArticleSlides";

interface SocialAccount {
  id: string;
  platform: string;
  account_name: string | null;
  expires_at: string | null;
}

interface Props {
  article: SlideArticle & { id: string };
  onDismiss?: () => void;
}

export default function PublishArticleCarousel({ article, onDismiss }: Props) {
  const { data: professional } = useProfessional();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const slideCount = getSlideCount(article);

  const [postMode, setPostMode] = useState<"now" | "schedule">("now");
  const [description, setDescription] = useState(article.title);
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  const [progress, setProgress] = useState<{ current: number; total: number; phase: string } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const { data: igAccount } = useQuery<SocialAccount | null>({
    queryKey: ["instagram-account", professional?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("social_accounts")
        .select("id, platform, account_name, expires_at")
        .eq("professional_id", professional!.id)
        .eq("platform", "instagram")
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!professional?.id,
  });

  const isExpired = igAccount?.expires_at ? new Date(igAccount.expires_at) < new Date() : false;
  const canPublish = igAccount && !isExpired;

  // Garante que as imagens carregaram antes de capturar
  const waitForImages = async () => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(".article-slides-render img"));
    await Promise.all(imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
    ));
  };

  const captureAndUploadSlide = async (
    el: HTMLDivElement,
    index: number,
    professionalId: string,
  ): Promise<string> => {
    const canvas = await html2canvas(el, {
      width: 1080,
      height: 1080,
      scale: 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#000000",
    });

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob falhou"))), "image/jpeg", 0.92)
    );

    const path = `${professionalId}/carousel-slides/${article.id}-${Date.now()}-${index}.jpg`;
    const { error } = await supabase.storage.from("images").upload(path, blob, {
      upsert: true,
      contentType: "image/jpeg",
    });
    if (error) throw error;
    const { data } = supabase.storage.from("images").getPublicUrl(path);
    return data.publicUrl;
  };

  const handlePublish = async () => {
    if (!professional || !user || !canPublish) return;
    setPublishing(true);

    try {
      // 1. Aguarda imagens dos slides carregarem
      setProgress({ current: 0, total: slideCount, phase: "Carregando imagens..." });
      await waitForImages();

      // 2. Captura cada slide e faz upload
      const urls: string[] = [];
      for (let i = 0; i < slideCount; i++) {
        const el = slideRefs.current[i];
        if (!el) throw new Error(`Slide ${i + 1} não encontrado`);
        setProgress({ current: i + 1, total: slideCount, phase: `Renderizando slide ${i + 1}/${slideCount}...` });
        const url = await captureAndUploadSlide(el, i, professional.id);
        urls.push(url);
      }

      // 3. Insere o post no banco
      setProgress({ current: slideCount, total: slideCount, phase: "Agendando..." });
      const scheduledDate = postMode === "now"
        ? new Date(Date.now() + 5000).toISOString()
        : new Date(scheduledAt).toISOString();

      const { error: insertError } = await (supabase as any).from("social_posts").insert({
        professional_id:     professional.id,
        article_id:          article.id,
        video_id:            null,
        platform:            "instagram",
        post_type:           "carousel",
        scheduled_at:        scheduledDate,
        description,
        carousel_image_urls: urls,
        status:              "pending",
      });
      if (insertError) throw insertError;

      // 4. Se "agora", invoca a função de publicação imediatamente
      if (postMode === "now") {
        setProgress({ current: slideCount, total: slideCount, phase: "Publicando no Instagram..." });
        const { data, error: fnErr } = await supabase.functions.invoke("publish-social-posts");
        if (fnErr) throw fnErr;
        const { published, failed } = data as { published: number; failed: number };
        if (published > 0) toast.success("Carrossel publicado no Instagram!");
        else if (failed > 0) toast.error("Falhou ao publicar — verifique os logs.");
        else toast.info("Carrossel agendado para publicação em instantes.");
      } else {
        const d = new Date(scheduledAt);
        toast.success("Carrossel agendado!", {
          description: `Instagram — ${d.toLocaleString("pt-BR")}`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      onDismiss?.();
    } catch (e: any) {
      toast.error("Erro ao publicar carrossel", { description: e.message });
    } finally {
      setPublishing(false);
      setProgress(null);
    }
  };

  if (!professional) return null;

  return (
    <>
      {/* Slides renderizados off-screen para captura */}
      <div
        className="article-slides-render"
        style={{
          position: "fixed",
          left: -10000,
          top: 0,
          pointerEvents: "none",
          opacity: 0,
        }}
      >
        <ArticleSlides
          article={article}
          professional={professional as SlideProfessional}
          slideRefs={slideRefs}
        />
      </div>

      <Card className="border-pink-200 bg-gradient-to-br from-pink-50/40 to-purple-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Instagram className="h-5 w-5 text-pink-500" />
              Publicar Carrossel no Instagram
            </CardTitle>
            {onDismiss && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onDismiss}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {!igAccount && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Link2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Conecte o Instagram para publicar.</p>
              <Button size="sm" variant="outline" asChild>
                <a href="/admin/configuracoes">Conectar Instagram</a>
              </Button>
            </div>
          )}

          {igAccount && isExpired && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <p className="text-sm text-amber-700 font-medium">Token expirado — reconecte o Instagram.</p>
              <Button size="sm" variant="outline" asChild>
                <a href="/admin/configuracoes">Reconectar</a>
              </Button>
            </div>
          )}

          {canPublish && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-pink-600 border-pink-300 gap-1.5">
                  <Instagram className="h-3 w-3" />
                  {igAccount.account_name ?? "Instagram"}
                </Badge>
                <Badge variant="outline" className="gap-1.5">
                  <Images className="h-3 w-3" />
                  {slideCount} slides
                </Badge>
              </div>

              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                <Images className="h-3.5 w-3.5 shrink-0" />
                Os slides serão renderizados (1080x1080) e publicados como carrossel.
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Legenda</Label>
                <Textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Escreva a legenda do carrossel..."
                  className="resize-none text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Quando publicar</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPostMode("now")}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                      postMode === "now"
                        ? "border-pink-400 bg-pink-50 text-pink-700"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Send className="h-4 w-4" /> Agora
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostMode("schedule")}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                      postMode === "schedule"
                        ? "border-pink-400 bg-pink-50 text-pink-700"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Calendar className="h-4 w-4" /> Agendar
                  </button>
                </div>

                {postMode === "schedule" && (
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
              </div>

              {progress && (
                <div className="rounded-lg bg-pink-50 border border-pink-200 px-3 py-2 text-xs text-pink-700 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {progress.phase}
                </div>
              )}

              <Button
                className="w-full gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white border-0"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Publicando...</>
                ) : postMode === "now" ? (
                  <><Send className="h-4 w-4" />Publicar carrossel agora</>
                ) : (
                  <><Clock className="h-4 w-4" />Confirmar agendamento</>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

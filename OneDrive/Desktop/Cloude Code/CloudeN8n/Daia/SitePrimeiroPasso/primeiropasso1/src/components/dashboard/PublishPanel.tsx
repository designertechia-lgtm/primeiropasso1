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
import {
  Instagram, Loader2, ImagePlus, X, Wand2,
  Calendar, Clock, Send, Link2, Film,
} from "lucide-react";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

interface Props {
  videoId: string;
  videoTitle: string;
  videoDescription?: string | null;
  videoUrl?: string | null;
  defaultPostType?: "reels" | "feed";
  onDismiss?: () => void;
}

interface SocialAccount {
  id: string;
  platform: string;
  account_name: string | null;
  expires_at: string | null;
}

export default function PublishPanel({ videoId, videoTitle, videoDescription, videoUrl, defaultPostType, onDismiss }: Props) {
  const { data: professional } = useProfessional();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [postType, setPostType]   = useState<"reels" | "feed">(defaultPostType ?? "reels");
  const [postMode, setPostMode]   = useState<"now" | "schedule">("now");
  const [description, setDescription] = useState(videoDescription ?? `Confira: ${videoTitle}`);
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  const [feedImageUrl, setFeedImageUrl]       = useState<string | null>(null);
  const [feedImagePreview, setFeedImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage]   = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [publishing, setPublishing]           = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const isExpired = igAccount?.expires_at
    ? new Date(igAccount.expires_at) < new Date()
    : false;

  const canPublish = igAccount && !isExpired;

  const handleImageUpload = async (file: File) => {
    if (!user) return;
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("Imagem muito grande", { description: "Máximo de 10MB." });
      return;
    }
    setUploadingImage(true);
    try {
      const ext  = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/feed-posts/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("images").getPublicUrl(path);
      setFeedImageUrl(urlData.publicUrl);
      setFeedImagePreview(URL.createObjectURL(file));
      toast.success("Imagem carregada!");
    } catch (e: any) {
      toast.error("Erro no upload", { description: e.message });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!professional?.slug) return;
    setGeneratingImage(true);
    try {
      const res = await fetch(`${API}/gerar-imagem-feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professional.slug,
          titulo:     videoTitle,
          descricao:  videoDescription ?? videoTitle,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      const data = await res.json();
      setFeedImageUrl(data.image_url);
      setFeedImagePreview(data.image_url);
      toast.success("Imagem sugerida pela IA!");
    } catch (e: any) {
      toast.error("Erro ao gerar imagem", { description: e.message });
    } finally {
      setGeneratingImage(false);
    }
  };

  const handlePublish = async () => {
    if (!professional || !canPublish) return;
    if (postType === "feed" && !feedImageUrl) {
      toast.error("Adicione uma imagem para posts de Feed.");
      return;
    }

    setPublishing(true);
    try {
      const scheduledDate = postMode === "now"
        ? new Date(Date.now() + 5000).toISOString()
        : new Date(scheduledAt).toISOString();

      const { error } = await (supabase as any).from("social_posts").insert({
        professional_id: professional.id,
        video_id:        videoId,
        platform:        "instagram",
        post_type:       postType,
        scheduled_at:    scheduledDate,
        description,
        image_url:       postType === "feed" ? feedImageUrl : null,
        status:          "pending",
      });

      if (error) throw error;

      if (postMode === "now") {
        const { data, error: fnErr } = await supabase.functions.invoke("publish-social-posts");
        if (fnErr) throw fnErr;
        const { published, failed } = data as { published: number; failed: number };
        if (published > 0) toast.success("Publicado no Instagram!");
        else if (failed > 0) toast.error("Falhou ao publicar — verifique os logs.");
        else toast.info("Post agendado para publicação em instantes.");
      } else {
        const d = new Date(scheduledAt);
        toast.success("Post agendado!", {
          description: `Instagram — ${d.toLocaleString("pt-BR")}`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      onDismiss?.();
    } catch (e: any) {
      toast.error("Erro ao publicar", { description: e.message });
    } finally {
      setPublishing(false);
    }
  };

  if (!professional) return null;

  return (
    <Card className="border-pink-200 bg-gradient-to-br from-pink-50/40 to-purple-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Instagram className="h-5 w-5 text-pink-500" />
            Publicar no Instagram
          </CardTitle>
          {onDismiss && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onDismiss}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Not connected */}
        {!igAccount && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Link2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Conecte o Instagram para publicar ou agendar.
            </p>
            <Button size="sm" variant="outline" asChild>
              <a href="/admin/configuracoes">Conectar Instagram</a>
            </Button>
          </div>
        )}

        {/* Token expired */}
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
            {/* Account badge */}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-pink-600 border-pink-300 gap-1.5">
                <Instagram className="h-3 w-3" />
                {igAccount.account_name ?? "Instagram"}
              </Badge>
            </div>

            {/* Post type selector */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tipo de Post</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "reels", icon: Film, label: "Reels",    desc: "Vídeo vertical" },
                  { value: "feed",  icon: ImagePlus, label: "Feed", desc: "Imagem quadrada" },
                ] as const).map(({ value, icon: Icon, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPostType(value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      postType === value
                        ? "border-pink-400 bg-pink-50 text-pink-700"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                    <span className="text-xs font-normal opacity-70">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reels info */}
            {postType === "reels" && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                <Film className="h-3.5 w-3.5 shrink-0" />
                {videoUrl
                  ? "O vídeo gerado será publicado como Reels."
                  : "Certifique-se de que o vídeo está salvo no Supabase Storage (não YouTube)."}
              </div>
            )}

            {/* Feed image */}
            {postType === "feed" && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Imagem do Post</Label>

                {feedImagePreview ? (
                  <div className="relative rounded-lg overflow-hidden aspect-square max-w-[180px]">
                    <img src={feedImagePreview} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setFeedImageUrl(null); setFeedImagePreview(null); }}
                      className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-0.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-primary/30 rounded-lg hover:bg-primary/5 transition-colors text-sm text-muted-foreground"
                    >
                      {uploadingImage
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <ImagePlus className="h-5 w-5" />}
                      <span>{uploadingImage ? "Enviando..." : "Minha Imagem"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateImage}
                      disabled={generatingImage}
                      className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-purple-300 rounded-lg hover:bg-purple-50 transition-colors text-sm text-muted-foreground disabled:opacity-60"
                    >
                      {generatingImage
                        ? <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
                        : <Wand2 className="h-5 w-5 text-purple-500" />}
                      <span>{generatingImage ? "Gerando..." : "Gerar com IA"}</span>
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
                />
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Legenda</Label>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Escreva a legenda do post..."
                className="resize-none text-sm"
              />
            </div>

            {/* Post mode */}
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
                  <Send className="h-4 w-4" />
                  Agora
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
                  <Calendar className="h-4 w-4" />
                  Agendar
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

            {/* Publish button */}
            <Button
              className="w-full gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white border-0"
              onClick={handlePublish}
              disabled={publishing || (postType === "feed" && !feedImageUrl)}
            >
              {publishing ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Publicando...</>
              ) : postMode === "now" ? (
                <><Send className="h-4 w-4" />Publicar agora</>
              ) : (
                <><Clock className="h-4 w-4" />Confirmar agendamento</>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

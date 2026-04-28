import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Instagram, Linkedin, Film, Calendar, Clock,
  Plus, Trash2, CheckCircle2, XCircle, Loader2, Share2, Send,
} from "lucide-react";

// TikTok icon (lucide não tem, usamos SVG inline)
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.16 8.16 0 0 0 4.77 1.52V6.77a4.85 4.85 0 0 1-1-.08z"/>
    </svg>
  );
}

const PLATFORMS = [
  { id: "instagram", label: "Instagram",  icon: Instagram,   color: "text-pink-500",   bg: "bg-pink-50 border-pink-200"   },
  { id: "linkedin",  label: "LinkedIn",   icon: Linkedin,    color: "text-blue-600",   bg: "bg-blue-50 border-blue-200"   },
  { id: "tiktok",    label: "TikTok",     icon: TikTokIcon,  color: "text-gray-800",   bg: "bg-gray-50 border-gray-200"   },
] as const;

type Platform = "instagram" | "linkedin" | "tiktok";

interface Video {
  id: string;
  title: string;
  thumbnail_url: string | null;
  description: string | null;
}

interface SocialPost {
  id: string;
  video_id: string;
  platform: Platform;
  scheduled_at: string;
  description: string | null;
  status: "pending" | "published" | "failed" | "cancelled";
  error_message: string | null;
}

function statusBadge(status: SocialPost["status"]) {
  const map = {
    pending:   { label: "Agendado",   className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    published: { label: "Publicado",  className: "bg-green-100 text-green-800 border-green-200"   },
    failed:    { label: "Falhou",     className: "bg-red-100 text-red-800 border-red-200"         },
    cancelled: { label: "Cancelado",  className: "bg-gray-100 text-gray-600 border-gray-200"      },
  };
  const s = map[status];
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

function platformLabel(p: Platform) {
  return PLATFORMS.find((x) => x.id === p)?.label ?? p;
}

function descriptionPlaceholder(video: Video | undefined, platform: Platform) {
  if (!video) return "";
  return video.description ?? `Confira: ${video.title}`;
}

export default function AdminRedesSociais() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen]     = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [platform, setPlatform]         = useState<Platform>("instagram");
  const [scheduledAt, setScheduledAt]   = useState("");
  const [description, setDescription]   = useState("");
  const [saving, setSaving]             = useState(false);
  const [publishing, setPublishing]     = useState(false);

  const { data: videos = [], isLoading: loadingVideos } = useQuery<Video[]>({
    queryKey: ["videos-for-social", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, title, thumbnail_url, description")
        .eq("professional_id", professional!.id)
        .eq("published", true)
        .order("created_at", { ascending: false });
      return (data ?? []) as Video[];
    },
    enabled: !!professional?.id,
  });

  const { data: posts = [], isLoading: loadingPosts } = useQuery<SocialPost[]>({
    queryKey: ["social-posts", professional?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("social_posts")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("scheduled_at", { ascending: false });
      return (data ?? []) as SocialPost[];
    },
    enabled: !!professional?.id,
  });

  const openSchedule = (video: Video) => {
    setSelectedVideo(video);
    setPlatform("instagram");
    // Default: amanhã às 09:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    setScheduledAt(tomorrow.toISOString().slice(0, 16));
    setDescription(video.description ?? `Confira: ${video.title}`);
    setDialogOpen(true);
  };

  const handleSchedule = async () => {
    if (!professional || !selectedVideo || !scheduledAt) return;
    setSaving(true);
    const { error } = await (supabase as any).from("social_posts").insert({
      professional_id: professional.id,
      video_id:        selectedVideo.id,
      platform,
      scheduled_at:    new Date(scheduledAt).toISOString(),
      description,
      status:          "pending",
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao agendar", { description: error.message });
    } else {
      toast.success("Post agendado!", { description: `${platformLabel(platform)} — ${new Date(scheduledAt).toLocaleString("pt-BR")}` });
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancelar este agendamento?")) return;
    const { error } = await (supabase as any)
      .from("social_posts")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) toast.error("Erro ao cancelar");
    else {
      toast.success("Agendamento cancelado");
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
    }
  };

  const handlePublishNow = async () => {
    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("publish-social-posts");
      if (error) throw error;
      const { published, failed } = data as { published: number; failed: number };
      if (published > 0) toast.success(`${published} post(s) publicado(s) com sucesso!`);
      if (failed > 0) toast.error(`${failed} post(s) falharam — veja o status na lista.`);
      if (published === 0 && failed === 0) toast.info("Nenhum post pendente para publicar agora.");
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
    } catch (e: any) {
      toast.error("Erro ao publicar", { description: e?.message });
    } finally {
      setPublishing(false);
    }
  };

  const videoMap = Object.fromEntries(videos.map((v) => [v.id, v]));

  if (loadingVideos || loadingPosts) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Redes Sociais</h1>
          <p className="text-muted-foreground mt-1 text-sm">Agende a publicação dos seus vídeos nas plataformas.</p>
        </div>
        <Button onClick={handlePublishNow} disabled={publishing} variant="default" size="sm">
          {publishing
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Publicando...</>
            : <><Send className="h-3.5 w-3.5 mr-1.5" />Publicar pendentes</>
          }
        </Button>
      </div>

      {/* Vídeos disponíveis para agendar */}
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Seus vídeos</h2>
        {videos.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">
            Nenhum vídeo publicado. Crie e publique um vídeo para agendar nas redes sociais.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <Card key={v.id} className="overflow-hidden">
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt={v.title} className="w-full h-36 object-cover" />
                ) : (
                  <div className="w-full h-36 bg-muted flex items-center justify-center">
                    <Film className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <CardContent className="p-3 space-y-2">
                  <p className="font-medium text-sm line-clamp-2">{v.title}</p>
                  <Button size="sm" className="w-full" onClick={() => openSchedule(v)}>
                    <Share2 className="h-3.5 w-3.5 mr-1" />
                    Agendar publicação
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Posts agendados */}
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Posts agendados</h2>
        {posts.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">Nenhum post agendado ainda.</p>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => {
              const video  = videoMap[post.video_id];
              const plat   = PLATFORMS.find((p) => p.id === post.platform);
              const Icon   = plat?.icon ?? Film;
              const date   = new Date(post.scheduled_at);

              return (
                <Card key={post.id}>
                  <CardContent className="p-4 flex gap-4 items-start">
                    {/* Thumbnail */}
                    <div className="shrink-0">
                      {video?.thumbnail_url ? (
                        <img src={video.thumbnail_url} alt="" className="w-16 h-16 rounded object-cover" />
                      ) : (
                        <div className="w-16 h-16 rounded bg-muted flex items-center justify-center">
                          <Film className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`flex items-center gap-1 text-sm font-medium ${plat?.color}`}>
                          <Icon className="h-4 w-4" />
                          {plat?.label}
                        </span>
                        {statusBadge(post.status)}
                      </div>
                      <p className="text-sm font-medium line-clamp-1">{video?.title ?? "Vídeo"}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {date.toLocaleDateString("pt-BR")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {post.error_message && (
                        <p className="text-xs text-red-600 line-clamp-2">{post.error_message}</p>
                      )}
                    </div>

                    {/* Ação */}
                    {post.status === "pending" && (
                      <Button
                        variant="ghost" size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleCancel(post.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Dialog de agendamento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar publicação</DialogTitle>
          </DialogHeader>

          {selectedVideo && (
            <div className="space-y-5">
              {/* Vídeo selecionado */}
              <div className="flex gap-3 items-center p-3 rounded-lg bg-muted/50">
                {selectedVideo.thumbnail_url ? (
                  <img src={selectedVideo.thumbnail_url} alt="" className="w-14 h-14 rounded object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded bg-muted flex items-center justify-center">
                    <Film className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <p className="text-sm font-medium line-clamp-2">{selectedVideo.title}</p>
              </div>

              {/* Plataforma */}
              <div className="space-y-2">
                <Label>Plataforma</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPlatform(p.id as Platform);
                          setDescription(descriptionPlaceholder(selectedVideo, p.id as Platform));
                        }}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                          platform === p.id
                            ? `${p.bg} border-current ${p.color}`
                            : "border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Data e hora */}
              <div className="space-y-2">
                <Label htmlFor="scheduled-at">Data e hora</Label>
                <input
                  id="scheduled-at"
                  type="datetime-local"
                  value={scheduledAt}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Descrição */}
              <div className="space-y-2">
                <Label htmlFor="post-desc">Legenda / Descrição</Label>
                <Textarea
                  id="post-desc"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Escreva a legenda do post..."
                />
              </div>

              <Button onClick={handleSchedule} disabled={saving || !scheduledAt} className="w-full">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Agendando...</> : "Confirmar agendamento"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

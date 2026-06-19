import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Upload, Film, CheckCircle2, X,
  Scissors, Wand2, Image, Loader2, PlayCircle, Share2, Download, Copy, Instagram,
  Clapperboard,
} from "lucide-react";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { FieldHint } from "@/components/ui/FieldHint";
import PublishPanel from "@/components/dashboard/PublishPanel";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

interface VideoForm {
  id?: string;
  title: string;
  description: string;
  embed_url: string;
  thumbnail_url: string;
  published: boolean;
}

const emptyForm: VideoForm = { title: "", description: "", embed_url: "", thumbnail_url: "", published: false };

// ── Player sob demanda ─────────────────────────────────────────
function VideoPlayer({ url, title }: { url: string; title: string }) {
  const isYoutube = /youtube\.com|youtu\.be/.test(url);

  if (isYoutube) {
    const videoId = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
    return (
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
        <iframe
          className="absolute inset-0 w-full h-full rounded-lg"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title={title}
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="flex justify-center bg-black rounded-lg overflow-hidden">
      <video
        src={url}
        controls
        autoPlay
        preload="none"
        className="max-h-[70vh] max-w-full w-auto block"
      />
    </div>
  );
}

// ── Painel de edição (trim + thumbnail) ────────────────────────
function EditPanel({
  video,
  professionalSlug,
  onClose,
}: {
  video: { id: string; title: string; embed_url: string; thumbnail_url: string | null };
  professionalSlug: string;
  onClose: () => void;
}) {
  const queryClient                   = useQueryClient();
  const [trimStart, setTrimStart]     = useState(0);
  const [trimEnd, setTrimEnd]         = useState(30);
  const [duration, setDuration]       = useState(30);
  const [trimming, setTrimming]       = useState(false);
  const [trimJobId, setTrimJobId]     = useState<string | null>(null);
  const [trimStatus, setTrimStatus]   = useState<string>("");
  const pollRef                       = useRef<ReturnType<typeof setInterval> | null>(null);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const handleTrim = async () => {
    setTrimming(true);
    setTrimStatus("Enviando...");
    try {
      const res  = await fetch(`${API}/trim-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: video.id,
          professional_slug: professionalSlug,
          start_seconds: trimStart,
          end_seconds: trimEnd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Erro ao iniciar trim");
      setTrimJobId(data.job_id);
      pollRef.current = setInterval(async () => {
        const s = await fetch(`${API}/status/${data.job_id}`).then((r) => r.json());
        setTrimStatus(s.step ?? s.status);
        if (s.status === "done") {
          clearInterval(pollRef.current!);
          setTrimming(false);
          toast.success("Vídeo cortado e atualizado!");
          queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
          onClose();
        } else if (s.status === "error") {
          clearInterval(pollRef.current!);
          setTrimming(false);
          toast.error("Erro ao cortar: " + s.message);
        }
      }, 3000);
    } catch (e: any) {
      setTrimming(false);
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Player */}
      <video
        src={video.embed_url}
        controls
        className="w-full rounded-lg max-h-48 bg-black"
        onLoadedMetadata={(e) => {
          const d = Math.floor((e.target as HTMLVideoElement).duration);
          setDuration(d);
          setTrimEnd(d);
        }}
      />

      {/* Trim */}
      <div className="space-y-3">
        <Label className="font-semibold flex items-center gap-2">
          <Scissors className="h-4 w-4" /> Cortar vídeo
        </Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Início: {fmt(trimStart)}</Label>
            <input
              type="range" min={0} max={Math.max(0, trimEnd - 1)} step={1}
              value={trimStart}
              onChange={(e) => setTrimStart(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Fim: {fmt(trimEnd)}</Label>
            <input
              type="range" min={trimStart + 1} max={duration} step={1}
              value={trimEnd}
              onChange={(e) => setTrimEnd(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Duração resultante: <strong>{fmt(trimEnd - trimStart)}</strong>
        </p>
        <Button onClick={handleTrim} disabled={trimming} className="w-full">
          {trimming
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{trimStatus}</>
            : <><Scissors className="h-4 w-4 mr-2" />Aplicar corte</>}
        </Button>
      </div>

      {/* Trocar thumbnail */}
      <div className="space-y-2">
        <Label className="font-semibold flex items-center gap-2">
          <Image className="h-4 w-4" /> Trocar thumbnail
        </Label>
        <ImageUpload
          currentUrl={video.thumbnail_url}
          onUploaded={async (url) => {
            await supabase.from("videos").update({ thumbnail_url: url }).eq("id", video.id);
            toast.success("Thumbnail atualizada!");
            queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
          }}
          folder="video-thumbnails"
        />
      </div>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────
export default function AdminVideos() {
  const { data: professional } = useProfessional();
  const { user }               = useAuth();
  const navigate               = useNavigate();
  const queryClient            = useQueryClient();

  const [open, setOpen]               = useState(false);
  const [editPanelVideo, setEditPanelVideo] = useState<any>(null);
  const [playerVideo, setPlayerVideo] = useState<any>(null);
  const [shareVideo, setShareVideo]   = useState<any>(null);
  const [publishVideo, setPublishVideo] = useState<any>(null);
  const [form, setForm]               = useState<VideoForm>(emptyForm);
  const [saving, setSaving]           = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["admin-videos", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("videos")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const openNew  = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (v: typeof videos[0]) => {
    setForm({
      id: v.id, title: v.title, description: v.description || "",
      embed_url: v.embed_url, thumbnail_url: (v as any).thumbnail_url || "",
      published: v.published,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!professional || !form.title || !form.embed_url) return;
    setSaving(true);
    const payload = {
      professional_id: professional.id,
      title: form.title,
      description: form.description || null,
      embed_url: form.embed_url,
      thumbnail_url: form.thumbnail_url || null,
      published: form.published,
      published_at: form.published ? new Date().toISOString() : null,
    };
    const { error } = form.id
      ? await supabase.from("videos").update(payload).eq("id", form.id)
      : await supabase.from("videos").insert(payload);
    setSaving(false);
    if (error) toast.error("Erro ao salvar vídeo");
    else {
      toast.success(form.id ? "Vídeo atualizado!" : "Vídeo criado!");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
    }
  };

  const deleteStorageFile = async (url: string) => {
    try {
      const withoutQuery = url.split("?")[0];
      const match = withoutQuery.split("/object/public/images/")[1];
      if (match) await supabase.storage.from("images").remove([decodeURIComponent(match)]);
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este vídeo?")) return;
    // Busca embed_url e thumbnail antes de deletar o registro
    const video = videos.find((v: any) => v.id === id);
    const { error } = await supabase.from("videos").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    // Deleta arquivos do storage (só se forem URLs do Supabase)
    if (video?.embed_url && (video.embed_url.includes("supabase") || /\.(mp4|webm|mov)$/i.test(video.embed_url))) {
      await deleteStorageFile(video.embed_url);
    }
    if (video?.thumbnail_url && video.thumbnail_url.includes("supabase")) {
      await deleteStorageFile(video.thumbnail_url);
    }
    toast.success("Vídeo excluído");
    queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground flex-1">Vídeos</h1>

        {/* Botões de criação de vídeo com IA */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/admin/criar-video")}
            className="gap-2"
          >
            <Clapperboard className="h-4 w-4" />
            Criar Vídeo
          </Button>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Vídeo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar Vídeo" : "Novo Vídeo"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Título <FieldHint text="Nome do vídeo exibido na sua página pública." /></Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Vídeo <FieldHint text="Faça upload de um arquivo da galeria (até 100MB) ou cole um link do YouTube." /></Label>
                <div className="space-y-3">
                  {form.embed_url && form.embed_url.includes("supabase") ? (
                    <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                      <span className="flex-1 truncate min-w-0 text-xs text-green-700">
                        {decodeURIComponent(form.embed_url.split("/").pop() || "vídeo")}
                      </span>
                      <Button type="button" variant="ghost" size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setForm({ ...form, embed_url: "" })}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-muted-foreground">Cole um link do YouTube:</div>
                      <Input value={form.embed_url}
                        onChange={(e) => setForm({ ...form, embed_url: e.target.value })}
                        placeholder="https://www.youtube.com/watch?v=..." />
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm"
                      disabled={uploadingVideo}
                      onClick={() => videoInputRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-1" />
                      {uploadingVideo ? "Enviando..." : "Upload da galeria"}
                    </Button>
                  </div>
                  <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !user) return;
                      if (file.size > 100 * 1024 * 1024) {
                        toast.error("Arquivo muito grande", { description: "Máximo de 100MB." });
                        return;
                      }
                      setUploadingVideo(true);
                      const oldUrl = form.embed_url;
                      const ext  = file.name.split(".").pop();
                      const path = `${user.id}/videos/${Date.now()}.${ext}`;
                      const { error } = await supabase.storage.from("images").upload(path, file, { upsert: true });
                      if (error) {
                        toast.error("Erro no upload", { description: error.message });
                        setUploadingVideo(false);
                        return;
                      }
                      // Deleta vídeo antigo do storage após upload bem-sucedido
                      if (oldUrl && (oldUrl.includes("supabase") || oldUrl.endsWith(".mp4") || oldUrl.endsWith(".webm"))) {
                        try {
                          const match = oldUrl.split("?")[0].split("/object/public/images/")[1];
                          if (match) await supabase.storage.from("images").remove([decodeURIComponent(match)]);
                        } catch {}
                      }
                      const { data: urlData } = supabase.storage.from("images").getPublicUrl(path);
                      setForm((prev) => ({ ...prev, embed_url: urlData.publicUrl }));
                      setUploadingVideo(false);
                      toast.success("Vídeo enviado!");
                      e.target.value = "";
                    }} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Thumbnail / Capa <FieldHint text="Imagem de capa exibida antes do vídeo ser reproduzido na sua página." /></Label>
                <ImageUpload currentUrl={form.thumbnail_url || null}
                  onUploaded={(url) => setForm({ ...form, thumbnail_url: url })}
                  folder="video-thumbnails" />
              </div>
              <div className="space-y-2">
                <Label>Descrição <FieldHint text="Texto explicativo exibido abaixo do vídeo na sua página." /></Label>
                <Textarea rows={4} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.published}
                  onCheckedChange={(v) => setForm({ ...form, published: v })} />
                <Label>Publicado <FieldHint text="Vídeos publicados ficam visíveis na sua página pública. Desativado = rascunho." /></Label>
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>


      {videos.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          Nenhum vídeo ainda. Clique em "Novo Vídeo" para começar.
        </p>
      ) : (
        <div className="grid gap-4">
          {videos.map((v) => {
            const isYoutube = /youtube|youtu\.be/i.test((v as any).embed_url ?? "");
            const canPublishToIG = !isYoutube && !!(v as any).embed_url;
            return (
              <div key={v.id} className="space-y-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <button
                        className="shrink-0 relative group rounded-lg overflow-hidden h-12 w-12"
                        onClick={() => setPlayerVideo(v)}
                        title="Assistir vídeo"
                      >
                        {(v as any).thumbnail_url ? (
                          <img
                            src={(v as any).thumbnail_url}
                            alt=""
                            className="h-12 w-12 object-cover transition-opacity group-hover:opacity-70"
                          />
                        ) : (
                          <div className="h-12 w-12 bg-muted flex items-center justify-center">
                            <Film className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <PlayCircle className="h-5 w-5 text-white drop-shadow-lg" />
                        </div>
                      </button>
                      <div className="min-w-0">
                        <CardTitle className="text-lg truncate">{v.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {(v as any).created_at &&
                            `Criado em ${new Date((v as any).created_at).toLocaleString("pt-BR", {
                              day: "2-digit", month: "2-digit", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}`}
                          {(v as any).script_json && (
                            <span className="ml-2 text-muted-foreground/60">· Roteiro salvo</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {(v as any).script_json && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Reeditar com IA"
                          onClick={() => navigate(`/admin/criar-video?edit=${v.id}`)}
                        >
                          <Wand2 className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      {canPublishToIG && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Publicar no Instagram"
                          onClick={() => setPublishVideo(v)}
                        >
                          <Instagram className="h-4 w-4 text-pink-500" />
                        </Button>
                      )}
                      <Dialog
                        open={editPanelVideo?.id === v.id}
                        onOpenChange={(o) => !o && setEditPanelVideo(null)}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar trim/thumbnail"
                            onClick={() => setEditPanelVideo(v)}
                          >
                            <Scissors className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Editar — {v.title}</DialogTitle>
                          </DialogHeader>
                          {editPanelVideo?.id === v.id && professional?.slug && (
                            <EditPanel
                              video={v as any}
                              professionalSlug={professional.slug}
                              onClose={() => setEditPanelVideo(null)}
                            />
                          )}
                        </DialogContent>
                      </Dialog>
                      <Button variant="ghost" size="icon" title="Compartilhar" onClick={() => setShareVideo(v)}>
                        <Share2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Detalhes" onClick={() => openEdit(v)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => handleDelete(v.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        v.published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {v.published ? "Publicado" : "Rascunho"}
                    </span>
                  </CardContent>
                </Card>

                {publishVideo?.id === v.id && (
                  <PublishPanel
                    videoId={v.id}
                    videoTitle={v.title}
                    videoDescription={v.description}
                    videoUrl={(v as any).embed_url}
                    onDismiss={() => setPublishVideo(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Player modal — carrega vídeo só ao abrir */}
      <Dialog open={!!playerVideo} onOpenChange={(o) => !o && setPlayerVideo(null)}>
        <DialogContent className="max-w-2xl overflow-hidden">
          <DialogHeader className="min-w-0">
            <DialogTitle className="truncate pr-6 min-w-0">{playerVideo?.title}</DialogTitle>
          </DialogHeader>
          {playerVideo && (
            <VideoPlayer url={playerVideo.embed_url} title={playerVideo.title} />
          )}
        </DialogContent>
      </Dialog>

      {/* Compartilhar modal */}
      <Dialog open={!!shareVideo} onOpenChange={(o) => !o && setShareVideo(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <Share2 className="h-4 w-4 shrink-0" />
              <span className="truncate">{shareVideo?.title}</span>
            </DialogTitle>
          </DialogHeader>
          {shareVideo && (
            <div className="space-y-4 mt-1">
              {/* Link público */}
              {professional?.slug && shareVideo.published && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Link público do vídeo</p>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground truncate">
                      {window.location.origin}/{professional.slug}/video/{shareVideo.id}
                    </div>
                    <Button size="sm" variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/${professional.slug}/video/${shareVideo.id}`);
                        toast.success("Link copiado!");
                      }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
              {(!shareVideo.published) && (
                <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Publique o vídeo para gerar o link de compartilhamento.
                </p>
              )}

              {/* Baixar vídeo */}
              {shareVideo.embed_url && !/youtube|youtu\.be/.test(shareVideo.embed_url) && (
                <a
                  href={shareVideo.embed_url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Baixar vídeo para publicar
                </a>
              )}

              {/* Legendas por plataforma */}
              {shareVideo.script_json ? (
                <div className="space-y-3">
                  {[
                    { label: "Instagram / Reels", key: "descricao_instagram", fallback: "descricao_post" },
                    { label: "LinkedIn",          key: "descricao_linkedin",   fallback: "descricao_post" },
                    { label: "TikTok",            key: "legenda_tiktok",       fallback: "descricao_post" },
                  ].map(({ label, key, fallback }) => {
                    const text: string = (shareVideo.script_json as any)[key] || (shareVideo.script_json as any)[fallback] || "";
                    if (!text) return null;
                    return (
                      <div key={label} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{label}</p>
                          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
                            onClick={() => { navigator.clipboard.writeText(text); toast.success(`Legenda para ${label} copiada!`); }}>
                            <Copy className="h-3 w-3" /> Copiar
                          </Button>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-28 overflow-y-auto">
                          {text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : shareVideo.description ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Descrição</p>
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
                      onClick={() => { navigator.clipboard.writeText(shareVideo.description); toast.success("Descrição copiada!"); }}>
                      <Copy className="h-3 w-3" /> Copiar
                    </Button>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-28 overflow-y-auto">
                    {shareVideo.description}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Gere este vídeo com IA para ter legendas prontas por plataforma.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

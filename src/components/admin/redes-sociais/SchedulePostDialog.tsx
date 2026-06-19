import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import html2canvas from "html2canvas";
import ArticleSlides, {
  type SlideArticle,
  type SlideProfessional,
  getSlideCount,
} from "@/components/dashboard/ArticleSlides";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Trash2, Ban, Film, FileText } from "lucide-react";

export const PLATFORM_META = {
  instagram: { label: "Instagram", color: "#E1306C" },
  facebook:  { label: "Facebook",  color: "#1877F2" },
  threads:   { label: "Threads",   color: "#101010" },
  linkedin:  { label: "LinkedIn",  color: "#0A66C2" },
  tiktok:    { label: "TikTok",    color: "#FE2C55" },
} as const;

export type Platform = keyof typeof PLATFORM_META;

export interface CalendarPost {
  id: string;
  platform: Platform;
  scheduled_at: string;
  description: string | null;
  status: "pending" | "published" | "failed" | "cancelled";
  post_type: "reels" | "feed" | "carousel";
  video_id: string | null;
  article_id: string | null;
  image_url: string | null;
  carousel_image_urls: string[] | null;
  error_message: string | null;
}

interface VideoOption {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
}

interface ArticleOption extends SlideArticle {
  id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CalendarPost | null;
  defaultDate: string | null;
  professionalId: string | null;
  onSaved: () => void;
}

type ContentKind = "video" | "article";

function toLocalInput(iso: string | null): string {
  if (!iso) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  }
  const d = new Date(iso);
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60000);
  return local.toISOString().slice(0, 16);
}

const STATUS_LABEL: Record<CalendarPost["status"], string> = {
  pending:   "Agendado",
  published: "Publicado",
  failed:    "Falhou",
  cancelled: "Cancelado",
};

export default function SchedulePostDialog({
  open,
  onOpenChange,
  editing,
  defaultDate,
  professionalId,
  onSaved,
}: Props) {
  const { data: professional } = useProfessional();
  const isEditing = !!editing;
  const isLocked  = editing?.status === "published";

  const [kind,        setKind]        = useState<ContentKind>("video");
  const [platform,    setPlatform]    = useState<Platform>("instagram");
  const [contentId,   setContentId]   = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>(toLocalInput(null));
  const [description, setDescription] = useState<string>("");
  const [touchedDesc, setTouchedDesc] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [renderMsg,   setRenderMsg]   = useState<string | null>(null);

  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    setTouchedDesc(false);
    setRenderMsg(null);
    if (editing) {
      setKind(editing.article_id ? "article" : "video");
      setPlatform(editing.platform);
      setContentId(editing.article_id ?? editing.video_id ?? "");
      setScheduledAt(toLocalInput(editing.scheduled_at));
      setDescription(editing.description ?? "");
    } else {
      setKind("video");
      setPlatform("instagram");
      setContentId("");
      setScheduledAt(toLocalInput(defaultDate));
      setDescription("");
    }
  }, [open, editing, defaultDate]);

  const { data: videos = [] } = useQuery<VideoOption[]>({
    queryKey: ["videos-for-calendar", professionalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, title, description, thumbnail_url")
        .eq("professional_id", professionalId!)
        .order("created_at", { ascending: false });
      return (data ?? []) as VideoOption[];
    },
    enabled: !!professionalId && open,
  });

  const { data: articles = [] } = useQuery<ArticleOption[]>({
    queryKey: ["articles-for-calendar", professionalId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("articles")
        .select("id, title, cover_image_url, font_style, font_size, carousel_items")
        .eq("professional_id", professionalId!)
        .order("created_at", { ascending: false });
      return (data ?? []) as ArticleOption[];
    },
    enabled: !!professionalId && open,
  });

  const selectedVideo   = useMemo(() => videos.find((v) => v.id === contentId) ?? null, [videos, contentId]);
  const selectedArticle = useMemo(() => articles.find((a) => a.id === contentId) ?? null, [articles, contentId]);

  // Auto-fill legenda do conteúdo selecionado (a menos que user já editou manualmente)
  useEffect(() => {
    if (touchedDesc || isEditing) return;
    if (kind === "video" && selectedVideo) {
      setDescription(selectedVideo.description ?? selectedVideo.title ?? "");
    } else if (kind === "article" && selectedArticle) {
      setDescription(selectedArticle.title ?? "");
    }
  }, [kind, selectedVideo, selectedArticle, touchedDesc, isEditing]);

  // Trocar tipo limpa seleção (a menos que esteja editando)
  function changeKind(next: ContentKind) {
    if (isEditing) return;
    setKind(next);
    setContentId("");
  }

  const canSave = !!professionalId && !!scheduledAt && !!contentId && !saving;

  async function captureSlide(el: HTMLDivElement, index: number, articleId: string): Promise<string> {
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
    const path = `${professionalId}/carousel-slides/${articleId}-${Date.now()}-${index}.jpg`;
    const { error } = await supabase.storage.from("images").upload(path, blob, {
      upsert: true,
      contentType: "image/jpeg",
    });
    if (error) throw error;
    const { data } = supabase.storage.from("images").getPublicUrl(path);
    return data.publicUrl;
  }

  async function renderArticleSlides(article: ArticleOption): Promise<string[]> {
    const slideCount = getSlideCount(article);
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(".article-slides-render img"));
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
      )
    );
    const urls: string[] = [];
    for (let i = 0; i < slideCount; i++) {
      const el = slideRefs.current[i];
      if (!el) throw new Error(`Slide ${i + 1} não encontrado`);
      setRenderMsg(`Renderizando slide ${i + 1}/${slideCount}…`);
      urls.push(await captureSlide(el, i, article.id));
    }
    return urls;
  }

  async function handleSave() {
    if (!canSave || !professionalId) return;
    setSaving(true);
    try {
      if (isEditing && editing) {
        // Edição: apenas atualiza metadados (não re-renderiza slides)
        const updates: Record<string, any> = {
          platform,
          scheduled_at: new Date(scheduledAt).toISOString(),
          description: description.trim() || null,
        };
        const { error } = await (supabase as any)
          .from("social_posts")
          .update(updates)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Publicação atualizada!");
        onSaved();
        return;
      }

      // Criação
      if (kind === "video") {
        const { error } = await (supabase as any).from("social_posts").insert({
          professional_id: professionalId,
          platform,
          video_id: contentId,
          post_type: "reels",
          status: "pending",
          scheduled_at: new Date(scheduledAt).toISOString(),
          description: description.trim() || null,
        });
        if (error) throw error;
        toast.success("Vídeo agendado!");
        onSaved();
      } else if (kind === "article" && selectedArticle) {
        // Carrossel: renderiza slides off-screen + upload + insert
        setRenderMsg("Preparando renderização…");
        const urls = await renderArticleSlides(selectedArticle);
        setRenderMsg("Salvando agendamento…");
        const { error } = await (supabase as any).from("social_posts").insert({
          professional_id: professionalId,
          platform,
          article_id: contentId,
          video_id: null,
          post_type: "carousel",
          status: "pending",
          scheduled_at: new Date(scheduledAt).toISOString(),
          description: description.trim() || null,
          carousel_image_urls: urls,
        });
        if (error) throw error;
        toast.success("Carrossel agendado!", { description: `${urls.length} slides renderizados.` });
        onSaved();
      }
    } catch (e: any) {
      toast.error("Erro ao agendar", { description: e?.message ?? String(e) });
    } finally {
      setSaving(false);
      setRenderMsg(null);
    }
  }

  async function handleCancelPost() {
    if (!editing) return;
    if (!confirm("Cancelar essa publicação?")) return;
    const { error } = await (supabase as any)
      .from("social_posts")
      .update({ status: "cancelled" })
      .eq("id", editing.id);
    if (error) return toast.error("Erro ao cancelar", { description: error.message });
    toast.success("Cancelada.");
    onSaved();
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirm("Excluir essa publicação do calendário?")) return;
    const { error } = await (supabase as any)
      .from("social_posts")
      .delete()
      .eq("id", editing.id);
    if (error) return toast.error("Erro ao excluir", { description: error.message });
    toast.success("Excluída.");
    onSaved();
  }

  return (
    <>
      {kind === "article" && selectedArticle && professional && !isEditing && (
        <div
          className="article-slides-render"
          style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none", opacity: 0 }}
        >
          <ArticleSlides
            article={selectedArticle}
            professional={professional as SlideProfessional}
            slideRefs={slideRefs}
          />
        </div>
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              {isEditing ? "Editar publicação" : "Agendar publicação"}
              {isEditing && editing && (
                <Badge variant="outline" style={{ color: PLATFORM_META[editing.platform].color }}>
                  {STATUS_LABEL[editing.status]}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {isLocked
                ? "Esta publicação já foi enviada. Você pode visualizar mas não editar."
                : "Escolha o conteúdo (vídeo ou artigo), plataforma, data e legenda."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!isEditing && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => changeKind("video")}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                    kind === "video"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Film className="h-4 w-4" /> Vídeo
                </button>
                <button
                  type="button"
                  onClick={() => changeKind("article")}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                    kind === "article"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <FileText className="h-4 w-4" /> Artigo (carrossel)
                </button>
              </div>
            )}

            <div className="space-y-2">
              <Label>Plataforma</Label>
              <Select
                value={platform}
                onValueChange={(v) => setPlatform(v as Platform)}
                disabled={isLocked}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PLATFORM_META) as Platform[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      <span style={{ color: PLATFORM_META[p].color }}>●</span>{" "}
                      {PLATFORM_META[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{kind === "video" ? "Vídeo" : "Artigo"}</Label>
              <Select
                value={contentId}
                onValueChange={setContentId}
                disabled={isLocked || isEditing}
              >
                <SelectTrigger>
                  <SelectValue placeholder={kind === "video" ? "Selecione um vídeo" : "Selecione um artigo"} />
                </SelectTrigger>
                <SelectContent>
                  {kind === "video" ? (
                    videos.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">
                        Nenhum vídeo. Crie um na aba "Criar Vídeo".
                      </div>
                    ) : (
                      videos.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.title}
                        </SelectItem>
                      ))
                    )
                  ) : articles.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      Nenhum artigo. Crie um na aba "Artigos".
                    </div>
                  ) : (
                    articles.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.title}{" "}
                        {Array.isArray(a.carousel_items) && (
                          <span className="text-xs text-muted-foreground">({a.carousel_items.length} slides)</span>
                        )}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data e hora</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={isLocked}
              />
            </div>

            <div className="space-y-2">
              <Label>Legenda</Label>
              <Textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setTouchedDesc(true);
                }}
                placeholder="Legenda da publicação (vem do conteúdo, edite se quiser)."
                className="min-h-[100px]"
                disabled={isLocked}
              />
              {!touchedDesc && !isEditing && contentId && (
                <p className="text-xs text-muted-foreground">
                  Texto preenchido a partir do {kind === "video" ? "vídeo" : "artigo"}. Pode editar à vontade.
                </p>
              )}
            </div>

            {editing?.error_message && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <strong>Erro na última tentativa:</strong> {editing.error_message}
              </div>
            )}

            {renderMsg && (
              <div className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {renderMsg}
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <div className="flex gap-2">
              {isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir
                </Button>
              )}
              {isEditing && editing?.status === "pending" && (
                <Button type="button" variant="outline" size="sm" onClick={handleCancelPost}>
                  <Ban className="h-4 w-4 mr-1" /> Cancelar publicação
                </Button>
              )}
            </div>
            <Button onClick={handleSave} disabled={!canSave || isLocked}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {isEditing ? "Salvar alterações" : "Agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

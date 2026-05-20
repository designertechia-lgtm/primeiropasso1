import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Loader2, Trash2, Ban } from "lucide-react";

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
  thumbnail_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CalendarPost | null;
  defaultDate: string | null;
  professionalId: string | null;
  onSaved: () => void;
}

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
  const isEditing = !!editing;
  const isLocked  = editing?.status === "published";

  const [platform,    setPlatform]    = useState<Platform>("instagram");
  const [videoId,     setVideoId]     = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>(toLocalInput(null));
  const [description, setDescription] = useState<string>("");
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setPlatform(editing.platform);
      setVideoId(editing.video_id ?? "");
      setScheduledAt(toLocalInput(editing.scheduled_at));
      setDescription(editing.description ?? "");
    } else {
      setPlatform("instagram");
      setVideoId("");
      setScheduledAt(toLocalInput(defaultDate));
      setDescription("");
    }
  }, [open, editing, defaultDate]);

  const { data: videos = [] } = useQuery<VideoOption[]>({
    queryKey: ["videos-for-calendar", professionalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, title, thumbnail_url")
        .eq("professional_id", professionalId!)
        .order("created_at", { ascending: false });
      return (data ?? []) as VideoOption[];
    },
    enabled: !!professionalId && open,
  });

  const canSave = useMemo(() => {
    if (!professionalId) return false;
    if (!scheduledAt) return false;
    if (!videoId) return false;
    return true;
  }, [professionalId, scheduledAt, videoId]);

  async function handleSave() {
    if (!canSave || !professionalId) return;
    setSaving(true);
    const payload = {
      platform,
      video_id: videoId,
      scheduled_at: new Date(scheduledAt).toISOString(),
      description: description.trim() || null,
    };
    if (isEditing && editing) {
      const { error } = await (supabase as any)
        .from("social_posts")
        .update(payload)
        .eq("id", editing.id);
      setSaving(false);
      if (error) return toast.error("Erro ao salvar", { description: error.message });
      toast.success("Publicação atualizada!");
      onSaved();
    } else {
      const { error } = await (supabase as any).from("social_posts").insert({
        professional_id: professionalId,
        post_type: "reels",
        status: "pending",
        ...payload,
      });
      setSaving(false);
      if (error) return toast.error("Erro ao agendar", { description: error.message });
      toast.success("Publicação agendada!");
      onSaved();
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            {isEditing ? "Editar publicação" : "Agendar publicação"}
            {isEditing && editing && (
              <Badge
                variant="outline"
                style={{ color: PLATFORM_META[editing.platform].color }}
              >
                {STATUS_LABEL[editing.status]}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {isLocked
              ? "Esta publicação já foi enviada. Você pode visualizar mas não editar."
              : "Defina plataforma, vídeo, data e legenda. Você pode arrastar no calendário pra remarcar."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
            <Label>Vídeo</Label>
            <Select value={videoId} onValueChange={setVideoId} disabled={isLocked}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um vídeo" />
              </SelectTrigger>
              <SelectContent>
                {videos.length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    Nenhum vídeo encontrado. Crie um na aba "Criar Vídeo".
                  </div>
                )}
                {videos.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.title}
                  </SelectItem>
                ))}
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
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Texto da publicação, hashtags, menções..."
              className="min-h-[100px]"
              disabled={isLocked}
            />
          </div>

          {editing?.error_message && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              <strong>Erro na última tentativa:</strong> {editing.error_message}
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
          <Button onClick={handleSave} disabled={!canSave || saving || isLocked}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEditing ? "Salvar alterações" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

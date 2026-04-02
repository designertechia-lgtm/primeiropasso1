import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Pencil, Trash2, Upload, Film } from "lucide-react";
import ImageUpload from "@/components/dashboard/ImageUpload";

interface VideoForm {
  id?: string;
  title: string;
  description: string;
  embed_url: string;
  thumbnail_url: string;
  published: boolean;
}

const emptyForm: VideoForm = { title: "", description: "", embed_url: "", thumbnail_url: "", published: false };

export default function AdminVideos() {
  const { data: professional } = useProfessional();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<VideoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
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

  const openNew = () => { setForm(emptyForm); setOpen(true); };

  const openEdit = (v: typeof videos[0]) => {
    setForm({ id: v.id, title: v.title, description: v.description || "", embed_url: v.embed_url, thumbnail_url: (v as any).thumbnail_url || "", published: v.published });
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

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este vídeo?")) return;
    const { error } = await supabase.from("videos").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else {
      toast.success("Vídeo excluído");
      queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
    }
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Vídeos</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Vídeo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar Vídeo" : "Novo Vídeo"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Vídeo</Label>
                <div className="space-y-3">
                  {form.embed_url && (
                    <div className="text-sm text-muted-foreground truncate border rounded-md px-3 py-2 bg-muted/30">
                      <Film className="h-3 w-3 inline mr-1" />
                      {form.embed_url}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingVideo}
                      onClick={() => videoInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {uploadingVideo ? "Enviando..." : "Upload da galeria"}
                    </Button>
                  </div>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !user) return;
                      const maxSize = 100 * 1024 * 1024; // 100MB
                      if (file.size > maxSize) {
                        toast.error("Arquivo muito grande", { description: "Máximo de 100MB." });
                        return;
                      }
                      setUploadingVideo(true);
                      const ext = file.name.split(".").pop();
                      const path = `${user.id}/videos/${Date.now()}.${ext}`;
                      const { error } = await supabase.storage.from("images").upload(path, file, { upsert: true });
                      if (error) {
                        toast.error("Erro no upload", { description: error.message });
                        setUploadingVideo(false);
                        return;
                      }
                      const { data: urlData } = supabase.storage.from("images").getPublicUrl(path);
                      setForm((prev) => ({ ...prev, embed_url: urlData.publicUrl }));
                      setUploadingVideo(false);
                      toast.success("Vídeo enviado!");
                      e.target.value = "";
                    }}
                  />
                  <div className="text-xs text-muted-foreground">Ou cole um link do YouTube:</div>
                  <Input
                    value={form.embed_url}
                    onChange={(e) => setForm({ ...form, embed_url: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Thumbnail / Capa</Label>
                <ImageUpload
                  currentUrl={form.thumbnail_url || null}
                  onUploaded={(url) => setForm({ ...form, thumbnail_url: url })}
                  folder="video-thumbnails"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.published} onCheckedChange={(v) => setForm({ ...form, published: v })} />
                <Label>Publicado</Label>
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {videos.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nenhum vídeo ainda. Clique em "Novo Vídeo" para começar.</p>
      ) : (
        <div className="grid gap-4">
          {videos.map((v) => (
            <Card key={v.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">{v.title}</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(v)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(v.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <span className={`text-xs px-2 py-1 rounded-full ${v.published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {v.published ? "Publicado" : "Rascunho"}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

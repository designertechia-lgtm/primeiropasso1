import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Wand2, Loader2, User, Camera, Sparkles } from "lucide-react";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

const STYLES = [
  { id: "profissional", label: "Realista",    emoji: "📷" },
  { id: "cartoon",      label: "Cartoon",     emoji: "🎨" },
  { id: "aquarela",     label: "Aquarela",    emoji: "🖌️" },
  { id: "pixar",        label: "Pixar 3D",    emoji: "🎬" },
  { id: "minimalista",  label: "Minimalista", emoji: "✏️" },
] as const;
type StyleId = typeof STYLES[number]["id"];

interface AvatarForm {
  name: string;
  age: string;
  personality: string;
  backstory: string;
  style: StyleId;
  generation_prompt: string;
}

const emptyForm: AvatarForm = {
  name: "",
  age: "",
  personality: "",
  backstory: "",
  style: "profissional",
  generation_prompt: "",
};

interface Avatar {
  id: string;
  name: string;
  age: number | null;
  personality: string;
  backstory: string;
  photo_url: string;
  is_generated: boolean;
  style: string;
  created_at: string;
}

async function parseError(e: unknown, res?: Response): Promise<string> {
  if (res) {
    try {
      const body = await res.clone().json();
      if (body?.detail) return String(body.detail);
    } catch {}
    return `HTTP ${res.status} ${res.statusText}`;
  }
  if (e instanceof TypeError && e.message === "Failed to fetch") {
    return `Sem conexão com o servidor (${API}) — verifique se o backend está rodando`;
  }
  return e instanceof Error ? e.message : String(e);
}

export default function AdminAvatares() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const [open, setOpen]           = useState(false);
  const [form, setForm]           = useState<AvatarForm>(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [photoMode, setPhotoMode] = useState<"upload" | "generate" | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const slug = professional?.slug ?? "";

  const { data: avatars = [], isLoading } = useQuery<Avatar[]>({
    queryKey: ["avatares", slug],
    queryFn: async () => {
      const res = await fetch(`${API}/avatares/${slug}`);
      if (!res.ok) throw new Error(await parseError(null, res));
      const data = await res.json();
      return data.avatars ?? [];
    },
    enabled: !!slug,
  });

  const openNew = () => {
    setForm(emptyForm);
    setPhotoMode(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPhotoMode("upload");
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!slug || !form.name.trim()) {
      toast.error("Nome do personagem é obrigatório");
      return;
    }
    setSaving(true);
    let lastRes: Response | undefined;
    try {
      const body = {
        professional_slug: slug,
        name: form.name,
        age: form.age ? parseInt(form.age) : null,
        personality: form.personality,
        backstory: form.backstory,
        style: form.style,
        generate_photo: false,
        generation_prompt: "",
      };
      lastRes = await fetch(`${API}/criar-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await lastRes.json();
      if (!lastRes.ok) throw new Error(data.detail ?? `HTTP ${lastRes.status}`);

      const avatarId: string = data.avatar_id;

      if (photoMode === "upload" && selectedFile) {
        const fd = new FormData();
        fd.append("file", selectedFile);
        fd.append("professional_slug", slug);
        lastRes = await fetch(`${API}/upload-foto-avatar/${avatarId}`, {
          method: "POST",
          body: fd,
        });
        if (!lastRes.ok) {
          const upErr = await lastRes.json().catch(() => ({}));
          throw new Error(upErr.detail ?? `Erro no upload: HTTP ${lastRes.status}`);
        }
      }

      toast.success("Personagem criado!");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["avatares", slug] });
    } catch (e: unknown) {
      toast.error(await parseError(e, lastRes?.ok === false ? lastRes : undefined), {
        duration: 6000,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!form.name.trim()) {
      toast.error("Informe o nome antes de gerar");
      return;
    }
    if (!form.generation_prompt.trim()) {
      toast.error("Descreva a aparência do personagem para gerar a foto");
      return;
    }
    setGenerating(true);
    let lastRes: Response | undefined;
    try {
      const body = {
        professional_slug: slug,
        name: form.name,
        age: form.age ? parseInt(form.age) : null,
        personality: form.personality,
        backstory: form.backstory,
        style: form.style,
        generate_photo: true,
        generation_prompt: form.generation_prompt,
      };
      lastRes = await fetch(`${API}/criar-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await lastRes.json();
      if (!lastRes.ok) throw new Error(data.detail ?? `HTTP ${lastRes.status}`);
      toast.success("Personagem criado com foto gerada pela IA!");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["avatares", slug] });
    } catch (e: unknown) {
      toast.error(await parseError(e, lastRes?.ok === false ? lastRes : undefined), {
        duration: 6000,
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (avatar: Avatar) => {
    if (!confirm(`Excluir o personagem "${avatar.name}"?`)) return;
    let res: Response | undefined;
    try {
      res = await fetch(`${API}/avatar/${avatar.id}?professional_slug=${slug}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(null, res));
      toast.success("Personagem excluído");
      queryClient.invalidateQueries({ queryKey: ["avatares", slug] });
    } catch (e: unknown) {
      toast.error(await parseError(e, res?.ok === false ? res : undefined), { duration: 6000 });
    }
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Personagens</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Crie personagens para usar em vídeos e artigos
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Novo Personagem
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Personagem</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pb-2">

              {/* Nome */}
              <div className="space-y-1">
                <Label>Nome <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Ex: Carneirinho, Dra. Ana..."
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* Idade */}
              <div className="space-y-1">
                <Label>Idade <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input
                  type="number"
                  placeholder="16"
                  min={1}
                  max={120}
                  value={form.age}
                  onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                />
              </div>

              {/* Personalidade */}
              <div className="space-y-1">
                <Label>Personalidade</Label>
                <Input
                  placeholder="Ex: Empática, calma, representa paz e harmonia"
                  value={form.personality}
                  onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))}
                />
              </div>

              {/* Backstory */}
              <div className="space-y-1">
                <Label>Backstory / História</Label>
                <Textarea
                  rows={2}
                  placeholder="Ex: Ela ajuda pessoas a encontrar o caminho certo para curas emocionais e mentais..."
                  value={form.backstory}
                  onChange={(e) => setForm((f) => ({ ...f, backstory: e.target.value }))}
                />
              </div>

              {/* Estilo visual — sempre visível */}
              <div className="space-y-1.5">
                <Label className="font-medium">Estilo Visual</Label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, style: s.id }))}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors flex items-center gap-1 ${
                        form.style === s.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      <span>{s.emoji}</span> {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Foto */}
              <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
                <Label className="font-medium">Foto do Personagem</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={photoMode === "upload" ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setPhotoMode("upload"); fileInputRef.current?.click(); }}
                  >
                    <Upload className="h-4 w-4 mr-1.5" /> Upload
                  </Button>
                  <Button
                    type="button"
                    variant={photoMode === "generate" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPhotoMode("generate")}
                  >
                    <Sparkles className="h-4 w-4 mr-1.5" /> Gerar com IA
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {/* Preview upload */}
                {previewUrl && photoMode === "upload" && (
                  <div className="flex items-center gap-3 mt-1">
                    <img src={previewUrl} alt="preview" className="w-14 h-14 rounded-full object-cover border-2 border-primary/30" />
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">{selectedFile?.name}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground px-2"
                        onClick={() => { setPreviewUrl(null); setSelectedFile(null); setPhotoMode(null); }}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                )}

                {/* Gerar com IA — descrição */}
                {photoMode === "generate" && (
                  <div className="space-y-1 mt-1">
                    <Label className="text-xs font-medium">
                      Descrição visual <span className="text-muted-foreground">(aparência, traços, expressão, roupa)</span>
                    </Label>
                    <Textarea
                      rows={2}
                      placeholder={`Ex: ovelha branca fofa, expressão carinhosa, fundo suave — estilo ${STYLES.find(s => s.id === form.style)?.label ?? "Realista"}`}
                      value={form.generation_prompt}
                      onChange={(e) => setForm((f) => ({ ...f, generation_prompt: e.target.value }))}
                    />
                  </div>
                )}

                {photoMode === null && (
                  <p className="text-xs text-muted-foreground">
                    Opcional — faça upload de uma imagem ou deixe a IA criar com base no estilo selecionado.
                  </p>
                )}
              </div>

              {/* Botões de ação */}
              {photoMode === "generate" ? (
                <Button
                  onClick={handleGenerate}
                  disabled={generating || !form.name.trim() || !form.generation_prompt.trim()}
                  className="w-full"
                >
                  {generating
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando foto com IA...</>
                    : <><Wand2 className="h-4 w-4 mr-2" />Gerar Personagem com IA</>}
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="w-full">
                  {saving
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                    : "Salvar Personagem"}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {avatars.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Nenhum personagem criado ainda.</p>
          <p className="text-sm text-muted-foreground">
            Crie personagens para usar como narradores nos seus vídeos e artigos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {avatars.map((av) => (
            <Card key={av.id} className="group relative overflow-hidden">
              <CardContent className="p-0">
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {av.photo_url ? (
                    <img src={av.photo_url} alt={av.name} className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="h-10 w-10 text-muted-foreground/40" />
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-semibold text-sm leading-tight truncate flex-1">{av.name}</p>
                    {av.is_generated && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">IA</Badge>
                    )}
                  </div>
                  {av.age && <p className="text-xs text-muted-foreground">{av.age} anos</p>}
                  {av.style && (
                    <p className="text-xs text-muted-foreground capitalize">
                      {STYLES.find(s => s.id === av.style)?.emoji} {STYLES.find(s => s.id === av.style)?.label ?? av.style}
                    </p>
                  )}
                  {av.personality && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{av.personality}</p>
                  )}
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-7 w-7"
                    onClick={() => handleDelete(av)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

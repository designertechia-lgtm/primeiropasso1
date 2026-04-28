import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Wand2, Loader2, User, Camera, Sparkles, Copy, Pencil, ZoomIn, RefreshCw } from "lucide-react";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

const STYLES = [
  { id: "profissional", label: "Realista",    emoji: "📷" },
  { id: "cartoon",      label: "Cartoon",     emoji: "🎨" },
  { id: "aquarela",     label: "Aquarela",    emoji: "🖌️" },
  { id: "pixar",        label: "Pixar 3D",    emoji: "🎬" },
  { id: "minimalista",  label: "Minimalista", emoji: "✏️" },
] as const;
type StyleId = typeof STYLES[number]["id"];
type PhotoMode = "upload" | "generate" | "profile" | "transform" | null;

interface AvatarForm {
  name: string;
  age: string;
  personality: string;
  backstory: string;
  style: StyleId;
  generation_prompt: string;
}

const emptyForm: AvatarForm = {
  name: "", age: "", personality: "", backstory: "",
  style: "profissional", generation_prompt: "",
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
      if (body?.detail) {
        const detail = String(body.detail);
        if (res.status === 503 || detail.includes("UNAVAILABLE") || detail.includes("high demand"))
          return "O modelo de IA está com alta demanda no momento. Tente novamente em alguns segundos.";
        return detail;
      }
    } catch {}
    return `HTTP ${res.status} ${res.statusText}`;
  }
  if (e instanceof TypeError && e.message === "Failed to fetch")
    return `Sem conexão com o servidor (${API}) — verifique se o backend está rodando`;
  return e instanceof Error ? e.message : String(e);
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  onRetry: (attempt: number, max: number) => void,
  maxRetries = 3,
): Promise<Response> {
  let res!: Response;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    res = await fetch(input, init);
    if (res.status !== 503 || attempt === maxRetries) return res;
    onRetry(attempt, maxRetries);
    await new Promise(r => setTimeout(r, 5000 * attempt));
  }
  return res;
}

export default function AdminAvatares() {
  const { data: professional } = useProfessional();

  const [open, setOpen]                 = useState(false);
  const [editingAvatar, setEditingAvatar] = useState<Avatar | null>(null);
  const [enlargedAvatar, setEnlargedAvatar] = useState<Avatar | null>(null);
  const [form, setForm]                 = useState<AvatarForm>(emptyForm);
  const [saving, setSaving]             = useState(false);
  const [photoMode, setPhotoMode]       = useState<PhotoMode>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null);
  const [generating, setGenerating]         = useState(false);
  const [styleGenAvatar, setStyleGenAvatar] = useState<Avatar | null>(null);
  const [styleGenStyle, setStyleGenStyle]   = useState<StyleId>("profissional");
  const [styleGenerating, setStyleGenerating] = useState(false);
  const [retryAttempt, setRetryAttempt]     = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileModeIntentRef = useRef<"upload" | "transform">("upload");

  const slug = professional?.slug ?? "";

  const { data: avatars = [], isLoading, isError, error, refetch } = useQuery<Avatar[]>({
    queryKey: ["avatares", slug],
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch(`${API}/avatares/${slug}`);
      } catch (e) {
        throw new Error(await parseError(e));
      }
      if (!res.ok) throw new Error(await parseError(null, res));
      const data = await res.json();
      return data.avatars ?? [];
    },
    enabled: !!slug,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const resetModal = () => {
    setForm(emptyForm);
    setPhotoMode(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setEditingAvatar(null);
  };

  const openNew = () => { resetModal(); setOpen(true); };

  const openEdit = (av: Avatar) => {
    setEditingAvatar(av);
    setForm({
      name: av.name,
      age: av.age ? String(av.age) : "",
      personality: av.personality,
      backstory: av.backstory,
      style: (STYLES.find(s => s.id === av.style)?.id ?? "profissional") as StyleId,
      generation_prompt: "",
    });
    setPhotoMode(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setOpen(true);
  };

  const handleClone = (av: Avatar) => {
    setEditingAvatar(null);
    setForm({
      name: `Cópia de ${av.name}`,
      age: av.age ? String(av.age) : "",
      personality: av.personality,
      backstory: av.backstory,
      style: (STYLES.find(s => s.id === av.style)?.id ?? "profissional") as StyleId,
      generation_prompt: "",
    });
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
    setPhotoMode(fileModeIntentRef.current);
    e.target.value = "";
  };

  const buildBaseBody = () => ({
    professional_slug: slug,
    name: form.name,
    age: form.age ? parseInt(form.age) : null,
    personality: form.personality,
    backstory: form.backstory,
    style: form.style,
    generate_photo: photoMode === "generate",
    generation_prompt: photoMode === "generate" ? form.generation_prompt : "",
    photo_url_existing: photoMode === "profile" ? (professional?.photo_url ?? "") : "",
  });

  const handleSave = async () => {
    if (!slug || !form.name.trim()) { toast.error("Nome do personagem é obrigatório"); return; }
    setSaving(true);
    let lastRes: Response | undefined;
    try {
      const isEdit = !!editingAvatar;
      const url    = isEdit ? `${API}/avatar/${editingAvatar!.id}` : `${API}/criar-avatar`;
      const method = isEdit ? "PATCH" : "POST";

      lastRes = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBaseBody()),
      });
      const data = await lastRes.json();
      if (!lastRes.ok) throw new Error(data.detail ?? `HTTP ${lastRes.status}`);

      const avatarId: string = isEdit ? editingAvatar!.id : data.avatar_id;

      if (photoMode === "upload" && selectedFile) {
        const fd = new FormData();
        fd.append("file", selectedFile);
        fd.append("professional_slug", slug);
        lastRes = await fetch(`${API}/upload-foto-avatar/${avatarId}`, { method: "POST", body: fd });
        if (!lastRes.ok) {
          const err = await lastRes.json().catch(() => ({}));
          throw new Error(err.detail ?? `Erro no upload: HTTP ${lastRes.status}`);
        }
      }

      toast.success(isEdit ? "Personagem atualizado!" : "Personagem criado!");
      setOpen(false);
      resetModal();
      await refetch();
    } catch (e: unknown) {
      toast.error(await parseError(e, lastRes?.ok === false ? lastRes : undefined), { duration: 6000 });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!form.name.trim()) { toast.error("Informe o nome antes de gerar"); return; }
    if (!form.generation_prompt.trim()) { toast.error("Descreva a aparência do personagem"); return; }
    setGenerating(true);
    setRetryAttempt(0);
    let lastRes: Response | undefined;
    try {
      const isEdit = !!editingAvatar;
      const endpoint = isEdit ? `${API}/avatar/${editingAvatar!.id}` : `${API}/criar-avatar`;
      const method   = isEdit ? "PATCH" : "POST";

      lastRes = await fetchWithRetry(
        endpoint,
        { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildBaseBody()) },
        (attempt, max) => {
          setRetryAttempt(attempt);
          toast.info(`Servidor ocupado, tentando novamente... (${attempt}/${max})`, { duration: 4000 });
        },
      );
      const data = await lastRes.json();
      if (!lastRes.ok) throw new Error(data.detail ?? `HTTP ${lastRes.status}`);
      toast.success(isEdit ? "Foto gerada e personagem atualizado!" : "Personagem criado com foto gerada pela IA!");
      setOpen(false);
      resetModal();
      await refetch();
    } catch (e: unknown) {
      toast.error(await parseError(e, lastRes?.ok === false ? lastRes : undefined), { duration: 6000 });
    } finally {
      setGenerating(false);
      setRetryAttempt(0);
    }
  };

  const handleStyleGen = async () => {
    if (!styleGenAvatar) return;
    setStyleGenerating(true);
    setRetryAttempt(0);
    let lastRes: Response | undefined;
    try {
      const fd = new FormData();
      fd.append("professional_slug", slug);
      fd.append("style", styleGenStyle);
      lastRes = await fetchWithRetry(
        `${API}/gerar-estilo-avatar/${styleGenAvatar.id}`,
        { method: "POST", body: fd },
        (attempt, max) => {
          setRetryAttempt(attempt);
          toast.info(`Servidor ocupado, tentando novamente... (${attempt}/${max})`, { duration: 4000 });
        },
      );
      const data = await lastRes.json();
      if (!lastRes.ok) throw new Error(data.detail ?? `HTTP ${lastRes.status}`);
      toast.success(`Variação "${STYLES.find(s => s.id === styleGenStyle)?.label}" criada!`);
      setStyleGenAvatar(null);
      setEnlargedAvatar(null);
      await refetch();
    } catch (e: unknown) {
      toast.error(await parseError(e, lastRes?.ok === false ? lastRes : undefined), { duration: 6000 });
    } finally {
      setStyleGenerating(false);
      setRetryAttempt(0);
    }
  };

  const handleTransform = async () => {
    if (!form.name.trim()) { toast.error("Informe o nome do personagem"); return; }
    if (!selectedFile) { toast.error("Selecione uma foto para transformar"); return; }
    setSaving(true);
    setRetryAttempt(0);
    let lastRes: Response | undefined;
    try {
      const fd = new FormData();
      fd.append("professional_slug", slug);
      fd.append("name", form.name);
      fd.append("personality", form.personality);
      fd.append("backstory", form.backstory);
      fd.append("style", form.style);
      if (form.age) fd.append("age", form.age);
      fd.append("file", selectedFile);
      lastRes = await fetchWithRetry(
        `${API}/criar-avatar-transformado`,
        { method: "POST", body: fd },
        (attempt, max) => {
          setRetryAttempt(attempt);
          toast.info(`Servidor ocupado, tentando novamente... (${attempt}/${max})`, { duration: 4000 });
        },
      );
      const data = await lastRes.json();
      if (!lastRes.ok) throw new Error(data.detail ?? `HTTP ${lastRes.status}`);
      toast.success(`Avatar "${form.name}" criado com estilo ${STYLES.find(s => s.id === form.style)?.label}!`);
      setOpen(false);
      resetModal();
      await refetch();
    } catch (e: unknown) {
      toast.error(await parseError(e, lastRes?.ok === false ? lastRes : undefined), { duration: 6000 });
    } finally {
      setSaving(false);
      setRetryAttempt(0);
    }
  };

  const handleDelete = async (av: Avatar) => {
    if (!confirm(`Excluir o personagem "${av.name}"?`)) return;
    let res: Response | undefined;
    try {
      res = await fetch(`${API}/avatar/${av.id}?professional_slug=${slug}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(null, res));
      toast.success("Personagem excluído");
      await refetch();
    } catch (e: unknown) {
      toast.error(await parseError(e, res?.ok === false ? res : undefined), { duration: 6000 });
    }
  };

  const currentPhoto = editingAvatar
    ? (photoMode === "profile" ? professional?.photo_url : (photoMode === "upload" || photoMode === "transform") ? previewUrl : editingAvatar.photo_url)
    : (photoMode === "profile" ? professional?.photo_url : previewUrl);

  if (isLoading) return <div className="animate-pulse text-muted-foreground p-6">Carregando personagens...</div>;

  if (isError) return (
    <div className="text-center py-16 space-y-3">
      <p className="text-destructive text-sm">{(error as Error)?.message ?? "Erro ao carregar personagens"}</p>
      <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
    </div>
  );

  /* ── Modal de criação/edição ─────────────────────────────── */
  const PhotoSection = (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
      <div className="flex items-center gap-3">
        {/* Preview */}
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border bg-muted shrink-0 flex items-center justify-center">
          {currentPhoto
            ? <img src={currentPhoto} alt="foto" className="w-full h-full object-cover" />
            : <Camera className="h-6 w-6 text-muted-foreground/40" />}
        </div>
        <div className="flex-1">
          <Label className="font-medium text-sm mb-2 block">Como gerar a imagem?</Label>
          <div className="flex flex-col gap-1.5">
            {/* Opção 1: Transformar foto com IA — destaque (só aparece em criação) */}
            {!editingAvatar && (
              <button
                type="button"
                onClick={() => { fileModeIntentRef.current = "transform"; fileInputRef.current?.click(); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors text-left ${
                  photoMode === "transform"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-primary/40 text-foreground bg-primary/5 hover:bg-primary/10"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Minha foto + IA</strong>
                  <span className={`block ${photoMode === "transform" ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    Envie uma foto e a IA transforma no estilo escolhido
                  </span>
                </span>
              </button>
            )}
            {/* Opção 2: Gerar com IA por descrição */}
            <button
              type="button"
              onClick={() => setPhotoMode(photoMode === "generate" ? null : "generate")}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors text-left ${
                photoMode === "generate"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <Wand2 className="h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Gerar por descrição</strong>
                <span className={`block ${photoMode === "generate" ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  Descreva e a IA cria do zero (Imagen 3)
                </span>
              </span>
            </button>
            {/* Opções secundárias numa linha */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {professional?.photo_url && (
                <button
                  type="button"
                  onClick={() => setPhotoMode(photoMode === "profile" ? null : "profile")}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    photoMode === "profile"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  👤 Minha foto do perfil
                </button>
              )}
              <button
                type="button"
                onClick={() => { fileModeIntentRef.current = "upload"; fileInputRef.current?.click(); }}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  photoMode === "upload"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <Upload className="h-3 w-3 inline mr-1" />Upload simples
              </button>
            </div>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {photoMode === "profile" && professional?.photo_url && (
        <p className="text-xs text-primary">✓ Usando sua foto do perfil</p>
      )}
      {photoMode === "upload" && selectedFile && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground truncate flex-1">{selectedFile.name}</p>
          <button type="button" className="text-xs text-muted-foreground hover:text-destructive"
            onClick={() => { setSelectedFile(null); setPreviewUrl(null); setPhotoMode(null); }}>
            Remover
          </button>
        </div>
      )}
      {photoMode === "transform" && selectedFile && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground truncate flex-1">{selectedFile.name}</p>
            <button type="button" className="text-xs text-muted-foreground hover:text-destructive"
              onClick={() => { setSelectedFile(null); setPreviewUrl(null); setPhotoMode(null); }}>
              Remover
            </button>
          </div>
          <p className="text-xs text-primary bg-primary/5 rounded-lg px-2.5 py-1.5">
            ✨ A IA vai aplicar o estilo <strong>{STYLES.find(s => s.id === form.style)?.label}</strong> à sua foto mantendo a aparência (~30s)
          </p>
        </div>
      )}
      {photoMode === "transform" && !selectedFile && (
        <p className="text-xs text-muted-foreground">Clique em "Minha foto + IA" para selecionar a foto</p>
      )}
      {photoMode === "generate" && (
        <div className="space-y-1">
          <Label className="text-xs font-medium">
            Descrição visual <span className="text-muted-foreground">(aparência, roupa, expressão)</span>
          </Label>
          <Textarea
            rows={2}
            placeholder={`Ex: mulher 35 anos, cabelos cacheados, sorriso acolhedor — estilo ${STYLES.find(s => s.id === form.style)?.label}`}
            value={form.generation_prompt}
            onChange={(e) => setForm(f => ({ ...f, generation_prompt: e.target.value }))}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Personagens</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Crie personagens para usar em vídeos e artigos
          </p>
        </div>

        <Dialog open={open} onOpenChange={(v) => { if (!v) resetModal(); setOpen(v); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Personagem</Button>
          </DialogTrigger>
          <DialogContent
            className="max-w-lg max-h-[90vh] overflow-y-auto"
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{editingAvatar ? `Editar — ${editingAvatar.name}` : "Criar Personagem"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pb-2">
              {/* Nome */}
              <div className="space-y-1">
                <Label>Nome <span className="text-destructive">*</span></Label>
                <Input placeholder="Ex: Carneirinho, Dra. Ana..." value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              {/* Idade */}
              <div className="space-y-1">
                <Label>Idade <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input type="number" placeholder="30" min={1} max={120} value={form.age}
                  onChange={e => setForm(f => ({ ...f, age: e.target.value }))} />
              </div>

              {/* Personalidade */}
              <div className="space-y-1">
                <Label>Personalidade</Label>
                <Input placeholder="Ex: Empática, calma, acolhedora" value={form.personality}
                  onChange={e => setForm(f => ({ ...f, personality: e.target.value }))} />
              </div>

              {/* Backstory */}
              <div className="space-y-1">
                <Label>Backstory / História</Label>
                <Textarea rows={2} value={form.backstory}
                  placeholder="Ex: Ajuda pessoas a encontrar o caminho certo para curas emocionais..."
                  onChange={e => setForm(f => ({ ...f, backstory: e.target.value }))} />
              </div>

              {/* Estilo */}
              <div className="space-y-1.5">
                <Label className="font-medium">Estilo Visual</Label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map(s => (
                    <button key={s.id} type="button"
                      onClick={() => setForm(f => ({ ...f, style: s.id }))}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors flex items-center gap-1 ${
                        form.style === s.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}>
                      {s.emoji} {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {PhotoSection}

              {/* Botão */}
              {photoMode === "generate" ? (
                <Button onClick={handleGenerate}
                  disabled={generating || !form.name.trim() || !form.generation_prompt.trim()}
                  className="w-full">
                  {generating
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{retryAttempt > 0 ? `Servidor ocupado, tentativa ${retryAttempt + 1}/3...` : "Gerando com IA..."}</>
                    : <><Wand2 className="h-4 w-4 mr-2" />{editingAvatar ? "Gerar nova foto e salvar" : "Gerar Avatar com IA"}</>}
                </Button>
              ) : photoMode === "transform" ? (
                <Button onClick={handleTransform}
                  disabled={saving || !form.name.trim() || !selectedFile}
                  className="w-full">
                  {saving
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{retryAttempt > 0 ? `Servidor ocupado, tentativa ${retryAttempt + 1}/3...` : "Transformando com IA (~30s)..."}</>
                    : <><Sparkles className="h-4 w-4 mr-2" />{selectedFile ? "Transformar foto e criar avatar" : "Selecione uma foto acima"}</>}
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="w-full">
                  {saving
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                    : editingAvatar ? "Salvar alterações" : "Salvar Personagem"}
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
          <p className="text-sm text-muted-foreground">Crie personagens para usar como narradores nos seus vídeos e artigos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {avatars.map(av => (
            <Card key={av.id} className="group relative overflow-hidden">
              <CardContent className="p-0">
                {/* Foto — clica para ampliar */}
                <button
                  className="w-full aspect-square bg-muted flex items-center justify-center overflow-hidden relative"
                  onClick={() => av.photo_url && setEnlargedAvatar(av)}
                  title={av.photo_url ? "Ampliar foto" : undefined}
                >
                  {av.photo_url
                    ? <img src={av.photo_url} alt={av.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    : <Camera className="h-10 w-10 text-muted-foreground/40" />}
                  {av.photo_url && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                    </div>
                  )}
                </button>

                {/* Info */}
                <div className="p-3 space-y-1">
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-semibold text-sm leading-tight truncate flex-1">{av.name}</p>
                    {av.is_generated && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">IA</Badge>}
                  </div>
                  {av.age && <p className="text-xs text-muted-foreground">{av.age} anos</p>}
                  <p className="text-xs text-muted-foreground">
                    {STYLES.find(s => s.id === av.style)?.emoji} {STYLES.find(s => s.id === av.style)?.label ?? av.style}
                  </p>
                  {av.personality && <p className="text-xs text-muted-foreground line-clamp-2">{av.personality}</p>}
                </div>

                {/* Ações no hover */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                  <Button size="icon" variant="secondary" className="h-7 w-7" title="Editar"
                    onClick={() => openEdit(av)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="secondary" className="h-7 w-7" title="Clonar"
                    onClick={() => handleClone(av)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {av.photo_url && (
                    <Button size="icon" variant="secondary" className="h-7 w-7" title="Gerar variação"
                      onClick={() => { setStyleGenAvatar(av); setStyleGenStyle("profissional"); }}>
                      <Sparkles className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="icon" variant="destructive" className="h-7 w-7" title="Excluir"
                    onClick={() => handleDelete(av)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de geração de estilo */}
      <Dialog open={!!styleGenAvatar} onOpenChange={o => !o && setStyleGenAvatar(null)}>
        <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Gerar Variação — {styleGenAvatar?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pb-2">
            {styleGenAvatar?.photo_url && (
              <div className="flex items-center gap-3">
                <img src={styleGenAvatar.photo_url} alt="" className="w-14 h-14 rounded-full object-cover border" />
                <p className="text-sm text-muted-foreground">
                  A IA vai gerar uma nova versão estética mantendo a aparência original.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Escolha o estilo</Label>
              <div className="flex flex-wrap gap-1.5">
                {STYLES.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => setStyleGenStyle(s.id)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors flex items-center gap-1 ${
                      styleGenStyle === s.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}>
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              ⏱ A geração leva ~30 segundos. O resultado será salvo como um novo personagem na lista.
            </p>
            <Button onClick={handleStyleGen} disabled={styleGenerating} className="w-full">
              {styleGenerating
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{retryAttempt > 0 ? `Servidor ocupado, tentativa ${retryAttempt + 1}/3...` : "Gerando com IA (~30s)..."}</>
                : <><RefreshCw className="h-4 w-4 mr-2" />Gerar variação {STYLES.find(s => s.id === styleGenStyle)?.label}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de imagem ampliada */}
      <Dialog open={!!enlargedAvatar} onOpenChange={o => !o && setEnlargedAvatar(null)}>
        <DialogContent className="max-w-xl p-2">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="truncate">{enlargedAvatar?.name}</DialogTitle>
          </DialogHeader>
          {enlargedAvatar?.photo_url && (
            <div className="space-y-3 px-2 pb-4">
              <img
                src={enlargedAvatar.photo_url}
                alt={enlargedAvatar.name}
                className="w-full rounded-xl object-contain max-h-[70vh]"
              />
              <div className="px-2 space-y-1 text-sm text-muted-foreground">
                {enlargedAvatar.age && <p>{enlargedAvatar.age} anos · {STYLES.find(s => s.id === enlargedAvatar.style)?.label}</p>}
                {enlargedAvatar.personality && <p>{enlargedAvatar.personality}</p>}
                {enlargedAvatar.backstory && <p className="line-clamp-3">{enlargedAvatar.backstory}</p>}
              </div>
              <div className="flex gap-2 px-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEnlargedAvatar(null); openEdit(enlargedAvatar); }}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEnlargedAvatar(null); handleClone(enlargedAvatar); }}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Clonar
                </Button>
              </div>
              {enlargedAvatar.photo_url && (
                <Button size="sm" className="mx-2"
                  onClick={() => { setStyleGenAvatar(enlargedAvatar); setStyleGenStyle("profissional"); setEnlargedAvatar(null); }}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Gerar Variação de Estilo
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

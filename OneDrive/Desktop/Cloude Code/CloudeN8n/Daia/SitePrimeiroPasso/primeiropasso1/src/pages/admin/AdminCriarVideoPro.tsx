import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useProfessional } from "@/hooks/useProfessional";
import PublishPanel from "@/components/dashboard/PublishPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Crown, Loader2, CheckCircle2, AlertCircle,
  ChevronRight, ChevronLeft, ChevronDown, Mic, Monitor, Smartphone,
  Circle, Square, RotateCcw, Sparkles,
  ImagePlus, X, ArrowUp, ArrowDown, Film,
  Camera, Info, Plus, Trash2,
} from "lucide-react";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

const EDGE_VOICES = [
  { id: "pt-BR-FranciscaNeural", label: "Francisca", gender: "Feminina" },
  { id: "pt-BR-ThalitaNeural",   label: "Thalita",   gender: "Feminina, jovem" },
  { id: "pt-BR-AntonioNeural",   label: "Antônio",   gender: "Masculina" },
];

// Etapas internas: 1=Visual, 2=Config, 3=Gerar (correspondem aos steps 2, 3, 4 globais)
type InternalStep = 1 | 2 | 3;
type ModoVisual   = "avatar" | "fotos" | "ia_fast" | "ia_pro";
type EstiloIA     = "cinematico" | "realista" | "animacao" | "pixar" | "paisagem" | "neon" | "minimalista" | "vintage" | "motion_graphics" | "dramatico" | "aquarela" | "espaco";
type VoiceMode    = "edge" | "gravacao" | "elevenlabs";

const ESTILOS: Record<EstiloIA, { icon: string; label: string; desc: string }> = {
  cinematico:      { icon: "🎬", label: "Cinemático",    desc: "Luz dramática, bokeh" },
  realista:        { icon: "📸", label: "Realista",       desc: "8K, natural" },
  animacao:        { icon: "🎨", label: "Animação",       desc: "Cartoon 2D" },
  pixar:           { icon: "✨", label: "Pixar",          desc: "3D animado" },
  paisagem:        { icon: "🌿", label: "Paisagens",      desc: "Natureza, épico" },
  neon:            { icon: "🌃", label: "Neon",           desc: "Cyberpunk, néon" },
  minimalista:     { icon: "⬜", label: "Minimalista",    desc: "Geometria limpa" },
  vintage:         { icon: "📽️", label: "Vintage",        desc: "Grão de filme" },
  motion_graphics: { icon: "📊", label: "Motion Graphics",desc: "Infográfico" },
  dramatico:       { icon: "⚫", label: "Dramático",      desc: "Noir, sombras" },
  aquarela:        { icon: "🖌️", label: "Aquarela",       desc: "Pintura artística" },
  espaco:          { icon: "🚀", label: "Espaço / Sci-Fi",desc: "Galáxia, épico" },
};

type Slide = {
  indice: number;
  texto_legenda: string;
  narracao_slide: string;
  visual_prompt: string;
  duracao_s: number;
};

type Roteiro = {
  titulo: string;
  narracao: string;
  cta: string;
  slides: Slide[];
};

type JobStatus = {
  status: "idle" | "processing" | "done" | "error" | "cancelled";
  progress?: number;
  step?: string;
  video_url?: string;
  video_id?: string;
  titulo?: string;
  message?: string;
  fallback_used?: boolean;
};

const STORAGE_KEY_PRO = "pp-criar-video-pro";

function loadSavedPro() {
  try {
    const s = localStorage.getItem(STORAGE_KEY_PRO);
    if (!s) return null;
    const parsed = JSON.parse(s);
    const status = parsed?.jobStatus?.status;
    // Descarta estados terminais ou transitórios sem jobId (travados)
    const orphan = status === "processing" && !parsed?.activeJobId;
    if (["cancelled", "error"].includes(status) || orphan) {
      localStorage.removeItem(STORAGE_KEY_PRO);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function estimarCusto(modo: ModoVisual, slides: Slide[]) {
  const dur = slides.reduce((acc, s) => acc + (s.duracao_s || 6), 0);
  const usdRate = modo === "ia_pro" ? 0.40 : 0.15;
  const brl = dur * usdRate * 5.8;
  const tempo = { avatar: "4–8 min", fotos: "3–6 min", ia_fast: "5–10 min", ia_pro: "15–30 min" }[modo];
  return { brl: `~R$ ${brl.toFixed(0)}`, tempo, dur };
}

// ── Gravador de voz ────────────────────────────────────────────────────────────
function VoiceRecorder({ onRecorded, label, hint }: {
  onRecorded: (blob: Blob) => void;
  label: string;
  hint?: string;
}) {
  const [state, setState]       = useState<"idle" | "recording" | "done">("idle");
  const [seconds, setSeconds]   = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRef  = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { timerRef.current && clearInterval(timerRef.current); }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        onRecorded(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stop = () => {
    mediaRef.current?.stop();
    timerRef.current && clearInterval(timerRef.current);
    setState("done");
  };

  const reset = () => { setAudioUrl(null); setState("idle"); setSeconds(0); };
  const fmt   = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border-2 border-dashed border-purple-400/40 bg-purple-50/30 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {state === "idle" && (
        <Button onClick={start} variant="outline" className="w-full gap-2">
          <Circle className="h-4 w-4 text-red-500 fill-red-500" /> Iniciar Gravação
        </Button>
      )}
      {state === "recording" && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-red-500 font-mono text-lg font-bold animate-pulse">
            <Circle className="h-3 w-3 fill-red-500" /> {fmt(seconds)}
          </div>
          <Button onClick={stop} variant="destructive" className="w-full gap-2">
            <Square className="h-4 w-4" /> Parar Gravação
          </Button>
        </div>
      )}
      {state === "done" && audioUrl && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" /> Gravação concluída ({fmt(seconds)})
          </div>
          <audio src={audioUrl} controls className="w-full h-8" />
          <Button onClick={reset} variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5" /> Gravar novamente
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function AdminCriarVideoPro() {
  const { data: professional, isLoading: professionalLoading } = useProfessional();
  const location = useLocation();
  const navigate = useNavigate();

  // location.state tem prioridade (navegação fresca do AdminCriarVideo)
  // senão restaura do localStorage
  const locationState = location.state as { roteiro?: Roteiro } | null;
  const saved = useRef(locationState?.roteiro ? null : loadSavedPro()).current;

  const [roteiro, setRoteiro]   = useState<Roteiro | null>(locationState?.roteiro ?? saved?.roteiro ?? null);
  const [step, setStep]         = useState<InternalStep>(saved?.step ?? 1);
  const [modoVisual, setModoVisual] = useState<ModoVisual>(saved?.modoVisual ?? "ia_fast");
  const [estiloIA, setEstiloIA]     = useState<EstiloIA>(saved?.estiloIA ?? "cinematico");
  const [voiceMode, setVoiceMode]   = useState<VoiceMode>(saved?.voiceMode ?? "edge");
  const [edgeVoice, setEdgeVoice]   = useState<string>(saved?.edgeVoice ?? "pt-BR-FranciscaNeural");
  const [format, setFormat]         = useState<"portrait" | "landscape">(saved?.format ?? "portrait");
  const [jobStatus, setJobStatus]   = useState<JobStatus>(saved?.jobStatus ?? { status: "idle" });
  const [activeJobId, setActiveJobId] = useState<string | null>(saved?.activeJobId ?? null);
  const [localElapsed, setLocalElapsed] = useState<number>(saved?.jobStatus?.elapsed_seconds ?? 0);
  const [draftId, setDraftId]       = useState<string | null>(saved?.draftId ?? null);
  const [draftSaved, setDraftSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [showPublish, setShowPublish] = useState(true);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Arquivos não persistem (blobs/File não são serializáveis)
  const [avatarPhoto, setAvatarPhoto]               = useState<File | null>(null);
  const [avatarPhotoPreview, setAvatarPhotoPreview] = useState<string | null>(null);
  const [previewClipUrl, setPreviewClipUrl]         = useState<string | null>(null);
  const [previewLoading, setPreviewLoading]         = useState(false);
  const [frameImages, setFrameImages]               = useState<{ file: File; preview: string }[]>([]);
  const [voiceBlob, setVoiceBlob]   = useState<Blob | null>(null);
  const [narBlob, setNarBlob]       = useState<Blob | null>(null);

  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const avatarInputRef  = useRef<HTMLInputElement>(null);
  const [avatarImgError, setAvatarImgError] = useState(false);

  // Persiste estado serializável no localStorage.
  // "processing" sem activeJobId é transitório — não persiste para não travar a tela.
  useEffect(() => {
    try {
      const isOrphanProcessing = jobStatus.status === "processing" && !activeJobId;
      const persistedJobStatus = isOrphanProcessing ? { status: "idle" } : jobStatus;
      localStorage.setItem(STORAGE_KEY_PRO, JSON.stringify({
        step, roteiro, modoVisual, estiloIA, voiceMode, edgeVoice, format,
        jobStatus: persistedJobStatus, activeJobId, draftId,
      }));
    } catch {}
  }, [step, roteiro, modoVisual, estiloIA, voiceMode, edgeVoice, format, jobStatus, activeJobId]);

  // Auto-save do roteiro editado no Supabase (debounce 1.5s, somente no step 2)
  useEffect(() => {
    if (!roteiro || !professional?.slug || step !== 2) return;
    setDraftSaved("saving");
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/salvar-rascunho`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            professional_slug: professional.slug,
            roteiro,
            format,
            draft_id: draftId ?? undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.draft_id) setDraftId(data.draft_id);
          setDraftSaved("saved");
          setTimeout(() => setDraftSaved("idle"), 2500);
        } else {
          setDraftSaved("idle");
        }
      } catch {
        setDraftSaved("idle");
      }
    }, 1500);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [roteiro]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preenche CTA automaticamente se veio vazio (manual ou localStorage antigo)
  useEffect(() => {
    if (!roteiro || roteiro.cta) return;
    const slug = professional?.slug;
    const link = slug ? `primeiropasso.online/${slug}` : "primeiropasso.online";
    const cta  = `Dê o Primeiro Passo. Agende seu horário. 👉 ${link}`;
    setRoteiro((r) => r ? { ...r, cta } : r);
  }, [professional?.full_name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retoma polling se voltar com job em andamento
  useEffect(() => {
    if (activeJobId && saved?.jobStatus?.status === "processing") {
      startStopwatch(saved?.jobStatus?.elapsed_seconds ?? 0);
      pollStatus(activeJobId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { stopPolling(); stopStopwatch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopPolling   = () => { if (pollRef.current)    { clearInterval(pollRef.current);    pollRef.current    = null; } };
  const stopStopwatch = () => { if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; } };

  const startStopwatch = (init = 0) => {
    stopStopwatch();
    setLocalElapsed(init);
    elapsedRef.current = setInterval(() => setLocalElapsed((s) => s + 1), 1000);
  };

  const pollStatus = (id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await (await fetch(`${API}/status/${id}`)).json();
        setJobStatus(data);
        if (["done", "error", "cancelled"].includes(data.status)) {
          stopPolling(); stopStopwatch();
          if (data.status === "done") toast.success("Vídeo PRO criado com sucesso!");
          if (data.status === "error") toast.error("Erro: " + data.message);
        }
      } catch {
        stopPolling();
        setJobStatus({ status: "error", message: "Erro de conexão" });
      }
    }, 3000);
  };

  const updateSlide = (i: number, field: keyof Slide, value: string | number) => {
    if (!roteiro?.slides) return;
    const slides = [...roteiro.slides];
    slides[i] = { ...slides[i], [field]: value };
    setRoteiro({ ...roteiro, slides });
  };

  const handleAvatarPhotoChange = (file: File) => {
    setAvatarPhoto(file);
    setAvatarPhotoPreview(URL.createObjectURL(file));
    setAvatarImgError(false);
    setPreviewClipUrl(null);
  };

  const handlePreviewAvatar = async () => {
    if (!professional?.slug) return;
    setPreviewLoading(true);
    try {
      const form = new FormData();
      form.append("professional_slug", professional.slug);
      if (avatarPhoto) form.append("photo", avatarPhoto);
      const res = await fetch(`${API}/preview-avatar`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      setPreviewClipUrl(data.clip_url);
      toast.success("Preview gerado!");
    } catch (e: any) {
      toast.error(e.message || "Preview avatar ainda não disponível");
    } finally { setPreviewLoading(false); }
  };

  const handleGerar = async () => {
    if (!professional?.slug || !roteiro) return;
    if (voiceMode === "gravacao" && !narBlob)     return toast.error("Grave o roteiro antes de gerar.");
    if (voiceMode === "elevenlabs" && !voiceBlob) return toast.error("Grave uma amostra de voz antes de gerar.");
    if (modoVisual === "fotos" && frameImages.length < 1) return toast.error("Adicione pelo menos 1 foto.");

    setJobStatus({ status: "processing", progress: 0, step: "Iniciando..." });
    startStopwatch(0);

    try {
      let narrationPath: string | null = null;
      let voiceId: string | null = null;
      let avatarPhotoUrl: string | null = professional?.photo_url ?? null;
      let frameImageUrls: string[] | null = null;

      if (modoVisual === "avatar" && avatarPhoto) {
        setJobStatus({ status: "processing", progress: 5, step: "Enviando foto do avatar..." });
        const form = new FormData();
        form.append("file", avatarPhoto);
        const res = await fetch(`${API}/upload-foto`, { method: "POST", body: form });
        if (res.ok) { const d = await res.json(); avatarPhotoUrl = d.url; }
      }

      if (modoVisual === "fotos" && frameImages.length > 0) {
        setJobStatus({ status: "processing", progress: 5, step: "Enviando fotos..." });
        const form = new FormData();
        frameImages.forEach((img) => form.append("files", img.file));
        const res = await fetch(`${API}/upload-imagens`, { method: "POST", body: form });
        if (res.ok) { const d = await res.json(); frameImageUrls = d.paths; }
      }

      if (voiceMode === "gravacao" && narBlob) {
        setJobStatus({ status: "processing", progress: 8, step: "Enviando gravação..." });
        const form = new FormData();
        form.append("audio", narBlob, "narracao.webm");
        const res = await fetch(`${API}/upload-narracao`, { method: "POST", body: form });
        if (res.ok) { const d = await res.json(); narrationPath = d.path; }
      }

      if (voiceMode === "elevenlabs" && voiceBlob) {
        setJobStatus({ status: "processing", progress: 8, step: "Clonando sua voz..." });
        const form = new FormData();
        form.append("audio", voiceBlob, "voice.webm");
        form.append("nome", professional?.full_name ?? "Profissional");
        const res = await fetch(`${API}/clone-voz`, { method: "POST", body: form });
        const d = await res.json();
        if (!res.ok) {
          const msg = d.detail || "Erro ao clonar voz";
          if (res.status === 402 || msg.toLowerCase().includes("plano") || msg.toLowerCase().includes("subscription")) {
            toast.error("Plano ElevenLabs não inclui clonagem. Selecione voz Automática ou grave o roteiro.", { duration: 8000 });
            setJobStatus({ status: "idle" });
            return;
          }
          throw new Error(msg);
        }
        voiceId = d.voice_id;
      }

      const res = await fetch(`${API}/gerar-video-pro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professional.slug,
          roteiro,
          modo: modoVisual,
          estilo: estiloIA,
          avatar_photo_url: avatarPhotoUrl,
          frame_image_urls: frameImageUrls,
          voice_mode: voiceMode,
          edge_voice: edgeVoice,
          elevenlabs_voice_id: voiceId,
          narration_audio_path: narrationPath,
          format,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Erro ${res.status}`);
      setActiveJobId(data.job_id);
      pollStatus(data.job_id);
    } catch (e: any) {
      setJobStatus({ status: "error", message: e.message || "Erro ao conectar à API" });
    }
  };

  const handleCancel = async () => {
    if (!activeJobId) return;
    try {
      await fetch(`${API}/cancelar-job/${activeJobId}`, { method: "POST" });
      setJobStatus({ status: "cancelled" });
      toast.info("Geração cancelada.");
    } catch { toast.error("Não foi possível cancelar."); }
  };

  const handleDownload = async (url: string, titulo: string) => {
    try {
      const blob = await fetch(url).then((r) => r.blob());
      const a    = document.createElement("a");
      a.href     = URL.createObjectURL(blob);
      a.download = `${titulo.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { toast.error("Erro ao baixar vídeo."); }
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY_PRO);
    navigate("/admin/criar-video");
  };

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const custo = roteiro?.slides?.length ? estimarCusto(modoVisual, roteiro.slides) : null;

  // ── Sem roteiro: redireciona de volta ─────────────────────────────────────────
  if (!roteiro) return (
    <div className="max-w-2xl mx-auto space-y-6 py-12 text-center">
      <Crown className="h-12 w-12 text-purple-300 mx-auto" />
      <div>
        <h2 className="text-xl font-semibold">Roteiro não encontrado</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Para criar um vídeo PRO, gere o roteiro primeiro e selecione o modelo PRO.
        </p>
      </div>
      <Button onClick={() => navigate("/admin/criar-video")} className="bg-purple-600 hover:bg-purple-700 text-white">
        <ChevronLeft className="mr-2 h-4 w-4" /> Ir para Criar Vídeo
      </Button>
    </div>
  );

  // ── Step Indicator (sempre mostra os 4 steps globais) ────────────────────────
  // Step 1 (Roteiro) = sempre feito ✓
  // Internal step 1 = global step 2 (Visual)
  // Internal step 2 = global step 3 (Config)
  // Internal step 3 = global step 4 (Gerar)
  const globalStep = step + 1; // internal 1→global 2, 2→3, 3→4

  const StepIndicator = () => (
    <div className="flex items-center gap-1.5 mb-8">
      {[
        { global: 1, label: "Roteiro" },
        { global: 2, label: "Visual" },
        { global: 3, label: "Config" },
        { global: 4, label: "Gerar" },
      ].map(({ global, label }, i) => {
        const isDone   = global < globalStep || global === 1;
        const isActive = global === globalStep;
        return (
          <div key={global} className="flex items-center gap-1.5">
            <div className={`flex items-center gap-1.5 ${isActive ? "text-purple-600 font-semibold" : isDone ? "text-green-500" : "text-muted-foreground"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                isActive ? "border-purple-600 bg-purple-600 text-white"
                  : isDone ? "border-green-500 bg-green-500 text-white"
                  : "border-muted-foreground"
              }`}>
                {isDone ? "✓" : global}
              </div>
              <span className="text-sm hidden sm:inline">{label}</span>
            </div>
            {i < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground mx-0.5" />}
          </div>
        );
      })}
    </div>
  );

  const Header = () => (
    <div className="flex items-center gap-3">
      <Crown className="h-7 w-7 text-purple-500 shrink-0" />
      <div>
        <h1 className="text-2xl font-bold">Estúdio PRO</h1>
        <p className="text-muted-foreground mt-0.5 text-sm truncate max-w-xs">
          {roteiro.titulo || "Vídeo com IA cinematográfica"}
        </p>
      </div>
    </div>
  );

  // ── Etapa 1 (global 2) — Modo Visual ─────────────────────────────────────────
  if (step === 1) return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Header />
      <StepIndicator />

      <Label className="text-base font-semibold">Modo Visual</Label>

      <div className="grid grid-cols-2 gap-3">
        {([
          { value: "fotos",   label: "Minhas Fotos",      emoji: "🖼️", desc: "Suas fotos animadas pela IA",    custo: "~R$ 3-5",   tempo: "3-6 min" },
          { value: "avatar",  label: "Avatar Falante",     emoji: "🎙️", desc: "Foto do perfil com lip-sync",   custo: "~R$ 4-6",   tempo: "4-8 min" },
          { value: "ia_fast", label: "IA Cinemático Fast", emoji: "⚡",  desc: "Cenas geradas por IA",          custo: "~R$ 3-4",   tempo: "5-10 min" },
          { value: "ia_pro",  label: "IA Cinemático Pro",  emoji: "🎬",  desc: "Cenas IA máxima qualidade",     custo: "~R$ 12-16", tempo: "15-30 min" },
        ] as const).map(({ value, label, emoji, desc, custo, tempo }) => (
          <Card key={value}
            className={`cursor-pointer border-2 transition-all ${modoVisual === value ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "border-border hover:border-purple-400/40"}`}
            onClick={() => setModoVisual(value)}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{emoji}</span>
                <p className="font-semibold text-sm">{label}</p>
              </div>
              <p className="text-xs text-muted-foreground">{desc}</p>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">{custo}</Badge>
                <Badge variant="secondary" className="text-xs">{tempo}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {modoVisual === "ia_pro" && (
        <div className="rounded-xl border border-amber-300/50 bg-amber-50/40 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-2.5 text-sm">
          <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-muted-foreground">
            Modo Pro usa <strong>Veo Standard</strong> — máxima qualidade, ideal para campanhas premium.
          </p>
        </div>
      )}

      {/* Estilo Visual */}
      <div className="space-y-3">
        <Label className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" /> Estilo Visual
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(ESTILOS) as [EstiloIA, typeof ESTILOS[EstiloIA]][]).map(([value, { icon, label, desc }]) => (
            <Card key={value}
              className={`cursor-pointer border-2 transition-all ${estiloIA === value ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "border-border hover:border-purple-400/40"}`}
              onClick={() => setEstiloIA(value)}>
              <CardContent className="p-2.5 text-center space-y-0.5">
                <p className="text-lg leading-none">{icon}</p>
                <p className="font-medium text-xs">{label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={() => navigate("/admin/criar-video")}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Voltar ao Roteiro
        </Button>
        <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" size="lg" onClick={() => setStep(2)}>
          Próximo <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  // ── Etapa 2 (global 3) — Config Visual ───────────────────────────────────────
  if (step === 2) return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Header />
      <StepIndicator />

      {/* ── Revisar Roteiro ─────────────────────────────────────────────────── */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between border-purple-200 hover:border-purple-400/60" size="sm">
            <span className="flex items-center gap-2 font-medium">
              <Film className="h-4 w-4 text-purple-500" />
              Revisar Roteiro
              <Badge variant="secondary" className="text-xs">{roteiro.slides?.length ?? 0} slides</Badge>
              {custo && (
                <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">
                  {custo.brl}
                </Badge>
              )}
              {draftSaved === "saving" && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                </span>
              )}
              {draftSaved === "saved" && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-normal">
                  <CheckCircle2 className="h-3 w-3" /> Salvo
                </span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          {/* Título */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Título</Label>
            <Input value={roteiro.titulo} onChange={(e) => setRoteiro({ ...roteiro, titulo: e.target.value })} />
          </div>

          {/* Slides */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Slides</Label>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7 border-purple-200"
                onClick={() => {
                  const newSlide: Slide = {
                    indice: (roteiro.slides?.length ?? 0) + 1,
                    texto_legenda: "",
                    narracao_slide: "",
                    visual_prompt: "",
                    duracao_s: 6,
                  };
                  setRoteiro({ ...roteiro, slides: [...(roteiro.slides ?? []), newSlide] });
                }}>
                <Plus className="h-3.5 w-3.5" /> Slide
              </Button>
            </div>

            <div className="space-y-3">
              {roteiro.slides?.map((slide, i) => (
                <div key={i} className="rounded-xl border-2 border-purple-100 bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <Input
                      value={slide.texto_legenda}
                      onChange={(e) => updateSlide(i, "texto_legenda", e.target.value)}
                      placeholder="Legenda do slide..."
                      className="flex-1 text-sm font-medium"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number" min={4} max={12} value={slide.duracao_s}
                        onChange={(e) => updateSlide(i, "duracao_s", Number(e.target.value))}
                        className="w-14 text-center text-sm"
                      />
                      <span className="text-xs text-muted-foreground">s</span>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-destructive/60 hover:text-destructive"
                        disabled={(roteiro.slides?.length ?? 0) <= 1}
                        onClick={() => {
                          const slides = roteiro.slides!
                            .filter((_, j) => j !== i)
                            .map((s, j) => ({ ...s, indice: j + 1 }));
                          setRoteiro({ ...roteiro, slides });
                        }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    rows={2}
                    value={slide.narracao_slide}
                    onChange={(e) => updateSlide(i, "narracao_slide", e.target.value)}
                    placeholder="Narração deste slide..."
                    className="resize-none text-sm text-muted-foreground"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">CTA (slide final)</Label>
            <Input value={roteiro.cta} onChange={(e) => setRoteiro({ ...roteiro, cta: e.target.value })} />
          </div>

          {/* Custo atualizado ao vivo */}
          {custo && (
            <div className="rounded-xl border border-purple-100 bg-purple-50/30 px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {roteiro.slides?.length ?? 0} slides · {custo.dur}s gerados
              </span>
              <span className="font-semibold text-purple-700">{custo.brl} · ~{custo.tempo}</span>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* ── Avatar Falante ── */}
      {modoVisual === "avatar" && (
        <div className="space-y-4">
          <Label className="text-base font-semibold">Foto do Avatar</Label>

          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-full border-2 border-purple-300 overflow-hidden bg-muted flex items-center justify-center shrink-0">
              {avatarPhotoPreview ? (
                <img src={avatarPhotoPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : professionalLoading ? (
                <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
              ) : professional?.photo_url && !avatarImgError ? (
                <img
                  src={professional.photo_url}
                  alt="Foto do perfil"
                  className="w-full h-full object-cover"
                  onError={() => setAvatarImgError(true)}
                />
              ) : (
                <Camera className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {avatarPhotoPreview
                  ? "Foto personalizada selecionada."
                  : professional?.photo_url && !avatarImgError
                  ? "Usando sua foto de perfil atual."
                  : "Nenhuma foto de perfil. Faça upload abaixo."}
              </p>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarPhotoChange(f); e.target.value = ""; }}
              />
              <Button
                variant="outline" size="sm" className="gap-2"
                onClick={() => avatarInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" /> Usar outra foto
              </Button>
              {avatarPhotoPreview && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground text-xs"
                  onClick={() => { setAvatarPhoto(null); setAvatarPhotoPreview(null); setPreviewClipUrl(null); }}>
                  <RotateCcw className="h-3.5 w-3.5" /> Usar foto do perfil
                </Button>
              )}
            </div>
          </div>

          <Button
            variant="outline" className="w-full gap-2 border-purple-300 text-purple-600 hover:bg-purple-50"
            onClick={handlePreviewAvatar} disabled={previewLoading}
          >
            {previewLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando preview (4s)...</>
              : <><Sparkles className="h-4 w-4" /> Preview grátis (4s, sem áudio)</>}
          </Button>

          {previewClipUrl && (
            <video src={previewClipUrl} controls className="w-full max-w-xs mx-auto rounded-xl border shadow" />
          )}

          <div className="rounded-xl border border-purple-200/60 bg-purple-50/30 px-4 py-3 text-xs text-muted-foreground">
            <strong className="text-purple-600">Como funciona:</strong> A IA anima sua foto com lip-sync
            sincronizado à narração — movimento natural de cabeça, expressão empática e iluminação suave.
          </div>
        </div>
      )}

      {/* ── Minhas Fotos ── */}
      {modoVisual === "fotos" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">
              Suas Fotos{" "}
              <span className="text-sm font-normal text-muted-foreground">(3 a 8 fotos)</span>
            </Label>
            <Badge variant="outline" className="text-xs">
              {frameImages.length} foto{frameImages.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          <label className="flex flex-col items-center justify-center gap-2 w-full h-28 border-2 border-dashed border-purple-400/40 rounded-xl cursor-pointer hover:bg-purple-50/30 transition-all text-sm text-muted-foreground">
            <ImagePlus className="h-6 w-6 text-purple-400" />
            <span>Clique para adicionar fotos</span>
            <input
              type="file" multiple accept="image/*" className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                const newImgs = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
                setFrameImages((prev) => [...prev, ...newImgs].slice(0, 8));
                e.target.value = "";
              }}
            />
          </label>

          {frameImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Ordem define sequência dos slides.</p>
              <div className="grid grid-cols-3 gap-2">
                {frameImages.map((img, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden aspect-square border-2 border-purple-100">
                    <img src={img.preview} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-1">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-white" disabled={i === 0}
                          onClick={() => { const imgs = [...frameImages]; [imgs[i - 1], imgs[i]] = [imgs[i], imgs[i - 1]]; setFrameImages(imgs); }}>
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-white" disabled={i === frameImages.length - 1}
                          onClick={() => { const imgs = [...frameImages]; [imgs[i], imgs[i + 1]] = [imgs[i + 1], imgs[i]]; setFrameImages(imgs); }}>
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400"
                        onClick={() => setFrameImages(frameImages.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="absolute top-1 left-1 bg-purple-600/80 text-white text-xs rounded px-1.5 py-0.5 font-medium">{i + 1}</span>
                    {roteiro?.slides?.[i] && (
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-1 truncate">
                        {roteiro.slides[i].texto_legenda}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {frameImages.length < 3 && frameImages.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Adicione pelo menos 3 fotos para cobrir todos os slides.
            </div>
          )}
        </div>
      )}

      {/* ── IA Cinemático ── */}
      {(modoVisual === "ia_fast" || modoVisual === "ia_pro") && roteiro?.slides && (
        <div className="space-y-3">
          <Label className="text-base font-semibold">
            Prompts Visuais{" "}
            <span className="text-sm font-normal text-muted-foreground">(editáveis)</span>
          </Label>
          <p className="text-xs text-muted-foreground">Estes prompts guiam a geração de cada cena pela IA.</p>
          <div className="space-y-3">
            {roteiro.slides.map((slide, i) => (
              <div key={i} className="rounded-xl border-2 border-purple-100 bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-xs font-bold flex items-center justify-center shrink-0">
                    {slide.indice}
                  </span>
                  <p className="text-sm font-medium flex-1 truncate">{slide.texto_legenda}</p>
                  <Badge variant="secondary" className="text-xs shrink-0">{slide.duracao_s}s</Badge>
                </div>
                <Textarea
                  rows={2}
                  value={slide.visual_prompt}
                  onChange={(e) => updateSlide(i, "visual_prompt", e.target.value)}
                  className="resize-none text-xs font-mono text-muted-foreground"
                  placeholder="Prompt visual para esta cena..."
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Button
          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" size="lg"
          disabled={modoVisual === "fotos" && frameImages.length < 1}
          onClick={() => setStep(3)}
        >
          Próximo — Voz e Gerar <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  // ── Etapa 3 (global 4) — Voz e Gerar ─────────────────────────────────────────
  const isProcessing = jobStatus.status === "processing";
  const isDone       = jobStatus.status === "done";
  const isError      = jobStatus.status === "error";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Header />
      <StepIndicator />

      {/* Processing */}
      {isProcessing && (
        <Card className="border-purple-200">
          <CardContent className="py-10 flex flex-col items-center gap-5">
            <div className="relative">
              <Crown className="h-12 w-12 text-purple-300" />
              <Loader2 className="h-6 w-6 text-purple-600 animate-spin absolute -bottom-1 -right-1" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">Gerando vídeo PRO...</p>
              <p className="text-muted-foreground mt-1 text-sm">{jobStatus.step}</p>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${jobStatus.progress || 0}%` }} />
            </div>
            <div className="w-full grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-muted/60 px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1">Tempo decorrido</p>
                <p className="font-mono font-bold text-xl tabular-nums">{fmtTime(localElapsed)}</p>
              </div>
              <div className="rounded-xl bg-muted/60 px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1">Estimativa</p>
                <p className="font-mono font-bold text-xl tabular-nums">{custo?.tempo ?? "..."}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground/60 text-center">
              Pode navegar e voltar — o vídeo continuará sendo gerado
            </p>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleCancel}>
              <X className="h-4 w-4" /> Cancelar geração
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Done */}
      {isDone && (
        <>
        <Card className="border-green-200">
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <div className="text-center">
              <p className="font-semibold text-lg">Vídeo PRO criado com sucesso!</p>
              <p className="text-muted-foreground mt-1 text-sm">{jobStatus.titulo}</p>
              {jobStatus.fallback_used && (
                <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-amber-600">
                  <Info className="h-3.5 w-3.5" />
                  Usado fallback Pexels (Veo indisponível) — sem cobrança extra.
                </div>
              )}
            </div>
            {jobStatus.video_url && (
              <video src={jobStatus.video_url} controls className="w-full max-w-xs rounded-xl mt-2 shadow-lg" />
            )}
            <div className="flex gap-3 mt-2">
              {jobStatus.video_url && (
                <Button variant="outline" onClick={() => handleDownload(jobStatus.video_url!, jobStatus.titulo || "video-pro")}>
                  Baixar Vídeo
                </Button>
              )}
              <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleReset}>
                Criar Outro Vídeo
              </Button>
            </div>
          </CardContent>
        </Card>

        {showPublish && jobStatus.video_id && (
          <PublishPanel
            videoId={jobStatus.video_id}
            videoTitle={jobStatus.titulo ?? roteiro?.titulo ?? ""}
            videoDescription={null}
            videoUrl={jobStatus.video_url ?? null}
            onDismiss={() => setShowPublish(false)}
          />
        )}
        </>
      )}

      {/* Error */}
      {isError && (
        <Card className="border-destructive">
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <AlertCircle className="h-14 w-14 text-destructive" />
            <div className="text-center">
              <p className="font-semibold text-lg">Erro ao gerar vídeo</p>
              <p className="text-muted-foreground mt-1 text-sm">{jobStatus.message}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setJobStatus({ status: "idle" })}>Tentar novamente</Button>
              <Button variant="outline" onClick={handleReset}>Recomeçar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formulário de voz/formato */}
      {!isProcessing && !isDone && !isError && (
        <>
          {/* Voz */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Mic className="h-4 w-4" /> Voz da Narração
            </Label>

            <div className="grid grid-cols-3 gap-3">
              {([
                { value: "edge",       label: "Automática",    sub: "3 vozes pt-BR",    Icon: Mic },
                { value: "gravacao",   label: "Gravar Roteiro", sub: "Você lê o texto",  Icon: Circle },
                { value: "elevenlabs", label: "ElevenLabs",    sub: "~R$ 0,05/min",     Icon: Sparkles },
              ] as const).map(({ value, label, sub, Icon }) => (
                <Card key={value}
                  className={`cursor-pointer border-2 transition-all ${voiceMode === value ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "border-border hover:border-purple-400/40"}`}
                  onClick={() => setVoiceMode(value)}>
                  <CardContent className="p-3 text-center space-y-1">
                    <Icon className="h-5 w-5 mx-auto text-muted-foreground" />
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground">{sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {voiceMode === "edge" && (
              <div className="grid grid-cols-3 gap-3">
                {EDGE_VOICES.map((v) => (
                  <Card key={v.id}
                    className={`cursor-pointer border-2 transition-all ${edgeVoice === v.id ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "border-border hover:border-purple-400/40"}`}
                    onClick={() => setEdgeVoice(v.id)}>
                    <CardContent className="p-3 text-center">
                      <p className="font-medium text-sm">{v.label}</p>
                      <p className="text-xs text-muted-foreground">{v.gender}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {voiceMode === "gravacao" && roteiro && (
              <div className="space-y-3">
                <div className="rounded-lg bg-muted/50 border p-3 text-sm text-muted-foreground leading-relaxed max-h-36 overflow-y-auto">
                  {roteiro.narracao || roteiro.slides?.map((s) => s.narracao_slide).join(" ")}
                </div>
                <VoiceRecorder
                  onRecorded={setNarBlob}
                  label="Leia o texto acima em voz alta e grave aqui"
                  hint="Fale de forma clara e natural — esse áudio será a narração do vídeo."
                />
              </div>
            )}

            {voiceMode === "elevenlabs" && (
              <VoiceRecorder
                onRecorded={setVoiceBlob}
                label="Grave uma amostra da sua voz (mín. 30 segundos)"
                hint="Pode ler qualquer texto. O ElevenLabs vai clonar sua voz automaticamente."
              />
            )}
          </div>

          {/* Formato */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Formato</Label>
            <div className="grid grid-cols-2 gap-3">
              <Card className={`cursor-pointer border-2 transition-all ${format === "portrait" ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "border-border hover:border-purple-400/40"}`}
                onClick={() => setFormat("portrait")}>
                <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
                  <Smartphone className="h-5 w-5 text-purple-500" />
                  <p className="font-medium text-sm">Vertical 9:16</p>
                  <p className="text-xs text-muted-foreground">Reels · TikTok · Stories</p>
                </CardContent>
              </Card>
              <Card className={`cursor-pointer border-2 transition-all ${format === "landscape" ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "border-border hover:border-purple-400/40"}`}
                onClick={() => setFormat("landscape")}>
                <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
                  <Monitor className="h-5 w-5 text-purple-500" />
                  <p className="font-medium text-sm">Horizontal 16:9</p>
                  <p className="text-xs text-muted-foreground">YouTube · LinkedIn</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Estimativa de custo */}
          {custo && (
            <div className="rounded-xl border-2 border-purple-200 bg-purple-50/40 px-4 py-3 space-y-1.5">
              <p className="text-sm font-semibold text-purple-700 flex items-center gap-1.5">
                <Film className="h-4 w-4" /> Estimativa para este vídeo
              </p>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p>
                  Modo:{" "}
                  <strong className="text-foreground">
                    {{ avatar: "Avatar Falante", fotos: "Minhas Fotos", ia_fast: "IA Cinemático Fast", ia_pro: "IA Cinemático Pro" }[modoVisual]}
                  </strong>
                </p>
                <p>
                  {roteiro?.slides?.length ?? 0} slides · {custo.dur}s de{" "}
                  {modoVisual === "ia_pro" ? "Veo Standard" : "Veo Fast"}
                </p>
                <p className="text-base font-bold text-purple-700 mt-1">
                  {custo.brl} · ~{custo.tempo}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
              <ChevronLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
            <Button
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" size="lg"
              onClick={handleGerar}
            >
              <Crown className="mr-2 h-4 w-4" /> Gerar Vídeo PRO
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

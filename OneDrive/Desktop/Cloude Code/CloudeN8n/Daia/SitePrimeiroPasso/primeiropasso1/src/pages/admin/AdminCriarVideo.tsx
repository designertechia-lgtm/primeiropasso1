import { useState, useRef, useEffect, type ComponentType } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
  Film, Loader2, CheckCircle2, AlertCircle,
  ChevronRight, ChevronLeft, ChevronDown, Mic, Monitor, Smartphone,
  Circle, Square, RotateCcw, Sparkles, BookOpen,
  ImagePlus, X, ArrowUp, ArrowDown, Images, Wand2,
  Zap, Crown, Star, Minus, Triangle,
  Heart, BookOpenCheck, Flame, TrendingUp,
  Copy, Scissors, Download, Share2,
  Instagram, Youtube, Linkedin, Facebook,
} from "lucide-react";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.16 8.16 0 0 0 4.77 1.52V6.77a4.85 4.85 0 0 1-1-.08z"/>
    </svg>
  );
}

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";
const STORAGE_KEY = "pp-criar-video";

function loadSaved() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s);
    const status = parsed?.jobStatus?.status;
    // Descarta estados terminais ou transitórios travados
    if (["cancelled", "error", "loading"].includes(status)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

const EDGE_VOICES = [
  { id: "pt-BR-FranciscaNeural", label: "Francisca", gender: "Feminina" },
  { id: "pt-BR-ThalitaNeural",   label: "Thalita",   gender: "Feminina, jovem" },
  { id: "pt-BR-AntonioNeural",   label: "Antônio",   gender: "Masculina" },
];

type VoiceMode    = "edge" | "gravacao" | "elevenlabs";
type VideoModel   = "gratuito" | "premium" | "pro";
type EstiloIA     = "cinematico" | "realista" | "animacao" | "pixar" | "paisagem" | "neon" | "minimalista" | "vintage" | "motion_graphics" | "dramatico" | "aquarela" | "espaco";
type VisualStyle  = "images" | "animated" | "particles" | "lines" | "geometric" | "mixed";
type Tom          = "acolhedor" | "educativo" | "provocador" | "motivacional";
type Legenda   = { tempo: number; texto: string };
type Slide     = {
  indice: number;
  texto_legenda: string;
  narracao_slide: string;
  visual_prompt: string;
  duracao_s: number;
};
type Script    = {
  titulo: string;
  narracao: string;
  narracao_completa?: string;
  cta: string;
  legendas: Legenda[];
  slides?: Slide[];
  descricao_post?: string;
  descricao_instagram?: string;
  descricao_linkedin?: string;
  legenda_tiktok?: string;
};
type JobStatus = {
  status: "idle" | "loading" | "editing" | "processing" | "done" | "error" | "cancelled";
  progress?: number;
  step?: string;
  video_url?: string;
  video_id?: string;
  titulo?: string;
  message?: string;
  elapsed_seconds?: number;
};

type PlatformId = "tiktok" | "reels" | "stories_instagram" | "shorts" | "feed_instagram" | "linkedin" | "facebook" | "youtube";

const PLATFORMS: readonly {
  id: PlatformId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  format: string;
  maxS: number | null;
  idealS: number;
  desc: string;
}[] = [
  { id: "tiktok",            label: "TikTok",             icon: TikTokIcon, color: "text-gray-900 dark:text-white", format: "9:16", maxS: 60,   idealS: 30,  desc: "Vertical curto · até 60s"     },
  { id: "reels",             label: "Instagram Reels",    icon: Instagram,  color: "text-pink-500",                 format: "9:16", maxS: 90,   idealS: 30,  desc: "Vertical · até 90s"           },
  { id: "stories_instagram", label: "Instagram Stories",  icon: Instagram,  color: "text-pink-500",                 format: "9:16", maxS: 60,   idealS: 15,  desc: "Vertical · 15s · efêmero"     },
  { id: "shorts",            label: "YouTube Shorts",     icon: Youtube,    color: "text-red-500",                  format: "9:16", maxS: 60,   idealS: 45,  desc: "Vertical curto · até 60s"     },
  { id: "feed_instagram",    label: "Feed Instagram",     icon: Instagram,  color: "text-pink-500",                 format: "1:1",  maxS: 60,   idealS: 30,  desc: "Quadrado · até 60s"           },
  { id: "linkedin",          label: "LinkedIn",           icon: Linkedin,   color: "text-blue-600",                 format: "1:1",  maxS: 600,  idealS: 60,  desc: "Quadrado · 1-2min profissional"},
  { id: "facebook",          label: "Facebook",           icon: Facebook,   color: "text-blue-700",                 format: "9:16", maxS: 240,  idealS: 60,  desc: "Vertical · até 4min"          },
  { id: "youtube",           label: "YouTube",            icon: Youtube,    color: "text-red-500",                  format: "16:9", maxS: null, idealS: 120, desc: "Paisagem · sem limite"         },
];

type TrimState = { platformId: PlatformId; loading: boolean; resultUrl: string | null };

// ── Gravador reutilizável ────────────────────────────────────
function VoiceRecorder({
  onRecorded,
  label,
  hint,
}: {
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
    <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
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

// ── Página principal ─────────────────────────────────────────
export default function AdminCriarVideo() {
  const { data: professional } = useProfessional();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editVideoId = searchParams.get("edit");

  // Inicializa do localStorage para persistir entre navegações
  const saved = useRef(editVideoId ? null : loadSaved()).current;
  const [step, setStep]             = useState<1 | 2 | 3>(saved?.step ?? 1);
  const [objetivo, setObjetivo]     = useState<string>(saved?.objetivo ?? "");
  const [tom, setTom]               = useState<Tom>(saved?.tom ?? "acolhedor");
  const [iaLoading, setIaLoading]   = useState(false);
  const [script, setScript]         = useState<Script | null>(saved?.script ?? null);
  const [videoModel, setVideoModel] = useState<VideoModel>(saved?.videoModel ?? "gratuito");
  const [estiloIA, setEstiloIA]     = useState<EstiloIA>(saved?.estiloIA ?? "cinematico");
  const [voiceMode, setVoiceMode]   = useState<VoiceMode>(saved?.voiceMode ?? "edge");
  const [edgeVoice, setEdgeVoice]   = useState<string>(saved?.edgeVoice ?? "pt-BR-FranciscaNeural");
  const [voiceBlob, setVoiceBlob]   = useState<Blob | null>(null);
  const [narBlob, setNarBlob]       = useState<Blob | null>(null);
  const [imageMode, setImageMode]     = useState<"auto" | "custom">(saved?.imageMode ?? "auto");
  const [visualStyle, setVisualStyle] = useState<VisualStyle>(saved?.visualStyle ?? "images");
  const [userImages, setUserImages] = useState<{ file: File; preview: string }[]>([]);
  const [format, setFormat]         = useState<"portrait" | "landscape" | "square">(saved?.format ?? "portrait");
  const [jobStatus, setJobStatus]   = useState<JobStatus>(saved?.jobStatus ?? { status: "idle" });
  const [activeJobId, setActiveJobId] = useState<string | null>(saved?.activeJobId ?? null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [trimState, setTrimState]   = useState<TrimState | null>(null);
  const [avgSeconds, setAvgSeconds] = useState<number | null>(null);
  const [localElapsed, setLocalElapsed] = useState<number>(saved?.jobStatus?.elapsed_seconds ?? 0);
  const [draftId, setDraftId]       = useState<string | null>(saved?.draftId ?? null);
  const [draftSaved, setDraftSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [showPublish, setShowPublish] = useState(false);
  const [publishTrimData, setPublishTrimData] = useState<{ postType: "reels" | "feed"; videoUrl: string; description: string; videoId: string } | null>(null);
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const draftTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishTrimRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (publishTrimData) {
      setTimeout(() => publishTrimRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [publishTrimData]);

  // Salva estado no localStorage sempre que mudar.
  // "loading" é transitório — nunca persiste para não travar o botão no próximo acesso.
  useEffect(() => {
    try {
      const persistedJobStatus = jobStatus.status === "loading" ? { status: "idle" } : jobStatus;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        step, objetivo, tom, script, videoModel, estiloIA, voiceMode, edgeVoice, format, imageMode, visualStyle,
        jobStatus: persistedJobStatus, activeJobId, draftId,
      }));
    } catch {}
  }, [step, objetivo, tom, script, videoModel, estiloIA, voiceMode, edgeVoice, format, imageMode, visualStyle, jobStatus, activeJobId]);

  // Retoma polling se voltar com um vídeo ainda em processamento
  useEffect(() => {
    if (activeJobId && saved?.jobStatus?.status === "processing") {
      startStopwatch(saved?.jobStatus?.elapsed_seconds ?? 0);
      pollStatus(activeJobId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Para polling e cronômetro ao desmontar o componente
  useEffect(() => () => { stopPolling(); stopStopwatch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save do roteiro editado no Supabase (debounce 1.5s)
  useEffect(() => {
    if (!script || !professional?.slug || step !== 2) return;
    setDraftSaved("saving");
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/salvar-rascunho`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            professional_slug: professional.slug,
            roteiro: script,
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
  }, [script]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega roteiro existente quando abrindo em modo de reedição
  useEffect(() => {
    if (!editVideoId || !professional?.slug) return;
    fetch(`${API}/video-roteiro/${editVideoId}?professional_slug=${professional.slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.script_json) {
          setScript(data.script_json);
          setFormat(data.video_format ?? "portrait");
          setJobStatus({ status: "editing" });
          setStep(2);
          toast.info("Roteiro carregado — edite e regere o vídeo.");
        } else {
          toast.warning("Este vídeo não tem roteiro salvo. Crie um novo.");
        }
      })
      .catch(() => toast.error("Não foi possível carregar o roteiro."));
  }, [editVideoId, professional?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSugerirObjetivo = async () => {
    if (!professional?.slug) {
      toast.error("Perfil profissional não encontrado");
      return;
    }
    setIaLoading(true);
    const url = `${API}/sugerir-objetivo`;
    const toastId = toast.loading("IA analisando seu perfil e documentos...", { duration: 60000 });
    try {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ professional_slug: professional.slug, video_type: "objetivo_livre" }),
        });
      } catch {
        throw new Error(`API offline ou inacessível (${API})`);
      }

      if (res.status === 404) throw new Error(`Endpoint não encontrado — reinicie a video-api`);
      if (res.status === 422) throw new Error(`Dados inválidos enviados para a API (422)`);
      if (res.status === 500) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Erro interno na API: ${err.detail || err.message || "verifique os logs"}`);
      }
      if (!res.ok) {
        throw new Error(`Erro inesperado ${res.status} em ${url}`);
      }

      const data = await res.json();
      if (data.objetivo) {
        setObjetivo(data.objetivo);
        toast.success("Objetivo criado pela IA!", { id: toastId, duration: 2000 });
      }
    } catch (e: any) {
      toast.error(e.message || "Não foi possível gerar sugestão", { id: toastId, duration: 8000 });
    } finally {
      setIaLoading(false);
    }
  };

  const buildDefaultCta = () => {
    const slug = professional?.slug;
    const link = slug ? `primeiropasso.online/${slug}` : "primeiropasso.online";
    return `Dê o Primeiro Passo. Agende seu horário. 👉 ${link}`;
  };

  const handleManualRoteiro = () => {
    if (!objetivo.trim()) return;
    const cta = buildDefaultCta();
    if (videoModel === "pro") {
      localStorage.removeItem("pp-criar-video-pro");
      navigate("/admin/criar-video-pro", {
        state: {
          roteiro: { titulo: objetivo.trim(), narracao: "", cta, slides: [] },
          objetivo: objetivo.trim(),
          tom,
          plataforma: "geral",
        },
      });
      return;
    }
    setScript({
      titulo: objetivo.trim(),
      narracao: "",
      cta,
      legendas: [{ tempo: 0, texto: "" }],
    });
    setStep(2);
  };

  const handleNextStep = async () => {
    if (!professional?.slug || !objetivo.trim()) return;
    setJobStatus({ status: "loading" });
    try {
      const res = await fetch(`${API}/gerar-roteiro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professional.slug,
          tema_sugerido: objetivo.trim(),
          tom,
          plataforma: "geral",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      const data = await res.json();
      if (!data.cta) data.cta = buildDefaultCta();
      if (videoModel === "pro") {
        localStorage.removeItem("pp-criar-video-pro");
        navigate("/admin/criar-video-pro", {
          state: { roteiro: data, objetivo: objetivo.trim(), tom, plataforma: "geral" },
        });
        return;
      }
      setScript(data);
      setJobStatus({ status: "editing" });
      setStep(2);
    } catch (e: any) {
      setJobStatus({ status: "idle" });
      toast.error(e.message || "Não foi possível gerar o roteiro");
    }
  };

  const handleGenerate = async () => {
    if (!professional?.slug || !script) return;

    if (voiceMode === "gravacao" && !narBlob) {
      toast.error("Grave o roteiro antes de gerar o vídeo.");
      return;
    }
    if (voiceMode === "elevenlabs" && !voiceBlob) {
      toast.error("Grave uma amostra de voz antes de gerar o vídeo.");
      return;
    }

    setJobStatus({ status: "processing", progress: 0, step: "Iniciando..." });
    startStopwatch(0);
    setStep(3);
    fetch(`${API}/perf-stats`).then((r) => r.json()).then((d) => {
      if (d.avg > 0) setAvgSeconds(d.avg);
    }).catch(() => {});

    try {
      let voiceId: string | null = null;
      let narrationPath: string | null = null;
      let customImagePaths: string[] | null = null;

      // Upload imagens do usuário
      if (imageMode === "custom" && userImages.length > 0) {
        setJobStatus({ status: "processing", progress: 3, step: "Enviando imagens..." });
        const form = new FormData();
        userImages.forEach((img) => form.append("files", img.file));
        const res  = await fetch(`${API}/upload-imagens`, { method: "POST", body: form });
        const data = await res.json();
        customImagePaths = data.paths;
      }

      // Upload gravação do roteiro
      if (voiceMode === "gravacao" && narBlob) {
        setJobStatus({ status: "processing", progress: 5, step: "Enviando gravação..." });
        const form = new FormData();
        form.append("audio", narBlob, "narracao.webm");
        const res  = await fetch(`${API}/upload-narracao`, { method: "POST", body: form });
        const data = await res.json();
        narrationPath = data.path;
      }

      // Clonagem ElevenLabs
      if (voiceMode === "elevenlabs" && voiceBlob) {
        setJobStatus({ status: "processing", progress: 5, step: "Clonando sua voz..." });
        const form = new FormData();
        form.append("audio", voiceBlob, "voice.webm");
        form.append("nome", professional.full_name || "Profissional");
        const res  = await fetch(`${API}/clone-voz`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.detail || "Erro ao clonar voz";
          const isPlano = res.status === 402 || msg.toLowerCase().includes("plano") || msg.toLowerCase().includes("subscription");
          if (isPlano) {
            toast.error("Plano ElevenLabs não inclui clonagem de voz. Selecione voz Automática ou grave o roteiro.", { duration: 8000 });
            setJobStatus({ status: "idle" });
            setStep(2);
            return;
          }
          throw new Error(msg);
        }
        voiceId = data.voice_id;
      }

      const res = await fetch(`${API}/gerar-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professional.slug,
          video_type: "objetivo_livre",
          objetivo: objetivo.trim(),
          script,
          voice: edgeVoice,
          voice_provider: voiceMode,
          elevenlabs_voice_id: voiceId,
          narration_audio_path: narrationPath,
          custom_image_paths: customImagePaths,
          format,
          model: videoModel,
          visual_style: visualStyle,
          estilo_visual: estiloIA,
        }),
      });
      const data = await res.json();
      setActiveJobId(data.job_id);
      pollStatus(data.job_id);
    } catch (e: any) {
      setJobStatus({ status: "error", message: e.message || "Erro ao conectar à API" });
    }
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const stopStopwatch = () => {
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  };

  const startStopwatch = (initialSeconds = 0) => {
    stopStopwatch();
    setLocalElapsed(initialSeconds);
    elapsedRef.current = setInterval(() => setLocalElapsed((s) => s + 1), 1000);
  };

  const pollStatus = (id: string) => {
    stopPolling(); // garante que só um interval roda por vez
    pollRef.current = setInterval(async () => {
      try {
        const data = await (await fetch(`${API}/status/${id}`)).json();
        setJobStatus(data);
        if (data.status === "done" || data.status === "error" || data.status === "cancelled") {
          stopPolling();
          stopStopwatch();
          if (data.status === "done") toast.success("Vídeo criado com sucesso!");
          if (data.status === "error") toast.error("Erro: " + data.message);
        }
      } catch {
        stopPolling();
        setJobStatus({ status: "error", message: "Erro de conexão" });
      }
    }, 3000);
  };

  const handleCancel = async () => {
    if (!activeJobId) return;
    try {
      await fetch(`${API}/cancelar-job/${activeJobId}`, { method: "POST" });
      setJobStatus({ status: "cancelled" });
      toast.info("Geração cancelada.");
    } catch {
      toast.error("Não foi possível cancelar.");
    }
  };

  const handleDownload = async (url: string, titulo: string) => {
    try {
      const blob = await fetch(url).then((r) => r.blob());
      const a    = document.createElement("a");
      a.href     = URL.createObjectURL(blob);
      a.download = `${titulo.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Erro ao baixar vídeo.");
    }
  };

  const handleTrim = async (platform: typeof PLATFORMS[number]) => {
    if (!jobStatus.video_id) return;
    const end = videoDuration > 0 ? Math.min(videoDuration, platform.idealS) : platform.idealS;
    setTrimState({ platformId: platform.id, loading: true, resultUrl: null });
    try {
      const res = await fetch(`${API}/trim-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professional?.slug,
          video_id: jobStatus.video_id,
          start_time: 0,
          end_time: end,
          aspect_ratio: platform.format,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erro ao cortar vídeo");
      const trimJobId: string = data.job_id;
      await new Promise<void>((resolve, reject) => {
        const iv = setInterval(async () => {
          try {
            const s = await (await fetch(`${API}/status/${trimJobId}`)).json();
            if (s.status === "done") {
              setTrimState({ platformId: platform.id, loading: false, resultUrl: s.video_url });
              clearInterval(iv);
              resolve();
            } else if (s.status === "error" || s.status === "cancelled") {
              clearInterval(iv);
              reject(new Error(s.message || "Erro no corte"));
            }
          } catch (e) { clearInterval(iv); reject(e); }
        }, 3000);
      });
    } catch (e: any) {
      setTrimState({ platformId: platform.id, loading: false, resultUrl: null });
      toast.error(e.message || "Erro ao cortar vídeo");
    }
  };

  const handleReset = () => {
    setStep(1); setScript(null); setObjetivo("");
    setTom("acolhedor");
    setVideoModel("gratuito");
    setEstiloIA("cinematico");
    setVoiceMode("edge"); setEdgeVoice("pt-BR-FranciscaNeural");
    setVoiceBlob(null); setNarBlob(null);
    setImageMode("auto"); setVisualStyle("images"); setUserImages([]); setFormat("portrait");
    setJobStatus({ status: "idle" }); setActiveJobId(null);
    setTrimState(null); setVideoDuration(0);
    localStorage.removeItem(STORAGE_KEY);
  };

  const updateLegenda = (i: number, field: keyof Legenda, value: string | number) => {
    if (!script) return;
    const legendas = [...script.legendas];
    legendas[i] = { ...legendas[i], [field]: field === "tempo" ? Number(value) : value };
    setScript({ ...script, legendas });
  };

  const updateSlide = (i: number, field: keyof Slide, value: string | number) => {
    if (!script?.slides) return;
    const slides = [...script.slides];
    slides[i] = { ...slides[i], [field]: value };
    const legendas = [...script.legendas];
    if (field === "texto_legenda" && legendas[i]) {
      legendas[i] = { ...legendas[i], texto: value as string };
    }
    setScript({ ...script, slides, legendas });
  };

  const StepIndicator = () => (
    <div className="flex items-center gap-2 mb-8">
      {[{ n: 1, label: "Objetivo" }, { n: 2, label: "Revisar" }, { n: 3, label: "Gerar" }].map(({ n, label }, i) => (
        <div key={n} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 ${step === n ? "text-primary font-semibold" : step > n ? "text-green-500" : "text-muted-foreground"}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step === n ? "border-primary bg-primary text-white" : step > n ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground"}`}>
              {step > n ? "✓" : n}
            </div>
            <span className="text-sm hidden sm:inline">{label}</span>
          </div>
          {i < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );

  // ── Step 1 ─────────────────────────────────────────────────
  if (step === 1) return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Criar Vídeo</h1>
        <p className="text-muted-foreground mt-1">Descreva o objetivo e geramos roteiro, narração e imagens automaticamente.</p>
      </div>
      <StepIndicator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Sobre o que será este vídeo?</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-primary/40 text-primary hover:bg-primary/5 min-w-[130px]"
            onClick={handleSugerirObjetivo}
            disabled={iaLoading}
          >
            {iaLoading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Criando...</>
              : <><Wand2 className="h-3.5 w-3.5" /> Criar com IA</>}
          </Button>
        </div>

        <div className="relative">
          <Textarea
            rows={4} value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            placeholder="Descreva o objetivo do vídeo ou clique em 'Criar com IA' para gerar automaticamente..."
            className={`resize-none text-base transition-opacity ${iaLoading ? "opacity-40 pointer-events-none" : ""}`}
          />
          {iaLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md">
              <div className="flex items-center gap-2 bg-background/90 border border-primary/30 rounded-xl px-4 py-2.5 shadow-sm">
                <Wand2 className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm font-medium text-primary">IA analisando seu perfil...</span>
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          A IA usa seu perfil e documentos para criar um objetivo personalizado, sem repetir os dos últimos 30 dias.
        </p>
      </div>

      {/* Seletor de tom */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Tom da Narração</Label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: "acolhedor",    label: "Acolhedor",    desc: "Empático e seguro",     Icon: Heart },
            { value: "educativo",    label: "Educativo",    desc: "Claro e informativo",   Icon: BookOpenCheck },
            { value: "provocador",   label: "Provocador",   desc: "Questiona e desafia",   Icon: Flame },
            { value: "motivacional", label: "Motivacional", desc: "Energia e ação",        Icon: TrendingUp },
          ] as const).map(({ value, label, desc, Icon }) => (
            <Card key={value}
              className={`cursor-pointer border-2 transition-all ${tom === value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              onClick={() => setTom(value)}>
              <CardContent className="p-3 flex items-center gap-3">
                <Icon className={`h-5 w-5 shrink-0 ${tom === value ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Seletor de modelo */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Modelo de Geração</Label>
        <div className="grid grid-cols-3 gap-3">
          <Card
            className={`cursor-pointer border-2 transition-all ${videoModel === "gratuito" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setVideoModel("gratuito")}
          >
            <CardContent className="p-3 text-center space-y-1.5">
              <Zap className="h-5 w-5 mx-auto text-primary" />
              <p className="font-semibold text-sm">Gratuito</p>
              <p className="text-xs text-muted-foreground">Imagens Pexels</p>
              <Badge variant="secondary" className="text-xs">Grátis · ~2min</Badge>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer border-2 transition-all ${videoModel === "premium" ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20" : "border-border hover:border-amber-400/50"}`}
            onClick={() => setVideoModel("premium")}
          >
            <CardContent className="p-3 text-center space-y-1.5">
              <Star className="h-5 w-5 mx-auto text-amber-500" />
              <p className="font-semibold text-sm">Premium</p>
              <p className="text-xs text-muted-foreground">Vídeo IA (Kling AI)</p>
              <Badge variant="outline" className="text-xs border-amber-400 text-amber-600">~R$ 4,50/vídeo</Badge>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer border-2 transition-all ${videoModel === "pro" ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "border-border hover:border-purple-400/50"}`}
            onClick={() => setVideoModel("pro")}
          >
            <CardContent className="p-3 text-center space-y-1.5">
              <Crown className="h-5 w-5 mx-auto text-purple-500" />
              <p className="font-semibold text-sm">Pro</p>
              <p className="text-xs text-muted-foreground">Vídeo IA HD (Google Veo)</p>
              <Badge variant="outline" className="text-xs border-purple-400 text-purple-600">~R$ 18/vídeo</Badge>
            </CardContent>
          </Card>
        </div>
        {videoModel !== "gratuito" && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            {videoModel === "premium"
              ? "Gera clipes cinematográficos com Kling AI para cada slide · ~4-6min"
              : "Máxima qualidade · clipes HD gerados pelo Google Veo · ~8-15min"}
          </p>
        )}
      </div>

      <Button
        variant="outline"
        className="w-full gap-2 border-primary/40 text-primary hover:bg-primary/5"
        size="lg"
        disabled={!objetivo.trim()}
        onClick={handleManualRoteiro}>
        <BookOpen className="h-4 w-4" /> Vou criar meu próprio roteiro
      </Button>

      <Button className="w-full" size="lg"
        disabled={!objetivo.trim() || jobStatus.status === "loading"}
        onClick={handleNextStep}>
        {jobStatus.status === "loading"
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando roteiro...</>
          : <><ChevronRight className="mr-2 h-4 w-4" /> Gerar Roteiro com IA</>}
      </Button>
    </div>
  );

  // ── Step 2 ─────────────────────────────────────────────────
  if (step === 2 && !script) return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Criar Vídeo</h1>
      </div>
      <StepIndicator />
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-4">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Roteiro não encontrado.</p>
          <Button variant="outline" onClick={() => setStep(1)}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Voltar ao início
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  if (step === 2 && script) return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Revisar Roteiro</h1>
          <p className="text-muted-foreground mt-1">Edite o conteúdo, escolha a voz e o formato.</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs shrink-0">
          {draftSaved === "saving" && (
            <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Salvando...</span></>
          )}
          {draftSaved === "saved" && (
            <><CheckCircle2 className="h-3 w-3 text-green-500" /><span className="text-green-600">Salvo</span></>
          )}
        </div>
      </div>
      <StepIndicator />

      {/* Narração */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Narração</Label>
        <Textarea rows={5} value={script.narracao}
          onChange={(e) => setScript({ ...script, narracao: e.target.value })}
          className="resize-none" />
        <p className="text-xs text-muted-foreground">
          {script.narracao.length} caracteres · aprox. {Math.round(script.narracao.length / 15)}s
        </p>
      </div>

      {/* Slides */}
      {script.slides && script.slides.length > 0 ? (
        <div className="space-y-2">
          <Label className="text-base font-semibold">Slides ({script.slides.length})</Label>
          <div className="space-y-3">
            {script.slides.map((slide, i) => (
              <div key={i} className="rounded-xl border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{slide.indice}</span>
                  <Input
                    value={slide.texto_legenda}
                    onChange={(e) => updateSlide(i, "texto_legenda", e.target.value)}
                    placeholder="Legenda do slide..."
                    className="flex-1 font-medium text-sm"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">{slide.duracao_s}s</span>
                </div>
                <Textarea
                  rows={2}
                  value={slide.narracao_slide}
                  onChange={(e) => updateSlide(i, "narracao_slide", e.target.value)}
                  placeholder="Narração deste slide..."
                  className="resize-none text-sm text-muted-foreground"
                />
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground gap-1">
                      <Wand2 className="h-3 w-3" /> Prompt visual
                      <ChevronDown className="h-3 w-3 transition-transform [[data-state=open]_&]:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-1">
                    <Textarea
                      rows={2}
                      value={slide.visual_prompt}
                      onChange={(e) => updateSlide(i, "visual_prompt", e.target.value)}
                      className="resize-none text-xs font-mono text-muted-foreground"
                    />
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Slides</Label>
            <Button variant="outline" size="sm" onClick={() => {
              const last = script.legendas[script.legendas.length - 1];
              setScript({ ...script, legendas: [...script.legendas, { tempo: (last?.tempo ?? 0) + 4, texto: "" }] });
            }}>+ Slide</Button>
          </div>
          <div className="space-y-2">
            {script.legendas.map((leg, i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className="w-16 flex-shrink-0">
                  <Input type="number" min={0} value={leg.tempo}
                    onChange={(e) => updateLegenda(i, "tempo", e.target.value)}
                    className="text-center text-sm" />
                  <p className="text-xs text-center text-muted-foreground mt-0.5">seg</p>
                </div>
                <Input value={leg.texto} onChange={(e) => updateLegenda(i, "texto", e.target.value)}
                  placeholder="Texto do slide..." className="flex-1" />
                <Button variant="ghost" size="sm" className="text-destructive px-2"
                  onClick={() => script.legendas.length > 1 && setScript({ ...script, legendas: script.legendas.filter((_, j) => j !== i) })}
                  disabled={script.legendas.length <= 1}>✕</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Call to Action (slide final)</Label>
        <Input value={script.cta} onChange={(e) => setScript({ ...script, cta: e.target.value })} />
      </div>

      {/* Descrições para redes sociais */}
      {(script.descricao_instagram || script.descricao_linkedin || script.legenda_tiktok) && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between" size="sm">
              <span className="flex items-center gap-2 font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                Descrições para Redes Sociais
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">

            {script.descricao_instagram && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <span className="text-pink-500 text-base leading-none">📸</span> Instagram
                </Label>
                <Textarea rows={3} className="resize-none text-sm"
                  value={script.descricao_instagram}
                  onChange={(e) => setScript({ ...script, descricao_instagram: e.target.value })} />
              </div>
            )}

            {script.descricao_linkedin && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <span className="text-blue-600 text-base leading-none">💼</span> LinkedIn
                </Label>
                <Textarea rows={3} className="resize-none text-sm"
                  value={script.descricao_linkedin}
                  onChange={(e) => setScript({ ...script, descricao_linkedin: e.target.value })} />
              </div>
            )}

            {script.legenda_tiktok && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <span className="text-xs font-bold leading-none">TK</span> TikTok / Reels
                </Label>
                <Input className="text-sm"
                  value={script.legenda_tiktok}
                  onChange={(e) => setScript({ ...script, legenda_tiktok: e.target.value })} />
                <p className="text-xs text-muted-foreground">{script.legenda_tiktok.length} chars</p>
              </div>
            )}

          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Voz ── */}
      <div className="space-y-3">
        <Label className="text-base font-semibold flex items-center gap-2">
          <Mic className="h-4 w-4" /> Voz da Narração
        </Label>

        {/* Seleção do modo */}
        <div className="grid grid-cols-3 gap-3">
          {/* Automática */}
          <Card className={`cursor-pointer border-2 transition-all ${voiceMode === "edge" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setVoiceMode("edge")}>
            <CardContent className="p-3 text-center space-y-1">
              <Mic className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">Automática</p>
              <p className="text-xs text-muted-foreground">3 vozes pt-BR</p>
            </CardContent>
          </Card>

          {/* Gravar Roteiro */}
          <Card className={`cursor-pointer border-2 transition-all ${voiceMode === "gravacao" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setVoiceMode("gravacao")}>
            <CardContent className="p-3 text-center space-y-1">
              <BookOpen className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">Gravar Roteiro</p>
              <p className="text-xs text-muted-foreground">Você lê o texto</p>
            </CardContent>
          </Card>

          {/* ElevenLabs */}
          <Card className={`cursor-pointer border-2 transition-all ${voiceMode === "elevenlabs" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setVoiceMode("elevenlabs")}>
            <CardContent className="p-3 text-center space-y-1">
              <Sparkles className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">ElevenLabs</p>
              <Badge variant="outline" className="text-xs">Plano pago</Badge>
            </CardContent>
          </Card>
        </div>

        {/* Vozes automáticas */}
        {voiceMode === "edge" && (
          <div className="grid grid-cols-3 gap-3">
            {EDGE_VOICES.map((v) => (
              <Card key={v.id}
                className={`cursor-pointer border-2 transition-all ${edgeVoice === v.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                onClick={() => setEdgeVoice(v.id)}>
                <CardContent className="p-3 text-center">
                  <p className="font-medium text-sm">{v.label}</p>
                  <p className="text-xs text-muted-foreground">{v.gender}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Gravar o roteiro completo */}
        {voiceMode === "gravacao" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 border p-3 text-sm text-muted-foreground leading-relaxed max-h-36 overflow-y-auto">
              {script.narracao}
            </div>
            <VoiceRecorder
              onRecorded={setNarBlob}
              label="Leia o texto acima em voz alta e grave aqui"
              hint="Fale de forma clara e natural — esse áudio será a narração do vídeo."
            />
          </div>
        )}

        {/* ElevenLabs — amostra de voz */}
        {voiceMode === "elevenlabs" && (
          <VoiceRecorder
            onRecorded={setVoiceBlob}
            label="Grave uma amostra da sua voz (mín. 30 segundos)"
            hint="Pode ler qualquer texto. O ElevenLabs vai clonar sua voz e narrar o roteiro automaticamente."
          />
        )}
      </div>

      {/* ── Imagens ── (oculto em Premium/Pro — Veo gera visualmente) */}
      {videoModel === "gratuito" && <div className="space-y-3">
        <Label className="text-base font-semibold flex items-center gap-2">
          <Images className="h-4 w-4" /> Estilo Visual
        </Label>

        <div className="grid grid-cols-3 gap-3">
          <Card className={`cursor-pointer border-2 transition-all ${visualStyle === "images" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setVisualStyle("images")}>
            <CardContent className="p-3 text-center space-y-1">
              <Images className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">Imagens</p>
              <p className="text-xs text-muted-foreground">Pexels por slide</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer border-2 transition-all ${visualStyle === "animated" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setVisualStyle("animated")}>
            <CardContent className="p-3 text-center space-y-1">
              <Wand2 className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">Degradê</p>
              <p className="text-xs text-muted-foreground">Blobs animados</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer border-2 transition-all ${visualStyle === "particles" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setVisualStyle("particles")}>
            <CardContent className="p-3 text-center space-y-1">
              <Sparkles className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">Partículas</p>
              <p className="text-xs text-muted-foreground">Pontos flutuantes</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer border-2 transition-all ${visualStyle === "lines" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setVisualStyle("lines")}>
            <CardContent className="p-3 text-center space-y-1">
              <Minus className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">Linhas</p>
              <p className="text-xs text-muted-foreground">Linhas diagonais</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer border-2 transition-all ${visualStyle === "geometric" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setVisualStyle("geometric")}>
            <CardContent className="p-3 text-center space-y-1">
              <Triangle className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">Geométrico</p>
              <p className="text-xs text-muted-foreground">Formas animadas</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer border-2 transition-all ${visualStyle === "mixed" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setVisualStyle("mixed")}>
            <CardContent className="p-3 text-center space-y-1">
              <Film className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">Misto</p>
              <p className="text-xs text-muted-foreground">Alterna imagem + gráfico</p>
            </CardContent>
          </Card>
        </div>

        {!["animated","particles","lines","geometric"].includes(visualStyle) && <div className="space-y-3">
        <Label className="text-sm font-medium text-muted-foreground">Imagens de Fundo</Label>
        <div className="grid grid-cols-2 gap-3">
          <Card className={`cursor-pointer border-2 transition-all ${imageMode === "auto" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setImageMode("auto")}>
            <CardContent className="p-3 text-center space-y-1">
              <Sparkles className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">Automáticas</p>
              <p className="text-xs text-muted-foreground">Pexels via IA</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer border-2 transition-all ${imageMode === "custom" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setImageMode("custom")}>
            <CardContent className="p-3 text-center space-y-1">
              <ImagePlus className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">Minhas Imagens</p>
              <p className="text-xs text-muted-foreground">Upload pessoal</p>
            </CardContent>
          </Card>
        </div>

        {imageMode === "custom" && (
          <div className="space-y-3">
            {/* Botão de upload */}
            <label className="flex items-center justify-center gap-2 w-full h-24 border-2 border-dashed border-primary/40 rounded-xl cursor-pointer hover:bg-primary/5 transition-all text-sm text-muted-foreground hover:text-foreground">
              <ImagePlus className="h-5 w-5" />
              Clique para adicionar imagens
              <input
                type="file" multiple accept="image/*" className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const newImgs = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
                  setUserImages((prev) => [...prev, ...newImgs]);
                  e.target.value = "";
                }}
              />
            </label>

            {userImages.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {userImages.length} imagem(ns) · slides sem imagem usam Pexels como fallback
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {userImages.map((img, i) => (
                    <div key={i} className="relative group rounded-lg overflow-hidden aspect-square border">
                      <img src={img.preview} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-1">
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-white"
                            disabled={i === 0}
                            onClick={() => {
                              const imgs = [...userImages];
                              [imgs[i - 1], imgs[i]] = [imgs[i], imgs[i - 1]];
                              setUserImages(imgs);
                            }}>
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-white"
                            disabled={i === userImages.length - 1}
                            onClick={() => {
                              const imgs = [...userImages];
                              [imgs[i], imgs[i + 1]] = [imgs[i + 1], imgs[i]];
                              setUserImages(imgs);
                            }}>
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400"
                          onClick={() => setUserImages(userImages.filter((_, j) => j !== i))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="absolute top-1 left-1 bg-black/60 text-white text-xs rounded px-1">{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        </div>}
      </div>}

      {/* Modelo selecionado: nota visual no Step 2 */}
      {videoModel !== "gratuito" && (
        <div className="rounded-xl border border-amber-300/50 bg-amber-50/40 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-2.5 text-sm">
          {videoModel === "premium"
            ? <Star className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            : <Crown className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />}
          <div>
            <p className="font-medium">
              {videoModel === "premium" ? "Modelo Premium ativo" : "Modelo Pro ativo"}
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              {videoModel === "premium" ? "Kling AI" : "Google Veo"} vai gerar clipes cinematográficos para cada slide automaticamente.
              Imagens de fundo não são necessárias.
            </p>
          </div>
        </div>
      )}

      {/* Estilo Visual — visível apenas para Premium */}
      {videoModel === "premium" && (
        <div className="space-y-3">
          <Label className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Estilo Visual
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "cinematico",  icon: "🎬", label: "Cinemático",   desc: "Luz dramática, bokeh" },
              { value: "realista",    icon: "📸", label: "Realista",      desc: "8K, natural" },
              { value: "animacao",    icon: "🎨", label: "Animação",      desc: "Cartoon 2D" },
              { value: "pixar",       icon: "✨", label: "Pixar",         desc: "3D animado" },
              { value: "paisagem",    icon: "🌿", label: "Paisagens",     desc: "Natureza, épico" },
              { value: "neon",        icon: "🌃", label: "Neon",          desc: "Cyberpunk, néon" },
            ] as const).map(({ value, icon, label, desc }) => (
              <Card key={value}
                className={`cursor-pointer border-2 transition-all ${estiloIA === value ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20" : "border-border hover:border-amber-400/50"}`}
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
      )}

      {/* Formato */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Formato</Label>
        <div className="grid grid-cols-3 gap-3">
          <Card className={`cursor-pointer border-2 transition-all ${format === "portrait" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
            onClick={() => setFormat("portrait")}>
            <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
              <Smartphone className="h-5 w-5 text-primary" />
              <p className="font-medium text-sm">Vertical</p>
              <p className="text-xs text-muted-foreground">Reels · TikTok · Stories</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer border-2 transition-all ${format === "square" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
            onClick={() => setFormat("square")}>
            <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
              <Square className="h-5 w-5 text-primary" />
              <p className="font-medium text-sm">Quadrado</p>
              <p className="text-xs text-muted-foreground">Feed Instagram · LinkedIn</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer border-2 transition-all ${format === "landscape" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
            onClick={() => setFormat("landscape")}>
            <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
              <Monitor className="h-5 w-5 text-primary" />
              <p className="font-medium text-sm">Paisagem</p>
              <p className="text-xs text-muted-foreground">YouTube · Feed</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={() => setStep(1)}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Button className="flex-1" size="lg" onClick={handleGenerate}>
          <Film className="mr-2 h-5 w-5" /> Gerar Vídeo
        </Button>
      </div>
    </div>
  );

  // ── Step 3 ─────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Criar Vídeo</h1>
        <p className="text-muted-foreground mt-1">Aguarde enquanto seu vídeo é gerado.</p>
      </div>
      <StepIndicator />

      {jobStatus.status === "processing" && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-5">
            <Loader2 className="h-14 w-14 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-semibold text-lg">Gerando seu vídeo...</p>
              <p className="text-muted-foreground mt-1 text-sm">{jobStatus.step}</p>
            </div>

            {/* Barra de progresso */}
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${jobStatus.progress || 0}%` }} />
            </div>

            {/* Tempo decorrido + tempo médio */}
            <div className="w-full grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-muted/60 px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1">Tempo decorrido</p>
                <p className="font-mono font-bold text-xl tabular-nums">
                  {`${String(Math.floor(localElapsed / 60)).padStart(2, "0")}:${String(localElapsed % 60).padStart(2, "0")}`}
                </p>
              </div>
              <div className="rounded-xl bg-muted/60 px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1">
                  {avgSeconds ? "Tempo médio" : "Estimativa"}
                </p>
                <p className="font-mono font-bold text-xl tabular-nums">
                  {avgSeconds
                    ? `~${String(Math.floor(avgSeconds / 60)).padStart(2, "0")}:${String(Math.round(avgSeconds % 60)).padStart(2, "0")}`
                    : videoModel === "gratuito" ? "~02:00" : "~04:00"}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground/60 text-center">
              Pode navegar e voltar — o vídeo continuará sendo gerado
            </p>
          </CardContent>
        </Card>
      )}

      {jobStatus.status === "done" && (
        <div className="space-y-6">
          {/* Preview + ações principais */}
          <Card>
            <CardContent className="pt-6 pb-4 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
                <div>
                  <p className="font-semibold text-lg">Vídeo criado!</p>
                  <p className="text-muted-foreground text-sm">{jobStatus.titulo}</p>
                  {avgSeconds != null && (
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      Gerado em {Math.round(avgSeconds)}s
                    </p>
                  )}
                </div>
              </div>
              {jobStatus.video_url && (
                <video
                  src={jobStatus.video_url}
                  controls
                  className="w-1/2 mx-auto block rounded-xl shadow"
                  onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
                />
              )}
              <div className="flex gap-2">
                {jobStatus.video_url && (
                  <Button variant="outline" className="flex-1 gap-2"
                    onClick={() => handleDownload(jobStatus.video_url!, jobStatus.titulo || "video")}>
                    <Download className="h-4 w-4" /> Baixar Original
                  </Button>
                )}
                <Button
                  className="flex-1 gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white border-0"
                  onClick={() => setShowPublish(true)}>
                  <Instagram className="h-4 w-4" /> Publicar no Instagram
                </Button>
                <Button variant="outline" className="flex-1 gap-2" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4" /> Novo Vídeo
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Publicar no Instagram — vídeo principal */}
          {showPublish && jobStatus.video_id && (
            <PublishPanel
              videoId={jobStatus.video_id}
              videoTitle={jobStatus.titulo ?? script?.titulo ?? ""}
              videoDescription={script?.descricao_instagram ?? script?.descricao_post ?? null}
              videoUrl={jobStatus.video_url ?? null}
              onDismiss={() => setShowPublish(false)}
            />
          )}

          {/* Publicar no Instagram — vídeo cortado */}
          {publishTrimData && (
            <div ref={publishTrimRef}>
              <PublishPanel
                videoId={publishTrimData.videoId}
                videoTitle={jobStatus.titulo ?? script?.titulo ?? ""}
                videoDescription={publishTrimData.description}
                videoUrl={publishTrimData.videoUrl}
                defaultPostType={publishTrimData.postType}
                onDismiss={() => setPublishTrimData(null)}
              />
            </div>
          )}

          {/* Distribuição por plataformas */}
          <div className="space-y-3">
            <div>
              <h2 className="font-semibold text-base">Distribuir nas Plataformas</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Gere cortes otimizados para cada rede social com um clique.
              </p>
            </div>
            <div className="space-y-3">
              {PLATFORMS.map((platform) => {
                const isActive = trimState?.platformId === platform.id;
                const captionMap: Record<string, string | undefined> = {
                  reels:              script?.descricao_instagram,
                  feed_instagram:     script?.descricao_instagram,
                  stories_instagram:  script?.descricao_instagram,
                  linkedin:           script?.descricao_linkedin,
                  tiktok:             script?.legenda_tiktok,
                };
                const caption = captionMap[platform.id] || script?.descricao_post;
                const Icon = platform.icon;
                return (
                  <Card key={platform.id} className={isActive ? "border-primary/50 bg-primary/5" : ""}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Icon className={`h-6 w-6 shrink-0 ${platform.color}`} />
                          <div>
                            <p className="font-medium text-sm">{platform.label}</p>
                            <p className="text-xs text-muted-foreground">{platform.desc}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs font-mono">{platform.format}</Badge>
                          <Badge variant="secondary" className="text-xs">{platform.idealS}s ideal</Badge>
                        </div>
                      </div>

                      {caption && (
                        <div className="relative rounded-lg bg-muted/60 px-3 py-2 pr-8 text-xs text-muted-foreground leading-relaxed">
                          <p className="line-clamp-2">{caption}</p>
                          <Button
                            size="icon" variant="ghost"
                            className="absolute top-1 right-1 h-6 w-6"
                            onClick={() => { navigator.clipboard.writeText(caption); toast.success("Legenda copiada!"); }}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}

                      {isActive && trimState?.resultUrl && (
                        <div className="space-y-2">
                          <video src={trimState.resultUrl} controls className="w-1/2 mx-auto block rounded-lg" />
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1 gap-1.5"
                              onClick={() => handleDownload(trimState.resultUrl!, `${platform.label}_corte`)}>
                              <Download className="h-3.5 w-3.5" /> Baixar
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 gap-1.5"
                              onClick={() => { navigator.clipboard.writeText(trimState.resultUrl!); toast.success("Link copiado!"); }}>
                              <Share2 className="h-3.5 w-3.5" /> Copiar Link
                            </Button>
                          </div>
                          {(platform.id === "reels" || platform.id === "stories_instagram" || platform.id === "feed_instagram") && (
                            <Button
                              size="sm"
                              className="w-full gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white border-0"
                              onClick={() => setPublishTrimData({
                                postType: platform.id === "feed_instagram" ? "feed" : "reels",
                                videoUrl: trimState.resultUrl!,
                                description: caption ?? `${script?.titulo ?? jobStatus.titulo ?? ""}`,
                                videoId: jobStatus.video_id ?? "",
                              })}>
                              <Instagram className="h-3.5 w-3.5" />
                              {platform.id === "feed_instagram" ? "Publicar no Feed" : platform.id === "stories_instagram" ? "Publicar no Stories" : "Publicar no Reels"}
                            </Button>
                          )}
                        </div>
                      )}

                      {!(isActive && trimState?.resultUrl) && (
                        <Button
                          size="sm" className="w-full gap-2"
                          variant={isActive ? "secondary" : "outline"}
                          disabled={isActive && !!trimState?.loading}
                          onClick={() => handleTrim(platform)}>
                          {isActive && trimState?.loading
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cortando...</>
                            : <><Scissors className="h-3.5 w-3.5" /> Gerar Corte para {platform.label}</>}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}


      {!["processing", "done", "error"].includes(jobStatus.status) && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Estado inesperado. Tente novamente.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="mr-2 h-4 w-4" /> Editar roteiro
              </Button>
              <Button variant="outline" onClick={handleReset}>Recomeçar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {jobStatus.status === "error" && (
        <Card className="border-destructive">
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <AlertCircle className="h-14 w-14 text-destructive" />
            <div className="text-center">
              <p className="font-semibold text-lg">Erro ao gerar vídeo</p>
              <p className="text-muted-foreground mt-1 text-sm">{jobStatus.message}</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setStep(2)} variant="outline">
                <ChevronLeft className="mr-2 h-4 w-4" /> Editar
              </Button>
              <Button onClick={handleReset} variant="outline">Recomeçar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

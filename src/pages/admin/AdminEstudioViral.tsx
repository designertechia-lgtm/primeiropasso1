import { useState, useRef, useEffect, type ComponentType } from "react";
import { useSearchParams } from "react-router-dom";
import { useProfessional } from "@/hooks/useProfessional";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import PublishPanel from "@/components/dashboard/PublishPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Film, Loader2, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronDown, Mic, Monitor, Smartphone,
  Circle, Square, RotateCcw, Sparkles, BookOpen, Wand2,
  Heart, BookOpenCheck, Flame, TrendingUp,
  Copy, Scissors, Download, Share2, Search, RefreshCw,
  Instagram, Youtube, Linkedin, Facebook, Drama,
} from "lucide-react";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.16 8.16 0 0 0 4.77 1.52V6.77a4.85 4.85 0 0 1-1-.08z"/>
    </svg>
  );
}

import { videoApiAuthHeaders } from "@/lib/videoApi";
import { STORAGE_KEY } from "@/lib/criarVideoDraft";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

// Plataforma escolhida no Step 1 → formato técnico recomendado no Step 2.
// O usuário pode sobrescrever; um aviso aparece se divergir do recomendado.
const PLATAFORMA_FORMATO_PADRAO: Record<"geral" | "instagram" | "tiktok" | "linkedin", "portrait" | "square" | "landscape"> = {
  geral:     "portrait",
  instagram: "portrait",   // Reels/Stories — formato dominante no IG
  tiktok:    "portrait",
  linkedin:  "square",
};

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
type Tom          = "acolhedor" | "educativo" | "provocador" | "motivacional";
type DuracaoAlvo  = "30s" | "45s" | "60s";
type PlataformaAlvo = "geral" | "instagram" | "linkedin" | "tiktok";
type Legenda   = { tempo: number; texto: string };
type Slide     = {
  indice: number;
  texto_legenda: string;
  narracao_slide: string;
  visual_prompt: string;
  duracao_s: number;
  usar_avatar?: boolean;   // cópia inteligente: momento de pessoa em câmera → entra o personagem
};
// Clipe de vídeo real (Pexels/Pixabay) sugerido/escolhido para um slide
type ClipInfo = { url: string; thumb: string; duration: number; source: string };
type Script = {
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
type FormatoId = "livre" | "o_momento" | "antes_depois" | "crenca_errada" | "dialogo_interno" | "confissao" | "o_processo" | "dado_emocao";

const FORMATOS: Record<FormatoId, { emoji: string; nome: string; tagline: string; exemplo: string; tags: string[] }> = {
  livre: {
    emoji: "✨",
    nome: "Livre",
    tagline: "Claude escolhe a melhor estrutura",
    exemplo: "Formato padrão — a IA define a abordagem mais eficaz para o objetivo.",
    tags: ["Flexível", "Padrão"],
  },
  o_momento: {
    emoji: "🎬",
    nome: "O Momento",
    tagline: "Uma cena específica que vira universal",
    exemplo: "\"Tinha uma paciente que chegou dizendo que estava ótima. Eram 23h de uma segunda.\"",
    tags: ["Alta retenção", "Identificação"],
  },
  antes_depois: {
    emoji: "🔄",
    nome: "Antes / Depois",
    tagline: "Jornada de transformação em 60s",
    exemplo: "\"Antes ela não conseguia jantar sem checar o celular. Hoje pediu para desligar o wifi.\"",
    tags: ["Prova social", "Conversão"],
  },
  crenca_errada: {
    emoji: "🧠",
    nome: "A Crença Errada",
    tagline: "Desmonta o que o paciente acha que sabe",
    exemplo: "\"Pedir ajuda não é fraqueza — é exatamente o oposto.\"",
    tags: ["Viral", "Debate"],
  },
  dialogo_interno: {
    emoji: "💬",
    nome: "Diálogo Interno",
    tagline: "A voz da ansiedade falando em voz alta",
    exemplo: "\"Você está bem. Não, não está. Mas tem que estar. Não pode reclamar.\"",
    tags: ["Para o scroll", "DMs"],
  },
  confissao: {
    emoji: "🤝",
    nome: "Confissão do Terapeuta",
    tagline: "O que aprendi com meus pacientes",
    exemplo: "\"Depois de anos atendendo, aprendi que pedir ajuda é o ato mais corajoso.\"",
    tags: ["Confiança", "Autoridade"],
  },
  o_processo: {
    emoji: "🌱",
    nome: "O Processo",
    tagline: "Desmistifica o que é terapia de verdade",
    exemplo: "\"Terapia não é ficar deitado num sofá. Às vezes é só aprender a respirar.\"",
    tags: ["Reduz barreiras", "Conversão"],
  },
  dado_emocao: {
    emoji: "⚡",
    nome: "Dado + Emoção",
    tagline: "Um número que muda perspectiva",
    exemplo: "\"1 em cada 4 pessoas vai ter ansiedade clínica este ano.\"",
    tags: ["Shareável", "Autoridade"],
  },
};

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

// ── Blocos visuais do wizard (mesma linguagem do Clonar Vídeo) ───────────────

/** Rótulo de seção padronizado. */
function Secao({ children, opcional }: { children: React.ReactNode; opcional?: boolean }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
      {opcional && <span className="text-[9px] font-medium normal-case tracking-normal">opcional</span>}
    </p>
  );
}

/** Cartão de escolha único para tom, voz e formato — mesmo gesto, mesma cara. */
function Escolha({
  ativo, onClick, disabled, Icon, titulo, descricao, extra,
}: {
  ativo: boolean; onClick: () => void; disabled?: boolean;
  Icon?: ComponentType<{ className?: string }>;
  titulo: string; descricao?: string; extra?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      disabled={disabled}
      onClick={onClick}
      className={[
        "group relative w-full rounded-xl border bg-card p-3 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100",
        ativo
          ? "border-primary/70 bg-primary/[0.045] shadow-sm ring-1 ring-primary/30"
          : "border-border/70 hover:border-primary/40 hover:shadow-sm",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span
            className={[
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors",
              ativo ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground group-hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-sm font-medium leading-tight">{titulo}</span>
          {descricao && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{descricao}</span>}
          {extra}
        </span>
      </div>
    </button>
  );
}

// ── Página principal ─────────────────────────────────────────
export default function AdminEstudioViral() {
  const { data: professional } = useProfessional();
  const [searchParams, setSearchParams] = useSearchParams();
  const editVideoId = searchParams.get("edit");

  // Inicializa do localStorage para persistir entre navegações
  const saved = useRef(editVideoId ? null : loadSaved()).current;
  const [step, setStep]             = useState<1 | 2 | 3>(saved?.step ?? 1);
  const [objetivo, setObjetivo]     = useState<string>(saved?.objetivo ?? "");
  const [tom, setTom]               = useState<Tom>(saved?.tom ?? "acolhedor");
  const [formato, setFormato]       = useState<FormatoId>(saved?.formato ?? "livre");
  const [duracaoAlvo, setDuracaoAlvo] = useState<DuracaoAlvo>(
    saved?.duracaoAlvo === "30s" || saved?.duracaoAlvo === "45s" || saved?.duracaoAlvo === "60s" ? saved.duracaoAlvo : "45s",
  );
  const [plataformaAlvo, setPlataformaAlvo] = useState<PlataformaAlvo>(saved?.plataformaAlvo ?? "geral");
  const [iaLoading, setIaLoading]   = useState(false);
  const [script, setScript]         = useState<Script | null>(saved?.script ?? null);
  const [voiceMode, setVoiceMode]   = useState<VoiceMode>(saved?.voiceMode ?? "edge");
  const [edgeVoice, setEdgeVoice]   = useState<string>(saved?.edgeVoice ?? "pt-BR-FranciscaNeural");
  const [voiceBlob, setVoiceBlob]   = useState<Blob | null>(null);
  const [narBlob, setNarBlob]       = useState<Blob | null>(null);
  // Voz ElevenLabs já clonada e salva no perfil (reusada entre sessões/vídeos).
  const [cloneVoiceId, setCloneVoiceId] = useState<string | null>(null);
  const [recloning, setRecloning]   = useState(false);  // regravar p/ substituir a voz salva
  // Cota mensal de voz clonada do GRATUITO (backend /voz-clonada-status).
  const [vozStatus, setVozStatus] = useState<{ used: number; quota: number; remaining: number } | null>(null);
  // Estourou a cota: "edge" (voz automática, grátis) | "creditos" (cobra por caractere)
  const [overQuotaChoice, setOverQuotaChoice] = useState<"edge" | "creditos">("edge");
  // Personagem/avatar — abre e fecha o vídeo (foto com movimento suave)
  const [avatars, setAvatars] = useState<{ id: string; name: string; photo_url: string | null }[]>([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  // Cenas do vídeo: clipe real sugerido/escolhido por slide (preview + troca)
  const [previewClips, setPreviewClips] = useState<(ClipInfo | null)[]>([]);
  const [clipsLoading, setClipsLoading] = useState(false);
  const [swapClipSlide, setSwapClipSlide] = useState<number | null>(null);
  const [swapClipQuery, setSwapClipQuery] = useState("");
  const [swapClipResults, setSwapClipResults] = useState<ClipInfo[]>([]);
  const [swapClipLoading, setSwapClipLoading] = useState(false);
  // Personagem escolhido por cena (galeria no "Trocar"): índice do slide -> avatar_id.
  // A foto do personagem vira a cena com movimento (Ken Burns) no backend.
  const [sceneAvatarIds, setSceneAvatarIds] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();
  const [format, setFormat]         = useState<"portrait" | "landscape" | "square">(saved?.format ?? "portrait");
  // Marca quando o usuário escolhe um formato manualmente. Enquanto false,
  // o formato segue a plataforma do Step 1 automaticamente.
  const [formatTouched, setFormatTouched] = useState<boolean>(saved?.formatTouched ?? false);
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

  // Premium e PRO moraram no Diretor IA (decisão 11/08) — esta tela é só o
  // fluxo gratuito. Links antigos com ?model=premium|pro (Axel, favoritos)
  // caem direto na aba certa em vez de abrir um formulário que não vende mais.
  useEffect(() => {
    const model = searchParams.get("model");
    if (model === "premium" || model === "pro") {
      setSearchParams((prev) => { prev.set("sub", "diretor"); prev.delete("model"); return prev; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega a voz ElevenLabs salva no perfil para reuso (sem reclonar a cada vídeo).
  // `as any` porque a coluna elevenlabs_voice_id ainda não está no types.ts gerado
  // (mesmo padrão de AdminLandingPage onde o vídeo institucional já reusa a voz).
  useEffect(() => {
    const saved = (professional as any)?.elevenlabs_voice_id || null;
    if (saved) setCloneVoiceId(saved);
  }, [professional]);

  // Roteiro novo → zera os clipes e os personagens por cena do roteiro
  // ANTERIOR. Sem isso, o vídeo novo herdava as cenas do roteiro velho:
  // selected_clip_urls saía com clipes sem relação com os slides atuais (e até
  // com contagem diferente), e um personagem marcado numa cena antiga
  // reaparecia no vídeo novo sem ninguém pedir.
  useEffect(() => {
    setPreviewClips([]);
    setSceneAvatarIds({});
  }, [script?.titulo, script?.slides?.length]);

  // Avatares do profissional (aba Personagens) — abre e fecha o vídeo.
  useEffect(() => {
    if (!professional?.id) return;
    (supabase as any)
      .from("avatars")
      .select("id,name,photo_url")
      .eq("professional_id", professional.id)
      .order("created_at", { ascending: false })
      .then(({ data }: any) => setAvatars(data ?? []));
  }, [professional?.id]);

  // Cota mensal de voz clonada do tier gratuito (badge "X de Y este mês").
  useEffect(() => {
    if (!professional?.slug) return;
    (async () => {
      try {
        const r = await fetch(`${API}/voz-clonada-status/${professional.slug}`, {
          headers: await videoApiAuthHeaders(),
        });
        if (r.ok) setVozStatus(await r.json());
      } catch { /* silencioso — o badge simplesmente não aparece */ }
    })();
  }, [professional?.slug]);

  // Salva estado no localStorage sempre que mudar.
  // "loading" é transitório — nunca persiste para não travar o botão no próximo acesso.
  useEffect(() => {
    try {
      const persistedJobStatus = jobStatus.status === "loading" ? { status: "idle" } : jobStatus;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        step, objetivo, tom, formato, duracaoAlvo, plataformaAlvo, script, voiceMode, edgeVoice, format, formatTouched,
        jobStatus: persistedJobStatus, activeJobId, draftId,
      }));
    } catch {}
  }, [step, objetivo, tom, formato, duracaoAlvo, plataformaAlvo, script, voiceMode, edgeVoice, format, formatTouched, jobStatus, activeJobId, draftId]);

  // Auto-sincroniza formato com a plataforma escolhida enquanto o usuário
  // não tiver mexido no seletor de formato manualmente.
  useEffect(() => {
    if (formatTouched) return;
    const recomendado = PLATAFORMA_FORMATO_PADRAO[plataformaAlvo];
    if (recomendado && recomendado !== format) {
      setFormat(recomendado);
    }
  }, [plataformaAlvo, formatTouched]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (data.script_json?.kind === "clone_v2v") {
          toast.warning("Este vídeo veio da Clonagem de Vídeo — edite pela aba \"Clonar Vídeo\".");
          return;
        }
        if (data.script_json) {
          setScript(data.script_json);
          setFormat(data.video_format ?? "portrait");
          setFormatTouched(true); // re-edição preserva escolha original
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
          formato,
          plataforma: plataformaAlvo,
          duracao_alvo: duracaoAlvo,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      const data = await res.json();
      if (!data.cta) data.cta = buildDefaultCta();
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
    if (voiceMode === "elevenlabs" && !cloneVoiceId && !voiceBlob) {
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

      // Upload gravação do roteiro
      if (voiceMode === "gravacao" && narBlob) {
        setJobStatus({ status: "processing", progress: 5, step: "Enviando gravação..." });
        const form = new FormData();
        form.append("audio", narBlob, "narracao.webm");
        const res  = await fetch(`${API}/upload-narracao`, { method: "POST", body: form });
        const data = await res.json();
        narrationPath = data.path;
      }

      // Voz ElevenLabs: reusa a voz salva no perfil, ou clona uma amostra nova (e salva).
      if (voiceMode === "elevenlabs") {
        if (voiceBlob) {
          // Gravou amostra nova → clona e persiste no perfil para reuso futuro.
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
          // Persiste no perfil para reusar entre sessões/vídeos (igual ao vídeo institucional).
          if (professional.id && voiceId) {
            await supabase.from("professionals").update({ elevenlabs_voice_id: voiceId }).eq("id", professional.id);
            setCloneVoiceId(voiceId);
            setRecloning(false);
            queryClient.invalidateQueries({ queryKey: ["my-professional"] });
          }
        } else {
          // Sem amostra nova → usa a voz já salva no perfil.
          voiceId = cloneVoiceId;
        }
      }

      const res = await fetch(`${API}/gerar-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await videoApiAuthHeaders()) },
        body: JSON.stringify({
          professional_slug: professional.slug,
          video_type: "objetivo_livre",
          objetivo: objetivo.trim(),
          script,
          voice: edgeVoice,
          voice_provider: voiceMode,
          elevenlabs_voice_id: voiceId,
          narration_audio_path: narrationPath,
          format,
          formato,
          // Esta tela é SÓ o fluxo gratuito — Premium/PRO moraram no Diretor IA.
          model: "gratuito",
          visual_style: "images",
          estilo_visual: "cinematico",
          image_style: "realistic",
          // Personagem: a foto abre/fecha o vídeo com movimento suave.
          avatar_id: selectedAvatarId || undefined,
          // Clipes escolhidos no preview de cenas (null = busca automática naquele slide)
          selected_clip_urls: previewClips.length
            ? previewClips.map((c) => c?.url ?? null)
            : undefined,
          // Personagem escolhido por cena (galeria do "Trocar"): id do avatar por
          // slide (null = clipe/auto). A foto vira cena com movimento no backend.
          scene_avatar_ids: Object.keys(sceneAvatarIds).length && script.slides?.length
            ? script.slides.map((_, i) => sceneAvatarIds[i] || null)
            : undefined,
          // Voz clonada após a cota do mês: gastar créditos ou cair pra voz Edge
          cloned_voice_over_quota: overQuotaChoice,
        }),
      });
      const data = await res.json();
      if (data?.voice_note === "cota_esgotada_usando_edge") {
        toast.info("Cota de voz clonada do mês esgotada — este vídeo usará a voz automática.", { duration: 8000 });
      }
      if (!res.ok) {
        const msg = data.detail || "Erro ao iniciar geração";
        const isCredit = res.status === 402 || msg.toLowerCase().includes("crédit");
        if (isCredit) {
          toast.error(msg, { duration: 8000 });
          setJobStatus({ status: "error", message: msg });
          return;
        }
        throw new Error(msg);
      }
      setActiveJobId(data.job_id);
      pollStatus(data.job_id);
    } catch (e: any) {
      setJobStatus({ status: "error", message: e.message || "Erro ao conectar à API" });
    }
  };

  // Cenas do vídeo: 1 clipe REAL sugerido por slide (o motor usa exatamente
  // o que estiver aqui na geração — o que você vê é o que sai).
  const loadPreviewClips = async () => {
    if (!script) return;
    setClipsLoading(true);
    try {
      const res = await fetch(`${API}/preview-clipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, format }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao buscar clipes");
      setPreviewClips(data.clips || []);
    } catch (e: any) {
      toast.error(e.message || "Não consegui buscar os clipes.");
    } finally {
      setClipsLoading(false);
    }
  };

  const searchSwapClips = async (query: string) => {
    if (!query.trim()) return;
    setSwapClipLoading(true);
    try {
      const res = await fetch(`${API}/buscar-clipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), format }),
      });
      const data = await res.json();
      setSwapClipResults(data.results || []);
    } catch {
      toast.error("Busca de clipes falhou.");
    } finally {
      setSwapClipLoading(false);
    }
  };

  const openSwapClip = (slideIndex: number) => {
    const q = script?.slides?.[slideIndex]?.visual_prompt || objetivo;
    setSwapClipSlide(slideIndex);
    setSwapClipQuery(q || "");
    setSwapClipResults([]);
    if (q) searchSwapClips(q);
  };

  const pickSwapClip = (clip: ClipInfo) => {
    if (swapClipSlide === null) return;
    const slide = swapClipSlide;
    setPreviewClips((prev) => {
      const next = [...prev];
      next[slide] = clip;
      return next;
    });
    // Voltar a ser clipe: remove o personagem que porventura estava nesta cena.
    setSceneAvatarIds((prev) => {
      if (!(slide in prev)) return prev;
      const next = { ...prev }; delete next[slide]; return next;
    });
    setSwapClipSlide(null);
    toast.success("Clipe trocado!");
  };

  // Usar a foto de um personagem NESTA cena (galeria do "Trocar").
  const pickSceneAvatar = (avatarId: string) => {
    if (swapClipSlide === null) return;
    const slide = swapClipSlide;
    setSceneAvatarIds((prev) => ({ ...prev, [slide]: avatarId }));
    setSwapClipSlide(null);
    toast.success("Personagem definido para esta cena!");
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
    // Um soluço de rede não pode encerrar o acompanhamento: o vídeo continua
    // sendo gerado no servidor, e desistir no primeiro erro deixava a tela
    // gritando "Erro de conexão" com o vídeo chegando logo depois. Só desiste
    // depois de vários ticks seguidos sem resposta.
    let falhasSeguidas = 0;
    pollRef.current = setInterval(async () => {
      try {
        const data = await (await fetch(`${API}/status/${id}`)).json();
        falhasSeguidas = 0;
        setJobStatus(data);
        if (data.status === "done" || data.status === "error" || data.status === "cancelled") {
          stopPolling();
          stopStopwatch();
          if (data.status === "done") toast.success("Vídeo criado com sucesso!");
          if (data.status === "error") toast.error("Erro: " + data.message);
        }
      } catch {
        falhasSeguidas += 1;
        if (falhasSeguidas >= 5) {   // ~15s sem rede
          stopPolling();
          stopStopwatch();
          setJobStatus({
            status: "error",
            message: "Perdi a conexão com o servidor — o vídeo pode ter continuado. Confira em Meus Vídeos antes de gerar de novo.",
          });
        }
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
    setTom("acolhedor"); setFormato("livre");
    setDuracaoAlvo("45s"); setPlataformaAlvo("geral");
    setVoiceMode("edge"); setEdgeVoice("pt-BR-FranciscaNeural");
    setVoiceBlob(null); setNarBlob(null); setRecloning(false);
    setFormat("portrait"); setFormatTouched(false);
    // Cenas do vídeo anterior nunca sobrevivem a um "Novo Vídeo" — clipes e
    // personagens por cena presos aqui contaminavam o próximo roteiro.
    setPreviewClips([]); setSceneAvatarIds({}); setSelectedAvatarId(null);
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

  /** Cabeçalho da tela — mesma assinatura visual do Clonar Vídeo. */
  const Cabecalho = ({ titulo, subtitulo }: { titulo: string; subtitulo: string }) => (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 ring-1 ring-inset ring-orange-500/25 dark:text-orange-400">
        <Flame className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold leading-none tracking-tight">{titulo}</h1>
        <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{subtitulo}</p>
      </div>
      <Badge variant="outline" className="ml-auto hidden shrink-0 gap-1.5 border-emerald-500/40 bg-emerald-500/5 text-[10px] font-medium text-emerald-700 sm:inline-flex dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Grátis
      </Badge>
    </div>
  );

  /** Trilha de progresso: barra contínua em vez de três bolinhas soltas. */
  const StepIndicator = () => (
    <div className="flex items-center gap-2">
      {[{ n: 1, label: "Objetivo" }, { n: 2, label: "Revisar" }, { n: 3, label: "Gerar" }].map(({ n, label }) => {
        const feito = step > n;
        const atual = step === n;
        return (
          <div key={n} className="flex-1">
            <div
              className={[
                "h-1 rounded-full transition-colors",
                feito ? "bg-primary" : atual ? "bg-primary/60" : "bg-border",
              ].join(" ")}
            />
            <p
              className={[
                "mt-1.5 flex items-center gap-1 text-[11px] transition-colors",
                atual ? "font-semibold text-foreground" : feito ? "text-primary" : "text-muted-foreground",
              ].join(" ")}
            >
              {feito && <CheckCircle2 className="h-3 w-3" />}
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );

  // ── Step 1 ─────────────────────────────────────────────────
  if (step === 1) return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Cabecalho
        titulo="Criar Vídeo"
        subtitulo="Descreva o objetivo e montamos roteiro, narração e cenas com clipes reais."
      />
      <StepIndicator />

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Secao>Sobre o que será este vídeo?</Secao>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="-mt-1 h-8 gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
            onClick={handleSugerirObjetivo}
            disabled={iaLoading}
          >
            {iaLoading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Criando…</>
              : <><Wand2 className="h-3.5 w-3.5" /> Criar com IA</>}
          </Button>
        </div>

        <div className="relative">
          <Textarea
            rows={4} value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            placeholder="Ex.: explicar que pedir ajuda não é fraqueza, para quem nunca fez terapia…"
            className={`resize-none bg-background text-[15px] transition-opacity ${iaLoading ? "pointer-events-none opacity-40" : ""}`}
          />
          {iaLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-background/90 px-4 py-2.5 shadow-sm backdrop-blur-[2px]">
                <Wand2 className="h-4 w-4 animate-pulse text-primary" />
                <span className="text-sm font-medium text-primary">Lendo seu perfil…</span>
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          A IA usa seu perfil e seus documentos para criar um objetivo personalizado, sem repetir os dos últimos 30 dias.
        </p>
      </div>

      {/* Seletor de tom */}
      <div>
        <Secao>Tom da narração</Secao>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: "acolhedor",    label: "Acolhedor",    desc: "Empático e seguro",     Icon: Heart },
            { value: "educativo",    label: "Educativo",    desc: "Claro e informativo",   Icon: BookOpenCheck },
            { value: "provocador",   label: "Provocador",   desc: "Questiona e desafia",   Icon: Flame },
            { value: "motivacional", label: "Motivacional", desc: "Energia e ação",        Icon: TrendingUp },
          ] as const).map(({ value, label, desc, Icon }) => (
            <Escolha
              key={value}
              ativo={tom === value}
              onClick={() => setTom(value)}
              Icon={Icon}
              titulo={label}
              descricao={desc}
            />
          ))}
        </div>
      </div>

      {/* Personagem (avatar) — a foto abre e fecha o vídeo com movimento suave. */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between h-auto py-2.5" size="sm">
            <span className="flex items-center gap-2 font-medium">
              <Drama className="h-4 w-4 text-primary" />
              Personagem do vídeo
              <span className="text-xs font-normal text-muted-foreground">
                {selectedAvatarId
                  ? avatars.find((a) => a.id === selectedAvatarId)?.name ?? "selecionado"
                  : "(opcional — abre e fecha o vídeo)"}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-3">
          {avatars.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum personagem ainda — crie um na aba <strong>Personagens</strong> para abrir seus vídeos com ele.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setSelectedAvatarId(null)}
                className={`rounded-xl border-2 overflow-hidden transition-all ${
                  selectedAvatarId === null ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="aspect-square bg-muted flex items-center justify-center text-xs text-muted-foreground">sem personagem</div>
                <p className="text-xs font-medium truncate px-2 py-1">Só clipes</p>
              </button>
              {avatars.map((av) => (
                <button
                  key={av.id}
                  type="button"
                  onClick={() => setSelectedAvatarId(av.id)}
                  className={`rounded-xl border-2 overflow-hidden text-left transition-all ${
                    selectedAvatarId === av.id ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="aspect-square bg-muted">
                    {av.photo_url
                      ? <img src={av.photo_url} alt={av.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">sem foto</div>}
                  </div>
                  <p className="text-xs font-medium truncate px-2 py-1">{av.name}</p>
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            A foto do personagem ganha movimento suave e abre/fecha o vídeo — os clipes reais contam a história no meio.
          </p>
        </CollapsibleContent>
      </Collapsible>

      {/* Duração e Plataforma alvo — orientam o agente de roteiro */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-muted-foreground">Duração alvo</Label>
          <Select value={duracaoAlvo} onValueChange={(v) => setDuracaoAlvo(v as DuracaoAlvo)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30s">30 segundos · ritmo acelerado</SelectItem>
              <SelectItem value="45s">45 segundos · equilibrado</SelectItem>
              <SelectItem value="60s">60 segundos · mais reflexivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-muted-foreground">Plataforma principal</Label>
          <Select value={plataformaAlvo} onValueChange={(v) => setPlataformaAlvo(v as PlataformaAlvo)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="geral">Geral · funciona em qualquer canal</SelectItem>
              <SelectItem value="instagram">Instagram · hook visual forte</SelectItem>
              <SelectItem value="tiktok">TikTok · hook ultra-rápido</SelectItem>
              <SelectItem value="linkedin">LinkedIn · mais reflexivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Seletor de formato narrativo (dropdown + preview) */}
      <div className="space-y-2">
        <Secao>Formato narrativo</Secao>
        <Select value={formato} onValueChange={(v) => setFormato(v as FormatoId)}>
          <SelectTrigger className="h-10">
            <SelectValue>
              <span className="flex items-center gap-2">
                <span className="text-base leading-none">{FORMATOS[formato].emoji}</span>
                <span className="font-medium">{FORMATOS[formato].nome}</span>
                <span className="text-muted-foreground text-xs">— {FORMATOS[formato].tagline}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(FORMATOS) as [FormatoId, (typeof FORMATOS)[FormatoId]][]).map(([id, f]) => (
              <SelectItem key={id} value={id}>
                <span className="flex items-center gap-2">
                  <span className="text-base leading-none">{f.emoji}</span>
                  <span className="font-medium">{f.nome}</span>
                  <span className="text-muted-foreground text-xs hidden sm:inline">— {f.tagline}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Preview do formato selecionado */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 space-y-2">
          {formato !== "livre" ? (
            <p className="text-sm italic text-muted-foreground leading-relaxed">{FORMATOS[formato].exemplo}</p>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">{FORMATOS.livre.exemplo}</p>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {FORMATOS[formato].tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Ação: a principal em destaque, a alternativa como texto — antes eram
          dois botões grandes de peso igual disputando o clique. */}
      <div className="space-y-2 pt-1">
        <Button
          className="h-11 w-full gap-2 shadow-md shadow-primary/20 transition-all active:scale-[0.99] disabled:shadow-none motion-reduce:transition-none motion-reduce:active:scale-100"
          size="lg"
          disabled={!objetivo.trim() || jobStatus.status === "loading"}
          onClick={handleNextStep}
        >
          {jobStatus.status === "loading"
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Escrevendo o roteiro…</>
            : <><Wand2 className="h-4 w-4" /> Gerar roteiro com IA</>}
        </Button>
        <button
          type="button"
          disabled={!objetivo.trim()}
          onClick={handleManualRoteiro}
          className="w-full rounded-lg py-1.5 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Prefiro escrever meu próprio roteiro
        </button>
      </div>
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <Cabecalho
          titulo="Revisar roteiro"
          subtitulo="Ajuste o texto, escolha a voz e o formato antes de gerar."
        />
        <span className="mt-1 flex shrink-0 items-center gap-1.5 text-[11px]">
          {draftSaved === "saving" && (
            <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Salvando…</span></>
          )}
          {draftSaved === "saved" && (
            <><CheckCircle2 className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600 dark:text-emerald-400">Salvo</span></>
          )}
        </span>
      </div>
      <StepIndicator />

      {/* Narração */}
      <div>
        <Secao>Narração</Secao>
        <Textarea rows={5} value={script.narracao}
          onChange={(e) => setScript({ ...script, narracao: e.target.value })}
          className="resize-none bg-background" />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {script.narracao.length} caracteres · aprox. {Math.round(script.narracao.length / 15)}s de narração
        </p>
      </div>

      {/* Slides */}
      {script.slides && script.slides.length > 0 ? (
        <div className="space-y-2">
          <Secao>Slides ({script.slides.length})</Secao>
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
                  {slide.usar_avatar && (
                    <Badge variant="outline" className="shrink-0 gap-1 text-xs text-primary border-primary/40">
                      <Drama className="h-3 w-3" /> personagem
                    </Badge>
                  )}
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

      {/* ── Cenas do vídeo (clipes reais por slide) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Secao>Cenas do vídeo</Secao>
          <Button variant="outline" size="sm" className="-mt-1 h-8 gap-1.5" onClick={loadPreviewClips} disabled={clipsLoading}>
            {clipsLoading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…</>
              : <><Search className="h-3.5 w-3.5" /> {previewClips.length ? "Buscar de novo" : "Ver as cenas"}</>}
          </Button>
        </div>
        {previewClips.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            O vídeo usa <strong>clipes de vídeo reais</strong> (Pexels/Pixabay) escolhidos pela IA.
            Clique em "Ver as cenas" para revisar e trocar qualquer clipe antes de gerar.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {previewClips.map((clip, i) => {
                const slideAvatar = script.slides?.[i]?.usar_avatar;
                const sceneAv = sceneAvatarIds[i] ? avatars.find((a) => a.id === sceneAvatarIds[i]) : null;
                return (
                  <div key={i} className="rounded-xl border overflow-hidden bg-card">
                    <div className="relative aspect-[9/16] max-h-44 w-full bg-muted">
                      {sceneAv ? (
                        sceneAv.photo_url ? (
                          <>
                            <img src={sceneAv.photo_url} alt={sceneAv.name} className="w-full h-full object-cover" />
                            <span className="absolute bottom-1 right-1 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] text-white flex items-center gap-1">
                              <Drama className="h-3 w-3" /> {sceneAv.name}
                            </span>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-center p-2">
                            <Drama className="h-6 w-6 text-primary" />
                            <span className="text-[11px] text-muted-foreground leading-tight">{sceneAv.name}</span>
                          </div>
                        )
                      ) : slideAvatar ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-center p-2">
                          <Drama className="h-6 w-6 text-primary" />
                          <span className="text-[11px] text-muted-foreground leading-tight">Seu personagem entra aqui</span>
                        </div>
                      ) : clip ? (
                        <>
                          <img src={clip.thumb} alt={`Cena ${i + 1}`} className="w-full h-full object-cover" />
                          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                            {clip.duration}s · {clip.source}
                          </span>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[11px] text-muted-foreground p-2 text-center">
                          sem clipe — a IA busca na hora
                        </div>
                      )}
                      <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                    </div>
                    {!slideAvatar && (
                      <Button variant="ghost" size="sm" className="w-full h-7 text-xs gap-1 rounded-none"
                        onClick={() => openSwapClip(i)}>
                        <RefreshCw className="h-3 w-3" /> Trocar
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Estes são os clipes que entram no vídeo, na ordem dos slides. Slides com o personagem usam a cena dele.
            </p>
          </>
        )}
      </div>

      {/* Dialog de troca de clipe */}
      <Dialog open={swapClipSlide !== null} onOpenChange={(open) => { if (!open) setSwapClipSlide(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Trocar o clipe da cena {swapClipSlide !== null ? swapClipSlide + 1 : ""}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={swapClipQuery}
              onChange={(e) => setSwapClipQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") searchSwapClips(swapClipQuery); }}
              placeholder="Buscar clipes (em inglês encontra mais)..."
              className="text-sm"
            />
            <Button size="sm" className="gap-1" disabled={swapClipLoading} onClick={() => searchSwapClips(swapClipQuery)}>
              {swapClipLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Buscar
            </Button>
          </div>
          {avatars.length > 0 && (
            <div className="space-y-1.5 border-b pb-3">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Drama className="h-3.5 w-3.5 text-primary" /> Ou use um personagem nesta cena
                <span className="font-normal">— a foto ganha um leve movimento, sem custo extra</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {avatars.map((av) => {
                  const active = swapClipSlide !== null && sceneAvatarIds[swapClipSlide] === av.id;
                  return (
                    <button key={av.id} type="button" onClick={() => pickSceneAvatar(av.id)}
                      className={`rounded-lg overflow-hidden border-2 transition-all ${active ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-primary/50"}`}
                      title={av.name}>
                      <div className="w-16 h-20 bg-muted">
                        {av.photo_url
                          ? <img src={av.photo_url} alt={av.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Drama className="h-5 w-5 text-muted-foreground" /></div>}
                      </div>
                      <span className="block text-[10px] font-medium truncate px-1 py-0.5 w-16">{av.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto">
            {swapClipLoading && swapClipResults.length === 0 && (
              <p className="col-span-3 text-center text-sm text-muted-foreground py-6">Buscando clipes...</p>
            )}
            {!swapClipLoading && swapClipResults.length === 0 && (
              <p className="col-span-3 text-center text-sm text-muted-foreground py-6">
                Nenhum clipe ainda — busque um termo acima.
              </p>
            )}
            {swapClipResults.map((clip, idx) => (
              <button key={idx} type="button" onClick={() => pickSwapClip(clip)}
                className="relative rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all">
                <img src={clip.thumb} alt="" className="w-full aspect-[9/16] object-cover" />
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  {clip.duration}s · {clip.source}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Voz ── */}
      <div className="space-y-3">
        <Secao>Voz da narração</Secao>

        {/* Seleção do modo */}
        <div className="grid grid-cols-3 gap-2">
          <Escolha
            ativo={voiceMode === "edge"}
            onClick={() => setVoiceMode("edge")}
            Icon={Mic}
            titulo="Automática"
            descricao="3 vozes pt-BR"
          />
          <Escolha
            ativo={voiceMode === "gravacao"}
            onClick={() => setVoiceMode("gravacao")}
            Icon={BookOpen}
            titulo="Gravar roteiro"
            descricao="Você lê o texto"
          />

          {/* "Minha voz" quando já há voz clonada salva no perfil */}
          <Escolha
            ativo={voiceMode === "elevenlabs"}
            onClick={() => setVoiceMode("elevenlabs")}
            Icon={Sparkles}
            titulo={cloneVoiceId ? "Minha voz" : "Voz clonada"}
            extra={
              <span className="mt-1 block">
                {vozStatus
                  ? <Badge variant="outline" className={`text-[10px] ${vozStatus.remaining > 0 ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400" : "border-amber-500/40 text-amber-600"}`}>
                      {vozStatus.remaining > 0 ? `${vozStatus.remaining} de ${vozStatus.quota} grátis no mês` : "cota do mês esgotada"}
                    </Badge>
                  : cloneVoiceId
                    ? <Badge variant="outline" className="border-emerald-600/40 text-[10px] text-emerald-700 dark:text-emerald-400">salva ✓</Badge>
                    : <Badge variant="outline" className="text-[10px]">Clone sua voz</Badge>}
              </span>
            }
          />
        </div>

        {/* Vozes automáticas */}
        {voiceMode === "edge" && (
          <div className="grid grid-cols-3 gap-2">
            {EDGE_VOICES.map((v) => (
              <Escolha
                key={v.id}
                ativo={edgeVoice === v.id}
                onClick={() => setEdgeVoice(v.id)}
                titulo={v.label}
                descricao={v.gender}
              />
            ))}
          </div>
        )}

        {/* Gravar o roteiro completo */}
        {voiceMode === "gravacao" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 border p-3 text-sm text-muted-foreground leading-relaxed max-h-36 overflow-y-auto">
              {script.narracao}
            </div>
            <div className="rounded-lg border border-amber-300/50 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2 flex items-start gap-2 text-xs">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-muted-foreground leading-relaxed">
                As <strong>legendas</strong> e os slides seguem o roteiro escrito acima — fale o mais próximo possível dele para manter a sincronia.
              </p>
            </div>
            <VoiceRecorder
              onRecorded={setNarBlob}
              label="Leia o texto acima em voz alta e grave aqui"
              hint="Fale de forma clara e natural — esse áudio será a narração do vídeo."
            />
          </div>
        )}

        {/* ElevenLabs — usa a voz salva no perfil, ou grava uma nova amostra */}
        {voiceMode === "elevenlabs" && (
          cloneVoiceId && !recloning ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Sua voz clonada salva será usada na narração.
              </span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                onClick={() => { setRecloning(true); setVoiceBlob(null); }}>
                <RotateCcw className="h-3 w-3" /> Regravar
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <VoiceRecorder
                onRecorded={setVoiceBlob}
                label="Grave uma amostra da sua voz (mín. 30 segundos)"
                hint="Pode ler qualquer texto. O ElevenLabs vai clonar sua voz, salvar no seu perfil e narrar o roteiro automaticamente."
              />
              {cloneVoiceId && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                  onClick={() => { setRecloning(false); setVoiceBlob(null); }}>
                  <RotateCcw className="h-3 w-3" /> Cancelar e usar minha voz salva
                </Button>
              )}
            </div>
          )
        )}

        {/* Cota grátis esgotada (só tier Gratuito): o usuário escolhe como seguir */}
        {voiceMode === "elevenlabs" && vozStatus && vozStatus.remaining === 0 && (
          <div className="rounded-lg border border-amber-300/50 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong>Sua cota grátis de voz clonada acabou este mês</strong> ({vozStatus.quota} vídeos).
              Escolha como gerar este vídeo:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Card
                className={`cursor-pointer border-2 transition-all ${overQuotaChoice === "creditos" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                onClick={() => setOverQuotaChoice("creditos")}
              >
                <CardContent className="p-2.5 text-center space-y-0.5">
                  <p className="font-medium text-xs">Usar créditos</p>
                  <p className="text-[11px] text-muted-foreground">Mantém sua voz clonada</p>
                </CardContent>
              </Card>
              <Card
                className={`cursor-pointer border-2 transition-all ${overQuotaChoice === "edge" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                onClick={() => setOverQuotaChoice("edge")}
              >
                <CardContent className="p-2.5 text-center space-y-0.5">
                  <p className="font-medium text-xs">Voz automática</p>
                  <p className="text-[11px] text-muted-foreground">Grátis (3 vozes pt-BR)</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>




      {/* Formato */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Secao>Formato</Secao>
          {!formatTouched && plataformaAlvo !== "geral" && (
            <span className="text-xs text-muted-foreground">
              Sugerido para {plataformaAlvo === "linkedin" ? "LinkedIn" : plataformaAlvo === "tiktok" ? "TikTok" : "Instagram"}
            </span>
          )}
        </div>
        {formatTouched && format !== PLATAFORMA_FORMATO_PADRAO[plataformaAlvo] && plataformaAlvo !== "geral" && (
          <div className="rounded-lg border border-amber-300/50 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2 flex items-start gap-2 text-xs">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-muted-foreground leading-relaxed">
              Você escolheu plataforma <strong>{plataformaAlvo === "linkedin" ? "LinkedIn" : plataformaAlvo === "tiktok" ? "TikTok" : "Instagram"}</strong> mas formato{" "}
              <strong>{format === "portrait" ? "Vertical" : format === "square" ? "Quadrado" : "Paisagem"}</strong>. O vídeo pode ficar com cortes nessa plataforma.{" "}
              <button
                type="button"
                className="underline text-amber-700 dark:text-amber-400"
                onClick={() => { setFormat(PLATAFORMA_FORMATO_PADRAO[plataformaAlvo]); setFormatTouched(false); }}
              >
                Usar formato recomendado
              </button>
            </p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {([
            { v: "portrait",  Icon: Smartphone, t: "Vertical",  d: "Reels · TikTok · Stories" },
            { v: "square",    Icon: Square,     t: "Quadrado",  d: "Feed Instagram · LinkedIn" },
            { v: "landscape", Icon: Monitor,    t: "Paisagem",  d: "YouTube · Feed" },
          ] as const).map(({ v, Icon, t, d }) => (
            <Escolha
              key={v}
              ativo={format === v}
              onClick={() => { setFormat(v); setFormatTouched(true); }}
              Icon={Icon}
              titulo={t}
              descricao={d}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={() => setStep(1)}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Button
          className="h-11 flex-1 gap-2 shadow-md shadow-primary/20 transition-all active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
          size="lg"
          onClick={handleGenerate}
        >
          <Film className="h-5 w-5" /> Gerar vídeo
        </Button>
      </div>
    </div>
  );

  // ── Step 3 ─────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Cabecalho
        titulo="Criar Vídeo"
        subtitulo={jobStatus.status === "done" ? "Seu vídeo está pronto." : "Montando o seu vídeo."}
      />
      <StepIndicator />

      {jobStatus.status === "processing" && (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          {/* Palco escuro com a luz de cena — mesma linguagem do Clonar Vídeo */}
          <div className="relative flex flex-col items-center gap-4 overflow-hidden bg-[#0a0e0d] px-6 py-10">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-28 h-64 bg-[radial-gradient(55%_100%_at_50%_0%,hsl(var(--primary)/0.22),transparent_72%)]"
            />
            <span className="relative z-10 grid h-14 w-14 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </span>
            <div className="relative z-10 text-center">
              <p className="text-[15px] font-medium text-white">Gerando seu vídeo…</p>
              <p className="mt-1 text-xs text-white/60">{jobStatus.step}</p>
            </div>
            <div className="relative z-10 w-full max-w-xs space-y-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${jobStatus.progress || 0}%` }}
                />
              </div>
              <p className="text-center text-[11px] tabular-nums text-white/60">
                {jobStatus.progress || 0}%
              </p>
            </div>
          </div>

          {/* Tempo decorrido + tempo médio */}
          <div className="grid grid-cols-2 divide-x divide-border/70 border-t border-border/70">
            <div className="px-4 py-3 text-center">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Decorrido</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums">
                {`${String(Math.floor(localElapsed / 60)).padStart(2, "0")}:${String(localElapsed % 60).padStart(2, "0")}`}
              </p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {avgSeconds ? "Média" : "Estimativa"}
              </p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-muted-foreground">
                {avgSeconds
                  ? `~${String(Math.floor(avgSeconds / 60)).padStart(2, "0")}:${String(Math.round(avgSeconds % 60)).padStart(2, "0")}`
                  : "~02:00"}
              </p>
            </div>
          </div>

          <div className="border-t border-border/70 px-4 py-2.5">
            <p className="text-center text-[11px] text-muted-foreground">
              Pode sair desta tela — o vídeo continua sendo gerado no servidor.
            </p>
          </div>
        </div>
      )}

      {jobStatus.status === "done" && (
        <div className="space-y-6">
          {/* Preview + ações principais */}
          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-4 pb-4 pt-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-tight">Vídeo pronto</p>
                  <p className="truncate text-sm text-muted-foreground">{jobStatus.titulo}</p>
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
              <div className="flex flex-wrap gap-2">
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
                {/* Volta para a edição mantendo roteiro, fotos, tema e voz — só regerar */}
                <Button variant="outline" className="flex-1 gap-2" onClick={() => { setShowPublish(false); setStep(2); }}>
                  <ChevronLeft className="h-4 w-4" /> Editar
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

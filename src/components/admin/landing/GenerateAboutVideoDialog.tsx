import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, Loader2, Clapperboard, Crown, RefreshCw, Mic, Square, CheckCircle2, RotateCcw, Upload, Video, Music, Captions, Image as ImageIcon, Link as LinkIcon, PlayCircle, Type } from "lucide-react";

const VIDEO_API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

const EDGE_VOICES = [
  { id: "pt-BR-FranciscaNeural", label: "Francisca (feminina)" },
  { id: "pt-BR-ThalitaNeural", label: "Thalita (feminina, jovem)" },
  { id: "pt-BR-AntonioNeural", label: "Antônio (masculina)" },
];

type Tier = "premium" | "pro";
type VoiceMode = "neural" | "clone";

// ── Gravador compacto de amostra de voz (pro clone ElevenLabs) ──
function useSampleRecorder() {
  const [state, setState] = useState<"idle" | "recording" | "done">("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        const b = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setBlob(b);
        setAudioUrl(URL.createObjectURL(b));
        setState("done");
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recRef.current = rec;
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone", {
        description: "Verifique a permissão do navegador.",
      });
    }
  }
  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    recRef.current?.stop();
  }
  function reset() {
    setState("idle"); setBlob(null); setSeconds(0);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  }
  return { state, seconds, blob, audioUrl, start, stop, reset };
}

function useTierCost(serviceKey: string, enabled: boolean) {
  return useQuery({
    queryKey: ["credit-estimate", serviceKey, 1],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("calculate-credits", {
        body: { service_key: serviceKey, units: 1 },
      });
      if (error) throw error;
      return data as { credits_required: number; current_balance: number };
    },
  });
}

// Vídeo "direto" (editável): arquivo .mp4/.webm/.mov ou URL do nosso storage.
// Link de YouTube/Vimeo não dá pra editar (worker não baixa stream).
function isDirectVideo(url?: string | null): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return /\.(mp4|webm|mov)(\?|$)/.test(u) || u.includes("/storage/v1/object/public/");
}

function SourceBtn({ active, onClick, disabled, icon: Icon, label }: {
  active: boolean; onClick: () => void; disabled?: boolean; icon: any; label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
        active ? "border-primary bg-primary/5 ring-1 ring-primary text-foreground" : "text-muted-foreground hover:bg-muted/50"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

interface GenerateAboutVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professionalSlug: string;
  professionalId: string;
  professionalName: string;
  photoUrl: string | null; // foto que será animada (about_image_url ou foto de perfil)
  currentVideoUrl?: string | null; // vídeo atual da seção Sobre (pré-carregado no estúdio)
  savedVoiceId: string | null; // clone ElevenLabs já salvo no perfil (reusado)
  onDone: (videoUrl: string) => void;
  /** Deep-link do Axel: rascunho de roteiro já preparado + molde escolhido na conversa */
  initialDraftId?: string | null;
  initialTier?: Tier | null;
}

export default function GenerateAboutVideoDialog({
  open,
  onOpenChange,
  professionalSlug,
  professionalId,
  professionalName,
  photoUrl,
  currentVideoUrl,
  savedVoiceId,
  onDone,
  initialDraftId,
  initialTier,
}: GenerateAboutVideoDialogProps) {
  const qc = useQueryClient();
  const [tier, setTier] = useState<Tier>(initialTier ?? "premium");
  const [voice, setVoice] = useState(EDGE_VOICES[0].id);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(savedVoiceId ? "clone" : "neural");
  const [cloneVoiceId, setCloneVoiceId] = useState<string | null>(savedVoiceId);
  const [recloning, setRecloning] = useState(false); // regravar mesmo tendo voz salva
  const [cloning, setCloning] = useState(false);
  const recorder = useSampleRecorder();

  // Origem do vídeo: "foto" = animar a foto (Kling); "video" = editar um footage real.
  const [source, setSource] = useState<"foto" | "video">("foto");
  const [footageFile, setFootageFile] = useState<File | null>(null);
  const [footageSource, setFootageSource] = useState<"upload" | "atual" | "link">("upload");
  const [footageLink, setFootageLink] = useState("");
  const [instrucoes, setInstrucoes] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [legendas, setLegendas] = useState(true);
  const [grade, setGrade] = useState("warm_cinematic");
  const [musica, setMusica] = useState(true);
  const [marca, setMarca] = useState(true);
  const [marcaSubtitulo, setMarcaSubtitulo] = useState("");
  const footageInputRef = useRef<HTMLInputElement | null>(null);

  // Preview do arquivo enviado (object URL) — liberado ao trocar/fechar.
  const footageObjectUrl = useMemo(
    () => (footageFile ? URL.createObjectURL(footageFile) : null),
    [footageFile],
  );
  useEffect(() => () => { if (footageObjectUrl) URL.revokeObjectURL(footageObjectUrl); }, [footageObjectUrl]);

  const currentEditable = isDirectVideo(currentVideoUrl);
  // Vídeo que será editado/demonstrado conforme a fonte escolhida.
  const editablePreview =
    footageSource === "upload" ? footageObjectUrl
    : footageSource === "atual" ? (currentVideoUrl || null)
    : (isDirectVideo(footageLink) ? footageLink : null);
  const hasFootage =
    footageSource === "upload" ? !!footageFile
    : footageSource === "atual" ? !!currentVideoUrl
    : isDirectVideo(footageLink);

  // Ao abrir no modo vídeo, pré-carrega o vídeo atual como ponto de partida.
  useEffect(() => {
    if (open && source === "video") setFootageSource(currentEditable ? "atual" : "upload");
  }, [open, source, currentEditable]);

  // Formato do vídeo segue a proporção da FOTO (foto 1:1 → vídeo 1:1; alta → 9:16).
  // Evita esticar a imagem e a seção Sobre renderiza qualquer proporção.
  const [videoFormat, setVideoFormat] = useState<"portrait" | "square">("portrait");
  useEffect(() => {
    if (!photoUrl) return;
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      setVideoFormat(ratio > 0.85 ? "square" : "portrait");
    };
    img.src = photoUrl;
  }, [photoUrl]);
  const [script, setScript] = useState<Record<string, any> | null>(null);
  const [narracao, setNarracao] = useState("");
  const [phase, setPhase] = useState<"roteiro" | "pronto" | "gerando">("roteiro");
  const [roteiroLoading, setRoteiroLoading] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; step: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const premiumCost = useTierCost("kling_premium", open);
  const proCost = useTierCost("kling_pro", open);
  const selectedCost = tier === "premium" ? premiumCost.data?.credits_required : proCost.data?.credits_required;
  const balance = premiumCost.data?.current_balance ?? proCost.data?.current_balance;
  const canAfford = selectedCost != null && balance != null && balance >= selectedCost;

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Deep-link do Axel: carrega o rascunho preparado na conversa
  useEffect(() => {
    if (!open || !initialDraftId || script) return;
    fetch(`${VIDEO_API}/video-roteiro/${initialDraftId}?professional_slug=${professionalSlug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.script_json) {
          setScript(data.script_json);
          setNarracao(data.script_json.narracao ?? data.script_json.narracao_completa ?? "");
          setPhase("pronto");
        }
      })
      .catch(() => toast.error("Não foi possível carregar o roteiro preparado pelo Axel."));
  }, [open, initialDraftId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function gerarRoteiro() {
    setRoteiroLoading(true);
    try {
      const res = await fetch(`${VIDEO_API}/gerar-roteiro-institucional`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professionalSlug,
          model: tier === "pro" ? "claude-opus-4-8" : "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      const data = await res.json();
      setScript(data);
      setNarracao(data.narracao ?? "");
      setPhase("pronto");
    } catch (e: any) {
      toast.error("Erro ao gerar o roteiro", { description: e?.message });
    } finally {
      setRoteiroLoading(false);
    }
  }

  async function clonarVoz() {
    if (!recorder.blob) return;
    setCloning(true);
    try {
      const form = new FormData();
      form.append("audio", recorder.blob, "amostra.webm");
      form.append("nome", professionalName || "Profissional");
      const res = await fetch(`${VIDEO_API}/clone-voz`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      const { voice_id } = await res.json();
      // Clona 1x e salva no perfil — os próximos vídeos reusam a voz
      const { error } = await supabase
        .from("professionals" as any)
        .update({ elevenlabs_voice_id: voice_id })
        .eq("id", professionalId);
      if (error) console.error("Falha ao salvar voice_id no perfil:", error.message);
      qc.invalidateQueries({ queryKey: ["my-professional"] });
      setCloneVoiceId(voice_id);
      setRecloning(false);
      recorder.reset();
      toast.success("Voz clonada e salva no seu perfil!", {
        description: "Ela será usada neste e nos próximos vídeos.",
      });
    } catch (e: any) {
      toast.error("Erro ao clonar a voz", { description: e?.message });
    } finally {
      setCloning(false);
    }
  }

  async function gerarVideo() {
    if (!script || !photoUrl || !canAfford) return;
    if (voiceMode === "clone" && !cloneVoiceId) return;
    setPhase("gerando");
    setProgress({ pct: 5, step: "Enviando..." });
    try {
      // Narração editada vale sobre os trechos por cena
      const finalScript = {
        ...script,
        narracao: narracao.trim(),
        slides: (script.slides ?? []).map((s: any) => {
          const { narracao_slide: _drop, ...rest } = s;
          return narracao.trim() !== (script.narracao ?? "").trim() ? rest : s;
        }),
      };
      const res = await fetch(`${VIDEO_API}/estudio-viral/gerar-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professionalSlug,
          script: finalScript,
          photo_url: photoUrl,
          tier,
          voice,
          voice_provider: voiceMode === "clone" && cloneVoiceId ? "elevenlabs" : "edge",
          elevenlabs_voice_id: voiceMode === "clone" ? cloneVoiceId : undefined,
          format: videoFormat,
          set_about_video: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      const { job_id } = await res.json();
      startPolling(job_id, "Vídeo institucional pronto e aplicado na sua página! 🎉");
    } catch (e: any) {
      setPhase("pronto");
      setProgress(null);
      toast.error("Erro ao iniciar a geração", { description: e?.message });
    }
  }

  // Polling compartilhado pelos dois fluxos (animar foto / editar vídeo).
  function startPolling(jobId: string, successMsg: string) {
    pollRef.current = setInterval(async () => {
      try {
        const st = await (await fetch(`${VIDEO_API}/status/${jobId}`)).json();
        if (st.status === "done") {
          if (pollRef.current) clearInterval(pollRef.current);
          qc.invalidateQueries({ queryKey: ["credit-balance"] });
          toast.success(successMsg);
          onDone(st.video_url);
          onOpenChange(false);
          setPhase("pronto");
          setProgress(null);
        } else if (st.status === "error" || st.status === "cancelled") {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase("pronto");
          setProgress(null);
          toast.error("A geração falhou", { description: st.message });
        } else {
          setProgress({ pct: st.progress ?? 50, step: st.step ?? "Gerando..." });
        }
      } catch { /* tenta de novo no próximo tick */ }
    }, 5000);
  }

  // Fluxo "Editar um vídeo meu": fonte (upload/atual/link) → corte automático no worker.
  async function editarVideo() {
    if (!hasFootage) return;
    setPhase("gerando");
    setProgress({ pct: 5, step: "Preparando…" });
    try {
      const body: Record<string, any> = {
        professional_slug: professionalSlug,
        legendas, grade, musica,
        marca,
        marca_nome: professionalName,
        marca_subtitulo: marcaSubtitulo.trim(),
        instrucoes: instrucoes.trim(),
        set_about_video: true,
      };

      if (footageSource === "upload") {
        setProgress({ pct: 5, step: "Enviando seu vídeo…" });
        const form = new FormData();
        form.append("file", footageFile!, footageFile!.name);
        const up = await fetch(`${VIDEO_API}/upload-footage`, { method: "POST", body: form });
        if (!up.ok) throw new Error(`Falha ao enviar o vídeo (${up.status})`);
        body.footage_path = (await up.json()).path;
      } else {
        body.footage_url = footageSource === "atual" ? currentVideoUrl : footageLink.trim();
      }

      const res = await fetch(`${VIDEO_API}/editar-institucional`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status}`);
      }
      const { job_id } = await res.json();
      startPolling(job_id, "Seu vídeo foi editado e aplicado na sua página! 🎉");
    } catch (e: any) {
      setPhase("pronto");
      setProgress(null);
      toast.error("Erro ao editar o vídeo", { description: e?.message });
    }
  }

  const gerando = phase === "gerando";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!gerando) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-primary" />
            Gerar vídeo institucional com IA
          </DialogTitle>
          <DialogDescription>
            {source === "foto"
              ? "Sua foto ganha vida com movimento suave, narração e legendas — e o vídeo entra direto na seção Sobre. (A narração é em voz off, sem sincronia labial.)"
              : "Envie um vídeo seu falando à câmera: a IA corta as hesitações e os silêncios, sincroniza legendas e equaliza o áudio — e aplica direto na seção Sobre."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Origem: animar a foto (Kling) OU editar um vídeo real do profissional */}
          <div className="flex rounded-lg border overflow-hidden text-sm">
            <button
              type="button"
              disabled={gerando}
              onClick={() => setSource("foto")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 transition ${source === "foto" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
            >
              <ImageIcon className="h-3.5 w-3.5" /> Animar minha foto
            </button>
            <button
              type="button"
              disabled={gerando}
              onClick={() => setSource("video")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 transition ${source === "video" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
            >
              <Video className="h-3.5 w-3.5" /> Editar um vídeo meu
            </button>
          </div>

          {source === "foto" && (!photoUrl ? (
            <p className="text-sm text-destructive">
              Adicione uma foto primeiro (imagem da seção Sobre ou foto de perfil) — é ela que será animada.
            </p>
          ) : (
            <div className="space-y-4">
            <div className="flex gap-3 items-start">
              <img src={photoUrl} alt="Foto a animar" className="w-20 h-20 rounded-lg object-cover border" />
              <div className="flex-1 space-y-2">
                <Label>Plano</Label>
                <div className="flex gap-2">
                  {(["premium", "pro"] as Tier[]).map((t) => {
                    const cost = t === "premium" ? premiumCost.data?.credits_required : proCost.data?.credits_required;
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={gerando}
                        onClick={() => setTier(t)}
                        className={`flex-1 rounded-lg border p-2.5 text-left transition ${
                          tier === t ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {t === "pro" ? <Crown className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                          {t === "pro" ? "PRO" : "Premium"}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {cost != null ? `${cost} créditos` : "..."}
                          {t === "pro" ? " · roteiro Opus + Kling topo" : " · Kling"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!canAfford && selectedCost != null && (
                  <p className="text-xs text-destructive">
                    Saldo insuficiente ({balance ?? 0}/{selectedCost}).
                  </p>
                )}
              </div>
            </div>

            {phase === "roteiro" && (
              <Button onClick={gerarRoteiro} disabled={roteiroLoading} className="w-full gap-2">
                {roteiroLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Escrevendo seu roteiro…</>
                  : <><Sparkles className="h-4 w-4" /> Gerar roteiro de apresentação (grátis)</>}
              </Button>
            )}

            {script && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="inst-narracao">Roteiro (edite à vontade)</Label>
                  <Button variant="ghost" size="sm" className="gap-1 h-7" onClick={gerarRoteiro} disabled={roteiroLoading || gerando}>
                    <RefreshCw className={`h-3 w-3 ${roteiroLoading ? "animate-spin" : ""}`} />
                    Regerar
                  </Button>
                </div>
                <Textarea
                  id="inst-narracao"
                  rows={7}
                  value={narracao}
                  onChange={(e) => setNarracao(e.target.value)}
                  disabled={gerando}
                />
                <div className="space-y-1.5">
                  <Label>Voz da narração</Label>
                  <div className="flex rounded-md border overflow-hidden w-fit">
                    <button
                      type="button"
                      onClick={() => setVoiceMode("neural")}
                      disabled={gerando}
                      className={`px-3 py-1.5 text-xs transition ${voiceMode === "neural" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
                    >
                      Voz neural
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceMode("clone")}
                      disabled={gerando}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs transition ${voiceMode === "clone" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
                    >
                      <Mic className="h-3 w-3" />
                      Minha voz {cloneVoiceId ? "(salva ✓)" : "(clonar)"}
                    </button>
                  </div>

                  {voiceMode === "neural" ? (
                    <Select value={voice} onValueChange={setVoice} disabled={gerando}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EDGE_VOICES.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : cloneVoiceId && !recloning ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        Sua voz clonada será usada na narração.
                      </span>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setRecloning(true)} disabled={gerando}>
                        <RotateCcw className="h-3 w-3" /> Regravar
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      {recorder.state === "idle" && (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Grave ~30-60s lendo o roteiro acima com voz natural — a IA clona e
                            salva no seu perfil pra usar em todos os vídeos.
                          </p>
                          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={recorder.start}>
                            <Mic className="h-3.5 w-3.5 text-red-500" /> Gravar amostra
                          </Button>
                        </>
                      )}
                      {recorder.state === "recording" && (
                        <div className="space-y-2 text-center">
                          <p className="text-sm font-mono font-bold text-red-500 animate-pulse">
                            ● {Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, "0")}
                          </p>
                          <Button variant="destructive" size="sm" className="w-full gap-1.5" onClick={recorder.stop}>
                            <Square className="h-3.5 w-3.5" /> Parar gravação
                          </Button>
                        </div>
                      )}
                      {recorder.state === "done" && recorder.audioUrl && (
                        <div className="space-y-2">
                          <audio src={recorder.audioUrl} controls className="w-full h-8" />
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={recorder.reset} disabled={cloning}>
                              <RotateCcw className="h-3 w-3" /> Regravar
                            </Button>
                            <Button size="sm" className="flex-1 gap-1.5" onClick={clonarVoz} disabled={cloning}>
                              {cloning
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Clonando…</>
                                : <><Mic className="h-3.5 w-3.5" /> Clonar e salvar minha voz</>}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            </div>
          ))}

          {source === "video" && (
            <div className="space-y-4">
              {/* Player / arrasta-e-solta em destaque */}
              <input
                ref={footageInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0] ?? null; setFootageFile(f); if (f) setFootageSource("upload"); }}
              />
              <div
                onDragOver={(e) => { e.preventDefault(); if (!gerando) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && f.type.startsWith("video/")) { setFootageFile(f); setFootageSource("upload"); }
                }}
                className={`relative overflow-hidden rounded-xl border bg-black/90 transition ${dragOver ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
              >
                {editablePreview ? (
                  <video key={editablePreview} src={editablePreview} controls playsInline className="mx-auto max-h-[42vh] w-full bg-black object-contain" />
                ) : (
                  <button
                    type="button"
                    disabled={gerando}
                    onClick={() => footageInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-2 py-14 text-center"
                  >
                    <Upload className="h-7 w-7 text-muted-foreground" />
                    <span className="text-sm font-medium">Arraste um vídeo aqui ou clique para enviar</span>
                    <span className="text-xs text-muted-foreground">MP4/MOV · fale solto que a IA corta o que sobra</span>
                  </button>
                )}
                {dragOver && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center bg-primary/10 text-sm font-medium text-primary">
                    Solte o vídeo
                  </div>
                )}
              </div>

              {/* Fonte do vídeo a editar */}
              <div className="space-y-2.5 rounded-xl border p-3">
                <p className="text-sm font-medium">Qual vídeo editar?</p>
                <div className="flex flex-wrap gap-2">
                  {currentEditable && (
                    <SourceBtn active={footageSource === "atual"} disabled={gerando} icon={PlayCircle} label="Vídeo atual" onClick={() => setFootageSource("atual")} />
                  )}
                  <SourceBtn active={footageSource === "upload" && !!footageFile} disabled={gerando} icon={Upload} label={footageFile ? "Trocar arquivo" : "Enviar arquivo"} onClick={() => footageInputRef.current?.click()} />
                  <SourceBtn active={footageSource === "link"} disabled={gerando} icon={LinkIcon} label="Colar link" onClick={() => setFootageSource("link")} />
                </div>
                {footageSource === "upload" && footageFile && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> {footageFile.name}
                  </p>
                )}
                {footageSource === "link" && (
                  <Input value={footageLink} onChange={(e) => setFootageLink(e.target.value)} disabled={gerando} placeholder="Link direto do vídeo (.mp4) — YouTube não dá pra editar" />
                )}
              </div>

              {/* Instruções pro editor IA */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-instr">
                  O que você quer mudar? <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                  id="edit-instr"
                  rows={2}
                  value={instrucoes}
                  onChange={(e) => setInstrucoes(e.target.value)}
                  disabled={gerando}
                  placeholder="Ex: tire as pausas longas · deixe com 30s · comece pela parte do consultório"
                />
              </div>

              {/* Ajustes */}
              <div className="space-y-3 rounded-xl border p-3">
                <p className="text-sm font-medium">Ajustes</p>

                <div className="space-y-2">
                  <button type="button" disabled={gerando} onClick={() => setMarca((v) => !v)} className="flex w-full items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Type className="h-3.5 w-3.5" /> Selo com meu nome
                    </span>
                    <span className={`relative h-5 w-9 rounded-full transition ${marca ? "bg-primary" : "bg-muted-foreground/30"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${marca ? "left-[18px]" : "left-0.5"}`} />
                    </span>
                  </button>
                  {marca && (
                    <Input value={marcaSubtitulo} onChange={(e) => setMarcaSubtitulo(e.target.value)} disabled={gerando} placeholder="Subtítulo — ex: Psicóloga · CRP 06/12345" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={gerando} onClick={() => setLegendas((v) => !v)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${legendas ? "border-primary bg-primary/5 ring-1 ring-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
                    <Captions className="h-3.5 w-3.5" /> Legendas {legendas ? "on" : "off"}
                  </button>
                  <button type="button" disabled={gerando} onClick={() => setMusica((v) => !v)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${musica ? "border-primary bg-primary/5 ring-1 ring-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
                    <Music className="h-3.5 w-3.5" /> Trilha {musica ? "on" : "off"}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Tratamento de cor</Label>
                  <Select value={grade} onValueChange={setGrade} disabled={gerando}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="warm_cinematic">Cinematográfico quente</SelectItem>
                      <SelectItem value="neutral_punch">Neutro com contraste</SelectItem>
                      <SelectItem value="subtle">Sutil (quase nada)</SelectItem>
                      <SelectItem value="none">Nenhum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {gerando && progress && (
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress.pct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground text-center">{progress.step} ({progress.pct}%) — pode levar alguns minutos</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>
            {gerando ? "Gerando…" : "Cancelar"}
          </Button>
          {source === "foto" ? (
            <Button
              onClick={gerarVideo}
              disabled={!script || !narracao.trim() || gerando || !canAfford || !photoUrl || (voiceMode === "clone" && !cloneVoiceId)}
              title={voiceMode === "clone" && !cloneVoiceId ? "Grave e clone sua voz primeiro (ou use a voz neural)" : undefined}
              className="gap-2"
            >
              {gerando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando vídeo…</>
                : <><Clapperboard className="h-4 w-4" /> Gerar por {selectedCost ?? "…"} créditos</>}
            </Button>
          ) : (
            <Button onClick={editarVideo} disabled={!hasFootage || gerando} className="gap-2">
              {gerando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Editando vídeo…</>
                : <><Clapperboard className="h-4 w-4" /> Editar e aplicar</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

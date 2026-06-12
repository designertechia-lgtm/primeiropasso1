import { useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, Loader2, Clapperboard, Crown, RefreshCw, Mic, Square, CheckCircle2, RotateCcw } from "lucide-react";

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

interface GenerateAboutVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professionalSlug: string;
  professionalId: string;
  professionalName: string;
  photoUrl: string | null; // foto que será animada (about_image_url ou foto de perfil)
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

      pollRef.current = setInterval(async () => {
        try {
          const st = await (await fetch(`${VIDEO_API}/status/${job_id}`)).json();
          if (st.status === "done") {
            if (pollRef.current) clearInterval(pollRef.current);
            qc.invalidateQueries({ queryKey: ["credit-balance"] });
            toast.success("Vídeo institucional pronto e aplicado na sua página! 🎉");
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
    } catch (e: any) {
      setPhase("pronto");
      setProgress(null);
      toast.error("Erro ao iniciar a geração", { description: e?.message });
    }
  }

  const gerando = phase === "gerando";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!gerando) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-primary" />
            Gerar vídeo institucional com IA
          </DialogTitle>
          <DialogDescription>
            Sua foto ganha vida com movimento suave, narração e legendas — e o vídeo entra
            direto na seção Sobre. (A narração é em voz off, sem sincronia labial.)
          </DialogDescription>
        </DialogHeader>

        {!photoUrl ? (
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

            {gerando && progress && (
              <div className="space-y-2">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress.pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground text-center">{progress.step} ({progress.pct}%) — pode levar alguns minutos</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>
            {gerando ? "Gerando…" : "Cancelar"}
          </Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

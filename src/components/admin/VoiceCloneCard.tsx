// Clonagem da voz do profissional dentro de Configurações (fecha o loop do áudio do Axel:
// só dá pra responder em áudio quem tem voz clonada). Reusa o endpoint /clone-voz da video-api
// e salva em professionals.elevenlabs_voice_id — mesma rota dos vídeos.
import { useState, useRef, useEffect } from "react";
import { Mic, Square, Circle, RotateCcw, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const VIDEO_API = (import.meta.env.VITE_VIDEO_API_URL as string) || "https://video-api.primeiropasso.online";

// Roteiro de ~40s: caloroso e foneticamente variado (afirmações, pausa, instrução suave) —
// rende uma amostra melhor pro ElevenLabs do que a pessoa improvisando.
const ROTEIRO_CLONE =
  "Olá! Seja muito bem-vindo. É um prazer enorme poder falar com você hoje. Sabe, a vida anda " +
  "corrida, cheia de compromissos, e às vezes a gente esquece de cuidar de quem mais importa: nós " +
  "mesmos. Eu acredito que todo mundo merece um espaço de acolhimento, calma e atenção de verdade. " +
  "Por isso, quero que você se sinta tranquilo aqui comigo. Vamos caminhar juntos, no seu tempo, " +
  "sem pressa, um passo de cada vez. Respira fundo, relaxa os ombros. Pode contar comigo para te " +
  "ouvir com carinho e ajudar você a encontrar mais leveza, equilíbrio e bem-estar no seu dia a dia. Até já!";

export function VoiceCloneCard({
  professionalId,
  professionalName,
  currentVoiceId,
  disabled,
}: {
  professionalId?: string;
  professionalName?: string;
  currentVoiceId?: string | null;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "recording" | "done">("idle");
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { timerRef.current && clearInterval(timerRef.current); }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        blobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
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

  const reset = () => { blobRef.current = null; setAudioUrl(null); setState("idle"); setSeconds(0); };
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const clonar = async () => {
    if (!blobRef.current || !professionalId) return;
    setCloning(true);
    try {
      const form = new FormData();
      form.append("audio", blobRef.current, "amostra.webm");
      form.append("nome", professionalName || "Profissional");
      const res = await fetch(`${VIDEO_API}/clone-voz`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const msg = (data as any)?.detail || "Erro ao clonar a voz";
        const isPlano = res.status === 402 || /plano|subscription|plan/i.test(String(msg));
        toast.error(isPlano ? "O plano ElevenLabs não inclui clonagem de voz." : msg, { duration: 7000 });
        return;
      }
      if ((data as any)?.voice_id) {
        await supabase.from("professionals").update({ elevenlabs_voice_id: (data as any).voice_id } as any).eq("id", professionalId);
        queryClient.invalidateQueries({ queryKey: ["my-professional"] });
        toast.success("Voz clonada e salva! Já pode marcar etapas pra responder em áudio.");
        reset();
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao clonar a voz");
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Sua voz para os áudios</p>
        {currentVoiceId ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Voz clonada
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Ainda não clonada</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Para o Axel responder em áudio na sua voz, grave o roteiro abaixo (~40s), lendo com calma e
        naturalidade.{currentVoiceId ? " Gravar de novo substitui a voz atual." : ""}
      </p>

      {/* Roteiro pra ler em voz alta durante a gravação */}
      <div className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
        {ROTEIRO_CLONE}
      </div>

      {state === "idle" && (
        <Button onClick={start} disabled={disabled} variant="outline" className="w-full gap-2">
          <Mic className="h-4 w-4 text-red-500" /> {currentVoiceId ? "Regravar minha voz" : "Gravar minha voz"}
        </Button>
      )}

      {state === "recording" && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-red-500 font-mono text-lg font-bold animate-pulse">
            <Circle className="h-3 w-3 fill-red-500" /> {fmt(seconds)}
          </div>
          <Button onClick={stop} variant="destructive" className="w-full gap-2">
            <Square className="h-4 w-4" /> Parar gravação
          </Button>
        </div>
      )}

      {state === "done" && audioUrl && (
        <div className="space-y-2">
          <audio src={audioUrl} controls className="w-full h-8" />
          <div className="flex gap-2">
            <Button onClick={reset} disabled={cloning} variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
              <RotateCcw className="h-3 w-3" /> Regravar
            </Button>
            <Button onClick={clonar} disabled={cloning} size="sm" className="flex-1 gap-1.5">
              {cloning ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Clonando…</>
              ) : (
                <><Mic className="h-3.5 w-3.5" /> Clonar e salvar minha voz</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

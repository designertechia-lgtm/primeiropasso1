import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useProfessional } from "@/hooks/useProfessional";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Clapperboard, Wand2, Loader2, Heart, BookOpenCheck, Flame, TrendingUp,
  Users, Sparkles, CheckCircle2,
} from "lucide-react";
import { videoApiAuthHeaders } from "@/lib/videoApi";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

type Tom = "acolhedor" | "educativo" | "provocador" | "motivacional";
type AvatarLite = { id: string; name: string; photo_url: string | null };
type JobStatus = {
  status: "idle" | "processing" | "done" | "error";
  progress?: number;
  step?: string;
  video_url?: string;
  message?: string;
};

// Fluxo independente: clonagem FIEL via Kling O1 Edit (vídeo-para-vídeo real —
// recebe o vídeo original de verdade e preserva movimentos/timing exatos).
// Decisão consciente do Carlos (24/07): sem a proteção de "nunca reusar
// ativos do original" que o Criar Vídeo do zero mantém, e sem personalização
// por perfil/DNA — o objetivo aqui é fidelidade máxima ao vídeo de referência.
export default function AdminClonarVideo() {
  const { data: professional } = useProfessional();
  const [, setSearchParams] = useSearchParams();

  const [refFile, setRefFile] = useState<File | null>(null);
  const [refUrl, setRefUrl] = useState("");
  const [refTema, setRefTema] = useState("");
  const [tom, setTom] = useState<Tom>("acolhedor");

  const [avatars, setAvatars] = useState<AvatarLite[]>([]);
  const [modo, setModo] = useState<"personagem" | "original">("original");
  const [avatarId, setAvatarId] = useState<string | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus>({ status: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!professional?.id) return;
    (supabase as any)
      .from("avatars")
      .select("id,name,photo_url")
      .eq("professional_id", professional.id)
      .order("created_at", { ascending: false })
      .then(({ data }: any) => setAvatars(data ?? []));
  }, [professional?.id]);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const pollStatus = (jobId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await (await fetch(`${API}/status/${jobId}`)).json();
        setJobStatus(data);
        if (data.status === "done" || data.status === "error") {
          stopPolling();
          if (data.status === "done") toast.success("Clone pronto! Já está em Meus Vídeos.", { duration: 8000 });
          if (data.status === "error") toast.error(data.message || "Erro ao clonar o vídeo", { duration: 8000 });
        }
      } catch {
        stopPolling();
        setJobStatus({ status: "error", message: "Erro de conexão" });
      }
    }, 4000);
  };

  useEffect(() => () => stopPolling(), []);

  const handleClonar = async () => {
    if (!professional?.slug) return;
    if (!refFile && !refUrl.trim()) { toast.error("Envie um arquivo ou cole um link do vídeo"); return; }
    if (modo === "personagem" && !avatarId) { toast.error("Escolha um personagem ou marque 'Manter o original'"); return; }

    setEnviando(true);
    setJobStatus({ status: "idle" });
    try {
      const form = new FormData();
      form.append("professional_slug", professional.slug);
      form.append("tema", refTema.trim());
      form.append("tom", tom);
      form.append("manter_original", modo === "original" ? "true" : "false");
      if (modo === "personagem" && avatarId) form.append("avatar_id", avatarId);
      if (refFile) form.append("file", refFile);
      else form.append("url", refUrl.trim());

      const res = await fetch(`${API}/clonar-video/iniciar`, {
        method: "POST",
        headers: await videoApiAuthHeaders(),   // sem Content-Type — o browser define o boundary
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao iniciar a clonagem");
      toast.info(`Clonando ${data.blocos} bloco(s) (~${Math.round(data.duracao_total_s)}s de vídeo)...`, { duration: 6000 });
      setJobStatus({ status: "processing", progress: 5, step: "Preparando..." });
      pollStatus(data.job_id);
    } catch (e: any) {
      toast.error(e.message || "Erro ao iniciar a clonagem", { duration: 8000 });
    } finally {
      setEnviando(false);
    }
  };

  const irParaMeusVideos = () => {
    setSearchParams((prev) => { prev.set("sub", "meus-videos"); return prev; }, { replace: true });
  };

  const processando = jobStatus.status === "processing";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clapperboard className="h-6 w-6 text-orange-500" /> Clonar Vídeo
        </h1>
        <p className="text-muted-foreground mt-1">
          Cole o link (ou envie o arquivo) e a IA clona o vídeo mantendo os movimentos e o tempo exatos do original.
        </p>
      </div>

      <Card className="border-dashed border-2 border-orange-300/50 bg-orange-50/30 dark:bg-orange-950/10">
        <CardContent className="p-4 space-y-3">
          <Label className="text-base font-semibold flex items-center gap-2">
            Clonar um vídeo que viralizou
            <Badge variant="outline" className="text-xs font-normal border-purple-400 text-purple-600">Kling O1 Edit</Badge>
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A IA reprocessa o vídeo original mantendo os <strong>movimentos de câmera e o
            tempo exatos</strong> — o resultado é o vídeo original transformado, não uma
            recriação do zero. Você escolhe abaixo se troca a pessoa do vídeo pelo seu
            personagem ou mantém a pessoa original.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={refUrl}
              onChange={(e) => setRefUrl(e.target.value)}
              placeholder="Cole o link (YouTube, TikTok ou Instagram)…"
              className="text-sm"
              disabled={!!refFile || processando}
            />
            <Input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
              className="text-xs file:text-xs"
              disabled={processando}
              onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Input
            value={refTema}
            onChange={(e) => setRefTema(e.target.value)}
            placeholder="Sobre o que será o SEU vídeo? (opcional)"
            className="text-sm"
            disabled={processando}
          />
          {!refFile && !!refUrl.trim() && (
            <p className="text-[11px] text-muted-foreground">
              Instagram às vezes bloqueia o acesso — se falhar, baixe o vídeo e envie o arquivo.
              Vídeos de até 90s (a clonagem cobra por segundo processado).
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Label className="text-base font-semibold">Personagem</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={processando}
            onClick={() => setModo("original")}
            className={`rounded-lg border p-3 text-left text-sm transition ${modo === "original" ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"}`}
          >
            <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" />Manter o original</div>
            <p className="text-xs text-muted-foreground mt-1">A pessoa do vídeo original continua na cena.</p>
          </button>
          <button
            type="button"
            disabled={processando}
            onClick={() => setModo("personagem")}
            className={`rounded-lg border p-3 text-left text-sm transition ${modo === "personagem" ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"}`}
          >
            <div className="flex items-center gap-2 font-medium"><Users className="h-4 w-4" />Meu personagem</div>
            <p className="text-xs text-muted-foreground mt-1">Troca a pessoa do vídeo pelo seu personagem, mantendo os movimentos.</p>
          </button>
        </div>
        {modo === "personagem" && (
          avatars.length ? (
            <div className="flex gap-2 flex-wrap">
              {avatars.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={processando}
                  onClick={() => setAvatarId(a.id)}
                  className={`rounded-lg border p-1 transition ${avatarId === a.id ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"}`}
                  title={a.name}
                >
                  {a.photo_url
                    ? <img src={a.photo_url} alt={a.name} className="h-14 w-14 rounded object-cover" />
                    : <div className="h-14 w-14 rounded bg-muted flex items-center justify-center text-xs">{a.name.slice(0, 2)}</div>}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Você ainda não tem personagens — crie um na aba <b>Personagens</b> ou use "Manter o original".
            </p>
          )
        )}
      </div>

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
              className={`cursor-pointer border-2 transition-all ${tom === value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"} ${processando ? "pointer-events-none opacity-60" : ""}`}
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

      {jobStatus.status === "done" ? (
        <Card className="border-green-500/40 bg-green-50/40 dark:bg-green-950/10">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Clone pronto!
            </div>
            <Button size="sm" onClick={irParaMeusVideos}>Ver em Meus Vídeos</Button>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={handleClonar} disabled={enviando || processando} className="w-full gap-2">
          {enviando || processando
            ? <><Loader2 className="h-4 w-4 animate-spin" /> {processando ? (jobStatus.step || "Clonando...") : "Iniciando..."}{processando && jobStatus.progress ? ` (${jobStatus.progress}%)` : ""}</>
            : <><Wand2 className="h-4 w-4" /> Clonar vídeo</>}
        </Button>
      )}
    </div>
  );
}

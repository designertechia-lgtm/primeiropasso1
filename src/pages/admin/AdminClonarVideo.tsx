import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useProfessional } from "@/hooks/useProfessional";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  Clapperboard, Wand2, Loader2, Heart, BookOpenCheck, Flame, TrendingUp,
  Users, Sparkles, CheckCircle2, ArrowLeft, History, Trash2, Send, RotateCcw,
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
  video_id?: string;
  message?: string;
};
type HistoryEntry = {
  video_url: string; thumbnail_url?: string | null; instrucao: string;
  created_at: string; credits_charged?: number; reverted_to?: number;
};
type CloneState = {
  kind?: string;
  tema?: string; tom?: string;
  history?: HistoryEntry[];
};
type VideoRow = {
  id: string; title: string; embed_url: string; thumbnail_url: string | null;
  script_json?: CloneState | null;
};

// Fluxo independente: clonagem FIEL via Kling O1 Edit (vídeo-para-vídeo real —
// recebe o vídeo original de verdade e preserva movimentos/timing exatos).
// Decisão consciente do Carlos (24/07): sem a proteção de "nunca reusar
// ativos do original" que o Criar Vídeo do zero mantém, e sem personalização
// por perfil/DNA — o objetivo aqui é fidelidade máxima ao vídeo de referência.
// Instrução livre ("O que você quer mudar?") + histórico de versões (25/07),
// inspirado no editor de personagens do Google Flow.
export default function AdminClonarVideo() {
  const { data: professional } = useProfessional();
  const [searchParams, setSearchParams] = useSearchParams();
  const videoIdParam = searchParams.get("video");

  // ── Modo form (entrada) ─────────────────────────────────────────────
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refUrl, setRefUrl] = useState("");
  const [refTema, setRefTema] = useState("");
  const [tom, setTom] = useState<Tom>("acolhedor");
  const [instrucaoInicial, setInstrucaoInicial] = useState("");

  const [avatars, setAvatars] = useState<AvatarLite[]>([]);
  const [modo, setModo] = useState<"personagem" | "original">("original");
  const [avatarId, setAvatarId] = useState<string | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus>({ status: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Modo studio (revisão/refinamento) ───────────────────────────────
  const [videoRow, setVideoRow] = useState<VideoRow | null>(null);
  const [showHistorico, setShowHistorico] = useState(false);
  const [instrucaoRefinar, setInstrucaoRefinar] = useState("");
  const [tituloDraft, setTituloDraft] = useState("");
  const videoId = videoRow?.id ?? jobStatus.video_id ?? videoIdParam ?? null;
  const modoStudio = !!videoId;

  useEffect(() => {
    if (!professional?.id) return;
    (supabase as any)
      .from("avatars")
      .select("id,name,photo_url")
      .eq("professional_id", professional.id)
      .order("created_at", { ascending: false })
      .then(({ data }: any) => setAvatars(data ?? []));
  }, [professional?.id]);

  const carregarEstado = async (id: string) => {
    if (!professional?.slug) return;
    try {
      const res = await fetch(`${API}/clonar-video/${id}/estado?professional_slug=${encodeURIComponent(professional.slug)}`);
      if (!res.ok) return;
      const data = await res.json();
      setVideoRow(data);
      setTituloDraft(data.title ?? "");
    } catch { /* silencioso — a tela mostra o que já tinha */ }
  };

  // Reidrata ao abrir com ?video=<id> (ex.: "Reeditar" em Meus Vídeos) — regra
  // do projeto: operação cara/demorada sobrevive a sair/voltar da tela.
  useEffect(() => {
    if (videoIdParam && professional?.slug) carregarEstado(videoIdParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoIdParam, professional?.slug]);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const pollStatus = (jobId: string, onDone?: () => void) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await (await fetch(`${API}/status/${jobId}`)).json();
        setJobStatus(data);
        if (data.status === "done" || data.status === "error") {
          stopPolling();
          if (data.status === "done") { toast.success("Vídeo pronto!", { duration: 6000 }); onDone?.(); }
          if (data.status === "error") toast.error(data.message || "Erro na clonagem", { duration: 8000 });
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
      form.append("instrucao_inicial", instrucaoInicial.trim());
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
      setJobStatus({ status: "processing", progress: 5, step: "Preparando...", video_id: data.job_id });
      pollStatus(data.job_id, () => carregarEstado(data.job_id));
    } catch (e: any) {
      toast.error(e.message || "Erro ao iniciar a clonagem", { duration: 8000 });
    } finally {
      setEnviando(false);
    }
  };

  const handleRefinar = async () => {
    if (!professional?.slug || !videoId) return;
    if (!instrucaoRefinar.trim()) { toast.error("Descreva o que você quer mudar"); return; }
    if (!confirm("Isso gera uma NOVA versão e cobra créditos de novo (a versão atual fica guardada no histórico). Continuar?")) return;

    try {
      const res = await fetch(`${API}/clonar-video/${videoId}/refinar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await videoApiAuthHeaders()) },
        body: JSON.stringify({ professional_slug: professional.slug, instrucao: instrucaoRefinar.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao gerar a nova versão");
      toast.info("Aplicando a mudança pedida...", { duration: 5000 });
      setJobStatus({ status: "processing", progress: 5, step: "Aplicando a mudança pedida...", video_id: videoId });
      setInstrucaoRefinar("");
      pollStatus(videoId, () => carregarEstado(videoId));
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar a nova versão", { duration: 8000 });
    }
  };

  const handleReverter = async (index: number) => {
    if (!professional?.slug || !videoId) return;
    try {
      const res = await fetch(`${API}/clonar-video/${videoId}/reverter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await videoApiAuthHeaders()) },
        body: JSON.stringify({ professional_slug: professional.slug, history_index: index }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao reverter");
      toast.success("Versão restaurada!");
      setShowHistorico(false);
      await carregarEstado(videoId);
    } catch (e: any) {
      toast.error(e.message || "Erro ao reverter", { duration: 6000 });
    }
  };

  const handleSalvarTitulo = async () => {
    if (!videoId || !tituloDraft.trim() || tituloDraft === videoRow?.title) return;
    await (supabase as any).from("videos").update({ title: tituloDraft.trim() }).eq("id", videoId);
    setVideoRow((v) => (v ? { ...v, title: tituloDraft.trim() } : v));
    toast.success("Título atualizado");
  };

  const handleExcluir = async () => {
    if (!videoId || !professional?.slug) return;
    if (!confirm("Excluir este vídeo clonado? Essa ação não pode ser desfeita.")) return;
    try {
      const { videoApiAuthHeaders: authHeaders } = await import("@/lib/videoApi");
      const res = await fetch(`${API}/video/${videoId}?professional_slug=${encodeURIComponent(professional.slug)}`, {
        method: "DELETE", headers: await authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Erro ao excluir");
      toast.success("Vídeo excluído");
      irParaMeusVideos();
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir", { duration: 6000 });
    }
  };

  const irParaMeusVideos = () => {
    setSearchParams((prev) => { prev.set("sub", "meus-videos"); prev.delete("video"); return prev; }, { replace: true });
  };

  const voltarParaForm = () => {
    setVideoRow(null);
    setJobStatus({ status: "idle" });
    setSearchParams((prev) => { prev.delete("video"); return prev; }, { replace: true });
  };

  const processando = jobStatus.status === "processing";
  const state = (videoRow?.script_json || {}) as CloneState;
  const history = state.history || [];

  // ── Modo studio: revisar/refinar o clone já gerado ──────────────────
  if (modoStudio) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" onClick={voltarParaForm} title="Voltar"><ArrowLeft className="h-4 w-4" /></Button>
            <Input
              value={tituloDraft}
              onChange={(e) => setTituloDraft(e.target.value)}
              onBlur={handleSalvarTitulo}
              className="h-8 text-base font-semibold border-transparent hover:border-input focus:border-input max-w-xs"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowHistorico(true)}>
              <History className="h-3.5 w-3.5" /> Mostrar histórico{history.length > 0 && ` (${history.length})`}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleExcluir} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            <Button size="sm" onClick={irParaMeusVideos}>Concluir</Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0 bg-black flex items-center justify-center">
            {processando ? (
              <div className="aspect-[9/16] w-full max-w-sm flex flex-col items-center justify-center gap-3 text-white">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">{jobStatus.step || "Processando..."}{jobStatus.progress ? ` (${jobStatus.progress}%)` : ""}</p>
              </div>
            ) : videoRow?.embed_url ? (
              <video controls poster={videoRow.thumbnail_url || undefined} src={videoRow.embed_url} className="max-h-[70vh] w-auto" />
            ) : (
              <div className="aspect-[9/16] w-full max-w-sm flex items-center justify-center text-white/60 text-sm">Sem vídeo ainda</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 space-y-2">
            <Label className="text-sm font-medium">O que você quer mudar?</Label>
            <div className="flex gap-2">
              <Textarea
                rows={2}
                value={instrucaoRefinar}
                onChange={(e) => setInstrucaoRefinar(e.target.value)}
                placeholder='Ex.: "mude a cor da parede", "deixe a cena mais clara"...'
                disabled={processando}
                className="text-sm"
              />
              <Button size="icon" className="shrink-0 self-end" onClick={handleRefinar} disabled={processando || !instrucaoRefinar.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Gera uma nova versão (cobra créditos de novo) — a atual fica guardada no histórico.</p>
          </CardContent>
        </Card>

        <Sheet open={showHistorico} onOpenChange={setShowHistorico}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader><SheetTitle>Histórico de versões</SheetTitle></SheetHeader>
            <div className="space-y-3 mt-4">
              {history.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma versão anterior ainda.</p>}
              {[...history].reverse().map((h, i) => {
                const idx = history.length - 1 - i;
                const isCurrent = videoRow?.embed_url === h.video_url;
                return (
                  <div key={idx} className="flex gap-3 rounded-lg border p-2">
                    {h.thumbnail_url && <img src={h.thumbnail_url} alt="" className="h-16 w-9 rounded object-cover shrink-0" />}
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</p>
                      <p className="text-sm truncate">{h.instrucao?.trim() || "Versão original"}{h.reverted_to !== undefined ? " (revertido)" : ""}</p>
                      {isCurrent ? (
                        <Badge variant="secondary" className="text-[10px]">Versão atual</Badge>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => handleReverter(idx)}>
                          <RotateCcw className="h-3 w-3" /> Usar esta versão
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // ── Modo form: entrada (upload/link + configuração inicial) ─────────
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
          <div className="space-y-1">
            <Label className="text-xs font-medium">O que você quer mudar? <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea
              rows={2}
              value={instrucaoInicial}
              onChange={(e) => setInstrucaoInicial(e.target.value)}
              placeholder='Ex.: "mude a cor da parede", "deixe o ambiente mais claro"...'
              disabled={processando}
              className="text-sm"
            />
          </div>
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

      <Button onClick={handleClonar} disabled={enviando || processando} className="w-full gap-2">
        {enviando || processando
          ? <><Loader2 className="h-4 w-4 animate-spin" /> {processando ? (jobStatus.step || "Clonando...") : "Iniciando..."}{processando && jobStatus.progress ? ` (${jobStatus.progress}%)` : ""}</>
          : <><Wand2 className="h-4 w-4" /> Clonar vídeo</>}
      </Button>
    </div>
  );
}

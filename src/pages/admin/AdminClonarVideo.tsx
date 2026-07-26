import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useProfessional } from "@/hooks/useProfessional";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  Clapperboard, Wand2, Loader2, Heart, BookOpenCheck, Flame, TrendingUp,
  Users, Sparkles, ArrowLeft, History, Trash2, Send, RotateCcw, Link2, Upload,
  Camera, Palette, Box, AlertTriangle,
} from "lucide-react";
import { videoApiAuthHeaders } from "@/lib/videoApi";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

type Tom = "acolhedor" | "educativo" | "provocador" | "motivacional";
type Estilo = "realista" | "pixar" | "cartoon";
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
  tema?: string; tom?: string; manter_original?: boolean; estilo?: string;
  history?: HistoryEntry[];
};
type VideoRow = {
  id: string; title: string; embed_url: string; thumbnail_url: string | null;
  script_json?: CloneState | null;
};

const TONS = [
  { value: "acolhedor",    label: "Acolhedor",    desc: "Empático e seguro",     Icon: Heart },
  { value: "educativo",    label: "Educativo",    desc: "Claro e informativo",   Icon: BookOpenCheck },
  { value: "provocador",   label: "Provocador",   desc: "Questiona e desafia",   Icon: Flame },
  { value: "motivacional", label: "Motivacional", desc: "Energia e ação",        Icon: TrendingUp },
] as const;

// Mesmo conceito de estilo já usado em Personagens/Criar Vídeo, adaptado pro
// vídeo inteiro (Kling O1 Edit) — "realista" = sem mudança de estilo (padrão).
const ESTILOS = [
  { value: "realista", label: "Realista", Icon: Camera },
  { value: "cartoon",  label: "Cartoon",  Icon: Palette },
  { value: "pixar",    label: "Pixar 3D", Icon: Box },
] as const;

// ── Acompanhamento resiliente à navegação (regra do projeto, CLAUDE.md) ────
// A clonagem é cara (créditos reais) e demorada — o profissional não pode
// perder o rastro dela só por sair da tela ou trocar de aba. O polling vive
// no escopo do MÓDULO (Map por video_id), não dentro do componente: sai da
// tela e o job continua sendo observado; volta (mesma aba ou via "Meus
// Vídeos" → "Acompanhar") e a tela readota o estado atual na hora. Fechar ou
// recarregar o navegador perde só a barra de progresso ao vivo — o job em si
// roda no servidor e o resultado final já está salvo no banco quando pronto;
// por isso `estado` também é conferido contra `/status` ao montar com
// ?video=, não só o Map (que não sobrevive a um reload de página).
type CloneJobEntry = { status: JobStatus; intervalId: ReturnType<typeof setInterval> | null; onChange: (() => void) | null };
const cloneJobs = new Map<string, CloneJobEntry>();

function pollCloneJob(videoId: string, initial?: JobStatus) {
  let entry = cloneJobs.get(videoId);
  if (!entry) {
    entry = { status: initial || { status: "processing" }, intervalId: null, onChange: null };
    cloneJobs.set(videoId, entry);
  } else {
    entry.status = initial || { status: "processing" };
  }
  entry.onChange?.();
  if (entry.intervalId) clearInterval(entry.intervalId);
  entry.intervalId = setInterval(async () => {
    const e = cloneJobs.get(videoId);
    if (!e) return;
    try {
      const data: JobStatus = await (await fetch(`${API}/status/${videoId}`)).json();
      e.status = data;
      e.onChange?.();
      if (data.status === "done" || data.status === "error") {
        if (e.intervalId) clearInterval(e.intervalId);
        e.intervalId = null;
        if (data.status === "done") {
          if (e.onChange) toast.success("Vídeo pronto!", { duration: 6000 });
          else toast.success("Seu vídeo clonado ficou pronto!", {
            description: "Abra Meus Vídeos para revisar.",
            duration: 12000,
          });
        } else {
          toast.error(data.message || "Erro na clonagem", { duration: 8000 });
        }
      }
    } catch {
      // rede falhou nesse tick — tenta de novo no próximo, não desiste
    }
  }, 4000);
}

// Fluxo independente: clonagem FIEL via Kling O1 Edit (vídeo-para-vídeo real —
// recebe o vídeo original de verdade e preserva movimentos/timing exatos).
// Decisão consciente do Carlos (24/07): sem a proteção de "nunca reusar
// ativos do original" que o Criar Vídeo do zero mantém, e sem personalização
// por perfil/DNA — o objetivo aqui é fidelidade máxima ao vídeo de referência.
// Layout inspirado no editor de personagens do Google Flow (25/07): barra
// superior, painel de config à esquerda, preview grande à direita, barra de
// instrução embaixo — usando as CORES do nosso design system (bg-card/
// border-border/text-foreground), não o tema escuro do Flow em si.
export default function AdminClonarVideo() {
  const { data: professional } = useProfessional();
  const [searchParams, setSearchParams] = useSearchParams();
  const videoIdParam = searchParams.get("video");

  // ── Modo entrada ─────────────────────────────────────────────────────
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refPreviewUrl, setRefPreviewUrl] = useState<string | null>(null);
  const [refUrl, setRefUrl] = useState("");
  const [refTema, setRefTema] = useState("");
  const [tom, setTom] = useState<Tom>("acolhedor");
  const [estilo, setEstilo] = useState<Estilo>("realista");
  const [instrucaoInicial, setInstrucaoInicial] = useState("");

  const [avatars, setAvatars] = useState<AvatarLite[]>([]);
  const [modo, setModo] = useState<"personagem" | "original">("original");
  const [avatarId, setAvatarId] = useState<string | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus>({ status: "idle" });

  // ── Modo estúdio (revisão/refinamento) ──────────────────────────────
  const [videoRow, setVideoRow] = useState<VideoRow | null>(null);
  const [showHistorico, setShowHistorico] = useState(false);
  const [instrucaoRefinar, setInstrucaoRefinar] = useState("");
  const [estiloRefinar, setEstiloRefinar] = useState<Estilo>("realista");
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

  // Preview local do arquivo escolhido (object URL — não sobe nada, só mostra).
  useEffect(() => {
    if (!refFile) { setRefPreviewUrl(null); return; }
    const url = URL.createObjectURL(refFile);
    setRefPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [refFile]);

  // Achado real (25/07): a busca falhava silenciosamente (rede lenta, servidor
  // ocupado terminando o job em background) e deixava a tela travada em "Sem
  // vídeo ainda" mesmo com o vídeo já pronto e salvo no banco. Agora tenta de
  // novo (3x, com espera curta) antes de desistir, e SEMPRE avisa se falhar de
  // verdade — nunca mais falha em silêncio.
  const carregarEstado = async (id: string, tentativa = 1): Promise<void> => {
    if (!professional?.slug) return;
    try {
      const res = await fetch(`${API}/clonar-video/${id}/estado?professional_slug=${encodeURIComponent(professional.slug)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setVideoRow(data);
      setTituloDraft(data.title ?? "");
      const estiloSalvo = data.script_json?.estilo;
      if (estiloSalvo === "pixar" || estiloSalvo === "cartoon" || estiloSalvo === "realista") {
        setEstiloRefinar(estiloSalvo);
      }
    } catch {
      if (tentativa < 3) {
        await new Promise((r) => setTimeout(r, 1500 * tentativa));
        return carregarEstado(id, tentativa + 1);
      }
      toast.error("Não consegui carregar os dados do vídeo — clique em Voltar e tente reabrir.", { duration: 8000 });
    }
  };

  // Reidrata ao abrir com ?video=<id> (ex.: "Reeditar" em Meus Vídeos) — regra
  // do projeto: operação cara/demorada sobrevive a sair/voltar da tela. Se não
  // há job no Map do módulo (aba nova ou navegador recarregado), confere no
  // servidor se ainda está processando e retoma o polling a partir daí.
  useEffect(() => {
    if (!videoIdParam || !professional?.slug) return;
    carregarEstado(videoIdParam);
    if (!cloneJobs.has(videoIdParam)) {
      fetch(`${API}/status/${videoIdParam}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.status === "processing") pollCloneJob(videoIdParam, data);
          // Job que já terminou com erro (ex.: bloco falhou): mostra o erro em
          // vez de "Sem vídeo ainda". Só se ainda não há vídeo salvo no banco.
          else if (data?.status === "error") setJobStatus(data);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoIdParam, professional?.slug]);

  // Reassina o job do módulo sempre que o video_id em foco muda — o polling
  // em si roda independente do componente estar montado ou não.
  useEffect(() => {
    if (!videoId) return;
    const entry = cloneJobs.get(videoId);
    if (!entry) return;
    const sync = () => {
      setJobStatus(entry.status);
      if (entry.status.status === "done") {
        carregarEstado(videoId);
        cloneJobs.delete(videoId);
      }
    };
    entry.onChange = sync;
    sync();
    return () => { if (entry.onChange === sync) entry.onChange = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

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
      form.append("estilo", estilo);
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
      pollCloneJob(data.job_id, { status: "processing", progress: 5, step: "Preparando..." });
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
        body: JSON.stringify({ professional_slug: professional.slug, instrucao: instrucaoRefinar.trim(), estilo: estiloRefinar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao gerar a nova versão");
      toast.info("Aplicando a mudança pedida...", { duration: 5000 });
      setInstrucaoRefinar("");
      pollCloneJob(videoId, { status: "processing", progress: 5, step: "Aplicando a mudança pedida..." });
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
      const res = await fetch(`${API}/video/${videoId}?professional_slug=${encodeURIComponent(professional.slug)}`, {
        method: "DELETE", headers: await videoApiAuthHeaders(),
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
  // Fallback: a resposta do job já traz video_url — não depende só da segunda
  // busca (/estado) pra mostrar o resultado assim que fica pronto.
  const previewUrl = videoRow?.embed_url || jobStatus.video_url;

  // ── Modo estúdio: revisar/refinar o clone já gerado ─────────────────
  if (modoStudio) {
    return (
      <div className="max-w-5xl mx-auto rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" onClick={voltarParaForm} title="Voltar"><ArrowLeft className="h-4 w-4" /></Button>
            <Input
              value={tituloDraft}
              onChange={(e) => setTituloDraft(e.target.value)}
              onBlur={handleSalvarTitulo}
              className="h-8 text-base font-semibold border-transparent hover:border-input focus-visible:border-input max-w-xs"
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

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
          <div className="p-4 space-y-4 border-b lg:border-b-0 lg:border-r border-border bg-muted/20">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tema</p>
              <p className="text-sm">{state.tema?.trim() || "Não informado"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tom da narração</p>
              <p className="text-sm">{TONS.find((t) => t.value === state.tom)?.label || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Personagem</p>
              <p className="text-sm">{state.manter_original ? "Original do vídeo" : "Meu personagem"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Estilo (próxima versão)</p>
              <div className="grid grid-cols-3 gap-1.5">
                {ESTILOS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={processando}
                    onClick={() => setEstiloRefinar(value)}
                    className={`rounded-lg border p-1.5 flex flex-col items-center gap-1 text-center transition ${estiloRefinar === value ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${estiloRefinar === value ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-[10px] leading-none">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex-1 min-h-[420px] flex items-center justify-center bg-black">
              {processando ? (
                <div className="flex flex-col items-center justify-center gap-3 text-white p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm text-center">{jobStatus.step || "Processando..."}{jobStatus.progress ? ` (${jobStatus.progress}%)` : ""}</p>
                </div>
              ) : previewUrl ? (
                <video controls poster={videoRow?.thumbnail_url || undefined} src={previewUrl} className="max-h-[65vh] w-auto" />
              ) : jobStatus.status === "error" ? (
                <div className="flex flex-col items-center justify-center gap-3 text-white/80 p-8 text-center max-w-md">
                  <AlertTriangle className="h-8 w-8 text-amber-400" />
                  <p className="text-sm font-medium">Esta clonagem não foi concluída</p>
                  <p className="text-xs text-white/50">{jobStatus.message || "Um erro interrompeu o processamento."} Nenhum crédito ficou retido — o valor foi estornado.</p>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="secondary" onClick={voltarParaForm}>Tentar de novo</Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExcluir}>
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  </div>
                </div>
              ) : videoRow ? (
                <div className="flex items-center justify-center text-white/40 text-sm p-8">Sem vídeo ainda</div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-white/60 p-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p className="text-sm">Carregando...</p>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-border space-y-2 bg-card">
              <div className="flex gap-2">
                <Textarea
                  rows={2}
                  value={instrucaoRefinar}
                  onChange={(e) => setInstrucaoRefinar(e.target.value)}
                  placeholder='O que você quer mudar? Ex.: "mude a cor da parede"...'
                  disabled={processando}
                  className="text-sm"
                />
                <Button size="icon" className="shrink-0 self-end" onClick={handleRefinar} disabled={processando || !previewUrl || !instrucaoRefinar.trim()} title={!previewUrl ? "Só é possível refinar depois que houver um vídeo pronto" : undefined}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Gera uma nova versão (cobra créditos de novo) — a atual fica guardada no histórico.</p>
            </div>
          </div>
        </div>

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

  // ── Modo entrada: upload/link + configuração inicial ────────────────
  return (
    <div className="max-w-5xl mx-auto rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Clapperboard className="h-5 w-5 text-orange-500" />
        <span className="font-semibold">Clonar Vídeo</span>
        <Badge variant="outline" className="text-xs font-normal border-purple-400 text-purple-600 ml-1">Kling O1 Edit</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
        <div className="p-4 space-y-5 border-b lg:border-b-0 lg:border-r border-border bg-muted/20">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Vídeo de referência</p>
            <div className="relative">
              <Link2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={refUrl}
                onChange={(e) => setRefUrl(e.target.value)}
                placeholder="Cole o link (YouTube, TikTok, Instagram)…"
                className="text-sm pl-8"
                disabled={!!refFile || processando}
              />
            </div>
            <label className="flex items-center gap-2 text-xs rounded-md border border-input bg-background px-3 py-2 cursor-pointer transition hover:bg-muted">
              <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{refFile ? refFile.name : "Ou envie um arquivo…"}</span>
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                className="hidden"
                disabled={processando}
                onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {!refFile && !!refUrl.trim() && (
              <p className="text-[11px] text-muted-foreground">
                Instagram às vezes bloqueia o acesso — se falhar, baixe o vídeo e envie o arquivo. Até 90s.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Sobre o que será o SEU vídeo? (opcional)</p>
            <Input
              value={refTema}
              onChange={(e) => setRefTema(e.target.value)}
              placeholder="Tema do seu vídeo…"
              className="text-sm"
              disabled={processando}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Personagem</p>
            <div className="space-y-1.5">
              <button
                type="button"
                disabled={processando}
                onClick={() => setModo("original")}
                className={`w-full rounded-lg border p-2.5 text-left text-sm transition ${modo === "original" ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <div className="flex items-center gap-2 font-medium"><Sparkles className="h-3.5 w-3.5" />Manter o original</div>
                <p className="text-xs text-muted-foreground mt-0.5">A pessoa do vídeo continua na cena.</p>
              </button>
              <button
                type="button"
                disabled={processando}
                onClick={() => setModo("personagem")}
                className={`w-full rounded-lg border p-2.5 text-left text-sm transition ${modo === "personagem" ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <div className="flex items-center gap-2 font-medium"><Users className="h-3.5 w-3.5" />Meu personagem</div>
                <p className="text-xs text-muted-foreground mt-0.5">Troca a pessoa pelo seu personagem.</p>
              </button>
            </div>
            {modo === "personagem" && (
              avatars.length ? (
                <div className="flex gap-2 flex-wrap pt-1">
                  {avatars.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={processando}
                      onClick={() => setAvatarId(a.id)}
                      className={`rounded-lg border p-0.5 transition ${avatarId === a.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40"}`}
                      title={a.name}
                    >
                      {a.photo_url
                        ? <img src={a.photo_url} alt={a.name} className="h-12 w-12 rounded object-cover" />
                        : <div className="h-12 w-12 rounded bg-muted flex items-center justify-center text-xs">{a.name.slice(0, 2)}</div>}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pt-1">
                  Sem personagens ainda — crie um em <b>Personagens</b> ou use "Manter o original".
                </p>
              )
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Tom da narração</p>
            <div className="grid grid-cols-2 gap-1.5">
              {TONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={processando}
                  onClick={() => setTom(value)}
                  className={`rounded-lg border p-2 flex flex-col items-center gap-1 text-center transition ${tom === value ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <Icon className={`h-4 w-4 ${tom === value ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-[11px]">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Estilo visual</p>
            <div className="grid grid-cols-3 gap-1.5">
              {ESTILOS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={processando}
                  onClick={() => setEstilo(value)}
                  className={`rounded-lg border p-2 flex flex-col items-center gap-1 text-center transition ${estilo === value ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <Icon className={`h-4 w-4 ${estilo === value ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-[11px]">{label}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">"Realista" mantém a aparência original — Cartoon/Pixar transformam a cena inteira.</p>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex-1 min-h-[420px] flex items-center justify-center bg-black">
            {refPreviewUrl ? (
              <video controls src={refPreviewUrl} className="max-h-[65vh] w-auto" />
            ) : refUrl.trim() ? (
              <div className="flex flex-col items-center gap-2 text-white/50 text-sm p-8">
                <Link2 className="h-8 w-8" />
                <p>Link colado — o preview aparece depois de clonar.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/30 text-sm p-8">
                <Clapperboard className="h-10 w-10" />
                <p>Envie um vídeo ou cole um link para começar.</p>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-border space-y-2 bg-card">
            <Textarea
              rows={2}
              value={instrucaoInicial}
              onChange={(e) => setInstrucaoInicial(e.target.value)}
              placeholder='O que você quer mudar? (opcional) Ex.: "mude a cor da parede"...'
              disabled={processando}
              className="text-sm"
            />
            <Button onClick={handleClonar} disabled={enviando || processando} className="w-full gap-2">
              {enviando || processando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {processando ? (jobStatus.step || "Clonando...") : "Iniciando..."}{processando && jobStatus.progress ? ` (${jobStatus.progress}%)` : ""}</>
                : <><Wand2 className="h-4 w-4" /> Clonar vídeo</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useProfessional } from "@/hooks/useProfessional";
import { useCreditBalance } from "@/hooks/useBilling";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Clapperboard, Wand2, Loader2, Heart, BookOpenCheck, Flame, TrendingUp,
  Users, Sparkles, ArrowLeft, History, Trash2, Send, RotateCcw, Link2, Upload,
  Camera, Palette, Box, AlertTriangle, Coins, Download,
} from "lucide-react";
import { videoApiAuthHeaders } from "@/lib/videoApi";
import {
  buscarEstadoClone, cancelarCloneJob, iniciarCloneJob, marcarCloneJob,
  retomarCloneJob, useCloneJob,
} from "@/lib/cloneJobs";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

/** Teto do fluxo no worker (CLONE_V2V_MAX_DURATION_S). */
const MAX_DURACAO_S = 90;

type Tom = "acolhedor" | "educativo" | "provocador" | "motivacional";
type Estilo = "realista" | "pixar" | "cartoon";
type AvatarLite = { id: string; name: string; photo_url: string | null };
type Bloco = { inicio_s: number; fim_s: number };
type HistoryEntry = {
  video_url: string; thumbnail_url?: string | null; instrucao: string;
  created_at: string; credits_charged?: number; reverted_to?: number;
};
type CloneState = {
  kind?: string;
  tema?: string; tom?: string; manter_original?: boolean; estilo?: string;
  original_video_url?: string;
  blocks?: Bloco[];
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

const fmtDuracao = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m}min ${r}s` : `${r}s`;
};

/**
 * POST com progresso REAL de upload. O `fetch` não expõe quanto do corpo já
 * subiu, e aqui o arquivo chega a 200MB: sem isso o botão ficava parado em
 * "Iniciando..." por minutos, sem sinal de vida nenhum.
 */
function postComProgresso(
  url: string, form: FormData, headers: Record<string, string>, onPct: (pct: number) => void,
): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onPct(e.loaded / e.total); };
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* resposta não-JSON */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, body });
    };
    xhr.onerror = () => reject(new Error("Falha de rede ao enviar o vídeo."));
    xhr.ontimeout = () => reject(new Error("O envio demorou demais e foi interrompido."));
    xhr.send(form);
  });
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
//
// O acompanhamento do job vive em src/lib/cloneJobs.ts (fora do React): sair da
// sub-aba DESMONTA esta tela (Radix Tabs), e o job não pode morrer junto.
export default function AdminClonarVideo() {
  const { data: professional } = useProfessional();
  const { data: creditos } = useCreditBalance();
  const [searchParams, setSearchParams] = useSearchParams();
  const videoIdParam = searchParams.get("video");

  // ── Modo entrada ─────────────────────────────────────────────────────
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refPreviewUrl, setRefPreviewUrl] = useState<string | null>(null);
  const [refDuracao, setRefDuracao] = useState<number | null>(null);
  const [refUrl, setRefUrl] = useState("");
  const [refTema, setRefTema] = useState("");
  const [tom, setTom] = useState<Tom>("acolhedor");
  const [estilo, setEstilo] = useState<Estilo>("realista");
  const [instrucaoInicial, setInstrucaoInicial] = useState("");

  const [avatars, setAvatars] = useState<AvatarLite[]>([]);
  const [modo, setModo] = useState<"personagem" | "original">("original");
  const [avatarId, setAvatarId] = useState<string | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  /** True enquanto conferimos banco + worker ao abrir com ?video=. Sem isso a
   *  tela acusava "clonagem não concluída" na janela entre montar e receber a
   *  primeira resposta — com o job rodando e cobrando normalmente. */
  const [reidratando, setReidratando] = useState(!!videoIdParam);

  // ── Modo estúdio (revisão/refinamento) ──────────────────────────────
  const [videoRow, setVideoRow] = useState<VideoRow | null>(null);
  const [showHistorico, setShowHistorico] = useState(false);
  const [instrucaoRefinar, setInstrucaoRefinar] = useState("");
  const [estiloRefinar, setEstiloRefinar] = useState<Estilo>("realista");
  const [tituloDraft, setTituloDraft] = useState("");
  const [vendo, setVendo] = useState<"depois" | "antes">("depois");
  const [confirmarRefinar, setConfirmarRefinar] = useState(false);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);

  // Preço vivo do serviço (fonte única: service_pricing, mesma conta da RPC de
  // débito em calculate-credits: ceil(base * unidades * (1 + markup/100))).
  const [creditosPorSegundo, setCreditosPorSegundo] = useState<number | null>(null);

  const videoId = videoIdParam ?? videoRow?.id ?? null;
  const modoStudio = !!videoId;
  const jobStatus = useCloneJob(videoId, professional?.slug ?? null);
  const processando = jobStatus.status === "processing";

  useEffect(() => {
    if (!professional?.id) return;
    (supabase as any)
      .from("avatars")
      .select("id,name,photo_url")
      .eq("professional_id", professional.id)
      .order("created_at", { ascending: false })
      .then(({ data }: any) => setAvatars(data ?? []));
  }, [professional?.id]);

  useEffect(() => {
    supabase
      .from("service_pricing")
      .select("base_cost_brl, markup_pct")
      .eq("service_key", "kling_o1_edit_clone")
      .eq("active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCreditosPorSegundo(Number(data.base_cost_brl) * (1 + (data.markup_pct ?? 100) / 100));
      });
  }, []);

  // Preview local do arquivo escolhido (object URL — não sobe nada, só mostra).
  useEffect(() => {
    if (!refFile) { setRefPreviewUrl(null); setRefDuracao(null); return; }
    const url = URL.createObjectURL(refFile);
    setRefPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [refFile]);

  // Achado real (25/07): a busca falhava silenciosamente e deixava a tela
  // travada em "Sem vídeo ainda" mesmo com o vídeo pronto e salvo no banco.
  // Causa encontrada em 10/08: `/clonar-video/{id}/estado` passa por
  // `require_owner` no worker e responde 401 sem o header Authorization — a
  // chamada não mandava JWT nenhum, então falhava SEMPRE, as 3 tentativas
  // queimavam à toa e `videoRow` nunca era preenchido (sem preview, sem
  // histórico, sem título). O JWT agora vai junto (buscarEstadoClone).
  // `videoAberto` guarda qual id a tela está mostrando AGORA. Sem essa checagem,
  // uma resposta atrasada (a busca tem 2 retentativas, até ~4,5s) chegaria depois
  // de o usuário clicar em Voltar e reabriria o estúdio sozinho.
  const videoAberto = useRef<string | null>(null);
  const carregarEstado = useCallback(async (id: string, tentativa = 1): Promise<void> => {
    if (!professional?.slug) return;
    try {
      const data = await buscarEstadoClone(id, professional.slug);
      if (!data) return;
      if (videoAberto.current !== id) return;   // o usuário já saiu deste vídeo
      setVideoRow(data as VideoRow);
      setTituloDraft(data.title ?? "");
      const estiloSalvo = (data.script_json as CloneState | null)?.estilo;
      if (estiloSalvo === "pixar" || estiloSalvo === "cartoon" || estiloSalvo === "realista") {
        setEstiloRefinar(estiloSalvo);
      }
    } catch {
      if (tentativa < 3) {
        await new Promise((r) => setTimeout(r, 1500 * tentativa));
        return carregarEstado(id, tentativa + 1);
      }
      if (videoAberto.current !== id) return;
      toast.error("Não consegui carregar os dados do vídeo — clique em Voltar e tente reabrir.", { duration: 8000 });
    }
  }, [professional?.slug]);

  // Reidrata ao abrir com ?video=<id> (clone recém-iniciado, "Reeditar" em Meus
  // Vídeos, aba nova ou reload) — regra do projeto: operação cara/demorada
  // sobrevive a sair/voltar da tela.
  useEffect(() => {
    videoAberto.current = videoIdParam;
    // Sem id não há o que reidratar; sem slug ainda, o efeito roda de novo quando
    // o profissional chega. Nos dois casos `reidratando` NÃO pode ficar preso em
    // true — isso deixaria o visor eternamente em "Carregando...".
    if (!videoIdParam) { setReidratando(false); return; }
    if (!professional?.slug) return;
    setReidratando(true);
    Promise.all([
      carregarEstado(videoIdParam),
      retomarCloneJob(videoIdParam, professional.slug),
    ]).finally(() => setReidratando(false));
  }, [videoIdParam, professional?.slug, carregarEstado]);

  // Job concluído: o banco já tem a versão nova (embed_url + histórico).
  // Recarrega uma vez por versão — nunca em laço.
  const ultimoDone = useRef<string | null>(null);
  useEffect(() => {
    if (jobStatus.status !== "done" || !videoId) return;
    const marca = `${videoId}:${jobStatus.video_url ?? ""}`;
    if (ultimoDone.current === marca) return;
    ultimoDone.current = marca;
    carregarEstado(videoId);
    setVendo("depois");
  }, [jobStatus.status, jobStatus.video_url, videoId, carregarEstado]);

  const state = (videoRow?.script_json || {}) as CloneState;
  const history = state.history || [];
  // Fallback: a resposta do job já traz video_url — não depende só da segunda
  // busca (/estado) pra mostrar o resultado assim que fica pronto.
  const previewUrl = videoRow?.embed_url || jobStatus.video_url || null;
  // Vídeo de referência: o guardado no Storage (durável, sobrevive a reload) e,
  // enquanto ele não chega, o arquivo local que o usuário acabou de escolher.
  const originalUrl = state.original_video_url || refPreviewUrl;

  // ── Custo em créditos ────────────────────────────────────────────────
  // O Kling (a parte cara) só roda quando há troca de personagem, mudança de
  // estilo ou um pedido de alteração. "Manter o original" + Realista + sem
  // instrução apenas redubla o áudio: não custa crédito nenhum.
  const klingAtivo = modo === "personagem" || estilo !== "realista" || !!instrucaoInicial.trim();
  const custoEstimado = useMemo(() => {
    if (!klingAtivo) return 0;
    if (creditosPorSegundo == null || refDuracao == null) return null;
    return Math.ceil(creditosPorSegundo * refDuracao);
  }, [klingAtivo, creditosPorSegundo, refDuracao]);
  const custoTeto = creditosPorSegundo != null ? Math.ceil(creditosPorSegundo * MAX_DURACAO_S) : null;
  // `credit_balance` é uma view que ainda não entrou no types.ts gerado (mesma
  // pendência das outras telas que mostram saldo) — cast local até regerar.
  const saldoRow = creditos as { balance?: number } | null | undefined;
  const saldoConhecido = typeof saldoRow?.balance === "number";
  const saldo = saldoRow?.balance ?? 0;
  // Só barra com saldo REALMENTE lido: enquanto a consulta não volta, `balance`
  // é undefined e tratá-lo como zero travaria o botão de quem tem crédito.
  const saldoInsuficiente = saldoConhecido && custoEstimado != null && custoEstimado > 0 && saldo < custoEstimado;
  const duracaoExcedida = refDuracao != null && refDuracao > MAX_DURACAO_S;

  // Custo do refinamento: a duração vem dos blocos já planejados no banco, então
  // é o mesmo número que o worker vai cobrar.
  const duracaoBlocos = useMemo(
    () => (state.blocks || []).reduce((acc, b) => acc + (b.fim_s - b.inicio_s), 0),
    [state.blocks],
  );
  const klingAtivoRefinar = !state.manter_original || estiloRefinar !== "realista" || !!instrucaoRefinar.trim();
  const custoRefinar = useMemo(() => {
    if (!klingAtivoRefinar) return 0;
    if (creditosPorSegundo == null || !duracaoBlocos) return null;
    return Math.ceil(creditosPorSegundo * duracaoBlocos);
  }, [klingAtivoRefinar, creditosPorSegundo, duracaoBlocos]);

  const handleClonar = async () => {
    if (!professional?.slug) return;
    if (!refFile && !refUrl.trim()) { toast.error("Envie um arquivo ou cole um link do vídeo"); return; }
    if (modo === "personagem" && !avatarId) { toast.error("Escolha um personagem ou marque 'Manter o original'"); return; }
    if (duracaoExcedida) {
      toast.error(`Este vídeo tem ${fmtDuracao(refDuracao!)} — o limite é ${MAX_DURACAO_S}s.`, { duration: 8000 });
      return;
    }
    if (saldoInsuficiente) {
      toast.error(`Saldo insuficiente: a clonagem custa ~${custoEstimado} créditos e você tem ${saldo}.`, { duration: 8000 });
      return;
    }

    setEnviando(true);
    setUploadPct(0);
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

      // sem Content-Type — o browser define o boundary do multipart
      const { ok, body } = await postComProgresso(
        `${API}/clonar-video/iniciar`, form, await videoApiAuthHeaders(), setUploadPct,
      );
      if (!ok) throw new Error((body.detail as string) || "Falha ao iniciar a clonagem");

      const jobId = String(body.job_id);
      toast.info(
        `Clonando ${body.blocos} bloco(s) (~${Math.round(Number(body.duracao_total_s))}s de vídeo)...`,
        { duration: 6000 },
      );
      // A URL passa a carregar o vídeo: trocar de sub-aba, recarregar a página
      // ou reabrir depois cai direto no acompanhamento, não num form vazio.
      videoAberto.current = jobId;
      setSearchParams((prev) => { prev.set("video", jobId); return prev; }, { replace: true });
      // Linha de base null: a linha acabou de nascer sem vídeo, então qualquer
      // embed_url que apareça no banco é necessariamente o resultado deste job.
      iniciarCloneJob(jobId, professional.slug, {
        status: "processing", progress: 5, step: "Preparando...", video_id: jobId,
      }, null);
      // O arquivo escolhido continua carregado de propósito: o preview local é
      // o que o visor exibe atrás do progresso até o vídeo original guardado no
      // Storage chegar pelo /estado.
    } catch (e: any) {
      toast.error(e.message || "Erro ao iniciar a clonagem", { duration: 8000 });
    } finally {
      setEnviando(false);
      setUploadPct(0);
    }
  };

  const handleRefinar = async () => {
    if (!professional?.slug || !videoId) return;
    if (!instrucaoRefinar.trim()) { toast.error("Descreva o que você quer mudar"); return; }
    setConfirmarRefinar(false);

    // Reação imediata na tela, mas SEM pollar ainda: o refinamento reusa o mesmo
    // video_id e o worker ainda guarda o "done" da versão anterior — consultar
    // antes da confirmação anunciaria "vídeo pronto" com o job nem iniciado.
    // A URL vigente vira a linha de base: enquanto o banco continuar devolvendo
    // ESTA mesma URL, o refinamento não terminou. É o que impede a versão antiga
    // de ser anunciada como "pronta" (e cobrada) se o worker sumir no meio.
    const embedAntes = videoRow?.embed_url || null;
    marcarCloneJob(videoId, professional.slug, {
      status: "processing", progress: 5, step: "Aplicando a mudança pedida...", video_id: videoId,
    }, embedAntes);
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
      // Agora o servidor já gravou "processing" pra este video_id — pode pollar.
      iniciarCloneJob(videoId, professional.slug, {
        status: "processing", progress: 5, step: "Aplicando a mudança pedida...", video_id: videoId,
      }, embedAntes);
    } catch (e: any) {
      // O job nunca começou no servidor — desfaz o "processando" da tela.
      cancelarCloneJob(videoId);
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
    setConfirmarExcluir(false);
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
    videoAberto.current = null;
    setVideoRow(null);
    setReidratando(false);
    setSearchParams((prev) => { prev.delete("video"); return prev; }, { replace: true });
  };

  // ── Modo estúdio: acompanhar / revisar / refinar o clone ────────────
  if (modoStudio) {
    const comparavel = !!previewUrl && !!originalUrl && !processando;
    // "Antes" cai no clone se a referência não estiver à mão; "Depois" NUNCA cai
    // na referência — sem clone pronto o visor tem que mostrar o aviso de falha,
    // não um vídeo que passaria por resultado.
    const srcVisor = vendo === "antes" ? (originalUrl || previewUrl) : previewUrl;

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
            {previewUrl && !processando && (
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a href={previewUrl} download target="_blank" rel="noreferrer">
                  <Download className="h-3.5 w-3.5" /> Baixar
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowHistorico(true)}>
              <History className="h-3.5 w-3.5" /> Histórico{history.length > 0 && ` (${history.length})`}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setConfirmarExcluir(true)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
            {/* Barra Antes/Depois: comparar com a referência é o jeito mais direto
                de julgar uma clonagem — os dois vídeos já estão hospedados. */}
            {comparavel && (
              <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-muted/20">
                {(["antes", "depois"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVendo(v)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${vendo === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {v === "antes" ? "Antes (referência)" : "Depois (seu clone)"}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 min-h-[420px] flex items-center justify-center bg-black relative">
              {processando ? (
                <>
                  {/* Enquanto processa, o visor mostra o vídeo de REFERÊNCIA em vez
                      de um retângulo preto: dá contexto do que está sendo clonado
                      e deixa a espera concreta. */}
                  {originalUrl && (
                    <video src={originalUrl} className="max-h-[65vh] w-auto opacity-30" muted loop autoPlay playsInline />
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm text-center font-medium">{jobStatus.step || "Processando..."}</p>
                    <div className="w-full max-w-xs space-y-1.5">
                      <Progress value={jobStatus.progress ?? 5} className="h-1.5" />
                      <p className="text-[11px] text-white/60 text-center">
                        {jobStatus.progress ?? 5}% — pode ir fazendo outra coisa, avisamos quando ficar pronto.
                      </p>
                    </div>
                  </div>
                </>
              ) : srcVisor ? (
                <video
                  key={srcVisor}
                  controls
                  poster={vendo === "depois" ? videoRow?.thumbnail_url || undefined : undefined}
                  src={srcVisor}
                  className="max-h-[65vh] w-auto"
                />
              ) : jobStatus.status === "error" || (videoRow && !reidratando) ? (
                // Clone sem vídeo pronto e que não está processando = não
                // concluído (job falhou, ou o worker reiniciou e perdeu o job
                // da memória). "Sem vídeo ainda" nunca é um estado normal
                // persistente aqui — ou está processando, ou tem vídeo, ou falhou.
                <div className="flex flex-col items-center justify-center gap-3 text-white/80 p-8 text-center max-w-md">
                  <AlertTriangle className="h-8 w-8 text-amber-400" />
                  <p className="text-sm font-medium">Esta clonagem não foi concluída</p>
                  {/* Nada de prometer estorno: o worker só estorna quando o job
                      DELE falha. Se o processo morreu no meio (redeploy), o
                      débito fica — afirmar devolução automática seria mentir
                      sobre o dinheiro do usuário. */}
                  <p className="text-xs text-white/50">
                    {jobStatus.message || "O processamento foi interrompido antes de gerar o vídeo."}{" "}
                    Quando a geração falha, o crédito costuma ser estornado sozinho — confira seu saldo
                    e, se o valor não tiver voltado, fale com o suporte antes de tentar de novo.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="secondary" onClick={voltarParaForm}>Tentar de novo</Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConfirmarExcluir(true)}>
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  </div>
                </div>
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
                <Button
                  size="icon"
                  className="shrink-0 self-end"
                  onClick={() => setConfirmarRefinar(true)}
                  disabled={processando || !previewUrl || !instrucaoRefinar.trim()}
                  title={!previewUrl ? "Só é possível refinar depois que houver um vídeo pronto" : undefined}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Gera uma nova versão
                {custoRefinar != null && (custoRefinar > 0
                  ? <> — <b>~{custoRefinar} créditos</b></>
                  : <> — <b>sem custo</b> (só a narração muda)</>)}
                {" "}e a atual fica guardada no histórico.
              </p>
            </div>
          </div>
        </div>

        <AlertDialog open={confirmarRefinar} onOpenChange={setConfirmarRefinar}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Gerar uma nova versão?</AlertDialogTitle>
              <AlertDialogDescription>
                {custoRefinar == null ? (
                  <>Isso reprocessa o vídeo inteiro e <b>cobra créditos de novo</b> (seu saldo: {saldo}). </>
                ) : custoRefinar > 0 ? (
                  <>Isso reprocessa o vídeo inteiro e custa <b>~{custoRefinar} créditos</b> (seu saldo: {saldo}). </>
                ) : (
                  <>Isso refaz a narração do vídeo, <b>sem custo de créditos</b>. </>
                )}
                A versão atual não é perdida — fica guardada no histórico e você pode voltar pra ela quando quiser.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleRefinar}>Gerar nova versão</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmarExcluir} onOpenChange={setConfirmarExcluir}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir este vídeo clonado?</AlertDialogTitle>
              <AlertDialogDescription>
                O vídeo, a referência guardada e todas as versões do histórico são apagados. Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleExcluir}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
        <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1.5">
          <Coins className="h-3.5 w-3.5" /> {saldo} créditos
        </span>
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
                disabled={!!refFile || enviando}
              />
            </div>
            <label className="flex items-center gap-2 text-xs rounded-md border border-input bg-background px-3 py-2 cursor-pointer transition hover:bg-muted">
              <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{refFile ? refFile.name : "Ou envie um arquivo…"}</span>
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                className="hidden"
                disabled={enviando}
                onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {!refFile && !!refUrl.trim() && (
              <p className="text-[11px] text-muted-foreground">
                Instagram às vezes bloqueia o acesso — se falhar, baixe o vídeo e envie o arquivo. Até {MAX_DURACAO_S}s.
              </p>
            )}
            {duracaoExcedida && (
              <p className="text-[11px] text-destructive flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                Este vídeo tem {fmtDuracao(refDuracao!)} — o limite é {MAX_DURACAO_S}s. Corte antes de enviar.
              </p>
            )}
          </div>

          {/* Custo antes de gastar: a clonagem cobra por segundo de vídeo, então
              o valor só aparecia num erro 402 DEPOIS do upload e da transcrição. */}
          <div className="rounded-lg border border-border bg-background p-2.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5" /> Custo estimado
              </span>
              <span className={`text-sm font-semibold ${saldoInsuficiente ? "text-destructive" : ""}`}>
                {!klingAtivo ? "Sem custo"
                  : custoEstimado != null ? `~${custoEstimado} créditos`
                  : custoTeto != null ? `até ${custoTeto} créditos`
                  : "—"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {!klingAtivo
                ? "Manter o original em Realista, sem pedido de mudança, apenas redubla o áudio — não usa a IA de vídeo."
                : custoEstimado != null
                  ? `${fmtDuracao(refDuracao!)} de vídeo. O valor final acompanha a duração processada.`
                  : creditosPorSegundo != null
                    ? `Cerca de ${creditosPorSegundo.toFixed(2).replace(".", ",")} créditos por segundo de vídeo (até ${MAX_DURACAO_S}s).`
                    : "Cobrado por segundo de vídeo processado."}
            </p>
            {saldoInsuficiente && (
              <p className="text-[11px] text-destructive flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                Seu saldo é de {saldo} créditos. Compre créditos antes de clonar.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Sobre o que será o SEU vídeo? (opcional)</p>
            <Input
              value={refTema}
              onChange={(e) => setRefTema(e.target.value)}
              placeholder="Tema do seu vídeo…"
              className="text-sm"
              disabled={enviando}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Personagem</p>
            <div className="space-y-1.5">
              <button
                type="button"
                disabled={enviando}
                onClick={() => setModo("original")}
                className={`w-full rounded-lg border p-2.5 text-left text-sm transition ${modo === "original" ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <div className="flex items-center gap-2 font-medium"><Sparkles className="h-3.5 w-3.5" />Manter o original</div>
                <p className="text-xs text-muted-foreground mt-0.5">A pessoa do vídeo continua na cena.</p>
              </button>
              <button
                type="button"
                disabled={enviando}
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
                      disabled={enviando}
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
                  disabled={enviando}
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
                  disabled={enviando}
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
          <div className="flex-1 min-h-[420px] flex items-center justify-center bg-black relative">
            {refPreviewUrl ? (
              <video
                controls={!enviando}
                src={refPreviewUrl}
                onLoadedMetadata={(e) => setRefDuracao(e.currentTarget.duration)}
                className={`max-h-[65vh] w-auto ${enviando ? "opacity-30" : ""}`}
              />
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
            {enviando && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm font-medium">
                  {uploadPct < 1 ? "Enviando o vídeo…" : "Analisando o vídeo e preparando a narração…"}
                </p>
                <div className="w-full max-w-xs space-y-1.5">
                  <Progress value={uploadPct < 1 ? Math.round(uploadPct * 100) : 100} className="h-1.5" />
                  <p className="text-[11px] text-white/60 text-center">
                    {uploadPct < 1
                      ? `${Math.round(uploadPct * 100)}% enviado`
                      : "Transcrevendo a fala do vídeo — isso leva alguns instantes."}
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-border space-y-2 bg-card">
            <Textarea
              rows={2}
              value={instrucaoInicial}
              onChange={(e) => setInstrucaoInicial(e.target.value)}
              placeholder='O que você quer mudar? (opcional) Ex.: "mude a cor da parede"...'
              disabled={enviando}
              className="text-sm"
            />
            <Button
              onClick={handleClonar}
              disabled={enviando || duracaoExcedida || saldoInsuficiente}
              className="w-full gap-2"
            >
              {enviando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {uploadPct < 1 ? `Enviando… ${Math.round(uploadPct * 100)}%` : "Analisando o vídeo…"}</>
                : <><Wand2 className="h-4 w-4" /> Clonar vídeo{klingAtivo && custoEstimado != null ? ` (~${custoEstimado} créditos)` : ""}</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

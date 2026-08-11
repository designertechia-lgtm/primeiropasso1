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
/** Resposta de GET /clonar-video/inspecionar — metadados do link, sem download. */
type UrlInfo = {
  duracao_s: number;
  duracao_conhecida: boolean;
  titulo: string;
  thumbnail: string | null;
  max_duracao_s: number;
  excede_limite: boolean;
};
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

const ACEITA_VIDEO = "video/mp4,video/quicktime,video/webm,video/x-matroska";

/** Textura do palco vazio — define a área de solta sem pesar. */
const TRAMA_PALCO = {
  backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)",
  backgroundSize: "22px 22px",
};

/** Rótulo de seção do painel de direção. */
function Secao({ children, obrigatorio }: { children: React.ReactNode; obrigatorio?: boolean }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
      {obrigatorio && <span className="text-[9px] font-medium normal-case tracking-normal text-primary">obrigatório</span>}
    </p>
  );
}

/**
 * Cartão de escolha (personagem, tom, estilo). Um só componente para os três
 * grupos: o mesmo gesto deve ter sempre a mesma aparência e o mesmo alvo de
 * clique, o que a versão anterior não garantia (cada grupo tinha seu tamanho).
 */
function Escolha({
  ativo, onClick, disabled, Icon, titulo, descricao, compacto,
}: {
  ativo: boolean; onClick: () => void; disabled?: boolean;
  Icon: React.ComponentType<{ className?: string }>;
  titulo: string; descricao?: string; compacto?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      disabled={disabled}
      onClick={onClick}
      className={[
        "group relative w-full rounded-xl border bg-card text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100",
        compacto ? "p-2" : "p-2.5",
        // Laranja é a cor de marcação desta tela (a assinatura da sub-aba):
        // seleção e ação em accent, verde fica para o resto do admin.
        ativo
          ? "border-accent/60 bg-accent/[0.06] shadow-sm ring-1 ring-accent/30"
          : "border-border/70 hover:border-accent/40 hover:shadow-sm",
      ].join(" ")}
    >
      <div className={compacto ? "flex flex-col items-center gap-1.5" : "flex items-start gap-2.5"}>
        <span
          className={[
            "grid shrink-0 place-items-center rounded-lg transition-colors",
            compacto ? "h-7 w-7" : "h-8 w-8",
            ativo ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground group-hover:text-foreground",
          ].join(" ")}
        >
          <Icon className={compacto ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </span>
        <span className={compacto ? "text-center" : "min-w-0"}>
          <span className={["block font-medium leading-tight", compacto ? "text-[11px]" : "text-sm"].join(" ")}>
            {titulo}
          </span>
          {descricao && !compacto && (
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{descricao}</span>
          )}
        </span>
      </div>
    </button>
  );
}

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
  // Metadados do LINK colado (duração/título/thumb), lidos sem baixar o vídeo.
  const [urlInfo, setUrlInfo] = useState<UrlInfo | null>(null);
  const [urlErro, setUrlErro] = useState<string | null>(null);
  const [inspecionando, setInspecionando] = useState(false);
  const [refTema, setRefTema] = useState("");
  const [tom, setTom] = useState<Tom>("acolhedor");
  const [estilo, setEstilo] = useState<Estilo>("realista");
  const [instrucaoInicial, setInstrucaoInicial] = useState("");

  const [avatars, setAvatars] = useState<AvatarLite[]>([]);
  const [modo, setModo] = useState<"personagem" | "original">("original");
  const [avatarId, setAvatarId] = useState<string | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  // A tela CONVIDA a arrastar um vídeo — e o padrão do navegador, se a solta
  // errar o palco por 40px, é NAVEGAR para o arquivo e descartar o formulário
  // inteiro. O guard neutraliza o default na janela toda; o onDrop do palco
  // continua funcionando por rodar antes, no alvo.
  useEffect(() => {
    const bloqueia = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", bloqueia);
    window.addEventListener("drop", bloqueia);
    return () => {
      window.removeEventListener("dragover", bloqueia);
      window.removeEventListener("drop", bloqueia);
    };
  }, []);

  // Link colado: pergunta ao worker a duração/título/thumb ANTES de qualquer
  // gasto. Quem envia arquivo já via o custo (o navegador sabe a duração);
  // quem colava link só descobria o preço num 402, depois de o servidor baixar
  // o vídeo, transcrever e traduzir à toa.
  useEffect(() => {
    const link = refUrl.trim();
    setUrlInfo(null);
    setUrlErro(null);
    if (!link || refFile || !professional?.slug) { setInspecionando(false); return; }
    let cancelado = false;
    setInspecionando(true);
    // Prazo próprio: sem ele, uma resposta que nunca chega deixaria o aviso
    // "Conferindo o link…" na tela para sempre.
    const abort = new AbortController();
    const corta = setTimeout(() => abort.abort(), 50_000);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API}/clonar-video/inspecionar?url=${encodeURIComponent(link)}` +
          `&professional_slug=${encodeURIComponent(professional.slug)}`,
          { headers: await videoApiAuthHeaders(), signal: abort.signal },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelado) return;
        if (res.ok) setUrlInfo(data as UrlInfo);
        else if (res.status === 400) setUrlErro(data.detail || "Não consegui ler esse link.");
        // Só o 400 é veredito sobre o LINK (privado, ao vivo, removido, site não
        // suportado) e por isso bloqueia. Qualquer outra resposta é problema
        // NOSSO — worker ainda sem esta rota, 5xx, timeout da plataforma — e não
        // pode impedir a clonagem: seguimos sem a estimativa, como antes dela
        // existir. Isso também torna a ordem de deploy (front x worker) inócua.
      } catch {
        // rede/CORS: idem — degrada para o fluxo antigo, não bloqueia
      } finally {
        clearTimeout(corta);
        if (!cancelado) setInspecionando(false);
      }
    }, 800);   // espera o usuário terminar de colar/digitar
    return () => { cancelado = true; clearTimeout(timer); clearTimeout(corta); abort.abort(); };
  }, [refUrl, refFile, professional?.slug]);

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
  // Duração da referência, venha ela do arquivo local (o navegador lê) ou do
  // link (o worker responde sem baixar) — daqui pra baixo os dois modos são
  // tratados igual: mesma estimativa, mesmo limite, mesma checagem de saldo.
  const duracaoRef = refFile
    ? refDuracao
    : (urlInfo?.duracao_conhecida ? urlInfo.duracao_s : null);
  // O teto vem do servidor quando ele responde (fonte da verdade); MAX_DURACAO_S
  // é só o espelho local pro caso do arquivo, medido aqui no navegador.
  const limiteDuracao = urlInfo?.max_duracao_s ?? MAX_DURACAO_S;
  const duracaoExcedida = duracaoRef != null && duracaoRef > limiteDuracao;
  const custoEstimado = useMemo(() => {
    if (!klingAtivo) return 0;
    if (creditosPorSegundo == null || duracaoRef == null) return null;
    return Math.ceil(creditosPorSegundo * duracaoRef);
  }, [klingAtivo, creditosPorSegundo, duracaoRef]);
  const custoTeto = creditosPorSegundo != null ? Math.ceil(creditosPorSegundo * limiteDuracao) : null;
  // `credit_balance` é uma view que ainda não entrou no types.ts gerado (mesma
  // pendência das outras telas que mostram saldo) — cast local até regerar.
  const saldoRow = creditos as { balance?: number } | null | undefined;
  const saldoConhecido = typeof saldoRow?.balance === "number";
  const saldo = saldoRow?.balance ?? 0;
  // Só barra com saldo REALMENTE lido: enquanto a consulta não volta, `balance`
  // é undefined e tratá-lo como zero travaria o botão de quem tem crédito.
  const saldoInsuficiente = saldoConhecido && custoEstimado != null && custoEstimado > 0 && saldo < custoEstimado;
  // Sem duração não há como conferir saldo antes: o usuário precisa saber que a
  // conferência não aconteceu, em vez de supor que passou.
  const saldoNaoConferido = klingAtivo && custoEstimado == null && !!refUrl.trim() && !refFile;

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
  // Refinar é uma regeneração inteira e cobra de novo — sem esta checagem o
  // usuário só descobria o saldo curto num 402, depois de confirmar o diálogo.
  const saldoInsuficienteRefinar =
    saldoConhecido && custoRefinar != null && custoRefinar > 0 && saldo < custoRefinar;

  const handleClonar = async () => {
    if (!professional?.slug) return;
    if (!refFile && !refUrl.trim()) { toast.error("Envie um arquivo ou cole um link do vídeo"); return; }
    if (modo === "personagem" && !avatarId) { toast.error("Escolha um personagem ou marque 'Manter o original'"); return; }
    if (duracaoExcedida) {
      toast.error(`Este vídeo tem ${fmtDuracao(duracaoRef!)} — o limite é ${limiteDuracao}s.`, { duration: 8000 });
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
    if (saldoInsuficienteRefinar) {
      toast.error(`Saldo insuficiente: a nova versão custa ~${custoRefinar} créditos e você tem ${saldo}.`, { duration: 8000 });
      return;
    }
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

  /** Entrada única de arquivo — vale para o seletor e para o arrastar-e-soltar. */
  const receberArquivo = (f: File | null) => {
    if (!f) return;
    // Windows sem player registrado devolve MIME vazio para .mkv/.mov — aí a
    // extensão decide. A trava continua barrando PDF/zip arrastado por engano.
    const ehVideo = f.type.startsWith("video/") || (!f.type && /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name));
    if (!ehVideo) {
      toast.error("Esse arquivo não é um vídeo. Envie mp4, mov, webm ou mkv.");
      return;
    }
    if (refUrl.trim()) toast.info("Troquei o link pelo arquivo enviado.");
    setRefFile(f);
    setRefUrl("");   // arquivo e link são caminhos exclusivos
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
      <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-lg shadow-black/5 dark:shadow-black/40">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-gradient-to-r from-orange-500/[0.07] via-transparent to-transparent px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={voltarParaForm} title="Voltar"><ArrowLeft className="h-4 w-4" /></Button>
            <Input
              value={tituloDraft}
              onChange={(e) => setTituloDraft(e.target.value)}
              onBlur={handleSalvarTitulo}
              className="h-8 max-w-xs border-transparent bg-transparent text-base font-semibold tracking-tight hover:border-input focus-visible:border-input"
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

        <div className="grid grid-cols-1 lg:grid-cols-[288px_1fr]">
          <div className="space-y-4 border-b border-border/70 bg-muted/30 p-4 lg:border-b-0 lg:border-r">
            <dl className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
              {[
                { rotulo: "Tema", valor: state.tema?.trim() || "Não informado" },
                { rotulo: "Tom da narração", valor: TONS.find((t) => t.value === state.tom)?.label || "—" },
                { rotulo: "Personagem", valor: state.manter_original ? "Original do vídeo" : "Meu personagem" },
              ].map(({ rotulo, valor }) => (
                <div key={rotulo}>
                  <dt className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rotulo}</dt>
                  <dd className="mt-0.5 text-sm leading-snug">{valor}</dd>
                </div>
              ))}
            </dl>
            <div>
              <Secao>Estilo da próxima versão</Secao>
              <div className="grid grid-cols-3 gap-1.5">
                {ESTILOS.map(({ value, label, Icon }) => (
                  <Escolha
                    key={value}
                    compacto
                    ativo={estiloRefinar === value}
                    disabled={processando}
                    onClick={() => setEstiloRefinar(value)}
                    Icon={Icon}
                    titulo={label}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            {/* Barra Antes/Depois: comparar com a referência é o jeito mais direto
                de julgar uma clonagem — os dois vídeos já estão hospedados. */}
            {comparavel && (
              <div className="flex items-center gap-1 border-b border-border/70 bg-muted/30 px-3 py-2">
                <div className="inline-flex rounded-lg bg-muted p-0.5 ring-1 ring-inset ring-border/60">
                  {(["antes", "depois"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={vendo === v}
                      onClick={() => setVendo(v)}
                      className={[
                        "rounded-[7px] px-3 py-1 text-xs font-medium transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        vendo === v
                          ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                          : "text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                    >
                      {v === "antes" ? "Antes" : "Depois"}
                    </button>
                  ))}
                </div>
                <span className="ml-1 text-[11px] text-muted-foreground">
                  {vendo === "antes" ? "vídeo de referência" : "o seu clone"}
                </span>
              </div>
            )}

            <div className="relative flex min-h-[460px] flex-1 items-center justify-center overflow-hidden bg-[#0a0e0d]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-32 h-72 bg-[radial-gradient(55%_100%_at_50%_0%,hsl(var(--accent)/0.26),transparent_72%)]"
              />
              {processando ? (
                <>
                  {/* Enquanto processa, o visor mostra o vídeo de REFERÊNCIA em vez
                      de um retângulo preto: dá contexto do que está sendo clonado
                      e deixa a espera concreta. */}
                  {originalUrl && (
                    <video src={originalUrl} className="relative z-10 max-h-[65vh] w-auto rounded-lg opacity-25" muted loop autoPlay playsInline />
                  )}
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 p-8 text-white">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </span>
                    <p className="text-center text-sm font-medium">{jobStatus.step || "Processando…"}</p>
                    <div className="w-full max-w-xs space-y-2">
                      <Progress value={jobStatus.progress ?? 5} className="h-1.5" />
                      <p className="text-center text-[11px] leading-relaxed text-white/60">
                        <span className="tabular-nums">{jobStatus.progress ?? 5}%</span> — pode ir fazendo outra coisa,
                        avisamos quando ficar pronto.
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
                  className="relative z-10 max-h-[65vh] w-auto rounded-lg shadow-2xl"
                />
              ) : jobStatus.status === "error" || (videoRow && !reidratando) ? (
                // Clone sem vídeo pronto e que não está processando = não
                // concluído (job falhou, ou o worker reiniciou e perdeu o job
                // da memória). "Sem vídeo ainda" nunca é um estado normal
                // persistente aqui — ou está processando, ou tem vídeo, ou falhou.
                <div className="relative z-10 flex max-w-md flex-col items-center justify-center gap-3 p-8 text-center text-white/80">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-400/25">
                    <AlertTriangle className="h-6 w-6 text-amber-400" />
                  </span>
                  <p className="text-sm font-medium text-white">Esta clonagem não foi concluída</p>
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
                <div className="relative z-10 flex flex-col items-center justify-center gap-3 p-8 text-white/60">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p className="text-sm">Carregando…</p>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-border/70 bg-card p-3">
              <div className="flex gap-2">
                <Textarea
                  rows={2}
                  value={instrucaoRefinar}
                  onChange={(e) => setInstrucaoRefinar(e.target.value)}
                  placeholder='O que você quer mudar? Ex.: "mude a cor da parede"…'
                  disabled={processando}
                  className="resize-none bg-background text-sm"
                />
                <Button
                  size="icon"
                  className="h-11 w-11 shrink-0 self-end bg-accent text-accent-foreground shadow-md shadow-accent/25 transition-all hover:bg-accent/90 active:scale-[0.97] disabled:shadow-none motion-reduce:transition-none motion-reduce:active:scale-100"
                  onClick={() => setConfirmarRefinar(true)}
                  disabled={processando || !previewUrl || !instrucaoRefinar.trim() || saldoInsuficienteRefinar}
                  title={
                    !previewUrl ? "Só é possível refinar depois que houver um vídeo pronto"
                      : saldoInsuficienteRefinar ? `Saldo insuficiente: são ~${custoRefinar} créditos e você tem ${saldo}`
                      : "Gerar nova versão"
                  }
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {saldoInsuficienteRefinar ? (
                <p className="text-[11px] text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  Uma nova versão custa ~{custoRefinar} créditos e seu saldo é de {saldo}. Compre créditos para refinar.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Gera uma nova versão
                  {custoRefinar != null && (custoRefinar > 0
                    ? <> — <b>~{custoRefinar} créditos</b></>
                    : <> — <b>sem custo</b> (só a narração muda)</>)}
                  {" "}e a atual fica guardada no histórico.
                </p>
              )}
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
    <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-lg shadow-black/5 dark:shadow-black/40">
      <div className="flex items-center gap-3 border-b border-border/70 bg-gradient-to-r from-orange-500/[0.07] via-transparent to-transparent px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 ring-1 ring-inset ring-orange-500/25 dark:text-orange-400">
          <Clapperboard className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-none tracking-tight">Clonar Vídeo</h2>
          <p className="mt-1.5 truncate text-[11px] leading-none text-muted-foreground">
            Refaz um vídeo de referência com a sua narração e o seu estilo
          </p>
        </div>
        <Badge
          variant="outline"
          className="ml-1 hidden shrink-0 gap-1.5 border-purple-400/40 bg-purple-500/5 text-[10px] font-medium text-purple-600 sm:inline-flex dark:text-purple-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-purple-500" /> Kling O1 Edit
        </Badge>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset ring-border/60">
          <Coins className="h-3.5 w-3.5 text-amber-500" />
          {saldo}
          <span className="font-normal text-muted-foreground">créditos</span>
        </span>
      </div>

      {/* O seletor de arquivo é único: serve ao botão do painel e ao palco. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACEITA_VIDEO}
        className="hidden"
        disabled={enviando}
        onChange={(e) => { receberArquivo(e.target.files?.[0] ?? null); e.target.value = ""; }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[336px_1fr]">
        <div className="space-y-5 border-b border-border/70 bg-muted/30 p-4 lg:border-b-0 lg:border-r">
          <div>
            <Secao obrigatorio>Vídeo de referência</Secao>
            <div className="relative">
              <Link2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={refUrl}
                onChange={(e) => setRefUrl(e.target.value)}
                placeholder="Cole o link (YouTube, TikTok, Instagram)…"
                className="bg-background pl-8 text-sm"
                disabled={!!refFile || enviando}
              />
            </div>
            <div className="my-2 flex items-center gap-2">
              <span className="h-px flex-1 bg-border/70" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ou</span>
              <span className="h-px flex-1 bg-border/70" />
            </div>
            {refFile ? (
              <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/[0.05] px-2.5 py-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent/15 text-accent">
                  <Clapperboard className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{refFile.name}</span>
                  <span className="block text-[10.5px] text-muted-foreground">
                    {(refFile.size / 1024 / 1024).toFixed(1)} MB
                    {duracaoRef != null && ` · ${fmtDuracao(duracaoRef)}`}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => setRefFile(null)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-destructive disabled:opacity-50"
                  title="Remover o arquivo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={enviando}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-xs transition hover:border-accent/40 hover:bg-muted disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">Escolher um arquivo do computador</span>
              </button>
            )}
            <div className="mt-2 space-y-1.5">
            {!refFile && !!refUrl.trim() && (
              inspecionando ? (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" /> Conferindo o link…
                </p>
              ) : urlErro ? (
                // O motivo real vem do worker (yt-dlp traduzido): vídeo privado,
                // exige login, removido, ao vivo... O usuário descobre AGORA, não
                // depois de esperar a clonagem falhar.
                <p className="text-[11px] text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  {urlErro}
                </p>
              ) : urlInfo ? (
                // O aviso de excesso é o bloco `duracaoExcedida` logo abaixo —
                // aqui só confirmamos quando ele realmente CABE, senão a tela
                // diria "dentro do limite" ao lado de "passou do limite".
                <p className="text-[11px] text-muted-foreground">
                  {!urlInfo.duracao_conhecida
                    ? `A plataforma não informou a duração; o limite de ${limiteDuracao}s é conferido no servidor.`
                    : urlInfo.excede_limite
                      ? `Vídeo de ${fmtDuracao(urlInfo.duracao_s)}.`
                      : `Vídeo de ${fmtDuracao(urlInfo.duracao_s)} — dentro do limite de ${limiteDuracao}s.`}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Instagram às vezes bloqueia o acesso — se falhar, baixe o vídeo e envie o arquivo. Até {limiteDuracao}s.
                </p>
              )
            )}
            {duracaoExcedida && (
              <p className="text-[11px] text-destructive flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                Este vídeo tem {fmtDuracao(duracaoRef!)} — o limite é {limiteDuracao}s. Corte antes de {refFile ? "enviar" : "clonar"}.
              </p>
            )}
            </div>
          </div>

          <div>
            <Secao>Tema do seu vídeo</Secao>
            <Input
              value={refTema}
              onChange={(e) => setRefTema(e.target.value)}
              placeholder="Opcional — ex.: ansiedade no trabalho"
              className="bg-background text-sm"
              disabled={enviando}
            />
          </div>

          <div>
            <Secao>Quem aparece</Secao>
            <div className="space-y-1.5">
              <Escolha
                ativo={modo === "original"}
                disabled={enviando}
                onClick={() => setModo("original")}
                Icon={Sparkles}
                titulo="Manter o original"
                descricao="A pessoa do vídeo continua na cena."
              />
              <Escolha
                ativo={modo === "personagem"}
                disabled={enviando}
                onClick={() => setModo("personagem")}
                Icon={Users}
                titulo="Meu personagem"
                descricao="Troca a pessoa pelo seu personagem."
              />
            </div>
            {modo === "personagem" && (
              avatars.length ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {avatars.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={enviando}
                      aria-pressed={avatarId === a.id}
                      onClick={() => setAvatarId(a.id)}
                      className={[
                        "relative rounded-xl p-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100",
                        avatarId === a.id
                          ? "ring-2 ring-accent ring-offset-1 ring-offset-muted"
                          : "opacity-75 ring-1 ring-border hover:opacity-100 hover:ring-accent/40",
                      ].join(" ")}
                      title={a.name}
                    >
                      {a.photo_url
                        ? <img src={a.photo_url} alt={a.name} className="h-12 w-12 rounded-[10px] object-cover" />
                        : <div className="grid h-12 w-12 place-items-center rounded-[10px] bg-muted text-xs font-medium">{a.name.slice(0, 2)}</div>}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="pt-2 text-xs text-muted-foreground">
                  Sem personagens ainda — crie um em <b>Personagens</b> ou use "Manter o original".
                </p>
              )
            )}
          </div>

          <div>
            <Secao>Tom da narração</Secao>
            <div className="grid grid-cols-2 gap-1.5">
              {TONS.map(({ value, label, Icon }) => (
                <Escolha
                  key={value}
                  compacto
                  ativo={tom === value}
                  disabled={enviando}
                  onClick={() => setTom(value)}
                  Icon={Icon}
                  titulo={label}
                />
              ))}
            </div>
          </div>

          <div>
            <Secao>Estilo visual</Secao>
            <div className="grid grid-cols-3 gap-1.5">
              {ESTILOS.map(({ value, label, Icon }) => (
                <Escolha
                  key={value}
                  compacto
                  ativo={estilo === value}
                  disabled={enviando}
                  onClick={() => setEstilo(value)}
                  Icon={Icon}
                  titulo={label}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              <b className="font-medium text-foreground">Realista</b> mantém a aparência original.
              Cartoon e Pixar transformam a cena inteira — e passam a usar a IA de vídeo, que é cobrada.
            </p>
          </div>
        </div>

        <div className="flex flex-col">
          {/* O palco é a maior área da tela e antes ficava um retângulo preto
              inerte: a única porta de entrada do arquivo era um link pequeno no
              painel. Agora ele é a porta — arrastar para cá funciona. */}
          <div
            onDragOver={(e) => { e.preventDefault(); if (!enviando) setArrastando(true); }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setArrastando(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              if (enviando) { toast.info("Aguarde o envio terminar para trocar o vídeo."); return; }
              const fs = e.dataTransfer.files;
              if (fs && fs.length > 1) toast.info("Um vídeo por vez — usei o primeiro da seleção.");
              receberArquivo(fs?.[0] ?? null);
            }}
            className="relative flex min-h-[460px] flex-1 items-center justify-center overflow-hidden bg-[#0a0e0d]"
          >
            {/* O palco aceita solta em QUALQUER estado (trocar o vídeo é 1
                gesto), então o realce também precisa existir em qualquer
                estado — não só no vazio, cujo cartão tem realce próprio. */}
            {arrastando && !enviando && (refPreviewUrl || refUrl.trim()) && (
              <div className="pointer-events-none absolute inset-0 z-30 m-3 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-accent/15 backdrop-blur-[1px]">
                <p className="rounded-full bg-black/65 px-4 py-2 text-sm font-medium text-white">
                  Solte para trocar o vídeo
                </p>
              </div>
            )}
            {/* Luz de cena: dá profundidade ao palco sem competir com o vídeo. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-32 h-72 bg-[radial-gradient(55%_100%_at_50%_0%,hsl(var(--accent)/0.26),transparent_72%)]"
            />

            {refPreviewUrl ? (
              <video
                controls={!enviando}
                src={refPreviewUrl}
                onLoadedMetadata={(e) => setRefDuracao(e.currentTarget.duration)}
                className={`relative z-10 max-h-[65vh] w-auto rounded-lg shadow-2xl transition-opacity ${enviando ? "opacity-25" : ""}`}
              />
            ) : refUrl.trim() ? (
              // O link é conferido antes de clonar: capa, nome e duração deixam
              // o profissional confirmar que é o vídeo certo — e o preço ao lado
              // deixa de ser abstrato.
              <div className="relative z-10 flex max-w-sm flex-col items-center gap-3 p-8 text-center text-sm text-white/70">
                {inspecionando ? (
                  <>
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
                      <Loader2 className="h-6 w-6 animate-spin text-white/80" />
                    </span>
                    <p>Conferindo o link…</p>
                  </>
                ) : urlErro ? (
                  <>
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-400/25">
                      <AlertTriangle className="h-6 w-6 text-amber-400" />
                    </span>
                    <p className="leading-snug text-white/90">{urlErro}</p>
                    <p className="text-xs text-white/60">Você ainda pode tentar clonar — o link é conferido de novo na hora.</p>
                  </>
                ) : urlInfo ? (
                  <>
                    {urlInfo.thumbnail
                      ? <img src={urlInfo.thumbnail} alt="" className="max-h-[45vh] w-auto rounded-xl object-contain shadow-2xl ring-1 ring-white/10" />
                      : <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10"><Link2 className="h-6 w-6" /></span>}
                    {urlInfo.titulo && <p className="font-medium leading-snug text-white/90">{urlInfo.titulo}</p>}
                    <p className="text-xs text-white/45">
                      {urlInfo.duracao_conhecida ? fmtDuracao(urlInfo.duracao_s) : "duração não informada pela plataforma"}
                      {" · baixamos o vídeo quando você clicar em Clonar"}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
                      <Link2 className="h-6 w-6" />
                    </span>
                    <p>Link colado — a capa aparece depois da conferência.</p>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled={enviando}
                onClick={() => fileInputRef.current?.click()}
                style={TRAMA_PALCO}
                className={[
                  "group relative z-10 m-6 flex w-[min(440px,88%)] flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-8 py-12 text-center",
                  "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  "motion-reduce:transition-none",
                  arrastando
                    ? "scale-[1.02] border-accent bg-accent/10 shadow-[0_0_60px_-12px_hsl(var(--accent)/0.55)]"
                    : "border-white/15 hover:border-accent/60 hover:bg-white/[0.03]",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid h-16 w-16 place-items-center rounded-2xl ring-1 transition-all duration-200",
                    arrastando
                      ? "scale-110 bg-accent/25 text-white ring-accent/40"
                      : "bg-white/[0.06] text-white/70 ring-white/10 group-hover:bg-accent/20 group-hover:text-white",
                  ].join(" ")}
                >
                  <Clapperboard className="h-7 w-7" />
                </span>
                <span>
                  <span className="block text-[15px] font-medium text-white">
                    {arrastando ? "Solte o vídeo aqui" : "Arraste um vídeo para começar"}
                  </span>
                  <span className="mt-1.5 block text-xs leading-relaxed text-white/45">
                    ou clique para escolher no computador
                    <br />
                    mp4, mov, webm ou mkv · até {limiteDuracao}s
                  </span>
                </span>
                <span className="text-[11px] text-white/60">Também dá para colar um link no painel ao lado</span>
              </button>
            )}

            {enviando && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/45 p-8 backdrop-blur-[2px]">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </span>
                <p className="text-sm font-medium text-white">
                  {uploadPct < 1 ? "Enviando o vídeo…" : "Analisando o vídeo e preparando a narração…"}
                </p>
                <div className="w-full max-w-xs space-y-2">
                  <Progress value={uploadPct < 1 ? Math.round(uploadPct * 100) : 100} className="h-1.5" />
                  <p className="text-center text-[11px] text-white/60">
                    {uploadPct < 1
                      ? `${Math.round(uploadPct * 100)}% enviado`
                      : "Transcrevendo a fala do vídeo — isso leva alguns instantes."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Régua de produção: instrução, preço e ação juntos. O custo ficava
              perdido no meio do painel, longe do botão que o cobra. */}
          <div className="space-y-2.5 border-t border-border/70 bg-card p-3">
            <Textarea
              rows={2}
              value={instrucaoInicial}
              onChange={(e) => setInstrucaoInicial(e.target.value)}
              placeholder='O que você quer mudar? (opcional) Ex.: "mude a cor da parede"…'
              disabled={enviando}
              className="resize-none bg-background text-sm"
            />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1">
                <span
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset",
                    saldoInsuficiente
                      ? "bg-destructive/10 text-destructive ring-destructive/25"
                      : !klingAtivo
                        ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400"
                        : "bg-muted text-foreground ring-border/60",
                  ].join(" ")}
                >
                  <Coins className="h-3.5 w-3.5" />
                  {!klingAtivo ? "Sem custo"
                    : custoEstimado != null ? `~${custoEstimado} créditos`
                    : custoTeto != null ? `até ${custoTeto} créditos`
                    : "Cobrado por segundo"}
                </span>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {!klingAtivo
                    ? "Manter o original em Realista, sem pedido de mudança, só redubla o áudio."
                    : custoEstimado != null
                      ? `${fmtDuracao(duracaoRef!)} de vídeo — o valor final acompanha a duração processada.`
                      : creditosPorSegundo != null
                        ? `Cerca de ${creditosPorSegundo.toFixed(2).replace(".", ",")} créditos por segundo de vídeo.`
                        : "Cobrado por segundo de vídeo processado."}
                </p>
              </div>

              {/* A conferência do link NÃO bloqueia o botão. Ela é uma
                  conveniência: o worker refaz a mesma validação no /iniciar, e o
                  download acontece ANTES de qualquer débito — então tentar com um
                  link problemático não custa crédito. Já um erro transitório
                  (timeout, rate-limit momentâneo) também chega aqui como 400;
                  travar o CTA por causa dele proibiria uma clonagem que
                  funcionaria. Avisar, sim; impedir, não. */}
              <Button
                size="lg"
                onClick={handleClonar}
                disabled={enviando || duracaoExcedida || saldoInsuficiente}
                title={
                  duracaoExcedida ? `O vídeo passa do limite de ${limiteDuracao}s — corte antes de clonar`
                    : saldoInsuficiente ? `Saldo insuficiente: ~${custoEstimado} créditos e você tem ${saldo}`
                    : undefined
                }
                className="h-11 shrink-0 gap-2 bg-accent px-5 text-accent-foreground shadow-md shadow-accent/25 transition-all hover:bg-accent/90 active:scale-[0.98] disabled:shadow-none motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                {enviando
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {uploadPct < 1 ? `Enviando… ${Math.round(uploadPct * 100)}%` : "Analisando…"}</>
                  : <><Wand2 className="h-4 w-4" /> {urlErro ? "Clonar mesmo assim" : "Clonar vídeo"}</>}
              </Button>
            </div>

            {saldoInsuficiente && (
              <p className="flex items-start gap-1.5 text-[11px] text-destructive">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                Seu saldo é de {saldo} créditos. Compre créditos antes de clonar.
              </p>
            )}
            {!saldoInsuficiente && saldoNaoConferido && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-500">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                Sem a duração deste link, não deu para conferir se o seu saldo cobre — você tem {saldo} créditos.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

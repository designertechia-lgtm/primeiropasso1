import { useEffect, useState } from "react";
import { toast } from "sonner";
import { videoApiAuthHeaders } from "@/lib/videoApi";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

// ── Acompanhamento de clonagens fora do ciclo de vida do React ──────────────
// A clonagem é cara (créditos reais, ~1,84/segundo de vídeo) e demorada — o
// profissional não pode perder o rastro dela por trocar de sub-aba (o Radix
// Tabs DESMONTA o conteúdo inativo) ou recarregar a página. Por isso o estado
// dos jobs vive aqui, no escopo do MÓDULO, e as telas apenas ASSINAM.
//
// Por que assinatura (Set de listeners) e não um único callback: o desenho
// anterior guardava um `onChange` só, gravado por um useEffect que só rodava
// quando o video_id MUDAVA. Ao refinar o mesmo vídeo, o id era o mesmo, o
// effect não rodava de novo, e a entrada recriada nascia sem callback — a tela
// ficava muda e continuava exibindo a versão antiga.
//
// ── Regra de ouro deste arquivo ────────────────────────────────────────────
// NUNCA anunciar "pronto" sem ter PROVA de vídeo novo, e nunca anunciar falha
// (nem prometer estorno) de um job que pode estar vivo. O worker cobra o
// crédito ANTES de processar e só estorna se o job dele falhar de verdade —
// então um "falhou" inventado pela tela é uma mentira sobre o dinheiro do
// usuário, e um "pronto" inventado entrega a versão velha por uma nova paga.
//
// Por isso a linha de base (`embedAntes`): a rota de refinamento REUSA o mesmo
// video_id e a linha em `videos` continua carregando o embed_url da versão
// ANTERIOR até o worker terminar. "Tem embed_url" não prova nada num
// refinamento — só prova se a URL MUDOU em relação à que existia no clique.

export type CloneJobStatus = {
  status: "idle" | "processing" | "done" | "error";
  progress?: number;
  step?: string;
  video_url?: string;
  video_id?: string;
  message?: string;
  elapsed_seconds?: number;
};

type Listener = (status: CloneJobStatus) => void;

type Entry = {
  status: CloneJobStatus;
  intervalId: ReturnType<typeof setInterval> | null;
  listeners: Set<Listener>;
  /** slug do dono — necessário pra conferir o estado no banco quando /status some */
  slug: string | null;
  /**
   * embed_url que a linha tinha quando este job começou. `undefined` = ainda
   * não sabemos (aba nova/reload); a primeira leitura do banco preenche.
   */
  embedAntes: string | null | undefined;
  /** ticks seguidos em que o worker não sabe do job e o banco não mudou */
  semNoticia: number;
  /** trava de reentrância: um tick lento não pode ser atropelado pelo seguinte */
  tickando: boolean;
};

const entries = new Map<string, Entry>();
const globalListeners = new Set<() => void>();

const POLL_MS = 4000;
/**
 * Quantos ticks seguidos aceitamos "o worker não conhece este job E o banco não
 * mudou" antes de declarar interrupção. O 404 do /status é determinístico (o
 * job não está na memória do worker, normalmente porque o EasyPanel redeployou
 * e matou o BackgroundTasks junto), mas exigimos confirmação repetida pra não
 * transformar um blip de rede em acusação de falha.
 */
const SEM_NOTICIA_LIMITE = 3;

function ensure(videoId: string): Entry {
  let entry = entries.get(videoId);
  if (!entry) {
    entry = {
      status: { status: "idle" }, intervalId: null, listeners: new Set(),
      slug: null, embedAntes: undefined, semNoticia: 0, tickando: false,
    };
    entries.set(videoId, entry);
  }
  return entry;
}

function emit(videoId: string) {
  const entry = entries.get(videoId);
  if (!entry) return;
  entry.listeners.forEach((fn) => fn(entry.status));
  globalListeners.forEach((fn) => fn());
}

function parar(entry: Entry) {
  if (entry.intervalId) clearInterval(entry.intervalId);
  entry.intervalId = null;
}

/** Descarta entradas ociosas (sem tela assinando e sem job rodando). */
function limpar(videoId: string) {
  const entry = entries.get(videoId);
  if (entry && !entry.intervalId && entry.listeners.size === 0) entries.delete(videoId);
}

export type CloneVideoRow = {
  id: string;
  title: string;
  embed_url: string;
  thumbnail_url: string | null;
  script_json?: Record<string, unknown> | null;
};

/**
 * Lê a linha do vídeo no banco (preview atual + histórico + vídeo original).
 * Exige JWT: `/clonar-video/{id}/estado` passa por `require_owner` no worker e
 * responde 401 sem o header — era o que mantinha o visor vazio mesmo com o
 * vídeo pronto e salvo.
 */
export async function buscarEstadoClone(videoId: string, slug: string): Promise<CloneVideoRow | null> {
  const res = await fetch(
    `${API}/clonar-video/${videoId}/estado?professional_slug=${encodeURIComponent(slug)}`,
    { headers: await videoApiAuthHeaders() },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as CloneVideoRow;
}

/**
 * Desfecho pelo banco quando o worker não sabe mais do job. Só devolve "done"
 * com PROVA de vídeo novo (embed_url diferente do que existia no clique) e só
 * devolve "error" depois de o silêncio se confirmar. `null` = ainda não dá pra
 * concluir nada; continua acompanhando.
 */
async function desfechoPeloBanco(videoId: string, entry: Entry): Promise<CloneJobStatus | null> {
  if (!entry.slug) return null;
  let row: CloneVideoRow | null;
  try {
    row = await buscarEstadoClone(videoId, entry.slug);
  } catch {
    return null;   // sem resposta do banco agora — o próximo tick tenta de novo
  }
  if (!row) return null;

  const atual = row.embed_url || "";
  // Primeira leitura sem linha de base (aba nova/reload no meio do job): adota
  // o que está lá como referência em vez de chutar que já ficou pronto.
  if (entry.embedAntes === undefined) entry.embedAntes = atual;

  if (atual && atual !== entry.embedAntes) {
    return { status: "done", progress: 100, video_url: atual, video_id: videoId };
  }

  entry.semNoticia += 1;
  if (entry.semNoticia >= SEM_NOTICIA_LIMITE) {
    return {
      status: "error",
      message: "O processamento foi interrompido antes de gerar o vídeo.",
    };
  }
  return null;
}

async function tick(videoId: string) {
  const entry = entries.get(videoId);
  if (!entry || entry.tickando) return;
  entry.tickando = true;
  try {
    let data: CloneJobStatus | null = null;
    let sumiu = false;
    try {
      const res = await fetch(`${API}/status/${videoId}`);
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json.status === "string") data = json as CloneJobStatus;
        else sumiu = true;
      } else if (res.status === 404) {
        sumiu = true;   // worker reiniciou e perdeu o job da memória
      } else {
        return;         // erro transitório (502/timeout): tenta no próximo tick
      }
    } catch {
      return;           // rede caiu nesse tick — não desiste
    }

    // NÃO existe heurística de "demorou demais": o elapsed_seconds do worker é a
    // idade real de um job saudável, não sinal de travamento. A chamada ao Kling
    // não tem teto, e um vídeo de 90s vira ~10 blocos processados 3 a 3 — passar
    // de meia hora é normal. Chutar falha aqui acusaria estorno inexistente e
    // ainda ofereceria "Excluir" em cima de um vídeo pago que está sendo gerado.

    if (sumiu) {
      const desfecho = await desfechoPeloBanco(videoId, entry);
      if (!desfecho) return;
      data = desfecho;
    } else {
      entry.semNoticia = 0;
    }
    if (!data) return;

    entry.status = data;
    emit(videoId);

    if (data.status === "done" || data.status === "error") {
      parar(entry);
      if (data.status === "done") {
        if (entry.listeners.size > 0) toast.success("Vídeo pronto!", { duration: 6000 });
        else toast.success("Seu vídeo clonado ficou pronto!", {
          description: "Abra a aba Clonar Vídeo ou Meus Vídeos para revisar.",
          duration: 12000,
        });
      } else {
        toast.error(data.message || "Erro na clonagem", { duration: 8000 });
      }
      limpar(videoId);
    }
  } finally {
    entry.tickando = false;
  }
}

/**
 * Começa (ou reinicia) o acompanhamento de um job.
 * `embedAtual` é o embed_url que a linha tem AGORA (null na primeira clonagem,
 * a URL da versão vigente num refinamento) — é a prova contra anunciar a versão
 * velha como se fosse a nova.
 */
export function iniciarCloneJob(
  videoId: string, slug: string | null, inicial: CloneJobStatus, embedAtual?: string | null,
) {
  const entry = ensure(videoId);
  entry.slug = slug ?? entry.slug;
  entry.status = inicial;
  entry.semNoticia = 0;
  if (embedAtual !== undefined) entry.embedAntes = embedAtual;
  parar(entry);
  entry.intervalId = setInterval(() => { void tick(videoId); }, POLL_MS);
  emit(videoId);
}

/**
 * Marca um estado na tela SEM ligar o polling. Usado no intervalo entre clicar
 * e o servidor confirmar: um refinamento reusa o mesmo video_id, e o worker
 * ainda guarda o "done" da versão anterior — pollar antes da confirmação leria
 * esse "done" velho e anunciaria "vídeo pronto" com o refinamento nem iniciado.
 */
export function marcarCloneJob(
  videoId: string, slug: string | null, status: CloneJobStatus, embedAtual?: string | null,
) {
  const entry = ensure(videoId);
  entry.slug = slug ?? entry.slug;
  entry.status = status;
  if (embedAtual !== undefined) entry.embedAntes = embedAtual;
  emit(videoId);
}

/** Desfaz o estado otimista quando a chamada ao servidor falha. */
export function cancelarCloneJob(videoId: string) {
  const entry = entries.get(videoId);
  if (!entry) return;
  parar(entry);
  entry.status = { status: "idle" };
  emit(videoId);
  limpar(videoId);
}

/** O que a reidratação conseguiu apurar sobre um job ao abrir a tela. */
export type RetomadaResultado = "processando" | "ausente" | "indefinido";

/**
 * Reidrata um job ao abrir a tela com ?video=<id> numa aba nova ou depois de um
 * reload — o Map do módulo não sobrevive a recarregar a página, mas o job segue
 * rodando no servidor.
 *
 * Distingue "o worker diz que não existe" (404) de "não consegui perguntar"
 * (5xx/rede): só o primeiro é ausência de verdade. Um 502 passageiro não pode
 * fazer a tela declarar que a clonagem falhou — ela está rodando e já foi paga.
 */
export async function retomarCloneJob(
  videoId: string, slug: string | null, tentativa = 1,
): Promise<RetomadaResultado> {
  const entry = ensure(videoId);
  entry.slug = slug ?? entry.slug;
  if (entry.intervalId) return "processando";          // já estamos acompanhando
  if (entry.status.status === "processing") return "processando";

  try {
    const res = await fetch(`${API}/status/${videoId}`);
    if (res.ok) {
      const data = (await res.json()) as CloneJobStatus;
      if (data?.status === "processing") {
        // Sem linha de base conhecida aqui: a primeira leitura do banco adota a
        // URL vigente, então um refinamento em curso nunca passa por concluído.
        iniciarCloneJob(videoId, slug, data);
        return "processando";
      }
      if (data?.status === "error") {
        entry.status = data;
        emit(videoId);
        return "ausente";
      }
      return "ausente";                                 // done/idle: o banco manda
    }
    if (res.status === 404) return "ausente";           // worker não conhece o job
  } catch {
    // rede caiu — cai no retry abaixo
  }

  if (tentativa < 3) {
    await new Promise((r) => setTimeout(r, 1200 * tentativa));
    return retomarCloneJob(videoId, slug, tentativa + 1);
  }
  // Não conseguimos apurar. Liga o acompanhamento assim mesmo: é preferível
  // seguir consultando do que a tela concluir sozinha que a clonagem falhou.
  iniciarCloneJob(videoId, slug, { status: "processing", step: "Verificando o andamento..." });
  return "indefinido";
}

export function statusAtual(videoId: string | null): CloneJobStatus {
  if (!videoId) return { status: "idle" };
  return entries.get(videoId)?.status ?? { status: "idle" };
}

/** Assina o job de um vídeo. Recebe atualizações mesmo que o job comece depois. */
export function useCloneJob(videoId: string | null, slug?: string | null): CloneJobStatus {
  const [status, setStatus] = useState<CloneJobStatus>(() => statusAtual(videoId));

  useEffect(() => {
    if (!videoId) { setStatus({ status: "idle" }); return; }
    const entry = ensure(videoId);
    if (slug) entry.slug = slug;
    setStatus(entry.status);
    entry.listeners.add(setStatus);
    return () => {
      entry.listeners.delete(setStatus);
      limpar(videoId);
    };
  }, [videoId, slug]);

  return status;
}

type JobAtivo = { videoId: string; status: CloneJobStatus } | null;

function lerAtivo(): JobAtivo {
  for (const [videoId, entry] of entries) {
    if (entry.status.status === "processing") return { videoId, status: entry.status };
  }
  return null;
}

/** Job de clonagem em andamento (qualquer vídeo) — alimenta o aviso na sub-aba. */
export function useCloneJobAtivo(): JobAtivo {
  const [ativo, setAtivo] = useState<JobAtivo>(lerAtivo);

  useEffect(() => {
    // Devolve o MESMO objeto quando nada mudou: este hook vive na barra de abas
    // do Estúdio Viral, e um estado novo a cada tique re-renderizaria a árvore
    // inteira de sub-abas sem necessidade.
    const fn = () => setAtivo((prev) => {
      const novo = lerAtivo();
      if (!prev && !novo) return prev;
      if (prev && novo && prev.videoId === novo.videoId
          && prev.status.progress === novo.status.progress
          && prev.status.step === novo.status.step) return prev;
      return novo;
    });
    globalListeners.add(fn);
    fn();
    // O emit cobre as respostas do worker; o intervalo curto cobre a janela
    // entre montar a barra de abas e o primeiro tique chegar.
    const id = setInterval(fn, 2000);
    return () => { globalListeners.delete(fn); clearInterval(id); };
  }, []);

  return ativo;
}

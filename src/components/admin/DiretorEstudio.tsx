// =============================================================================
// Diretor IA — criação de vídeo Premium/PRO por CHAT (sub-aba própria).
//
// Chat à esquerda (edge diretor-agent) + mesa de cenas à direita (leitura do
// estado real em video_scenes via GET /cenas — as AÇÕES passam pelo chat).
// O débito de créditos NUNCA sai do chat: a proposta vira um cartão com botão
// "Confirmar — X créditos" e o clique dispara o fluxo determinístico da edge.
//
// DESENHO: "A Régua" — a mesma leitura de progresso aparece em 3 escalas:
// trilho de 5 estações (onde estou) → régua segmentada por cena (quanto falta)
// → faixa de 3px na lateral de cada card (esta cena aqui). `corDoBloco` pinta
// as três, então macro e micro são o mesmo objeto visto de longe e de perto.
// Cor é semântica: accent = acontecendo agora · primary = feito/confirmado ·
// --pp-hold = esperando você · destructive = erro.
//
// Permanência: histórico 100% no banco (director_conversations, escrito só pela
// edge); draft/job em localStorage pra reidratar; cenas/montagem são estado
// servidor (video_scenes + job do worker) — navegar fora não perde nada.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfessional } from "@/hooks/useProfessional";
import { supabase } from "@/integrations/supabase/client";
import { videoApiAuthHeaders } from "@/lib/videoApi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import ChatTexto from "@/components/admin/ChatTexto";
import { toast } from "sonner";
import {
  Clapperboard, Loader2, Send, Film, RotateCcw, Scissors, Video, AlertCircle,
  CheckCircle2, Plus, ImagePlus, UserX, UserRound, ChevronDown, Check,
  MessageSquare, FileText, Image as ImageIcon, Play, RefreshCw,
  Lightbulb, TrendingUp, ArrowRight,
} from "lucide-react";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";
const STORAGE = "pp-diretor-estudio";

type PendingAction = { id: string; kind: string; credits: number; resumo: string } | null;

type Msg = {
  role: "user" | "director";
  content: string;
  pending_action?: PendingAction;
  /* marcações locais */
  failed?: boolean;
  pendingUsed?: boolean;
};

type Cena = {
  slide_idx: number;
  status: "vazia" | "gerando_imagem" | "imagem_pronta" | "animando" | "pronta" | "erro" | string;
  image_url: string | null;
  clip_url: string | null;
  clip_duration_s: number | null;
  narracao: string | null;
  error_reason: string | null;
};

const BUSY = ["gerando_imagem", "animando"];

type JobState = { status: "processing" | "done" | "error"; progress?: number; step?: string; video_url?: string; message?: string } | null;

type Modelo = "premium" | "pro";
type AvatarLite = { id: string; name: string; photo_url: string | null };

function loadSaved(): { draftId: string | null; montarJobId: string | null; model: Modelo; characterId: string | null } {
  try {
    const s = localStorage.getItem(STORAGE);
    if (!s) return { draftId: null, montarJobId: null, model: "premium", characterId: null };
    const p = JSON.parse(s);
    return {
      draftId: p.draftId ?? null,
      montarJobId: p.montarJobId ?? null,
      model: p.model === "pro" ? "pro" : "premium",
      characterId: p.characterId ?? null,
    };
  } catch { return { draftId: null, montarJobId: null, model: "premium", characterId: null }; }
}

/** Atalhos do primeiro contato: título + exemplo concreto do que digitar. */
const ATALHOS = [
  { Icon: Lightbulb, t: "Um tema que eu domino", d: "ansiedade, sono, alimentação…", envia: "Quero um vídeo sobre um tema que eu domino" },
  { Icon: UserRound, t: "Com o meu personagem", d: "o mesmo rosto em todas as cenas", envia: "Me ajuda a criar um vídeo com meu personagem" },
  { Icon: TrendingUp, t: "Recriar um vídeo que viralizou", d: "me conta o que você viu", envia: "Quero recriar um estilo de vídeo que viralizou" },
] as const;

/** Os 5 passos do mapa da produção (estado vazio da mesa). */
const MAPA = [
  { n: "01", Icon: MessageSquare, t: "Briefing", d: "Você conta o tema e para quem é.", tag: "agora", tom: "agora" },
  { n: "02", Icon: FileText, t: "Roteiro", d: "Eu escrevo as cenas e você ajusta.", tag: "grátis", tom: "free" },
  { n: "03", Icon: ImageIcon, t: "Imagens", d: "Gero a imagem de cada cena. Refaz à vontade.", tag: "grátis", tom: "free" },
  { n: "04", Icon: Play, t: "Animação", d: "Só as cenas que você aprovar ganham movimento.", tag: "créditos", tom: "hold" },
  { n: "05", Icon: Film, t: "Montagem", d: "Junto tudo com narração e legendas.", tag: "incluso", tom: "free" },
] as const;

/** Campo de mensagem: piso de 1 linha folgada e teto de ~6 linhas (depois rola). */
const CAMPO_MIN = 46;
const CAMPO_MAX = 168;

/** Quadriculado dos palcos vazios e dos slots fantasma — amarra os dois. */
const GRADE_VAZIA =
  "bg-[linear-gradient(hsl(var(--border)/0.4)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.4)_1px,transparent_1px)] bg-[size:10px_10px]";

export default function DiretorEstudio() {
  const { data: professional } = useProfessional();
  const navigate = useNavigate();
  const saved = useRef(loadSaved());

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(saved.current.draftId);
  const [cenas, setCenas] = useState<Cena[]>([]);
  const [montarJobId, setMontarJobId] = useState<string | null>(saved.current.montarJobId);
  const [job, setJob] = useState<JobState>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [model, setModel] = useState<Modelo>(saved.current.model);
  // Preços vivos por cena (fonte única: service_pricing, mesma conta da RPC de débito)
  const [precos, setPrecos] = useState<Record<string, { c5: number; c10: number }>>({});
  const [avatars, setAvatars] = useState<AvatarLite[]>([]);
  const [characterId, setCharacterId] = useState<string | null>(saved.current.characterId);
  const [criandoPersonagem, setCriandoPersonagem] = useState(false);
  const [confirmarNovo, setConfirmarNovo] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cenasPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE, JSON.stringify({ draftId, montarJobId, model, characterId }));
  }, [draftId, montarJobId, model, characterId]);

  // Galeria de personagens (tabela avatars — mesma da sub-aba Personagens)
  const carregarAvatars = useCallback(async () => {
    if (!professional?.id) return;
    // "as any": avatars ainda não está no types.ts gerado (mesma pendência de outras tabelas)
    const { data } = await (supabase.from("avatars" as any) as any)
      .select("id, name, photo_url")
      .eq("professional_id", professional.id)
      .order("created_at", { ascending: false });
    setAvatars((data as AvatarLite[]) || []);
  }, [professional?.id]);
  useEffect(() => { carregarAvatars(); }, [carregarAvatars]);

  useEffect(() => {
    supabase.from("service_pricing")
      .select("service_key, base_cost_brl, markup_pct")
      .in("service_key", ["kling_premium", "kling_pro"])
      .eq("active", true)
      .then(({ data }) => {
        const map: Record<string, { c5: number; c10: number }> = {};
        (data || []).forEach((r: any) => {
          const venda30 = Number(r.base_cost_brl) * (1 + (r.markup_pct ?? 100) / 100);
          map[r.service_key] = { c5: Math.ceil(venda30 * 5 / 30), c10: Math.ceil(venda30 * 10 / 30) };
        });
        setPrecos(map);
      });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, sending]);

  // ── Histórico (banco = fonte de verdade; a edge é quem escreve) ──
  useEffect(() => {
    if (!professional?.id) return;
    let q = supabase.from("director_conversations" as any)
      .select("role, content, pending_action")
      .eq("professional_id", professional.id)
      .order("created_at", { ascending: true })
      .limit(80);
    q = draftId ? q.eq("draft_id", draftId) : q.is("draft_id", null);
    q.then(({ data }: any) => {
      setMsgs((data || []).map((r: any) => ({
        role: r.role, content: r.content, pending_action: r.pending_action ?? null,
      })));
      setHistoryLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professional?.id]);

  // ── Mesa de cenas: carga + polling enquanto houver cena ocupada ──
  const carregarCenas = useCallback(async (id?: string | null) => {
    const alvo = id ?? draftId;
    if (!alvo || !professional?.slug) return;
    try {
      const res = await fetch(
        `${API}/cenas/${alvo}?professional_slug=${encodeURIComponent(professional.slug)}`,
        { headers: await videoApiAuthHeaders() },
      );
      const data = await res.json();
      if (res.ok) setCenas(data.cenas || []);
    } catch { /* transitório */ }
  }, [draftId, professional?.slug]);

  useEffect(() => { carregarCenas(); }, [carregarCenas]);

  useEffect(() => {
    const busy = cenas.some((c) => BUSY.includes(c.status));
    if (!busy || !draftId) {
      if (cenasPollRef.current) { clearInterval(cenasPollRef.current); cenasPollRef.current = null; }
      return;
    }
    if (cenasPollRef.current) return;
    cenasPollRef.current = setInterval(() => carregarCenas(), 4000);
    return () => {
      if (cenasPollRef.current) { clearInterval(cenasPollRef.current); cenasPollRef.current = null; }
    };
  }, [cenas, draftId, carregarCenas]);

  // ── Montagem: polling do job do worker ──
  useEffect(() => {
    if (!montarJobId) {
      if (jobPollRef.current) { clearInterval(jobPollRef.current); jobPollRef.current = null; }
      return;
    }
    const tick = async () => {
      try {
        const res = await fetch(`${API}/status/${montarJobId}`);
        const data = await res.json();
        if (data.status === "done") {
          setJob({ status: "done", video_url: data.video_url });
          setMontarJobId(null);
          toast.success("Vídeo montado! 🎬");
        } else if (data.status === "error") {
          setJob({ status: "error", message: data.message });
          setMontarJobId(null);
        } else {
          setJob({ status: "processing", progress: data.progress, step: data.step });
        }
      } catch { /* transitório */ }
    };
    tick();
    jobPollRef.current = setInterval(tick, 3000);
    return () => {
      if (jobPollRef.current) { clearInterval(jobPollRef.current); jobPollRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montarJobId]);

  // ── Personagem a partir de foto colada/enviada: vira um avatar da galeria
  //    (reusa /criar-avatar + /upload-foto-avatar do worker — sem código novo lá) ──
  const criarPersonagemDaFoto = async (file: File) => {
    if (!professional?.slug || criandoPersonagem) return;
    if (!file.type.startsWith("image/")) { toast.error("Cole ou envie uma imagem."); return; }
    setCriandoPersonagem(true);
    try {
      const resCriar = await fetch(`${API}/criar-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professional.slug,
          name: `Personagem ${avatars.length + 1}`,
        }),
      });
      const criado = await resCriar.json();
      if (!resCriar.ok) throw new Error(criado.detail || "Não consegui criar o personagem");
      const fd = new FormData();
      fd.append("professional_slug", professional.slug);
      fd.append("file", file);
      const resFoto = await fetch(`${API}/upload-foto-avatar/${criado.avatar_id}`, { method: "POST", body: fd });
      const foto = await resFoto.json();
      if (!resFoto.ok) throw new Error(foto.detail || "Não consegui subir a foto");
      await carregarAvatars();
      setCharacterId(criado.avatar_id);
      toast.success("Personagem criado da sua foto e selecionado! Ele também aparece na aba Personagens.");
    } catch (e: any) {
      toast.error(e.message || "Falha ao criar o personagem da foto");
    } finally {
      setCriandoPersonagem(false);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) { e.preventDefault(); criarPersonagemDaFoto(file); }
  };

  // ── Chat ──
  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("diretor-agent", { body });
    if (error) throw error;
    return data as {
      reply: string; draft_id: string | null; scenes_dirty: boolean;
      pending_action: PendingAction; montar_job_id: string | null;
    };
  };

  const aplicarResposta = (data: Awaited<ReturnType<typeof invoke>>) => {
    if (data.draft_id && data.draft_id !== draftId) setDraftId(data.draft_id);
    setMsgs((prev) => [...prev, { role: "director", content: data.reply, pending_action: data.pending_action }]);
    if (data.scenes_dirty) carregarCenas(data.draft_id ?? draftId);
    if (data.montar_job_id) { setJob({ status: "processing" }); setMontarJobId(data.montar_job_id); }
  };

  /** Auto-grow do campo: 1 → 6 linhas, sem lib e sem scrollbar nativa.
   *  O piso (CAMPO_MIN) impede que o cálculo encolha a caixa abaixo da linha
   *  única e corte o texto; acima do teto o próprio campo rola. */
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.max(CAMPO_MIN, Math.min(el.scrollHeight, CAMPO_MAX)) + "px";
  };

  // Altura inicial (e após reidratar o rascunho) sai do mesmo cálculo do digitar.
  useEffect(() => { autoGrow(taRef.current); }, [historyLoaded]);

  const sendMessage = async (texto?: string) => {
    const message = (texto ?? input).trim();
    if (!message || sending) return;
    setInput("");
    requestAnimationFrame(() => autoGrow(taRef.current));
    setSending(true);
    setMsgs((prev) => [...prev, { role: "user", content: message }]);
    try {
      const data = await invoke({ message, draft_id: draftId, model_hint: model, character_hint: characterId });
      aplicarResposta(data);
    } catch {
      // Erro honesto: a edge respondeu != 2xx (LLM fora do ar etc.) — oferecer retry.
      setMsgs((prev) => [...prev, {
        role: "director",
        content: "Tropecei aqui e não consegui responder. Pode mandar de novo?",
        failed: true,
      }]);
    } finally {
      setSending(false);
    }
  };

  const confirmarAcao = async (pendingId: string, msgIdx: number) => {
    if (confirming) return;
    setConfirming(pendingId);
    try {
      const data = await invoke({ confirm_action: { pending_id: pendingId }, draft_id: draftId });
      setMsgs((prev) => prev.map((m, i) => (i === msgIdx ? { ...m, pendingUsed: true } : m)));
      aplicarResposta(data);
    } catch {
      toast.error("Não consegui confirmar agora — tenta de novo em instantes.");
    } finally {
      setConfirming(null);
    }
  };

  const novoVideo = async () => {
    // Conversa que nunca virou rascunho é descartada (RLS permite só essas).
    if (!draftId && professional?.id) {
      await supabase.from("director_conversations" as any)
        .delete().eq("professional_id", professional.id).is("draft_id", null);
    }
    setDraftId(null);
    setMontarJobId(null);
    setJob(null);
    setCenas([]);
    setMsgs([]);
  };

  /** Card de cena → escreve no composer. NUNCA chama API: toda ação passa pelo
   *  Diretor, e o custo nasce do cartão de confirmação. */
  const pedirNoChat = (texto: string) => {
    setInput(texto);
    requestAnimationFrame(() => { taRef.current?.focus(); autoGrow(taRef.current); });
  };

  // ── Derivações de estado (a Régua é 100% calculada, sem estado novo) ──
  const comImagem = cenas.filter((c) => c.image_url).length;
  const prontas = cenas.filter((c) => c.status === "pronta").length;
  const ocupada = cenas.some((c) => BUSY.includes(c.status));
  const pendenteAberta = msgs.some((m) => m.pending_action && !m.pendingUsed);
  const precoAtual = precos[model === "pro" ? "kling_pro" : "kling_premium"];
  const sel = avatars.find((a) => a.id === characterId) ?? null;

  /* Estação ALCANÇADA — monotônica de propósito: o playhead mostra o mais longe
     que a produção chegou. Sem isso ele anda pra trás quando uma imagem é
     regenerada depois de já ter cena animada. */
  const etapaIdx =
    (job || montarJobId) ? 4
      : (prontas > 0 || cenas.some((c) => c.status === "animando")) ? 3
      : cenas.length > 0 ? 2
      : msgs.some((m) => m.role === "user") ? 1
      : 0;

  const ETAPAS = [
    { key: "briefing", Icon: MessageSquare, label: "Briefing", detalhe: etapaIdx > 0 ? "feito" : "comece aqui" },
    { key: "roteiro", Icon: FileText, label: "Roteiro", detalhe: cenas.length ? `${cenas.length} cenas` : "escrevendo" },
    { key: "imagens", Icon: ImageIcon, label: "Imagens", detalhe: cenas.length ? `${comImagem}/${cenas.length}` : "—" },
    { key: "animacao", Icon: Play, label: "Animação", detalhe: cenas.length ? `${prontas}/${cenas.length}` : "—" },
    { key: "montagem", Icon: Film, label: "Montagem", detalhe: job?.status === "done" ? "pronto" : job?.progress != null ? `${job.progress}%` : "—" },
  ] as const;

  /** Única fonte de cor de estado: pinta a régua segmentada E a faixa do card. */
  const corDoBloco = (c: Cena) =>
    c.status === "pronta" ? "bg-primary"
      : c.status === "erro" ? "bg-destructive"
      : BUSY.includes(c.status) ? "bg-accent/30 pp-dir-run"
      : c.image_url ? "bg-primary/35"
      : "bg-border";

  const rotuloEstado = (c: Cena) =>
    c.status === "pronta" ? "animada"
      : c.status === "erro" ? "falhou"
      : c.status === "animando" ? "animando"
      : c.status === "gerando_imagem" ? "criando imagem"
      : c.image_url ? "imagem pronta"
      : "sem imagem";

  const statusBadge = (c: Cena) => {
    switch (c.status) {
      case "gerando_imagem":
        return <Badge variant="secondary" className="h-5 gap-1 border-accent/30 bg-accent/10 text-[10px] text-accent"><Loader2 className="h-2.5 w-2.5 animate-spin" />Criando imagem…</Badge>;
      case "imagem_pronta":
        return <Badge variant="secondary" className="h-5 text-[10px]">Imagem pronta</Badge>;
      case "animando":
        return <Badge variant="secondary" className="h-5 gap-1 border-accent/30 bg-accent/10 text-[10px] text-accent"><Loader2 className="h-2.5 w-2.5 animate-spin" />Animando…</Badge>;
      case "pronta":
        return <Badge className="h-5 gap-1 bg-primary text-[10px] text-primary-foreground hover:bg-primary"><Check className="h-2.5 w-2.5" />Animada</Badge>;
      case "erro":
        return <Badge variant="destructive" className="h-5 text-[10px]">Falhou · crédito estornado</Badge>;
      default:
        return <Badge variant="outline" className="h-5 text-[10px] font-normal">Sem imagem</Badge>;
    }
  };

  return (
    <div className="space-y-3">
      {/* ── A. Cabeçalho ── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
            <Clapperboard className="h-4 w-4 text-accent" aria-hidden /> Diretor IA
          </h2>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] tabular-nums text-muted-foreground">
            Vídeo 9:16 · {model === "pro" ? "PRO" : "Premium"}
            {cenas.length > 0 && <> · {cenas.length} cenas</>}
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => setConfirmarNovo(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Novo vídeo
        </Button>
      </div>

      {/* ── B. A Régua: 5 estações + cinta de custo + régua por cena ── */}
      <Card className="rounded-lg px-3 py-2.5 sm:px-4">
        <ol
          role="list"
          className="flex items-start overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                     [mask-image:linear-gradient(to_right,transparent,#000_18px,#000_calc(100%-18px),transparent)]
                     lg:overflow-visible lg:[mask-image:none]"
        >
          {ETAPAS.map((et, i) => {
            const st = i < etapaIdx ? "feito" : i === etapaIdx ? "ativa" : "futura";
            const espera = i === 3 && pendenteAberta;
            return (
              <li
                key={et.key}
                aria-current={st === "ativa" ? "step" : undefined}
                className="relative flex min-w-[92px] flex-1 flex-col items-center gap-1.5"
              >
                {i > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-[-50%] top-[13px] h-[3px] w-full rounded-full",
                      st === "futura" ? "border-t-2 border-dashed border-border"
                        : st === "ativa" && ocupada ? "bg-accent/25 pp-dir-run"
                        : st === "ativa" ? "bg-accent/45"
                        : "bg-primary",
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 grid h-7 w-7 place-items-center rounded-full border-2 text-[10px] font-bold tabular-nums",
                    st === "feito" && "border-primary bg-primary text-primary-foreground",
                    st === "ativa" && "border-accent bg-background text-accent",
                    st === "futura" && "border-border bg-background text-muted-foreground",
                    espera && "ring-2 ring-[hsl(var(--pp-hold)/0.45)] ring-offset-2 ring-offset-card",
                  )}
                >
                  {st === "feito" ? <Check className="h-3.5 w-3.5" /> : <et.Icon className="h-3.5 w-3.5" />}
                </span>
                {st === "ativa" && (
                  <span
                    aria-hidden
                    className="absolute -top-1.5 z-10 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-accent"
                  />
                )}
                <span className={cn("text-[11px] font-semibold leading-none", st === "futura" ? "text-muted-foreground" : "text-foreground")}>
                  {et.label}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">{et.detalhe}</span>
              </li>
            );
          })}
        </ol>

        {/* cinta de custo: responde "quando isso me cobra" antes de qualquer clique */}
        <div className="mt-2 flex gap-1 text-[9.5px] font-semibold uppercase tracking-[0.1em]">
          <span className="flex-[3] rounded-sm bg-primary/10 py-[3px] text-center text-primary">
            Grátis · refaz à vontade
          </span>
          <span className="flex-[2] rounded-sm bg-[hsl(var(--pp-hold)/0.14)] py-[3px] text-center text-[hsl(var(--pp-hold))]">
            Créditos · só depois que você confirmar
          </span>
        </div>

        {cenas.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cenas</span>
            <div
              role="img"
              aria-live="polite"
              aria-label={`${prontas} de ${cenas.length} cenas animadas, ${comImagem} com imagem`}
              className="flex h-1.5 flex-1 gap-px overflow-hidden rounded-full"
            >
              {cenas.map((c) => (
                <span key={c.slide_idx} className={cn("h-full flex-1", corDoBloco(c))} />
              ))}
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{prontas}/{cenas.length}</span>
          </div>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(360px,400px)_1fr] lg:items-start">
        {/* ── C. Cabine (chat) ── */}
        <Card className="flex h-[68vh] min-h-[460px] flex-col overflow-hidden rounded-xl lg:h-[calc(100vh-15rem)] lg:min-h-[580px] lg:max-h-[880px]">
          {/* Papel de parede da conversa: duas luzes suaves nos cantos opostos
              (verde da marca em cima, âmbar embaixo) sobre a base do tema. Como
              usa os tokens, o mesmo gradiente serve ao claro e ao escuro — e
              fica atrás dos balões sem disputar leitura com eles. */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto bg-muted/25 p-3
                       bg-[radial-gradient(120%_75%_at_0%_0%,hsl(var(--primary)/0.10),transparent_62%),radial-gradient(105%_70%_at_100%_100%,hsl(var(--accent)/0.09),transparent_66%)]"
          >
            {historyLoaded && msgs.length === 0 && (
              <div className="space-y-4 pt-6">
                <div className="text-center">
                  <Clapperboard className="mx-auto h-7 w-7 text-accent" aria-hidden />
                  <p className="mt-2 text-[13px] font-semibold">Sou o Diretor. Vamos fazer seu vídeo?</p>
                  <p className="mx-auto mt-1 max-w-[290px] text-[11px] leading-snug text-muted-foreground">
                    Me conta o tema e para quem é. Eu escrevo o roteiro com você, gero as imagens
                    de graça e só animo depois que você aprovar o custo.
                  </p>
                </div>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Por onde começar</p>
                <div className="grid gap-1.5">
                  {ATALHOS.map((s) => (
                    <button
                      key={s.t}
                      type="button"
                      onClick={() => sendMessage(s.envia)}
                      className="group flex items-center gap-2.5 rounded-md border border-border/70 bg-card px-2.5 py-2 text-left shadow-sm
                                 transition-colors hover:border-accent/50 hover:bg-accent/[0.06]
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                                 focus-visible:ring-offset-card motion-reduce:transition-none"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
                        <s.Icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium leading-tight">{s.t}</span>
                        <span className="block truncate text-[10.5px] text-muted-foreground">{s.d}</span>
                      </span>
                      <ArrowRight
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-all
                                   group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transition-none"
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    // Balão OPACO sobre o papel de parede: translúcido deixaria o
                    // gradiente atravessar o texto. A sombra é o que faz o balão
                    // pousar sobre o fundo, como num mensageiro.
                    "max-w-[92%] break-words rounded-xl px-3 py-2 font-chat text-[13.5px] leading-[1.55] shadow-sm",
                    m.role === "user"
                      ? "rounded-tr-md bg-primary text-primary-foreground shadow-primary/20"
                      : m.failed
                        ? "rounded-tl-md border border-destructive/30 bg-destructive/10"
                        : "rounded-tl-md border border-border/60 bg-card",
                  )}
                >
                  <ChatTexto texto={m.content} />

                  {m.failed && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 h-8 w-full text-[11px]"
                      onClick={() => {
                        const lastUser = [...msgs].reverse().find((x) => x.role === "user");
                        if (lastUser) sendMessage(lastUser.content);
                      }}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" /> Tentar de novo
                    </Button>
                  )}

                  {m.pending_action && (
                    <div
                      className={cn(
                        "mt-2 space-y-2 rounded-lg border p-2.5 transition-opacity motion-reduce:transition-none",
                        m.pendingUsed
                          ? "border-border bg-muted/40 opacity-70"
                          : "border-[hsl(var(--pp-hold)/0.45)] bg-[hsl(var(--pp-hold)/0.10)] shadow-[0_2px_10px_-6px_hsl(var(--pp-hold)/0.5)]",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <Clapperboard className="h-3.5 w-3.5 text-[hsl(var(--pp-hold))]" aria-hidden />
                        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--pp-hold))]">
                          Precisa da sua confirmação
                        </span>
                      </div>

                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-[12px] font-medium leading-snug text-foreground">{m.pending_action.resumo}</p>
                        <p className="shrink-0 text-right">
                          <span className="block text-[22px] font-bold leading-none tabular-nums text-[hsl(var(--pp-hold))]">
                            {m.pending_action.credits}
                          </span>
                          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                            {m.pending_action.credits === 1 ? "crédito" : "créditos"}
                          </span>
                        </p>
                      </div>

                      {m.pendingUsed ? (
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Confirmado — acompanhe na mesa de cenas
                        </p>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 w-full text-[12px]"
                          disabled={confirming === m.pending_action.id}
                          onClick={() => confirmarAcao(m.pending_action!.id, i)}
                        >
                          {confirming === m.pending_action.id
                            ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            : <Film className="mr-1 h-3.5 w-3.5" />}
                          Confirmar — {m.pending_action.credits} crédito{m.pending_action.credits === 1 ? "" : "s"}
                        </Button>
                      )}

                      <p className="text-[9.5px] leading-snug text-muted-foreground">
                        Expira em 10 minutos. Cena que falhar é estornada automaticamente.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl rounded-tl-md border border-border/60 bg-muted/70 px-3 py-2" aria-live="polite">
                  <span className="sr-only">O Diretor está escrevendo</span>
                  <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
                </div>
              </div>
            )}
          </div>

          {/* ── D. Composer: uma caixa só (campo + instrumentos) ── */}
          <div className="border-t border-border/70 bg-card p-2.5">
            <div
              className="group/cmp overflow-hidden rounded-xl border border-border/80 bg-background transition-[border-color,box-shadow] duration-150
                         focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 motion-reduce:transition-none"
            >
              {/* fita da claquete: apagada em repouso, acesa no foco */}
              <div
                aria-hidden
                className="h-1.5 text-border transition-colors duration-200 group-focus-within/cmp:text-accent motion-reduce:transition-none
                           bg-[repeating-linear-gradient(115deg,currentColor_0_9px,transparent_9px_18px)]"
              />

              <Textarea
                ref={taRef}
                rows={1}
                value={input}
                onChange={(e) => { setInput(e.target.value); autoGrow(e.currentTarget); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                onPaste={onPaste}
                placeholder="Fale com o Diretor…"
                aria-label="Mensagem para o Diretor"
                style={{ height: CAMPO_MIN, maxHeight: CAMPO_MAX }}
                className="block min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent
                           px-3 py-3 text-[13.5px] leading-[1.5] shadow-none ring-offset-0
                           placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0
                           [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              />

              <div className="flex items-center gap-1.5 px-2 pb-2">
                {/* Personagem — grade em popover (sem fileira rolável) */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-8 max-w-[150px] shrink-0 items-center gap-1.5 rounded-full border border-border/70 py-0 pl-1 pr-2
                                 text-[11px] font-medium transition-colors hover:bg-muted/60 data-[state=open]:bg-muted/60
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                                 focus-visible:ring-offset-background motion-reduce:transition-none"
                    >
                      {sel?.photo_url
                        ? <img src={sel.photo_url} alt="" className="h-6 w-6 rounded-full object-cover ring-2 ring-primary/60" />
                        : <span className="grid h-6 w-6 place-items-center rounded-full bg-muted">
                            <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                          </span>}
                      <span className="hidden truncate min-[380px]:inline">{sel?.name ?? "Sem personagem"}</span>
                      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="w-64 rounded-lg p-2">
                    <p className="px-1 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Personagem do vídeo
                    </p>
                    <div className="grid max-h-[188px] grid-cols-4 gap-1.5 overflow-y-auto">
                      {avatars.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setCharacterId(a.id)}
                          title={a.name}
                          aria-pressed={characterId === a.id}
                          className={cn(
                            "relative aspect-square overflow-hidden rounded-md border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                            characterId === a.id ? "border-primary ring-2 ring-primary/25" : "border-transparent hover:border-primary/40",
                          )}
                        >
                          {a.photo_url
                            ? <img src={a.photo_url} alt={a.name} className="h-full w-full object-cover" />
                            : <span className="grid h-full w-full place-items-center bg-muted text-[11px] font-semibold">
                                {a.name.slice(0, 2).toUpperCase()}
                              </span>}
                          {characterId === a.id && (
                            <span aria-hidden className="absolute bottom-0 right-0 grid h-4 w-4 place-items-center rounded-tl-md bg-primary">
                              <Check className="h-2.5 w-2.5 text-primary-foreground" />
                            </span>
                          )}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={criandoPersonagem}
                        aria-label="Enviar foto para criar um personagem"
                        className="grid aspect-square place-items-center rounded-md border-2 border-dashed border-border text-muted-foreground
                                   transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2
                                   focus-visible:ring-ring motion-reduce:transition-none"
                      >
                        {criandoPersonagem ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCharacterId(null)}
                      className={cn(
                        "mt-2 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] transition motion-reduce:transition-none",
                        characterId === null ? "border-primary bg-primary/5 font-medium" : "border-border/70 hover:bg-muted/60",
                      )}
                    >
                      <UserX className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Sem personagem fixo
                    </button>
                    <p className="mt-1.5 px-1 text-[10px] leading-snug text-muted-foreground">
                      Toda foto enviada aqui vira um personagem e também aparece na aba <b>Personagens</b>.
                    </p>
                  </PopoverContent>
                </Popover>

                {/* Modelo — o valor é o rótulo; preço impresso no chip */}
                <Select value={model} onValueChange={(v) => setModel(v === "pro" ? "pro" : "premium")}>
                  <SelectTrigger
                    aria-label="Qualidade da animação"
                    className="h-8 w-auto shrink-0 gap-1.5 rounded-full border-border/70 bg-background px-2.5 py-0 text-[11px] font-medium
                               focus:ring-2 focus:ring-ring focus:ring-offset-2 [&>span]:line-clamp-none [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-60"
                  >
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <span aria-hidden>{model === "pro" ? "👑" : "⭐"}</span>
                      <span className="hidden min-[380px]:inline">{model === "pro" ? "PRO" : "Premium"}</span>
                      {precoAtual && <span className="tabular-nums text-muted-foreground">{precoAtual.c5} cr/5s</span>}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="w-[300px]">
                    <SelectItem value="premium" className="py-2">
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[12px] font-medium">⭐ Premium — Kling 1.6</span>
                        <span className="text-[10.5px] tabular-nums text-muted-foreground">
                          {precos.kling_premium
                            ? `${precos.kling_premium.c5} créditos por 5s · ${precos.kling_premium.c10} por 10s`
                            : "carregando o preço…"}
                        </span>
                      </span>
                    </SelectItem>
                    <SelectItem value="pro" className="py-2">
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[12px] font-medium">👑 PRO — Kling 3.0</span>
                        <span className="text-[10.5px] tabular-nums text-muted-foreground">
                          {precos.kling_pro
                            ? `${precos.kling_pro.c5} créditos por 5s · ${precos.kling_pro.c10} por 10s`
                            : "carregando o preço…"}
                        </span>
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>

                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={criandoPersonagem}
                        aria-label="Enviar foto para criar um personagem"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                      >
                        {criandoPersonagem ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Envie uma foto — ela vira um personagem</TooltipContent>
                  </Tooltip>

                  <Button
                    size="icon"
                    aria-label="Enviar"
                    disabled={!input.trim() || sending}
                    onClick={() => sendMessage()}
                    className="h-9 w-9 rounded-full shadow-none transition-transform active:scale-95 motion-reduce:transition-none"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {!input && msgs.length === 0 && (
              <p className="mt-1.5 px-1 text-[10.5px] leading-snug text-muted-foreground">
                <kbd className="rounded border border-border/70 bg-muted/60 px-1 font-sans text-[9.5px]">Enter</kbd> envia ·{" "}
                <kbd className="rounded border border-border/70 bg-muted/60 px-1 font-sans text-[9.5px]">Shift+Enter</kbd> quebra linha ·
                cole uma foto (Ctrl+V) para criar seu personagem
              </p>
            )}
          </div>
        </Card>

        {/* ── E. Mesa de cenas ── */}
        <div className="space-y-3">
          {job && (
            <Card
              className={cn(
                "rounded-xl p-3",
                job.status === "error" ? "border-destructive/40" : job.status === "done" ? "border-primary/40" : "border-accent/40",
              )}
              aria-live="polite"
            >
              {job.status === "processing" && (
                <>
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
                    <span className="text-[12.5px] font-medium">Montando o vídeo final</span>
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{job.progress ?? 0}%</span>
                  </div>
                  <Progress value={job.progress ?? 0} className="mt-2 h-1.5" />
                  <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
                    {job.step ? <span className="uppercase tracking-[0.1em]">{job.step}</span> : "preparando"} ·
                    {" "}Pode sair desta tela — a gente avisa quando ficar pronto.
                  </p>
                </>
              )}

              {job.status === "error" && (
                <p className="flex items-start gap-2 text-[12.5px] text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {job.message || "A montagem falhou. Suas cenas continuam salvas — peça ao Diretor para montar de novo."}
                </p>
              )}

              {job.status === "done" && job.video_url && (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-[12.5px] font-medium">
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> Vídeo pronto
                  </p>
                  <div className="mx-auto max-w-[240px] rounded-xl border border-border/70 bg-muted/40 p-2">
                    <video src={job.video_url} controls playsInline className="w-full rounded-md" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={() => navigate(`/admin/redes-sociais?tab=videos&sub=editor&loadurl=${encodeURIComponent(job.video_url!)}`)}
                    >
                      <Scissors className="mr-1 h-3.5 w-3.5" /> Abrir no Editor
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" onClick={() => navigate("/admin/redes-sociais?tab=videos&sub=meus-videos")}>
                      <Video className="mr-1 h-3.5 w-3.5" /> Meus Vídeos
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {cenas.length === 0 ? (
            /* Estado vazio: o mapa da produção responde "o que vai acontecer,
               quanto custa e quando me cobra" — e os slots mostram a forma exata
               do que vem (mesma geometria da grade real: sem salto de layout). */
            <div className="space-y-3">
              <Card className="rounded-lg p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Clapperboard className="h-4 w-4 text-accent" aria-hidden />
                  <h3 className="text-[13px] font-semibold">Como o vídeo nasce</h3>
                  <Badge variant="outline" className="ml-auto text-[10px] font-normal">leva ~15 a 30 min</Badge>
                </div>

                <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {MAPA.map((e) => (
                    <li
                      key={e.n}
                      className={cn("rounded-lg border p-2.5", e.tom === "agora" ? "border-accent/50 bg-accent/[0.06]" : "border-border/70 bg-background")}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <span
                          className={cn(
                            "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9.5px] font-bold tabular-nums",
                            e.tom === "agora" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {e.n}
                        </span>
                        <e.Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        <span className="text-[12px] font-semibold">{e.t}</span>
                      </div>
                      <p className="text-[11px] leading-snug text-muted-foreground">{e.d}</p>
                      <span
                        className={cn(
                          "mt-1.5 inline-block rounded-sm px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-[0.1em]",
                          e.tom === "hold" ? "bg-[hsl(var(--pp-hold)/0.14)] text-[hsl(var(--pp-hold))]"
                            : e.tom === "agora" ? "bg-accent/15 text-accent"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        {e.tag}
                      </span>
                    </li>
                  ))}
                </ol>

                <p className="mt-3 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
                  <b className="text-foreground">Nada é cobrado sem você clicar.</b> Quando chegar a hora de animar,
                  aparece um cartão no chat com o custo exato e um botão <b>Confirmar</b>. Cena que falhar é estornada.
                </p>

                <Button size="sm" className="mt-3 h-9" onClick={() => taRef.current?.focus()}>
                  <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Começar pelo tema
                </Button>
              </Card>

              <div>
                <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Suas cenas aparecem aqui
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      aria-hidden
                      style={{ opacity: 1 - i * 0.15 }}
                      className={cn("relative aspect-[9/16] rounded-lg border-2 border-dashed border-border/70", GRADE_VAZIA)}
                    >
                      <span className="absolute left-1.5 top-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] tabular-nums text-muted-foreground/60">
                        SCN {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mesa de cenas</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {comImagem} com imagem · {prontas} animadas
                </span>
              </div>

              <ol role="list" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {cenas.map((c) => {
                  const busy = BUSY.includes(c.status);
                  return (
                    <li key={c.slide_idx}>
                      <article
                        role="group"
                        aria-label={`Cena ${c.slide_idx + 1} — ${rotuloEstado(c)}`}
                        className={cn(
                          "group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors motion-reduce:transition-none",
                          c.status === "erro" ? "border-destructive/40" : "border-border/70 hover:border-primary/40",
                        )}
                      >
                        <span aria-hidden className={cn("absolute inset-y-0 left-0 z-20 w-[3px]", corDoBloco(c))} />

                        <div className={cn("relative aspect-[9/16] bg-muted", !c.image_url && !c.clip_url && GRADE_VAZIA)}>
                          {c.status === "pronta" && c.clip_url ? (
                            <video
                              src={c.clip_url}
                              poster={c.image_url || undefined}
                              controls
                              muted
                              loop
                              playsInline
                              className="h-full w-full object-cover"
                            />
                          ) : c.image_url ? (
                            <img
                              src={c.image_url}
                              alt=""
                              className={cn(
                                "h-full w-full object-cover",
                                c.status === "animando" && "saturate-[.55] brightness-95",
                                c.status === "erro" && "saturate-0",
                              )}
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                              {c.status === "gerando_imagem"
                                ? <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden />
                                : <ImageIcon className="h-5 w-5 text-muted-foreground/45" aria-hidden />}
                              <span className="text-[10px] text-muted-foreground">
                                {c.status === "gerando_imagem" ? "criando imagem" : "aguardando imagem"}
                              </span>
                            </div>
                          )}

                          {c.status === "gerando_imagem" && c.image_url && <Skeleton className="absolute inset-0" />}

                          {c.status === "animando" && (
                            <>
                              <span aria-hidden className="absolute inset-0 bg-background/40" />
                              <span className="absolute inset-x-0 bottom-0 z-10 p-2 text-center">
                                <span className="block text-[10.5px] font-semibold text-foreground">Animando</span>
                                <span className="block text-[9.5px] text-muted-foreground">leva 2 a 4 minutos · pode sair da tela</span>
                              </span>
                            </>
                          )}

                          {c.status === "erro" && (
                            <span aria-hidden className="absolute inset-0 grid place-items-center bg-destructive/10">
                              <AlertCircle className="h-5 w-5 text-destructive" />
                            </span>
                          )}

                          {busy && <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-[2px] bg-accent/25 pp-dir-run" />}

                          <span className="absolute left-2 top-2 z-10 rounded-sm bg-background/85 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.18em] tabular-nums backdrop-blur-[2px]">
                            SCN {String(c.slide_idx + 1).padStart(2, "0")}
                          </span>
                          {c.clip_duration_s && (
                            <span className="absolute right-2 top-2 z-10 rounded-sm bg-background/85 px-1.5 py-px text-[9.5px] font-semibold tabular-nums backdrop-blur-[2px]">
                              {c.clip_duration_s}s
                            </span>
                          )}

                          {/* Ações: só ESCREVEM no composer — nenhuma chama API,
                              então não existe risco de débito por clique acidental. */}
                          {!busy && (
                            <div
                              className="absolute inset-0 z-10 flex items-end justify-center gap-1.5 bg-gradient-to-t from-background/85 via-background/20 to-transparent p-2
                                         opacity-100 transition-opacity motion-reduce:transition-none
                                         lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
                            >
                              {c.status === "erro" ? (
                                <Button
                                  size="sm"
                                  className="h-8 rounded-full px-2.5 text-[10.5px]"
                                  onClick={() => pedirNoChat(`A cena ${c.slide_idx + 1} falhou. Tenta de novo, por favor.`)}
                                >
                                  <RotateCcw className="mr-1 h-3 w-3" /> Tentar de novo
                                </Button>
                              ) : !c.image_url ? (
                                <Button
                                  size="sm"
                                  className="h-8 rounded-full px-2.5 text-[10.5px]"
                                  onClick={() => pedirNoChat(`Gera a imagem da cena ${c.slide_idx + 1}.`)}
                                >
                                  <ImageIcon className="mr-1 h-3 w-3" /> Gerar no chat
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-8 rounded-full px-2.5 text-[10.5px]"
                                    onClick={() => pedirNoChat(`Refaz a imagem da cena ${c.slide_idx + 1}: `)}
                                  >
                                    <RefreshCw className="mr-1 h-3 w-3" /> Refazer no chat
                                  </Button>
                                  {c.status !== "pronta" && (
                                    <Button
                                      size="sm"
                                      className="h-8 rounded-full px-2.5 text-[10.5px]"
                                      onClick={() => pedirNoChat(`Anima a cena ${c.slide_idx + 1} com 5 segundos.`)}
                                    >
                                      <Play className="mr-1 h-3 w-3" /> Animar no chat
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1 p-2">
                          {statusBadge(c)}
                          {c.narracao && <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{c.narracao}</p>}
                          {c.error_reason && (
                            <p className="line-clamp-3 text-[11px] leading-snug text-destructive">
                              {c.error_reason} <span className="text-muted-foreground">— peça ao Diretor para refazer esta cena.</span>
                            </p>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ol>

              <p className="text-[11px] leading-snug text-muted-foreground">
                As ações saem daqui do chat. Passe o mouse numa cena para pedir um ajuste ao Diretor.
              </p>
            </>
          )}
        </div>
      </div>

      {/* input de arquivo FORA do Popover: o Radix desmonta o conteúdo ao fechar
          e o ref viraria null, quebrando o botão de foto em silêncio. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) criarPersonagemDaFoto(f);
          e.target.value = "";
        }}
      />

      <AlertDialog open={confirmarNovo} onOpenChange={setConfirmarNovo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Começar um vídeo novo?</AlertDialogTitle>
            <AlertDialogDescription>
              A conversa atual fica guardada no rascunho dela. As cenas e o vídeo já montado
              continuam em Meus Vídeos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar este</AlertDialogCancel>
            <AlertDialogAction onClick={novoVideo}>Começar novo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// Diretor IA — criação de vídeo Premium/PRO por CHAT (sub-aba própria).
//
// Chat à esquerda (edge diretor-agent) + mesa de cenas à direita (leitura do
// estado real em video_scenes via GET /cenas — as AÇÕES passam pelo chat).
// O débito de créditos NUNCA sai do chat: a proposta vira um cartão com botão
// "Confirmar — X créditos" e o clique dispara o fluxo determinístico da edge.
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Clapperboard, Loader2, Send, Sparkles, Film, RotateCcw,
  Scissors, Video, AlertCircle, CheckCircle2, Plus, ImagePlus, UserX,
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

const SUGESTOES = [
  "Quero um vídeo sobre um tema que domino",
  "Me ajuda a criar um vídeo com meu personagem",
  "Quero recriar um estilo de vídeo que viralizou",
];

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
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

  const sendMessage = async (texto?: string) => {
    const message = (texto ?? input).trim();
    if (!message || sending) return;
    setInput("");
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
    if (!confirm("Começar um vídeo novo? A conversa atual fica guardada no rascunho dela.")) return;
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

  const statusBadge = (c: Cena) => {
    switch (c.status) {
      case "gerando_imagem": return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Criando…</Badge>;
      case "imagem_pronta":  return <Badge variant="secondary">Imagem pronta</Badge>;
      case "animando":       return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Animando…</Badge>;
      case "pronta":         return <Badge className="bg-green-600 text-white hover:bg-green-600">Animada ✓</Badge>;
      case "erro":           return <Badge variant="destructive">Erro</Badge>;
      default:               return <Badge variant="outline">Sem imagem</Badge>;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-orange-500" /> Diretor IA
            <Badge variant="outline" className="text-xs border-purple-400 text-purple-600">Premium · PRO</Badge>
          </h2>
          <p className="text-xs text-muted-foreground">
            Crie o vídeo conversando: roteiro, imagens grátis cena a cena e animação com custo confirmado antes de debitar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={novoVideo}>
          <Plus className="h-4 w-4 mr-1" /> Novo vídeo
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(320px,420px)_1fr] items-start">
        {/* ── CHAT ── */}
        <Card className="flex flex-col h-[70vh] min-h-[480px]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {historyLoaded && msgs.length === 0 && (
              <div className="text-center space-y-3 pt-8">
                <Sparkles className="h-8 w-8 mx-auto text-orange-500" />
                <p className="text-sm font-medium">Sou o Diretor — vamos criar seu vídeo?</p>
                <p className="text-xs text-muted-foreground px-4">
                  Me conta o tema e pra quem é. Eu escrevo o roteiro com você, gero as imagens
                  de graça e só animo depois que você aprovar o custo.
                </p>
                <div className="flex flex-col gap-1.5 px-4">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-xs px-3 py-1.5 rounded-full border border-orange-500/30 bg-orange-500/5 text-foreground hover:bg-orange-500/15 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === "user"
                    ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-tr-md"
                    : m.failed
                      ? "bg-destructive/10 border border-destructive/30 rounded-tl-md"
                      : "bg-muted rounded-tl-md"
                }`}>
                  {m.content}
                  {m.failed && (
                    <Button
                      variant="outline" size="sm" className="mt-2 h-7 text-xs w-full"
                      onClick={() => {
                        const lastUser = [...msgs].reverse().find((x) => x.role === "user");
                        if (lastUser) sendMessage(lastUser.content);
                      }}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Tentar de novo
                    </Button>
                  )}
                  {m.pending_action && (
                    <div className="mt-2 rounded-lg border border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/30 p-2 space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1 text-foreground">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> {m.pending_action.resumo}
                      </p>
                      {m.pendingUsed ? (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Confirmado
                        </p>
                      ) : (
                        <Button
                          size="sm" className="h-7 text-xs w-full"
                          disabled={confirming === m.pending_action.id}
                          onClick={() => confirmarAcao(m.pending_action!.id, i)}
                        >
                          {confirming === m.pending_action.id
                            ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            : <Film className="h-3 w-3 mr-1" />}
                          Confirmar — {m.pending_action.credits} crédito{m.pending_action.credits === 1 ? "" : "s"}
                        </Button>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        A proposta expira em 10 min. Cena que falhar é estornada automaticamente.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-tl-md px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
          <div className="border-t p-2 flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}
              onPaste={onPaste}
              placeholder="Fale com o Diretor… (cole uma foto para criar seu personagem)"
              className="min-h-[40px] max-h-28 resize-none text-sm"
              rows={1}
            />
            <Button size="sm" className="h-10" disabled={!input.trim() || sending} onClick={() => sendMessage()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {/* Modelo de geração — o Diretor recebe a escolha junto com cada mensagem */}
          <div className="border-t px-2 py-1.5 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground shrink-0">Modelo:</span>
            <Select value={model} onValueChange={(v) => setModel(v === "pro" ? "pro" : "premium")}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="premium" className="text-xs">
                  ⭐ Premium — Kling 1.6{precos.kling_premium ? ` · cena 5s = ${precos.kling_premium.c5} cr / 10s = ${precos.kling_premium.c10} cr` : ""}
                </SelectItem>
                <SelectItem value="pro" className="text-xs">
                  👑 PRO — Kling 3.0{precos.kling_pro ? ` · cena 5s = ${precos.kling_pro.c5} cr / 10s = ${precos.kling_pro.c10} cr` : ""}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Personagem: galeria + colar/enviar foto (a foto vira um avatar novo) */}
          <div className="border-t px-2 py-1.5 flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] text-muted-foreground shrink-0">Personagem:</span>
            <button
              type="button"
              onClick={() => setCharacterId(null)}
              title="Sem personagem"
              className={`shrink-0 h-8 w-8 rounded-full border-2 flex items-center justify-center transition ${
                characterId === null ? "border-purple-500 bg-purple-500/10" : "border-border hover:border-purple-400/50"
              }`}
            >
              <UserX className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {avatars.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setCharacterId(a.id)}
                title={a.name}
                className={`shrink-0 h-8 w-8 rounded-full border-2 overflow-hidden transition ${
                  characterId === a.id ? "border-purple-500 ring-2 ring-purple-500/30" : "border-border hover:border-purple-400/50"
                }`}
              >
                {a.photo_url
                  ? <img src={a.photo_url} alt={a.name} className="w-full h-full object-cover" />
                  : <span className="text-[10px] font-medium">{a.name.slice(0, 2).toUpperCase()}</span>}
              </button>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={criandoPersonagem}
              title="Colar (Ctrl+V no chat) ou enviar uma foto — vira um personagem novo"
              className="shrink-0 h-8 w-8 rounded-full border-2 border-dashed border-border hover:border-purple-400/60 flex items-center justify-center"
            >
              {criandoPersonagem
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                : <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
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
          </div>
        </Card>

        {/* ── MESA DE CENAS + MONTAGEM ── */}
        <div className="space-y-3">
          {job && (
            <Card className="p-3 space-y-2">
              {job.status === "processing" && (
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                  <span>Montando o vídeo final… {job.step ? `(${job.step})` : ""} {job.progress ? `${job.progress}%` : ""}</span>
                </div>
              )}
              {job.status === "error" && (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> {job.message || "A montagem falhou — suas cenas continuam salvas; peça ao Diretor para montar de novo."}
                </p>
              )}
              {job.status === "done" && job.video_url && (
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" /> Vídeo pronto!
                  </p>
                  <video src={job.video_url} controls playsInline className="w-full max-w-[280px] rounded-lg border mx-auto" />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => navigate(`/admin/redes-sociais?tab=videos&sub=editor&loadurl=${encodeURIComponent(job.video_url!)}`)}
                    >
                      <Scissors className="h-3.5 w-3.5 mr-1" /> Abrir no Editor
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/admin/redes-sociais?tab=videos&sub=meus-videos")}>
                      <Video className="h-3.5 w-3.5 mr-1" /> Meus Vídeos
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {cenas.length === 0 ? (
            <Card className="p-8 text-center space-y-2 border-dashed">
              <Film className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                A mesa de cenas aparece aqui conforme o Diretor cria o roteiro com você.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {cenas.map((c) => (
                <Card key={c.slide_idx} className="overflow-hidden">
                  <div className="aspect-[9/16] bg-muted relative">
                    {c.clip_url ? (
                      <video src={c.clip_url} poster={c.image_url || undefined} controls muted playsInline className="w-full h-full object-cover" />
                    ) : c.image_url ? (
                      <img src={c.image_url} alt={`Cena ${c.slide_idx + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {BUSY.includes(c.status)
                          ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
                          : <Film className="h-6 w-6 text-muted-foreground/40" />}
                      </div>
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium">Cena {c.slide_idx + 1}</span>
                      {statusBadge(c)}
                    </div>
                    {c.narracao && <p className="text-[11px] text-muted-foreground line-clamp-2">{c.narracao}</p>}
                    {c.error_reason && <p className="text-[11px] text-destructive line-clamp-3">{c.error_reason}</p>}
                  </div>
                </Card>
              ))}
            </div>
          )}
          {cenas.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              As ações (gerar imagem, animar, montar) são comandadas no chat com o Diretor.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

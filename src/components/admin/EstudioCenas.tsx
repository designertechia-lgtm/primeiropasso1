/**
 * Estúdio de Cenas (Premium/PRO) — storytelling 10-60s com personagem/elementos
 * consistentes. Cada cena é criada e aprovada INDIVIDUALMENTE:
 *   1. imagem barata (personagem dentro do cenário da cena, mesma identidade)
 *   2. animar via Kling (débito POR CENA, custo visível antes, estorno se falhar)
 *   3. montar o vídeo final com narração + legendas karaokê + trilha.
 *
 * Permanência de estado NÍVEL 2 (regra do projeto): as cenas vivem na tabela
 * video_scenes + Storage — fechar a página não perde nada; este componente só
 * reidrata via GET /cenas/{draftId} e faz polling enquanto o backend trabalha.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Clapperboard, Loader2, ImagePlus, RefreshCw, Play, Trash2,
  AlertCircle, Sparkles, Film, Users,
} from "lucide-react";
import { videoApiAuthHeaders } from "@/lib/videoApi";

type CenaStatus = "vazia" | "gerando_imagem" | "imagem_pronta" | "animando" | "pronta" | "erro";

type Cena = {
  slide_idx: number;
  visual_prompt: string;
  narracao: string;
  avatar_id: string | null;
  image_url: string | null;
  clip_url: string | null;
  clip_duration_s: number | null;
  status: CenaStatus;
  error_reason: string | null;
};

type AvatarLite = { id: string; name: string; photo_url: string | null };

type Props = {
  api: string;
  professionalSlug: string;
  script: any;
  videoModel: "premium" | "pro";
  estilo: string;
  format: string;
  avatars: AvatarLite[];
  draftId: string | null;
  onDraftId: (id: string) => void;
  /** R$ estimado de 30s de cena no tier atual (base p/ custo por cena) */
  custoBase30: number;
  voice: { voice: string; provider: "edge" | "elevenlabs"; elevenlabsVoiceId?: string | null };
  /** Montagem final disparada: o pai assume o job (polling + Step 3) */
  onMontarJob: (jobId: string) => void;
};

const BUSY: CenaStatus[] = ["gerando_imagem", "animando"];

export default function EstudioCenas({
  api, professionalSlug, script, videoModel, estilo, format,
  avatars, draftId, onDraftId, custoBase30, voice, onMontarJob,
}: Props) {
  const [cenas, setCenas] = useState<Cena[]>([]);
  const [aberto, setAberto] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [montando, setMontando] = useState(false);
  const [modo, setModo] = useState<"personagem" | "elementos">("personagem");
  const [avatarId, setAvatarId] = useState<string | null>(avatars[0]?.id ?? null);
  const [durs, setDurs] = useState<Record<number, 5 | 10>>({});
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const custoCena = (dur: number) => (dur / 30) * custoBase30;
  const fmtBRL = (v: number) => v.toFixed(2).replace(".", ",");

  const authJson = async () => ({
    "Content-Type": "application/json",
    ...(await videoApiAuthHeaders()),
  });

  const carregar = async (id: string): Promise<Cena[]> => {
    const res = await fetch(
      `${api}/cenas/${id}?professional_slug=${encodeURIComponent(professionalSlug)}`,
      { headers: await videoApiAuthHeaders() },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Não consegui carregar as cenas");
    setCenas(data.cenas || []);
    return data.cenas || [];
  };

  // Reidrata cenas de um rascunho existente (voltou para a tela / recarregou)
  useEffect(() => {
    if (!draftId || !professionalSlug) return;
    carregar(draftId)
      .then((c) => { if (c.length) setAberto(true); })
      .catch(() => { /* rascunho sem cenas ainda — silencioso */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, professionalSlug]);

  // Polling enquanto o backend gera imagem/anima alguma cena
  useEffect(() => {
    const busy = cenas.some((c) => BUSY.includes(c.status));
    if (!busy || !draftId) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      carregar(draftId).catch(() => { /* transitório — tenta no próximo tick */ });
    }, 4000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cenas, draftId]);

  const iniciar = async () => {
    if (!script?.slides?.length) { toast.error("Gere o roteiro primeiro."); return; }
    setIniciando(true);
    try {
      const res = await fetch(`${api}/cenas/iniciar`, {
        method: "POST",
        headers: await authJson(),
        body: JSON.stringify({
          professional_slug: professionalSlug,
          script,
          draft_id: draftId,
          avatar_id: modo === "personagem" ? avatarId : null,
          format,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Não consegui abrir o Estúdio de Cenas");
      onDraftId(data.draft_id);
      setCenas(data.cenas || []);
      setAberto(true);
      toast.success("Cenas criadas! Gere a imagem de cada cena e anime as que aprovar.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIniciando(false);
    }
  };

  const gerarImagem = async (idx: number, instruction?: string) => {
    if (!draftId) return;
    try {
      const res = await fetch(`${api}/cenas/${draftId}/imagem`, {
        method: "POST",
        headers: await authJson(),
        body: JSON.stringify({
          professional_slug: professionalSlug,
          slide_idx: idx,
          estilo,
          instruction: instruction?.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao gerar a imagem da cena");
      setCenas((prev) => prev.map((c) =>
        c.slide_idx === idx ? { ...c, status: "gerando_imagem", error_reason: null } : c));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const gerarImagensFaltantes = async () => {
    const alvo = cenas.filter((c) => !c.image_url && !BUSY.includes(c.status));
    if (!alvo.length) { toast.info("Todas as cenas já têm imagem."); return; }
    for (const c of alvo) await gerarImagem(c.slide_idx);
  };

  const animar = async (idxs: number[]) => {
    if (!draftId || !idxs.length) return;
    const pedido = idxs.map((i) => ({ slide_idx: i, dur: durs[i] ?? 5 }));
    const total = pedido.reduce((a, p) => a + custoCena(p.dur), 0);
    if (!confirm(`Animar ${pedido.length} cena(s) por ~R$ ${fmtBRL(total)} em créditos?`)) return;
    try {
      const res = await fetch(`${api}/cenas/${draftId}/animar`, {
        method: "POST",
        headers: await authJson(),
        body: JSON.stringify({
          professional_slug: professionalSlug,
          model: videoModel,
          estilo,
          scenes: pedido,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao animar as cenas");
      setCenas((prev) => prev.map((c) =>
        idxs.includes(c.slide_idx) ? { ...c, status: "animando", error_reason: null } : c));
      toast.success("Animando! As cenas rodam em paralelo — acompanhe o status em cada card.");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const descartar = async (idx: number) => {
    if (!draftId) return;
    if (!confirm(`Descartar a imagem e o clipe da cena ${idx + 1}? (arquivos são apagados)`)) return;
    try {
      const res = await fetch(
        `${api}/cenas/${draftId}/${idx}?professional_slug=${encodeURIComponent(professionalSlug)}`,
        { method: "DELETE", headers: await videoApiAuthHeaders() },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao descartar a cena");
      await carregar(draftId);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const montar = async () => {
    if (!draftId) return;
    const prontas = cenas.filter((c) => c.status === "pronta").length;
    if (!prontas) { toast.error("Anime ao menos uma cena antes de montar."); return; }
    setMontando(true);
    try {
      const res = await fetch(`${api}/cenas/${draftId}/montar`, {
        method: "POST",
        headers: await authJson(),
        body: JSON.stringify({
          professional_slug: professionalSlug,
          model: videoModel,
          format,
          estilo_visual: estilo,
          script,
          voice: voice.voice,
          voice_provider: voice.provider,
          elevenlabs_voice_id: voice.elevenlabsVoiceId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao montar o vídeo");
      onMontarJob(data.job_id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMontando(false);
    }
  };

  const statusBadge = (c: Cena) => {
    switch (c.status) {
      case "gerando_imagem": return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Criando imagem…</Badge>;
      case "imagem_pronta":  return <Badge variant="secondary">Imagem pronta — revise e anime</Badge>;
      case "animando":       return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Animando (~2-4min)…</Badge>;
      case "pronta":         return <Badge className="bg-green-600 text-white hover:bg-green-600">Cena animada ✓</Badge>;
      case "erro":           return <Badge variant="destructive">Erro</Badge>;
      default:               return <Badge variant="outline">Sem imagem</Badge>;
    }
  };

  const prontasCount = cenas.filter((c) => c.status === "pronta").length;
  const animaveis = cenas.filter((c) => c.status === "imagem_pronta").map((c) => c.slide_idx);
  const custoAnimarTodas = animaveis.reduce((a, i) => a + custoCena(durs[i] ?? 5), 0);

  // ── Abertura: escolher o modo de consistência ──────────────────────────────
  if (!aberto) {
    return (
      <Card className="border-dashed border-primary/40">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Estúdio de Cenas — história com o mesmo personagem</h3>
            <Badge variant="secondary">{videoModel === "pro" ? "PRO" : "Premium"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Crie cada cena individualmente: a imagem mostra o <b>mesmo personagem dentro do
            cenário da cena</b>; você aprova, anima só o que gostou (custo por cena, com estorno
            se falhar) e monta o vídeo final com narração e legendas.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModo("personagem")}
              className={`rounded-lg border p-3 text-left text-sm transition ${modo === "personagem" ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"}`}
            >
              <div className="flex items-center gap-2 font-medium"><Users className="h-4 w-4" />Com meu personagem</div>
              <p className="text-xs text-muted-foreground mt-1">O mesmo rosto em todas as cenas, em cenários diferentes.</p>
            </button>
            <button
              type="button"
              onClick={() => setModo("elementos")}
              className={`rounded-lg border p-3 text-left text-sm transition ${modo === "elementos" ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"}`}
            >
              <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" />Mesmos elementos</div>
              <p className="text-xs text-muted-foreground mt-1">Sem personagem fixo: a primeira cena define a identidade visual das demais.</p>
            </button>
          </div>
          {modo === "personagem" && (
            avatars.length ? (
              <div className="flex gap-2 flex-wrap">
                {avatars.map((a) => (
                  <button
                    key={a.id}
                    type="button"
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
                Você ainda não tem personagens — crie um na aba <b>Personagens</b> ou use "Mesmos elementos".
              </p>
            )
          )}
          <Button onClick={iniciar} disabled={iniciando || (modo === "personagem" && !avatarId)}>
            {iniciando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clapperboard className="h-4 w-4 mr-2" />}
            Criar as cenas da história
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Editor de cards ─────────────────────────────────────────────────────────
  return (
    <Card className="border-primary/40">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Estúdio de Cenas</h3>
            <Badge variant="secondary">{prontasCount}/{cenas.length} animadas</Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={gerarImagensFaltantes}>
              <ImagePlus className="h-4 w-4 mr-1" />Gerar imagens que faltam
            </Button>
            <Button size="sm" variant="outline" disabled={!animaveis.length} onClick={() => animar(animaveis)}>
              <Play className="h-4 w-4 mr-1" />Animar todas (~R$ {fmtBRL(custoAnimarTodas)})
            </Button>
            <Button size="sm" disabled={!prontasCount || montando} onClick={montar}>
              {montando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Film className="h-4 w-4 mr-1" />}
              Montar vídeo final
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A imagem é grátis de regenerar até você aprovar. Animar debita por cena
          (~R$ {fmtBRL(custoCena(5))} por 5s, ~R$ {fmtBRL(custoCena(10))} por 10s) — cena que
          falhar é <b>estornada automaticamente</b>. Regenerar a imagem descarta o clipe da cena.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cenas.map((c) => (
            <div key={c.slide_idx} className="rounded-lg border overflow-hidden flex flex-col">
              <div className="relative aspect-[9/16] max-h-72 bg-muted flex items-center justify-center">
                {c.status === "pronta" && c.clip_url ? (
                  <video src={c.clip_url} className="h-full w-full object-cover" controls muted loop playsInline />
                ) : c.image_url ? (
                  <img src={c.image_url} alt={`Cena ${c.slide_idx + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="text-muted-foreground text-xs p-4 text-center">
                    {BUSY.includes(c.status) ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : "Sem imagem ainda"}
                  </div>
                )}
                <div className="absolute top-1 left-1"><Badge variant="secondary">Cena {c.slide_idx + 1}</Badge></div>
              </div>
              <div className="p-2 space-y-2 text-xs flex-1 flex flex-col">
                <div>{statusBadge(c)}</div>
                {c.narracao && <p className="text-muted-foreground line-clamp-2">🗣️ {c.narracao}</p>}
                {c.status === "erro" && c.error_reason && (
                  <p className="text-destructive flex gap-1"><AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{c.error_reason}</p>
                )}
                {editIdx === c.slide_idx && (
                  <div className="flex gap-1">
                    <Input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      placeholder='Ex.: "muda para um consultório claro"'
                      className="h-7 text-xs"
                    />
                    <Button size="sm" className="h-7 px-2" onClick={() => { gerarImagem(c.slide_idx, editText); setEditIdx(null); setEditText(""); }}>
                      OK
                    </Button>
                  </div>
                )}
                <div className="mt-auto flex flex-wrap gap-1">
                  {!BUSY.includes(c.status) && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 px-2"
                        onClick={() => (c.image_url ? (setEditIdx(editIdx === c.slide_idx ? null : c.slide_idx), setEditText("")) : gerarImagem(c.slide_idx))}>
                        {c.image_url ? <><RefreshCw className="h-3 w-3 mr-1" />Regenerar</> : <><ImagePlus className="h-3 w-3 mr-1" />Gerar imagem</>}
                      </Button>
                      {c.image_url && (
                        <>
                          <select
                            className="h-7 rounded border bg-background px-1 text-xs"
                            value={durs[c.slide_idx] ?? 5}
                            onChange={(e) => setDurs((p) => ({ ...p, [c.slide_idx]: Number(e.target.value) === 10 ? 10 : 5 }))}
                            title="Duração da animação"
                          >
                            <option value={5}>5s</option>
                            <option value={10}>10s</option>
                          </select>
                          <Button size="sm" className="h-7 px-2" onClick={() => animar([c.slide_idx])}>
                            <Play className="h-3 w-3 mr-1" />
                            {c.status === "pronta" ? "Re-animar" : "Animar"} R$ {fmtBRL(custoCena(durs[c.slide_idx] ?? 5))}
                          </Button>
                        </>
                      )}
                      {(c.image_url || c.clip_url) && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => descartar(c.slide_idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

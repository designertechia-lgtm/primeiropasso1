/**
 * Editor de Vídeo — corte + música + legendas + textos + stickers + clipes de
 * áudio posicionados (motor próprio no video-api, código SEPARADO do
 * Institucional e do Criar Vídeo).
 *
 * Fundações (Carlos 14/07 — Fase 0 do plano de evolução):
 *   - MODELO DE DOCUMENTO: todo o conteúdo da edição vive num EditorDoc único
 *     (editor/documentReducer.ts). O Desfazer agora cobre a edição INTEIRA
 *     (antes só os cortes) e o payload do render nasce de editor/serialize.ts
 *     — persistência, prévia e render leem a mesma fonte.
 *   - PROJETOS NO BANCO: a edição é salva com debounce na tabela
 *     editor_projects (além do cache no navegador) — dá pra trocar de máquina
 *     e manter vários projetos ("Meus projetos" na Biblioteca).
 *   - CONTRATO VERSIONADO com o worker (/editor/capabilities) e uploads
 *     autenticados (o worker passou a exigir sessão nos uploads).
 *
 * Novidades (Carlos 10/07):
 *   - STICKERS/sobreposições: png/gif/webm-alpha sobre o vídeo, com faixa
 *     própria na timeline (mover/esticar), arrasto no player pra posicionar,
 *     movimento "atravessa a tela" e geração por IA (fundo verde → chroma).
 *   - CLIPES DE ÁUDIO posicionados: efeito/narração em ponto exato, faixa
 *     azul na timeline, volume por clipe, prévia sincronizada no play.
 *
 * Revisões do Carlos (06/07):
 *   - Preview COLADO na timeline (mesmo card) + "prévia da edição": ao dar
 *     play, os trechos removidos são PULADOS — você vê como fica antes de
 *     renderizar.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfessional } from "@/hooks/useProfessional";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Scissors, Play, Pause, Loader2, Music, Upload, Film, Trash2, Undo2,
  CheckCircle2, AlertCircle, Video as VideoIcon, Captions, Wand2, RotateCcw,
  FolderOpen, Copy, Plus, Minus, Palette, Sparkles, Mic, Square, HelpCircle,
  Image as ImageIcon, Headphones, Volume2, Magnet, Download, Type, Clapperboard,
  Repeat, LogIn, LogOut, Check, Eye, EyeOff,
} from "lucide-react";
import { videoApiAuthHeaders } from "@/lib/videoApi";
import {
  API, EDITOR_STORAGE_KEY, EDITOR_CONTRACT_VERSION,
  STICKER_SIZES, STICKER_POSITIONS, SUB_PRESETS,
  groupWords, fmt, parseTime, newId, normalizarSegments,
  ANIM_IN_OPTS, ANIM_OUT_OPTS, ANIM_LOOP_OPTS,
  type Segment, type EditMeta, type SubSize, type SubStyle, type SubPos,
  type TitlePos, type Sticker, type StickerMovement, type StickerJob,
  type AnimIn, type AnimOut, type AnimLoop,
} from "./editor/types";
import {
  editorReducer, initialEditorState, type EditorDoc,
} from "./editor/documentReducer";
import {
  buildRenderPayload, snapshotFromStored, metaSemThumbs, aplicarFaixasOcultas,
  type ProjectSnapshot,
} from "./editor/serialize";
import { evaluateScene, drawScene, fontesDaCena, FONTE_PADRAO } from "./editor/scene";
import { FILTROS, FILTRO_IDS, EFEITOS, TRANSICOES, filtroCss,
  EXPORT_RESOLUCOES, EXPORT_FPS, EXPORT_CODECS, EXPORT_FORMATOS } from "./editor/filtros";
import EditorOnboarding, { onboardingPendente } from "./editor/EditorOnboarding";
import { usePreviewClock } from "./editor/previewClock";
import {
  listEditorProjects, fetchEditorProject, insertEditorProject,
  updateEditorProject, deleteEditorProject,
} from "./editor/projects";

export default function AdminEditorVideo() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── documento da edição (fonte única de verdade + undo genérico) ──────────
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const doc = state.doc;
  const {
    segments, musicId, musicUploadId, musicUploadName, musicVolume,
    originalVolume, fadeOut, fadeIn, denoise, subsOn, cues, words, cueMode, subFont, subSize,
    subColor, subStyle, subPos, titles, stickers, audioClips, pipClips, seqClips, transition,
    filtro, efeito, ducking, punchIn, introOn, introSource, introUploadId,
    introUploadName, introDur, introBg, introEffect, titulo,
  } = doc;
  const patch = (changes: Partial<EditorDoc>) => dispatch({ type: "patch", changes });
  const apply = (fn: (d: EditorDoc) => Partial<EditorDoc>) => dispatch({ type: "apply", fn });
  const update = (changes: Partial<EditorDoc>) => dispatch({ type: "update", changes });
  const applyLive = (fn: (d: EditorDoc) => Partial<EditorDoc>) => dispatch({ type: "applyLive", fn });
  const checkpoint = () => dispatch({ type: "checkpoint" });
  const undo = () => dispatch({ type: "undo" });

  // ── estado de sessão (fonte, projeto, jobs, UI) ────────────────────────────
  const [meta, setMeta] = useState<EditMeta | null>(null);
  const [previewSrc, setPreviewSrc] = useState("");
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");
  // URL re-carregável da fonte (galeria/draft) — reabre projeto com draft expirado
  const [sourceUrl, setSourceUrl] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [saveError, setSaveError] = useState(false);
  // fonte expirou no servidor e não foi recuperável — o próximo upload REANEXA
  // a fonte ao projeto preservando as edições (em vez de zerar o doc)
  const [fonteExpirada, setFonteExpirada] = useState(false);

  const [playhead, setPlayhead] = useState(0);
  // Timeline pro (Fase 1): zoom com scroll horizontal e snap magnético
  const [zoom, setZoom] = useState(1);
  const [snapOn, setSnapOn] = useState(true);
  const [snapGuide, setSnapGuide] = useState<number | null>(null);
  const [thumbsErro, setThumbsErro] = useState(false);
  // miniaturas do TRECHO VISÍVEL (quando ampliado): os quadros vêm em tamanho
  // natural do intervalo na tela, em vez de esticar a fita inteira (que estoura
  // a imagem em zoom alto). null/zoom 1× = usa a fita base de meta.thumbs.
  const [winThumbs, setWinThumbs] = useState<{ t0: number; t1: number; list: string[] } | null>(null);
  const winTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [amostraUrl, setAmostraUrl] = useState("");
  const [amostraCarregando, setAmostraCarregando] = useState(false);
  const [amostraErro, setAmostraErro] = useState("");
  const [gravando, setGravando] = useState(false);
  const [gravSegs, setGravSegs] = useState(0);
  // opções de exportação: escolha de SAÍDA, não conteúdo — estado local, não vai
  // pro doc/banco (não faz sentido versionar "exportei em 720p" com o projeto)
  const [expRes, setExpRes] = useState("1080p");
  const [expFps, setExpFps] = useState(30);
  const [expCodec, setExpCodec] = useState("h264");
  const [expFormato, setExpFormato] = useState("mp4");
  const [gifUrl, setGifUrl] = useState("");
  // codecs REAIS do worker (h265 só se o encoder existir lá) — vem do capabilities
  const [codecsDisp, setCodecsDisp] = useState<string[]>(["h264"]);
  const [tourAberto, setTourAberto] = useState(false);
  const [startField, setStartField] = useState("");
  const [endField, setEndField] = useState("");
  const [cutStart, setCutStart] = useState("");   // caixinha FIXA de corte por tempo
  const [cutEnd, setCutEnd] = useState("");
  const [previewEdit, setPreviewEdit] = useState(true);   // play pula trechos removidos
  // Diálogo de escolha de um 2º vídeo: "pip" (sobre o vídeo) ou "seq" (no fim)
  const [dialogVideo, setDialogVideo] = useState<null | "pip" | "seq">(null);
  const [pipLoading, setPipLoading] = useState(false);

  const [musicas, setMusicas] = useState<{ id: string; label: string }[]>([]);
  const [previewingTrack, setPreviewingTrack] = useState("");
  const [fontes, setFontes] = useState<{ id: string; label: string }[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set());

  const [newTitle, setNewTitle] = useState("");
  const [newTitleDur, setNewTitleDur] = useState(3);

  const [uploadingSticker, setUploadingSticker] = useState(false);
  const [uploadingClip, setUploadingClip] = useState(false);
  const [iaDesc, setIaDesc] = useState("");
  const [iaDur, setIaDur] = useState(5);
  const [iaStep, setIaStep] = useState("");
  const [stickerJob, setStickerJob] = useState<StickerJob | null>(null);
  const [videoBox, setVideoBox] = useState({ w: 0, h: 0 });

  const perfilLogo = ((professional as any)?.logo_url as string) || "";

  const [aiCutText, setAiCutText] = useState("");
  const [aiCutting, setAiCutting] = useState(false);
  const [exporting, setExporting] = useState("");

  const [rendering, setRendering] = useState(false);
  const [renderJobId, setRenderJobId] = useState("");   // persiste: retoma o acompanhamento ao voltar
  const [renderStep, setRenderStep] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const segDragRef = useRef<{ segId: number } | null>(null);
  const draggingRef = useRef(false);
  const restoredRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fontesPedidasRef = useRef<Map<string, number>>(new Map());
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const gravTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const metaRef = useRef<EditMeta | null>(null);
  const clipAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const trackDragRef = useRef<{ kind: "sticker" | "audio" | "title" | "cue" | "pip"; id: string; mode: "move" | "resize"; grab: number } | null>(null);
  const stickerDragRef = useRef<string | null>(null);
  const pipDragRef = useRef<string | null>(null);
  const pipVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const stickerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const criandoProjetoRef = useRef(false);
  // token de geração da sessão de edição: invalida callbacks assíncronos
  // (insert de projeto em voo) quando o usuário troca de projeto no meio
  const sessionSeqRef = useRef(0);
  // há edição ainda não gravada no banco (para o flush em trocas/unmount)
  const dirtyRef = useRef(false);
  // componente montado? (o save de unmount não pode fazer setState)
  const mountedRef = useRef(true);

  const { data: videos = [] } = useQuery({
    queryKey: ["admin-videos", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("videos").select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });
  const mp4Videos = (videos as any[]).filter(
    (v) => v.embed_url && !/youtube|youtu\.be/i.test(v.embed_url),
  );

  // Projetos salvos no banco (editor_projects — RLS do próprio usuário)
  const { data: projects = [] } = useQuery({
    queryKey: ["editor-projects"],
    queryFn: listEditorProjects,
    enabled: !!professional?.id,
  });

  useEffect(() => {
    fetch(`${API}/editor/musicas`).then((r) => r.json()).then((d) => setMusicas(d.musicas || [])).catch(() => {});
    fetch(`${API}/editor/fontes`).then((r) => r.json()).then((d) => setFontes(d.fontes || [])).catch(() => {});
    // Contrato front↔worker: worker mais velho que o front recusa o render com
    // mensagem clara em vez de ignorar campos em silêncio (incidente Rodada 8)
    fetch(`${API}/editor/capabilities`)
      .then((r) => (r.ok ? r.json() : { contract_version: 1 }))
      .then((d) => {
        if ((d.contract_version ?? 1) < EDITOR_CONTRACT_VERSION) {
          console.warn("[editor] worker com contrato antigo:", d.contract_version);
        }
        // só oferece os codecs que o worker de fato tem (h265 pode faltar no
        // build do ffmpeg) — evita oferecer uma opção que cairia calada
        if (Array.isArray(d.export?.codecs) && d.export.codecs.length) {
          setCodecsDisp(d.export.codecs);
        }
      })
      .catch(() => {});
    const clipEls = clipAudiosRef.current;
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (stickerPollRef.current) clearInterval(stickerPollRef.current);
      clipEls.forEach((el) => el.pause());
    };
  }, []);

  // Acompanhamento do render (extraído para o restore poder RETOMAR o polling)
  const pollRender = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API}/status/${jobId}`);
        if (resp.status === 404) {
          // o servidor reiniciou e perdeu o registro do job — o vídeo PODE já
          // ter sido salvo antes; nunca deixar o usuário girando pra sempre
          if (pollRef.current) clearInterval(pollRef.current);
          setRendering(false); setRenderJobId("");
          queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
          toast.info("O servidor reiniciou durante o processamento — confira Meus Vídeos: o vídeo pode já estar lá. Se não estiver, renderize de novo (suas edições estão guardadas).", { duration: 12000 });
          return;
        }
        const st = await resp.json();
        setRenderProgress(st.progress ?? 0); setRenderStep(st.step ?? "");
        if (st.status === "done") {
          if (pollRef.current) clearInterval(pollRef.current);
          setRendering(false); setRenderJobId(""); setResultUrl(st.video_url);
          toast.success("Edição pronta! O vídeo já está em Meus Vídeos.");
          queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
        } else if (st.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          setRendering(false); setRenderJobId("");
          toast.error(st.message || "A edição falhou", { duration: 9000 });
        }
      } catch { /* transitório */ }
    }, 3000);
  };

  // Acompanhamento da geração de sticker por IA (extraído para o restore
  // poder RETOMAR — regra do projeto: jobs >5s sobrevivem à navegação)
  const pollStickerJob = (job: StickerJob) => {
    if (stickerPollRef.current) clearInterval(stickerPollRef.current);
    stickerPollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API}/status/${job.job_id}`);
        if (resp.status === 404) {
          if (stickerPollRef.current) clearInterval(stickerPollRef.current);
          setStickerJob(null); setIaStep("");
          toast.info("O servidor reiniciou durante a geração do sticker — tente gerar de novo.", { duration: 9000 });
          return;
        }
        const st = await resp.json();
        setIaStep(st.step || "Gerando o sticker...");
        if (st.status === "done") {
          if (stickerPollRef.current) clearInterval(stickerPollRef.current);
          setStickerJob(null); setIaStep(""); setIaDesc("");
          const walk = /andando|caminhando|correndo|passeando|voando|nadando/i.test(job.desc);
          const m = metaRef.current;
          if (m) {
            const dur = Math.max(4, Number(st.duration) || 5);
            // id gerado FORA do reducer (função do reducer precisa ser pura)
            const sid = newId();
            apply((d) => ({
              stickers: [...d.stickers, {
                id: sid, upload_id: st.sticker_upload_id,
                name: `✨ ${job.desc.slice(0, 24)}`, animated: true,
                natural_dur: Number(st.duration) || 5,
                start: job.at, end: Math.min(m.duration, job.at + dur),
                x_pct: 0.84, y_pct: 0.76, scale_pct: 0.26,
                movement: walk ? "walk-right" : "none", loop: true, flip: false,
              }],
            }));
          }
          toast.success("Sticker gerado com fundo transparente! Já está na timeline — arraste no player para posicionar.", { duration: 9000 });
        } else if (st.status === "error") {
          if (stickerPollRef.current) clearInterval(stickerPollRef.current);
          setStickerJob(null); setIaStep("");
          toast.error(st.message || "A geração do sticker falhou", { duration: 9000 });
        }
      } catch { /* transitório */ }
    }, 3000);
  };

  // Aplica um snapshot completo (restore do navegador OU projeto do banco)
  const aplicarSnapshot = (s: ProjectSnapshot, extra?: { projectId?: number | null; projectName?: string }) => {
    // invalida callbacks da sessão anterior e mata os pollings dela — sem isso
    // o resultado do render do projeto A era gravado dentro do projeto B
    sessionSeqRef.current++;
    if (pollRef.current) clearInterval(pollRef.current);
    if (stickerPollRef.current) clearInterval(stickerPollRef.current);
    setSavedAt(""); setSaveError(false); setFonteExpirada(false);
    const m = s.meta!;
    setMeta(m);
    setPreviewSrc(m.preview_url || `${API}/editor/video/${m.edit_id}`);
    setSourceLabel(s.sourceLabel || "");
    setSourceUrl(s.sourceUrl || m.preview_url || "");
    setResultUrl(s.resultUrl || "");
    clock.pause(); clock.seek(0);
    setProjectId(extra?.projectId !== undefined ? extra.projectId : s.projectId);
    setProjectName(extra?.projectName !== undefined ? extra.projectName : (s.projectName || ""));
    const d: EditorDoc = { ...s.doc };
    if (!d.segments.length) d.segments = [{ id: 1, start: 0, end: m.duration, keep: true }];
    dispatch({ type: "reset", doc: d });
    if (s.stickerJob?.job_id) {
      // geração de sticker em andamento — retoma o acompanhamento
      setStickerJob(s.stickerJob);
      setIaStep("Retomando a geração do sticker...");
      pollStickerJob(s.stickerJob);
    } else {
      setStickerJob(null); setIaStep("");
    }
    if (s.renderJobId) {
      // havia uma renderização em andamento — RETOMA o acompanhamento
      setRenderJobId(s.renderJobId);
      setRendering(true);
      setRenderStep("Retomando o acompanhamento...");
      pollRender(s.renderJobId);
    } else {
      setRenderJobId(""); setRendering(false);
    }
  };

  // Carregar um vídeo direto no editor — tem prioridade sobre a restauração da
  // edição anterior. Duas entradas:
  //   • ?load={video_id} — tesoura de "Meus Vídeos" (busca embed_url na tabela)
  //   • ?loadurl={url}   — vídeo institucional vindo do dialog "Gerar com IA" da landing
  useEffect(() => {
    const loadId = searchParams.get("load");
    const loadUrl = searchParams.get("loadurl");
    if (!loadId && !loadUrl) return;
    (async () => {
      restoredRef.current = true;   // pula o restore — o load substitui a edição
      let embedUrl: string | null = null;
      let title = "Vídeo institucional";
      if (loadId) {
        const { data } = await (supabase as any)
          .from("videos").select("embed_url,title").eq("id", loadId).single();
        embedUrl = data?.embed_url ?? null;
        title = data?.title || "Vídeo da galeria";
      } else if (loadUrl) {
        try { embedUrl = decodeURIComponent(loadUrl); } catch { embedUrl = loadUrl; }
      }
      searchParams.delete("load");
      searchParams.delete("loadurl");
      setSearchParams(searchParams, { replace: true });
      if (!embedUrl || /youtube|youtu\.be|vimeo/i.test(embedUrl)) {
        toast.error("Não encontrei um arquivo de vídeo editável (links do YouTube/Vimeo não dá pra editar).");
        return;
      }
      const fd = new FormData();
      fd.append("video_url", embedUrl);
      try {
        const saved = snapshotFromStored(JSON.parse(localStorage.getItem(EDITOR_STORAGE_KEY) || "null"));
        // Só descarta o draft anterior se a edição NÃO era um projeto salvo —
        // o draft de um projeto pertence a ele (reabre por Meus projetos).
        if (saved?.meta?.edit_id && saved.projectId == null) {
          fd.append("replace_edit_id", saved.meta.edit_id);
        }
      } catch { /* sem draft anterior */ }
      await carregar(fd, title, embedUrl);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PERSISTÊNCIA: restaura ao entrar; salva a cada mudança ────────────────
  useEffect(() => {
    (async () => {
      try {
        if (searchParams.get("load") || searchParams.get("loadurl")) return;   // o efeito do load assume
        const raw = localStorage.getItem(EDITOR_STORAGE_KEY);
        if (!raw) { restoredRef.current = true; return; }
        const snap = snapshotFromStored(JSON.parse(raw));
        if (!snap?.meta?.edit_id) { restoredRef.current = true; return; }
        // Ping NÃO-destrutivo: só descarta com 404 EXPLÍCITO (arquivo realmente
        // morto). Servidor ocupado/rede instável → restaura mesmo assim.
        const head = await fetch(`${API}/editor/video/${snap.meta.edit_id}`, { method: "HEAD" }).catch(() => null);
        if (head && head.status === 404) {
          localStorage.removeItem(EDITOR_STORAGE_KEY);
          toast.info("A edição anterior expirou no servidor — reabra pelo card Meus projetos ou carregue o vídeo de novo.", { duration: 8000 });
          restoredRef.current = true;
          return;
        }
        if (!head || !head.ok) {
          toast.info("O servidor está ocupado — restaurei suas edições; o vídeo pode demorar um pouco pra carregar.", { duration: 8000 });
        }
        aplicarSnapshot(snap);
        if (snap.renderJobId) {
          toast.info("Sua renderização continuou no servidor — acompanhando de novo.", { duration: 7000 });
        } else {
          toast.success("Edição anterior restaurada — continue de onde parou.");
        }
      } catch { /* estado corrompido — segue vazio */ }
      restoredRef.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // meta sem thumbs, estável: as thumbnails chegam depois (GET /editor/thumbs)
  // e não podem, ao chegar, disparar um save inútil do projeto
  const metaSlim = useMemo(() => metaSemThumbs(meta), [
    meta?.edit_id, meta?.duration, meta?.width, meta?.height,
    meta?.has_audio, meta?.preview_url,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Snapshot completo do projeto (o que vai pro navegador E pro banco)
  const snapshot: ProjectSnapshot = useMemo(() => ({
    v: 2, meta: metaSlim, sourceLabel, sourceUrl, resultUrl, renderJobId, stickerJob,
    projectId, projectName, doc,
  }), [metaSlim, sourceLabel, sourceUrl, resultUrl, renderJobId, stickerJob,
       projectId, projectName, doc]);

  // Cache local (sobrevive a F5 — comportamento original)
  useEffect(() => {
    if (!restoredRef.current) return;
    if (!meta) { localStorage.removeItem(EDITOR_STORAGE_KEY); return; }
    try {
      localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(snapshot));
    } catch { /* localStorage cheio — ignora */ }
  }, [snapshot, meta]);

  // snapshot mais recente acessível em callbacks (flush/unmount)
  const snapshotRef = useRef(snapshot);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  // Grava o snapshot no banco AGORA. Best-effort — falha de rede não trava a
  // edição (o cache local segura), mas o indicador passa a acusar dessincronia.
  const salvarAgora = async (snap: ProjectSnapshot) => {
    if (!snap.meta) return;
    // insert em voo: NÃO marca como salvo (dirty fica de pé pro próximo ciclo)
    if (snap.projectId == null && criandoProjetoRef.current) return;
    dirtyRef.current = false;
    const name = (snap.projectName || snap.sourceLabel || "Edição").slice(0, 80);
    try {
      if (snap.projectId == null) {
        criandoProjetoRef.current = true;
        const seq = sessionSeqRef.current;
        try {
          const id = await insertEditorProject(name, snap);
          if (sessionSeqRef.current !== seq) {
            // o usuário trocou de contexto enquanto o insert corria — a linha
            // já guarda a edição: vira um projeto na lista (nada se perde),
            // só não pode roubar o projectId do contexto atual
            queryClient.invalidateQueries({ queryKey: ["editor-projects"] });
            return;
          }
          if (!mountedRef.current) {
            // save de unmount: sem setState — grava o id direto no cache local
            // pra volta ao editor NÃO inserir uma segunda linha do mesmo projeto
            try {
              const raw = JSON.parse(localStorage.getItem(EDITOR_STORAGE_KEY) || "null");
              if (raw?.meta?.edit_id === snap.meta.edit_id) {
                localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify({
                  ...raw, projectId: id, projectName: raw.projectName || name,
                }));
              }
            } catch { /* cache local indisponível — a lista ainda mostra o projeto */ }
            queryClient.invalidateQueries({ queryKey: ["editor-projects"] });
            return;
          }
          setProjectId(id);
          if (!snap.projectName) setProjectName(name);
          queryClient.invalidateQueries({ queryKey: ["editor-projects"] });
        } finally {
          criandoProjetoRef.current = false;
        }
      } else {
        await updateEditorProject(snap.projectId, name, snap);
        queryClient.invalidateQueries({ queryKey: ["editor-projects"] });
      }
      if (mountedRef.current) {
        setSaveError(false);
        setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      }
    } catch (e) {
      console.warn("[editor] salvar projeto no banco falhou (cache local ok)", e);
      dirtyRef.current = true;
      if (mountedRef.current) setSaveError(true);
    }
  };

  // Descarrega o save pendente ANTES de trocar de contexto (abrir outro
  // projeto, novo projeto, sair da tela) — sem isso as edições dos últimos
  // 2,5s morriam com o timer do debounce.
  const flushSave = async () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (dirtyRef.current && snapshotRef.current.meta) await salvarAgora(snapshotRef.current);
  };

  // Projeto no banco (debounce): cria na primeira edição, depois atualiza.
  useEffect(() => {
    if (!restoredRef.current || !meta) return;
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      salvarAgora(snapshotRef.current);
    }, 2500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  // Unmount (trocar de aba do admin): dispara o save pendente na hora
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (dirtyRef.current && snapshotRef.current.meta) salvarAgora(snapshotRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Miniaturas da timeline: não são salvas com o projeto (base64 pesado) —
  // ao restaurar/abrir, o painel repõe pelo worker. Com retry: se o worker
  // estiver reiniciando (deploy), uma falha silenciosa deixaria a timeline
  // pulsando "carregando" a sessão inteira.
  useEffect(() => {
    setThumbsErro(false);
    const id = meta?.edit_id;
    if (!id || meta?.thumbs?.length) return;
    let vivo = true;
    (async () => {
      for (let tentativa = 0; tentativa < 3 && vivo; tentativa++) {
        if (tentativa) await new Promise((r) => setTimeout(r, 2500 * tentativa));
        if (!vivo) return;
        try {
          // 40 frames (não 20): a timeline agora é larga e tem zoom — mais
          // miniaturas esticam menos ao ampliar
          const res = await fetch(`${API}/editor/thumbs/${id}?count=40`, {
            headers: await videoApiAuthHeaders(),
          });
          if (!res.ok) continue;
          const d = await res.json();
          if (!vivo) return;
          // o worker devolve "" no frame que o ffmpeg não conseguiu, e SEMPRE
          // devolve `count` entradas — checar só o tamanho aceitaria uma lista
          // toda vazia e a timeline pulsaria "carregando" para sempre
          const lista: string[] = d.thumbs || [];
          const bons = lista.filter(Boolean).length;
          if (!lista.length || bons < lista.length / 2) continue;
          setMeta((m) => (m && m.edit_id === id ? { ...m, thumbs: lista } : m));
          return;
        } catch { /* rede/worker fora — tenta de novo */ }
      }
      if (vivo) setThumbsErro(true);   // para de fingir que está carregando
    })();
    return () => { vivo = false; };
  }, [meta?.edit_id, meta?.thumbs?.length]);

  // Fonte nova = janela antiga não vale mais
  useEffect(() => { setWinThumbs(null); }, [meta?.edit_id]);

  // Miniaturas do TRECHO VISÍVEL: ao ampliar/rolar, pede os quadros SÓ do
  // intervalo na tela, em tamanho natural. É o que faz o zoom REVELAR detalhe
  // (mais quadros distintos do trecho) em vez de esticar os mesmos quadros da
  // timeline inteira — que estoura a imagem em zoom alto. Debounce para o scroll
  // não spammar o worker; o worker cacheia por janela.
  const pedirJanelaThumbs = () => {
    if (winTimerRef.current) clearTimeout(winTimerRef.current);
    const box = scrollRef.current;
    const id = meta?.edit_id;
    const dur = meta?.duration || 0;
    if (!box || !id || dur <= 0) return;
    if (zoom <= 1) { setWinThumbs(null); return; }   // 1× usa a fita base inteira
    winTimerRef.current = setTimeout(async () => {
      const total = box.scrollWidth || 1;
      const vis = box.clientWidth || 1;
      const t0 = (box.scrollLeft / total) * dur;
      const t1 = Math.min(dur, ((box.scrollLeft + vis) / total) * dur);
      // quantos quadros pedir para cobrir a largura visível com quadros de
      // largura ~natural (as imgs usam w-auto, então NUNCA esticam; isto só
      // garante que há quadros suficientes para preencher, sem sobrar cinza).
      // A fita cresce com o zoom (alturaFita) — um quadro 9:16 tem ~0,56×altura
      const alt = zoom <= 1 ? 64 : zoom <= 2 ? 96 : zoom <= 4 ? 128 : zoom <= 8 ? 144 : 192;
      const ratio = meta && meta.width && meta.height ? meta.width / meta.height : 0.5625;
      const larguraQuadro = Math.max(24, Math.min(alt, alt * ratio));
      const n = Math.max(12, Math.min(160, Math.ceil(vis / larguraQuadro) + 2));
      // pede a imagem MAIOR que o exibido (nitidez em tela retina); worker antigo
      // ignora height e manda 90px — degrada suave, não quebra
      const hPx = Math.min(200, Math.round(alt * 1.3));
      try {
        const res = await fetch(
          `${API}/editor/thumbs/${id}?count=${n}&start=${t0.toFixed(2)}&end=${t1.toFixed(2)}&height=${hPx}`,
          { headers: await videoApiAuthHeaders() });
        if (!res.ok) return;
        const lista: string[] = (await res.json()).thumbs || [];
        if (lista.length && lista.filter(Boolean).length >= lista.length / 2)
          setWinThumbs({ t0, t1, list: lista });
      } catch { /* rede/worker fora — mantém a janela atual */ }
    }, 250);
  };

  // dispara a janela quando o zoom muda ou troca a fonte (o scroll dispara pelo
  // onScroll do container). O worker já suporta janela (confirmado em prod), então
  // não dependemos do /capabilities aqui — evita ficar refém do cache dele.
  useEffect(() => {
    pedirJanelaThumbs();
    return () => { if (winTimerRef.current) clearTimeout(winTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, meta?.edit_id, meta?.duration]);

  // ── amostra REAL do efeito (Fase efeitos) ─────────────────────────────────
  // O efeito não tem prévia ao vivo (VHS/glitch não existem em CSS), então o
  // worker manda o frame do cursor já passado pelo ffmpeg. Com debounce: cada
  // amostra é um ffmpeg, e clicar nas pílulas dispararia uma por clique.
  useEffect(() => {
    const id = meta?.edit_id;
    if (!id) { setAmostraUrl(""); return; }
    let vivo = true;
    let urlAntiga = "";
    const timer = setTimeout(async () => {
      setAmostraCarregando(true);
      try {
        const q = new URLSearchParams({
          t: String(Math.max(0, playhead)), filtro, efeito,
        });
        const res = await fetch(`${API}/editor/amostra/${id}?${q}`, {
          headers: await videoApiAuthHeaders(),
        });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (!vivo) return;
        urlAntiga = URL.createObjectURL(blob);
        setAmostraUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return urlAntiga; });
        setAmostraErro("");
      } catch {
        if (vivo) setAmostraErro("amostra indisponível");
      } finally {
        if (vivo) setAmostraCarregando(false);
      }
    }, 450);
    return () => { vivo = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.edit_id, filtro, efeito, Math.round(playhead * 2)]);

  // libera o último blob ao sair (o effect acima só libera o anterior)
  useEffect(() => () => { if (amostraUrl) URL.revokeObjectURL(amostraUrl); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  // Prévia da trilha respeita o slider em tempo real
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.min(1, musicVolume / 100);
  }, [musicVolume, previewingTrack]);

  // Fontes reais do servidor via @font-face → a prévia desenha com a MESMA
  // fonte que o ffmpeg vai queimar. Carrega todas as que a cena usa (a legenda
  // e cada texto podem ter fontes diferentes), não só a da legenda.
  useEffect(() => {
    const querem = new Set([subFont, FONTE_PADRAO, ...fontesDaCena(doc)].filter(Boolean));
    for (const id of querem) {
      // Conta tentativas ANTES de pedir: sem isso, uma fonte que falha (id
      // fora da whitelist → 404) era re-pedida a cada tecla digitada (o doc
      // muda de identidade). Com teto de 3, uma oscilação de rede ainda se
      // recupera — desistir na 1ª falha deixaria a fonte errada até o F5.
      const tentativas = fontesPedidasRef.current.get(id) ?? 0;
      if (tentativas >= 3) continue;
      fontesPedidasRef.current.set(id, tentativas + 1);
      const face = new FontFace(`edfont-${id}`, `url(${API}/editor/fonte/${id})`);
      face.load().then((f) => {
        (document as any).fonts.add(f);
        fontesPedidasRef.current.set(id, 99);   // pronta: não pede mais
        setLoadedFonts((prev) => new Set(prev).add(id));
      }).catch(() => { /* 404 ou rede — cai na fonte padrão; re-tenta até 3x */ });
    }
  }, [subFont, doc]);


  const resetEditor = (m: EditMeta, label: string, srcUrl: string) => {
    setMeta(m);
    // preview pela CDN do Storage (inicia mais rápido); fallback = worker
    setPreviewSrc(m.preview_url || `${API}/editor/video/${m.edit_id}`);
    setSourceLabel(label);
    setSourceUrl(srcUrl || m.preview_url || "");
    clock.pause(); clock.seek(0); setResultUrl(""); setFonteExpirada(false);
    dispatch({ type: "resetSource", duration: m.duration });
    clipAudiosRef.current.forEach((el) => el.pause());
    clipAudiosRef.current.clear();
  };

  const recomecar = () => {
    if (!confirm(projectId
      ? "Descartar esta edição e excluir o projeto salvo?"
      : "Descartar esta edição e recomeçar?")) return;
    if (meta?.edit_id) {
      // limpa o arquivo de trabalho no servidor (tmp + Storage) — best-effort
      fetch(`${API}/editor/descartar/${meta.edit_id}`, { method: "DELETE" }).catch(() => {});
    }
    if (projectId != null) {
      deleteEditorProject(projectId)
        .then(() => queryClient.invalidateQueries({ queryKey: ["editor-projects"] }))
        .catch(() => toast.error("Não consegui excluir o projeto salvo — exclua pelo card Meus projetos.", { duration: 8000 }));
    }
    dirtyRef.current = false;   // edição descartada de propósito — nada a salvar
    limparEditor();
  };

  // Limpa o estado local SEM mexer no servidor/banco (base do Recomeçar e do
  // Novo projeto — o Novo preserva o projeto anterior salvo)
  const limparEditor = () => {
    sessionSeqRef.current++;
    clock.pause();
    setMeta(null); setPreviewSrc(""); setSourceLabel(""); setSourceUrl("");
    setResultUrl(""); setRenderJobId(""); setRendering(false);
    setProjectId(null); setProjectName(""); setSavedAt(""); setSaveError(false);
    setFonteExpirada(false);
    setStickerJob(null); setIaStep("");
    // duration 0 = limpa o conteúdo preservando as preferências globais
    // (música, volumes, estilo de legenda, intro) — paridade com o original
    dispatch({ type: "resetSource", duration: 0 });
    if (stickerPollRef.current) clearInterval(stickerPollRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    clipAudiosRef.current.forEach((el) => el.pause());
    clipAudiosRef.current.clear();
    localStorage.removeItem(EDITOR_STORAGE_KEY);
  };

  const novoProjeto = async () => {
    if (meta && !confirm("Começar um projeto novo? O atual continua salvo em Meus projetos.")) return;
    await flushSave();   // honra a promessa do confirm: nada dos últimos 2,5s se perde
    limparEditor();
  };

  const carregar = async (form: FormData, label: string, srcUrl = "") => {
    setLoadingSource(true);
    try {
      // Fonte expirada de um projeto salvo: o upload REANEXA a fonte (troca só
      // o vídeo, preservando cortes/legendas/stickers) — antes zerava o doc e
      // o debounce sobrescrevia o projeto no banco com a edição vazia.
      const reanexo = fonteExpirada && projectId != null && !!meta;
      if (meta?.edit_id && !reanexo) form.append("replace_edit_id", meta.edit_id);   // descarta o draft anterior
      const res = await fetch(`${API}/editor/carregar`, {
        method: "POST", body: form, headers: await videoApiAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao carregar o vídeo");
      if (reanexo) {
        // proteção: o toast pediu o MESMO arquivo — duração muito diferente
        // indica outro vídeo, e as edições ficariam fora de sincronia
        if (meta && Math.abs(data.duration - meta.duration) > 2 &&
            !confirm(`Este arquivo tem duração diferente do vídeo original do projeto (${fmt(data.duration)} vs ${fmt(meta.duration)}). Reanexar mesmo assim? Cortes, legendas e stickers podem ficar fora de sincronia.`)) {
          fetch(`${API}/editor/descartar/${data.edit_id}`, { method: "DELETE" }).catch(() => {});
          return;
        }
        setMeta(data);
        setPreviewSrc(data.preview_url || `${API}/editor/video/${data.edit_id}`);
        setSourceLabel(label);
        setSourceUrl(srcUrl || data.preview_url || "");
        setFonteExpirada(false);
        // clampa os cortes à duração da fonte re-enviada (pode diferir um pouco)
        apply((d) => ({
          segments: normalizarSegments(
            d.segments
              .map((s) => ({ ...s, end: Math.min(s.end, data.duration) }))
              .filter((s) => s.start < data.duration - 0.05 && s.end - s.start >= 0.15),
            data.duration),
        }));
        toast.success("Fonte reanexada — suas edições foram preservadas.");
      } else {
        resetEditor(data, label, srcUrl);
        toast.success("Vídeo carregado! Clique na timeline para posicionar o cursor.");
      }
    } catch (e: any) {
      toast.error(e.message, { duration: 7000 });
    } finally {
      setLoadingSource(false);
    }
  };

  // ── PiP: vídeo SOBRE o vídeo (Fase F) ─────────────────────────────────────
  // O 2º vídeo vira um draft próprio no worker (mesmo /editor/carregar do
  // principal — SEM replace_edit_id, para não descartar a fonte principal) e
  // entra como clipe no cursor. Som começa MUDO de propósito: o caso comum é
  // vídeo de reação/ilustração sobre a fala — áudio duplo estraga; ligar o som
  // é um clique no painel do clipe.
  const adicionarPip = async (form: FormData, label: string, srcUrl = "") => {
    if (!meta) return;
    setPipLoading(true);
    try {
      const res = await fetch(`${API}/editor/carregar`, {
        method: "POST", body: form, headers: await videoApiAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao carregar o vídeo");
      const dur = Math.min(5, data.duration);
      const start = Math.max(0, Math.min(playhead, meta.duration - dur));
      apply((d) => ({
        pipClips: [...d.pipClips, {
          id: newId(), edit_id: data.edit_id, name: label,
          natural_dur: data.duration, source_url: srcUrl,
          start, end: Math.min(meta.duration, start + dur),
          src_in: 0, x_pct: 0.72, y_pct: 0.22, scale_pct: 0.35,
          opacity: 1, volume: 0,
        }],
      }));
      setDialogVideo(null);
      toast.success("Vídeo sobreposto adicionado no cursor — arraste no player para posicionar. O som dele começa mudo (ajuste no painel).", { duration: 7000 });
    } catch (e: any) {
      toast.error(e.message, { duration: 7000 });
    } finally {
      setPipLoading(false);
    }
  };

  // Vídeo EMENDADO no fim (sequência): draft próprio, entra depois do vídeo
  // principal na faixa base. A prévia do trecho emendado (como a da capa de
  // entrada) chega na próxima leva — o RENDER já sai completo.
  const adicionarSeq = async (form: FormData, label: string, srcUrl = "") => {
    if (!meta) return;
    setPipLoading(true);
    try {
      const res = await fetch(`${API}/editor/carregar`, {
        method: "POST", body: form, headers: await videoApiAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao carregar o vídeo");
      apply((d) => ({
        seqClips: [...d.seqClips, {
          id: newId(), edit_id: data.edit_id, name: label,
          natural_dur: data.duration, source_url: srcUrl,
          src_in: 0, src_out: data.duration,
        }],
      }));
      setDialogVideo(null);
      toast.success("Vídeo emendado no FIM da edição — ajuste o trecho em \"Vídeos em sequência\". O render sai completo; a prévia do trecho emendado chega em breve.", { duration: 8000 });
    } catch (e: any) {
      toast.error(e.message, { duration: 7000 });
    } finally {
      setPipLoading(false);
    }
  };

  // ── projetos salvos ────────────────────────────────────────────────────────
  const abrirProjeto = async (id: number) => {
    if (loadingSource) return;
    setLoadingSource(true);
    try {
      await flushSave();   // não perde as edições dos últimos 2,5s do projeto atual
      const row = await fetchEditorProject(id);
      if (!row) throw new Error("Projeto não encontrado.");
      const snap = snapshotFromStored(row.doc);
      if (!snap?.meta?.edit_id) {
        toast.error("Este projeto está vazio ou corrompido.");
        return;
      }
      restoredRef.current = true;
      aplicarSnapshot(snap, { projectId: row.id, projectName: row.name });
      // Música/sticker/áudio/logo de projeto salvo NÃO expiram mais: a limpeza
      // do worker preserva o que estiver referenciado (RPC editor_media_in_use).
      // O VÍDEO continua expirando por idade — é grande — e é recarregado logo
      // abaixo.
      // O draft do vídeo expira no servidor (24-48h). Se morreu e temos a URL
      // da fonte, recarrega sozinho preservando a edição.
      const head = await fetch(`${API}/editor/video/${snap.meta.edit_id}`, { method: "HEAD" }).catch(() => null);
      if (head && head.status === 404) {
        if (snap.sourceUrl) {
          toast.info("O vídeo deste projeto expirou no servidor — recarregando a fonte...", { duration: 6000 });
          await recarregarFonte(snap.sourceUrl);
        } else {
          setFonteExpirada(true);
          toast.error("O vídeo deste projeto expirou no servidor — envie o MESMO arquivo de novo pela Biblioteca que as edições serão reaproveitadas.", { duration: 10000 });
        }
      } else {
        toast.success(`Projeto "${row.name}" aberto.`);
      }
    } catch (e: any) {
      toast.error(e.message, { duration: 7000 });
    } finally {
      setLoadingSource(false);
    }
  };

  // Re-baixa a MESMA fonte preservando o doc (novo edit_id no servidor)
  const recarregarFonte = async (videoUrl: string) => {
    try {
      const fd = new FormData();
      fd.append("video_url", videoUrl);
      const res = await fetch(`${API}/editor/carregar`, {
        method: "POST", body: fd, headers: await videoApiAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "não consegui baixar a fonte");
      setMeta(data);
      setPreviewSrc(data.preview_url || `${API}/editor/video/${data.edit_id}`);
      // draft antigo morreu; se a fonte era o próprio draft, aponta pro novo
      setSourceUrl(videoUrl.includes("editor-drafts") ? (data.preview_url || "") : videoUrl);
      toast.success("Fonte recarregada — o projeto continua de onde parou.");
    } catch (e: any) {
      setFonteExpirada(true);
      toast.error(`O vídeo deste projeto expirou e não consegui recarregar (${e.message}) — envie o MESMO arquivo de novo pela Biblioteca que as edições serão reaproveitadas.`, { duration: 10000 });
    }
  };

  const excluirProjeto = async (id: number, name: string) => {
    if (!confirm(`Excluir o projeto "${name}"?`)) return;
    try {
      await deleteEditorProject(id);
      queryClient.invalidateQueries({ queryKey: ["editor-projects"] });
      if (id === projectId) limparEditor();
      toast.success("Projeto excluído.");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── relógio mestre da prévia (Fase C do multi-track) ──────────────────────
  // O tempo vive no relógio (rAF), não mais no <video>: o vídeo é uma FONTE
  // COMANDADA (playbackRate + seek quando desvia >0,15s). É o motor que rege
  // N fontes nas próximas fases — e já deixa o cursor/karaokê/sticker fluidos
  // (60fps vs o intervalo de 120ms de antes).
  const clock = usePreviewClock({
    videoRef,
    duration: meta?.duration ?? 0,
    segments,
    previewEdit,
    onTick: setPlayhead,
  });
  const [previewVol, setPreviewVol] = useState(1);
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.volume = previewVol;
  }, [previewVol, previewSrc]);

  // ── timeline ───────────────────────────────────────────────────────────────
  const seekTo = (t: number) => clock.seek(t);
  // barra "Adicionar" da timeline → rola até a seção que cria aquele conteúdo
  const irParaSecao = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });

  // Faixas ocultas (olhinho): a prévia lê o doc EFETIVO — o que você vê é o
  // que o render vai fazer (o buildRenderPayload aplica o MESMO filtro)
  const docPrevia = useMemo(() => aplicarFaixasOcultas(doc), [doc]);
  const faixaOculta = (k: string) => !!doc.trackFlags?.[k]?.hidden;
  const alternarFaixa = (k: string) =>
    patch({ trackFlags: { ...doc.trackFlags, [k]: { hidden: !faixaOculta(k) } } });
  const olhoFaixa = (k: string) => (
    <button type="button" className="ml-auto opacity-70 hover:opacity-100 shrink-0"
      title={faixaOculta(k) ? "Mostrar a faixa (volta pra prévia e pro render)" : "Ocultar a faixa (sai da prévia E do render)"}
      onClick={() => alternarFaixa(k)}>
      {faixaOculta(k) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
    </button>
  );
  const posFromEvent = (clientX: number) => {
    if (!timelineRef.current || !meta) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * meta.duration;
  };
  const onTimelineDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    seekTo(posFromEvent(e.clientX));
  };

  // ── snap magnético (Fase 1) ────────────────────────────────────────────────
  // Pontos onde os blocos "grudam": início/fim do vídeo, cursor e as bordas de
  // todo mundo — é o que evita a fresta de 0,1s entre um corte e um sticker.
  // Cada ponto carrega o DONO: quem está sendo arrastado se exclui por
  // identidade, nunca por valor — o valor do item vira igual ao do alvo assim
  // que ele gruda, e excluir por valor mataria o alvo junto (o bloco desgrudava
  // no frame seguinte e o corte oscilava).
  const snapPoints = useMemo(() => {
    if (!meta) return [] as { t: number; dono: string }[];
    const pts = [
      { t: 0, dono: "fix" }, { t: meta.duration, dono: "fix" }, { t: playhead, dono: "fix" },
    ];
    segments.forEach((s, i) => {
      pts.push({ t: s.start, dono: `seg${i}` }, { t: s.end, dono: `seg${i}` });
    });
    for (const s of stickers) pts.push({ t: s.start, dono: `stk${s.id}` }, { t: s.end, dono: `stk${s.id}` });
    for (const c of audioClips) pts.push({ t: c.start, dono: `aud${c.id}` }, { t: c.end, dono: `aud${c.id}` });
    for (const t of titles) pts.push({ t: t.start, dono: `tit${t.id}` }, { t: t.end, dono: `tit${t.id}` });
    if (subsOn) cues.forEach((c, i) =>
      pts.push({ t: c.start, dono: `cue${i}` }, { t: c.end, dono: `cue${i}` }));
    for (const p of pipClips) pts.push({ t: p.start, dono: `pip${p.id}` }, { t: p.end, dono: `pip${p.id}` });
    return pts;
  }, [meta, playhead, segments, stickers, audioClips, titles, cues, subsOn, pipClips]);

  /** Cola `t` no ponto notável mais próximo (tolerância de 8px, convertida para
   *  segundos pela escala atual — no zoom a régua fica mais fina, então a
   *  tolerância em TEMPO diminui junto). `donos` = quem não conta (o próprio
   *  item arrastado). PURA de propósito: é chamada de handlers de arrasto, e
   *  quem mexe no estado é o chamador. guide != null indica que GRUDOU. */
  const calcSnap = (t: number, donos: string[] = []): { t: number; guide: number | null } => {
    if (!snapOn || !meta || !timelineRef.current) return { t, guide: null };
    const largura = timelineRef.current.getBoundingClientRect().width || 1;
    const tol = (8 / largura) * meta.duration;
    let melhor = t, dist = tol;
    for (const p of snapPoints) {
      if (donos.includes(p.dono)) continue;
      const d = Math.abs(p.t - t);
      if (d < dist) { dist = d; melhor = p.t; }
    }
    return { t: melhor, guide: dist < tol ? melhor : null };
  };

  // ── arrastar a FRONTEIRA entre dois trechos (Fase 1) ──────────────────────
  // Só existem fronteiras internas: os trechos são uma partição contígua de
  // [0, duração], então mover a borda de um move a do vizinho junto — nunca
  // abre buraco nem sobrepõe.
  const onBorderDown = (e: React.PointerEvent, segId: number) => {
    e.stopPropagation();
    e.preventDefault();
    checkpoint();
    // guarda o ID, não o índice: o poll do corte por IA pode reconstruir os
    // trechos no meio do arrasto e o índice passaria a apontar outro corte
    segDragRef.current = { segId };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onBorderMove = (e: React.PointerEvent) => {
    const d = segDragRef.current;
    if (!d || !meta) return;
    // se o nó remontou no meio do gesto, o pointer capture se perde e o "up"
    // nunca chega — sem isso, passar o mouse por cima já movia o corte
    if (e.buttons === 0) { onBorderUp(); return; }
    const i = segments.findIndex((s) => s.id === d.segId);
    if (i < 0 || i >= segments.length - 1) return;
    const { t, guide } = calcSnap(posFromEvent(e.clientX), [`seg${i}`, `seg${i + 1}`]);
    setSnapGuide(guide);
    applyLive((doc) => {
      const segs = [...doc.segments];
      const j = segs.findIndex((s) => s.id === d.segId);
      const cur = segs[j], prox = segs[j + 1];
      if (!cur || !prox) return {};
      const nt = Math.max(cur.start + 0.2, Math.min(prox.end - 0.2, t));
      segs[j] = { ...cur, end: nt };
      segs[j + 1] = { ...prox, start: nt };
      return { segments: segs };
    });
  };
  const onBorderUp = () => { segDragRef.current = null; setSnapGuide(null); };

  // ── régua (Fase 1) ─────────────────────────────────────────────────────────
  // Passo que mantém ~8 marcas visíveis em qualquer zoom (0:00, 0:05, 0:10...)
  const rulerStep = useMemo(() => {
    if (!meta?.duration) return 5;
    const visivel = meta.duration / zoom;
    const alvo = visivel / 8;
    return [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => s >= alvo) ?? 600;
  }, [meta?.duration, zoom]);
  const rulerMarks = useMemo(() => {
    if (!meta?.duration) return [] as number[];
    const m: number[] = [];
    for (let t = 0; t <= meta.duration + 1e-6; t += rulerStep) m.push(Number(t.toFixed(3)));
    return m;
  }, [meta?.duration, rulerStep]);
  const rotuloRegua = (t: number) => {
    const mm = Math.floor(t / 60);
    const ss = t - mm * 60;
    return rulerStep < 1 ? `${mm}:${ss.toFixed(1).padStart(4, "0")}`
                         : `${mm}:${String(Math.round(ss)).padStart(2, "0")}`;
  };

  // Zoom também AMPLIA a fita na VERTICAL: miniaturas maiores = zoom de verdade,
  // não só mais quadros na horizontal (Carlos: "o aumento vertical não está
  // sendo aplicado"). Os overlays (cortes/playhead/alças) são absolute inset-0
  // em %, então acompanham qualquer altura.
  const alturaFita = zoom <= 1 ? 64 : zoom <= 2 ? 96 : zoom <= 4 ? 128 : zoom <= 8 ? 144 : 192;

  // Zoom mantém o CURSOR no lugar (é o que a pessoa está olhando)
  const aplicarZoom = (novo: number) => {
    const z = Math.max(1, Math.min(16, novo));
    setZoom(z);
    requestAnimationFrame(() => {
      const box = scrollRef.current;
      if (!box || !meta?.duration) return;
      const alvo = (playhead / meta.duration) * box.scrollWidth;
      box.scrollLeft = Math.max(0, alvo - box.clientWidth / 2);
    });
  };

  // Com zoom, o playhead sai da área visível durante o play — acompanha
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || zoom === 1 || !meta?.duration) return;
    if (!clock.playing) return;
    const x = (playhead / meta.duration) * box.scrollWidth;
    if (x < box.scrollLeft + 40 || x > box.scrollLeft + box.clientWidth - 40) {
      box.scrollLeft = Math.max(0, x - box.clientWidth / 2);
    }
  }, [playhead, zoom, meta?.duration]);
  useEffect(() => {
    const move = (e: MouseEvent) => { if (draggingRef.current) seekTo(posFromEvent(e.clientX)); };
    const up = () => { draggingRef.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.duration]);

  // (a prévia da edição — pular removidos + velocidade por trecho — vive no
  // relógio mestre: avancarPlayhead em editor/previewClock.ts)

  const splitAtPlayhead = () => {
    if (!meta) return;
    const seg = segments.find((s) => playhead > s.start + 0.2 && playhead < s.end - 0.2);
    if (!seg) { toast.info("Posicione o cursor DENTRO de um trecho para dividir."); return; }
    apply((d) => {
      const next: Segment[] = [];
      let nid = Math.max(...d.segments.map((p) => p.id)) + 1;
      for (const s of d.segments) {
        if (s.id === seg.id) {
          next.push({ ...s, end: playhead });
          next.push({ id: nid++, start: playhead, end: s.end, keep: s.keep, speed: s.speed });
        } else next.push(s);
      }
      return { segments: next };
    });
  };

  const toggleSegment = (id: number) => {
    apply((d) => ({
      segments: d.segments.map((s) => (s.id === id ? { ...s, keep: !s.keep } : s)),
    }));
  };

  // Caixinha FIXA (Carlos 06/07): remove o intervalo [a,b] digitado, dividindo
  // os trechos que ele atravessa — não depende de onde o cursor está.
  const cortarIntervalo = () => {
    if (!meta) return;
    const a = parseTime(cutStart);
    const b = parseTime(cutEnd);
    if (a === null || b === null || b <= a) {
      toast.error("Tempos inválidos — use mm:ss (ex.: 1:56 a 1:59).");
      return;
    }
    const ca = Math.max(0, a), cb = Math.min(meta.duration, b);
    if (cb - ca < 0.15) { toast.error("Intervalo pequeno demais."); return; }
    apply((d) => {
      const next: Segment[] = [];
      let nid = Math.max(0, ...d.segments.map((p) => p.id)) + 1;
      for (const s of d.segments) {
        if (s.end <= ca || s.start >= cb) { next.push(s); continue; }
        if (s.start < ca) next.push({ id: nid++, start: s.start, end: ca, keep: s.keep, speed: s.speed });
        next.push({ id: nid++, start: Math.max(s.start, ca), end: Math.min(s.end, cb), keep: false });
        if (s.end > cb) next.push({ id: nid++, start: cb, end: s.end, keep: s.keep, speed: s.speed });
      }
      // descartar as sobras curtas abria buraco na partição — normalizar
      // devolve a região como trecho removido
      return { segments: normalizarSegments(next.filter((s) => s.end - s.start >= 0.15), meta.duration) };
    });
    setCutStart(""); setCutEnd("");
    toast.success(`Trecho ${fmt(ca)}–${fmt(cb)} removido — veja na timeline (dá pra restaurar).`);
  };

  const activeSeg = useMemo(
    () => segments.find((s) => playhead >= s.start && playhead <= s.end) ?? null,
    [segments, playhead],
  );
  useEffect(() => {
    if (activeSeg) { setStartField(fmt(activeSeg.start)); setEndField(fmt(activeSeg.end)); }
  }, [activeSeg?.id, activeSeg?.start, activeSeg?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyBound = (which: "start" | "end", value: number | null) => {
    if (!activeSeg || !meta || value === null) { toast.error("Tempo inválido — use mm:ss (ex.: 1:23.5)"); return; }
    const v = Math.max(0, Math.min(meta.duration, value));
    // Encolher um trecho NÃO apaga a região: a sobra vira trecho REMOVIDO
    // (restaurável na timeline) — antes ela sumia sem volta (bug do Carlos:
    // "reverto e só volta o último corte"). Esticar come o vizinho, e
    // normalizarSegments garante a partição nos dois casos.
    apply((d) => {
      const next: Segment[] = [];
      let nid = Math.max(0, ...d.segments.map((p) => p.id)) + 1;
      for (const s of d.segments) {
        if (s.id !== activeSeg.id) { next.push(s); continue; }
        if (which === "start") {
          const ns = Math.min(v, s.end - 0.2);
          if (ns > s.start + 0.15) next.push({ id: nid++, start: s.start, end: ns, keep: false });
          next.push({ ...s, start: ns });
        } else {
          const ne = Math.max(v, s.start + 0.2);
          next.push({ ...s, end: ne });
          if (ne < s.end - 0.15) next.push({ id: nid++, start: ne, end: s.end, keep: false });
        }
      }
      return { segments: normalizarSegments(next, meta.duration) };
    });
  };

  const keepSegments = segments.filter((s) => s.keep);
  // duração REAL: câmera lenta (0,5×) dobra o tempo do trecho, acelerado
  // encurta; vídeos EMENDADOS no fim somam (o desconto do crossfade por
  // emenda é pequeno e o contador histórico nunca o considerou)
  const seqDur = seqClips.reduce((a, c) => a + Math.max(0, c.src_out - c.src_in), 0);
  const finalDuration = keepSegments.reduce((a, s) => a + (s.end - s.start) / (s.speed ?? 1), 0) + seqDur;

  // ── cortar com IA ──────────────────────────────────────────────────────────
  const applyAiSegments = (keeps: { start: number; end: number }[]) => {
    if (!meta || !keeps.length) return;
    apply((d) => {
      const segs: Segment[] = [];
      // ids ACIMA dos atuais: renumerar a partir de 1 colidia com os ids
      // antigos e, se este poll chegasse no meio de um arrasto de fronteira,
      // o gesto continuava — em outro corte (o id "existia", mas era outro)
      let id = Math.max(0, ...d.segments.map((p) => p.id)) + 1;
      let cursor = 0;
      for (const k of keeps) {
        const s = Math.max(0, k.start), e = Math.min(meta.duration, k.end);
        if (s > cursor + 0.05) segs.push({ id: id++, start: cursor, end: s, keep: false });
        segs.push({ id: id++, start: s, end: e, keep: true });
        cursor = e;
      }
      if (cursor < meta.duration - 0.05) segs.push({ id: id++, start: cursor, end: meta.duration, keep: false });
      return { segments: normalizarSegments(segs, meta.duration) };
    });
  };

  const cortarComIA = async () => {
    if (!meta || !professional?.slug) return;
    setAiCutting(true);
    try {
      const res = await fetch(`${API}/editor/cortar-ia`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await videoApiAuthHeaders()) },
        body: JSON.stringify({ professional_slug: professional.slug, edit_id: meta.edit_id, instrucoes: aiCutText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha no corte por IA");
      const timer = setInterval(async () => {
        try {
          const st = await (await fetch(`${API}/status/${data.job_id}`)).json();
          if (st.status === "done") {
            clearInterval(timer); setAiCutting(false);
            applyAiSegments(st.keep_segments || []);
            toast.success(`A IA marcou ${(st.keep_segments || []).length} trechos para manter — dê play na prévia e ajuste o que quiser.`, { duration: 8000 });
          } else if (st.status === "error") {
            clearInterval(timer); setAiCutting(false);
            toast.error(st.message || "O corte por IA falhou", { duration: 8000 });
          }
        } catch { /* transitório */ }
      }, 3000);
    } catch (e: any) {
      setAiCutting(false);
      toast.error(e.message, { duration: 8000 });
    }
  };

  // ── música ─────────────────────────────────────────────────────────────────
  const previewTrack = (id: string) => {
    if (!audioRef.current) return;
    if (previewingTrack === id) { audioRef.current.pause(); setPreviewingTrack(""); return; }
    audioRef.current.src = `${API}/editor/musica/${id}`;
    audioRef.current.volume = Math.min(1, musicVolume / 100);
    audioRef.current.play().catch(() => {});
    setPreviewingTrack(id);
  };
  const uploadMusica = async (file: File) => {
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/editor/carregar-musica`, {
        method: "POST", body: form, headers: await videoApiAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao enviar a música");
      patch({ musicUploadId: data.music_upload_id, musicUploadName: file.name, musicId: "" });
      toast.success("Música carregada!");
    } catch (e: any) { toast.error(e.message); }
  };

  // ── stickers e clipes de áudio ─────────────────────────────────────────────
  const uploadSticker = async (file: File) => {
    if (!meta) return;
    setUploadingSticker(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/editor/carregar-sticker`, {
        method: "POST", body: form, headers: await videoApiAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao enviar o sticker");
      const start = Math.min(playhead, Math.max(0, meta.duration - 1));
      const dur = data.animated && data.duration > 0.5 ? Math.max(2, data.duration) : 4;
      const sid = newId();
      apply((d) => ({
        stickers: [...d.stickers, {
          id: sid, upload_id: data.sticker_upload_id, name: file.name,
          animated: !!data.animated, natural_dur: data.duration || 0,
          start, end: Math.min(meta.duration, start + dur),
          x_pct: 0.84, y_pct: 0.76, scale_pct: 0.22,
          movement: "none" as StickerMovement, loop: true, flip: false,
        }],
      }));
      toast.success("Sticker adicionado a partir do cursor — arraste-o no player para posicionar.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploadingSticker(false);
    }
  };

  const uploadClip = async (file: File) => {
    if (!meta) return;
    setUploadingClip(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/editor/carregar-musica`, {
        method: "POST", body: form, headers: await videoApiAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao enviar o áudio");
      const start = Math.min(playhead, Math.max(0, meta.duration - 1));
      const nat = Number(data.duration) || 5;
      const cid = newId();
      apply((d) => ({
        audioClips: [...d.audioClips, {
          id: cid, upload_id: data.music_upload_id, name: file.name,
          natural_dur: nat, start,
          end: Math.min(meta.duration, start + nat), volume: 1,
        }],
      }));
      toast.success("Áudio adicionado a partir do cursor — mova/estique o bloco azul na timeline.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploadingClip(false);
    }
  };

  // ── duplicar (quick win 14/07) ─────────────────────────────────────────────
  // Clona o item logo DEPOIS do original (ou no cursor, se houver espaço lá),
  // sem passar pelo servidor: o upload_id é o mesmo arquivo.
  const proximoSlot = (item: { start: number; end: number }) => {
    const len = item.end - item.start;
    const dur = meta?.duration ?? 0;
    const slot = (start: number) => ({
      start: Math.max(0, start), end: Math.min(dur, Math.max(0, start) + len),
    });
    // 1) no cursor, se ele estiver fora do item e a cópia couber
    if (playhead > item.end - 0.05 && playhead + len <= dur) return slot(playhead);
    // 2) logo depois do original
    if (item.end + len <= dur) return slot(item.end);
    // 3) logo antes (item colado no fim do vídeo — caso comum: quem adiciona
    //    perto do fim ganha end == duração, e "depois" não cabe)
    if (item.start - len >= 0) return slot(item.start - len);
    // 4) não cabe inteiro em lugar nenhum: encosta no fim, deslocado do
    //    original — cópia em cima do original parece "não aconteceu nada"
    //    (e, em áudio, tocaria dobrado)
    return slot(Math.min(Math.max(0, dur - len), item.start + Math.max(0.3, len / 2)));
  };

  const duplicarSticker = (id: string) => {
    const s = stickers.find((x) => x.id === id);
    if (!s || !meta) return;
    const nid = newId();
    apply((d) => {
      const orig = d.stickers.find((x) => x.id === id);
      if (!orig) return {};
      const i = d.stickers.findIndex((x) => x.id === id);
      const copia = { ...orig, id: nid, ...proximoSlot(orig) };
      const next = [...d.stickers];
      next.splice(i + 1, 0, copia);
      return { stickers: next };
    });
    toast.success("Sticker duplicado — mova o novo bloco na faixa roxa.");
  };

  const duplicarPip = (id: string) => {
    const p = pipClips.find((x) => x.id === id);
    if (!p || !meta) return;
    const nid = newId();
    apply((d) => {
      const orig = d.pipClips.find((x) => x.id === id);
      if (!orig) return {};
      const i = d.pipClips.findIndex((x) => x.id === id);
      const copia = { ...orig, id: nid, ...proximoSlot(orig) };
      const next = [...d.pipClips];
      next.splice(i + 1, 0, copia);
      return { pipClips: next };
    });
    toast.success("Vídeo sobreposto duplicado — mova o novo bloco na faixa rosa.");
  };

  const duplicarClip = (id: string) => {
    const c = audioClips.find((x) => x.id === id);
    if (!c || !meta) return;
    const nid = newId();
    apply((d) => {
      const orig = d.audioClips.find((x) => x.id === id);
      if (!orig) return {};
      const i = d.audioClips.findIndex((x) => x.id === id);
      const copia = { ...orig, id: nid, ...proximoSlot(orig) };
      const next = [...d.audioClips];
      next.splice(i + 1, 0, copia);
      return { audioClips: next };
    });
    toast.success("Áudio duplicado — mova o novo bloco na faixa azul.");
  };

  const duplicarTexto = (id: string) => {
    const t = titles.find((x) => x.id === id);
    if (!t || !meta) return;
    const nid = newId();
    apply((d) => {
      const orig = d.titles.find((x) => x.id === id);
      if (!orig) return {};
      const i = d.titles.findIndex((x) => x.id === id);
      const copia = { ...orig, id: nid, ...proximoSlot(orig) };
      const next = [...d.titles];
      next.splice(i + 1, 0, copia);
      return { titles: next };
    });
    toast.success("Texto duplicado — ajuste o tempo e o conteúdo da cópia.");
  };

  // Leva o item para o cursor preservando a duração (mesma regra dos stickers)
  const paraOCursor = <T extends { start: number; end: number }>(item: T): T => {
    if (!meta) return item;
    const len = item.end - item.start;
    const ns = Math.max(0, Math.min(meta.duration - len, playhead));
    return { ...item, start: ns, end: ns + len };
  };

  // ── voice over: gravar narração aqui mesmo (spec 10) ──────────────────────
  // A gravação vira um clipe de áudio comum: entra no cursor, aparece na faixa
  // azul e pode ser movida/esticada como qualquer outra. Sem tela nova, sem
  // fluxo novo — só reusa o que já existe.
  const gravarNarracao = async () => {
    if (gravando) {                       // 2º clique = parar
      mediaRecRef.current?.stop();
      return;
    }
    if (!meta) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const rec = new MediaRecorder(stream);
      const pedacos: Blob[] = [];
      const inicio = playhead;            // congela: o cursor anda se der play
      rec.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        setGravSegs(0);
        if (gravTimerRef.current) clearInterval(gravTimerRef.current);
        const blob = new Blob(pedacos, { type: "audio/webm" });
        if (blob.size < 1200) {           // clique sem fala
          toast.info("Gravação muito curta — nada foi adicionado.");
          return;
        }
        setUploadingClip(true);
        try {
          const form = new FormData();
          form.append("file", blob, `narracao-${Date.now()}.webm`);
          const res = await fetch(`${API}/editor/carregar-musica`, {
            method: "POST", body: form, headers: await videoApiAuthHeaders(),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || "Falha ao enviar a narração");
          const nat = Number(data.duration) || 1;
          const cid = newId();
          apply((d) => ({
            audioClips: [...d.audioClips, {
              id: cid, upload_id: data.music_upload_id,
              name: `🎙 Narração ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
              natural_dur: nat, start: inicio,
              end: Math.min(meta.duration, inicio + nat), volume: 1,
            }],
          }));
          toast.success("Narração gravada e posta na timeline — mova o bloco azul se quiser.");
        } catch (e: any) {
          toast.error(e.message, { duration: 8000 });
        } finally {
          setUploadingClip(false);
        }
      };
      mediaRecRef.current = rec;
      rec.start();
      setGravando(true);
      setGravSegs(0);
      gravTimerRef.current = setInterval(() => setGravSegs((s) => s + 1), 1000);
    } catch {
      toast.error("Não consegui acessar o microfone — verifique a permissão do navegador.", { duration: 9000 });
    }
  };

  // sair da tela no meio da gravação não pode deixar o microfone ligado
  useEffect(() => () => {
    if (mediaRecRef.current?.state === "recording") mediaRecRef.current.stop();
    if (gravTimerRef.current) clearInterval(gravTimerRef.current);
  }, []);

  // tour de boas-vindas na primeira vez no editor
  useEffect(() => { if (onboardingPendente()) setTourAberto(true); }, []);

  const gerarStickerIA = async () => {
    if (!meta || !professional?.slug || !iaDesc.trim() || stickerJob) return;
    setIaStep("Enviando o pedido...");
    try {
      const res = await fetch(`${API}/editor/gerar-sticker`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await videoApiAuthHeaders()) },
        body: JSON.stringify({
          professional_slug: professional.slug,
          descricao: iaDesc.trim(),
          duracao: iaDur,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao gerar o sticker");
      const job: StickerJob = { job_id: data.job_id, at: playhead, desc: iaDesc.trim() };
      setStickerJob(job);   // persiste → sair e voltar retoma o acompanhamento
      pollStickerJob(job);
    } catch (e: any) {
      setIaStep("");
      toast.error(e.message, { duration: 8000 });
    }
  };

  // Arrasto dos blocos nas FAIXAS da timeline (mover = mudar início;
  // borda direita = esticar/encurtar). Pointer capture → sem listeners globais.
  // checkpoint() no início: o gesto INTEIRO vira 1 passo de Desfazer.
  // "cue" = legenda na timeline (id = ÍNDICE em doc.cues — cue não tem id
  // próprio; o índice é estável durante o gesto, o array não reordena no drag)
  const onTrackDown = (e: React.PointerEvent, kind: "sticker" | "audio" | "title" | "cue" | "pip", id: string, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    const item = kind === "sticker" ? stickers.find((s) => s.id === id)
      : kind === "audio" ? audioClips.find((c) => c.id === id)
      : kind === "cue" ? cues[Number(id)]
      : kind === "pip" ? pipClips.find((p) => p.id === id)
      : titles.find((t) => t.id === id);
    if (!item || !meta) return;
    checkpoint();
    trackDragRef.current = { kind, id, mode, grab: posFromEvent(e.clientX) - item.start };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onTrackMove = (e: React.PointerEvent) => {
    const d = trackDragRef.current;
    if (!d || !meta) return;
    if (e.buttons === 0) { onTrackUp(); return; }   // gesto perdido (nó remontou)
    const item = d.kind === "sticker" ? stickers.find((s) => s.id === d.id)
      : d.kind === "audio" ? audioClips.find((c) => c.id === d.id)
      : d.kind === "cue" ? cues[Number(d.id)]
      : d.kind === "pip" ? pipClips.find((p) => p.id === d.id)
      : titles.find((t) => t.id === d.id);
    if (!item) return;
    const t = posFromEvent(e.clientX);
    // snap calculado FORA do reducer (o updater precisa ser puro); o próprio
    // item sai por IDENTIDADE — por valor ele se auto-excluiria ao grudar
    const eu = [`${d.kind === "sticker" ? "stk" : d.kind === "audio" ? "aud" : d.kind === "cue" ? "cue" : d.kind === "pip" ? "pip" : "tit"}${d.id}`];
    let novo: { start: number; end: number };
    let guide: number | null = null;
    if (d.mode === "move") {
      const len = item.end - item.start;
      const bruto = Math.max(0, Math.min(meta.duration - len, t - d.grab));
      // tenta grudar pelas DUAS bordas: vale a que GRUDOU (guide != null) —
      // comparar deslocamento fazia a borda que não grudou (deslocamento 0)
      // ganhar sempre, e o encaixe nunca acontecia
      const ini = calcSnap(bruto, eu);
      const fim = calcSnap(bruto + len, eu);
      let ns = bruto;
      if (ini.guide !== null && fim.guide !== null) {
        const usaIni = Math.abs(ini.t - bruto) <= Math.abs(fim.t - (bruto + len));
        ns = usaIni ? ini.t : fim.t - len;
        guide = usaIni ? ini.guide : fim.guide;
      } else if (ini.guide !== null) { ns = ini.t; guide = ini.guide; }
      else if (fim.guide !== null) { ns = fim.t - len; guide = fim.guide; }
      const preso = Math.max(0, Math.min(meta.duration - len, ns));
      // bloco encostado na borda do vídeo: o clamp desfaz o encaixe — a guia
      // não pode acender apontando um encaixe que não aconteceu
      if (Math.abs(preso - ns) > 1e-6) guide = null;
      ns = preso;
      novo = { start: ns, end: ns + len };
    } else {
      const r = calcSnap(t, eu);
      let ne = Math.max(item.start + 0.3, Math.min(meta.duration, r.t));
      // áudio/PiP não esticam além do arquivo; sticker/texto podem (loop/tela)
      const nat = (item as { natural_dur?: number }).natural_dur;
      if (d.kind === "audio") ne = Math.min(ne, item.start + (nat || 9999));
      if (d.kind === "pip") {
        const offset = (item as { src_in?: number }).src_in || 0;
        ne = Math.min(ne, item.start + Math.max(0.3, (nat || 9999) - offset));
      }
      guide = Math.abs(ne - r.t) < 1e-6 ? r.guide : null;   // clamp desfez o snap
      novo = { start: item.start, end: ne };
    }
    setSnapGuide(guide);
    if (d.kind === "sticker") applyLive((dd) => ({ stickers: dd.stickers.map((s) => (s.id === d.id ? { ...s, ...novo } : s)) }));
    else if (d.kind === "audio") applyLive((dd) => ({ audioClips: dd.audioClips.map((c) => (c.id === d.id ? { ...c, ...novo } : c)) }));
    else if (d.kind === "pip") applyLive((dd) => ({ pipClips: dd.pipClips.map((p) => (p.id === d.id ? { ...p, ...novo } : p)) }));
    else if (d.kind === "cue") {
      const idx = Number(d.id);
      applyLive((dd) => {
        const cue = dd.cues[idx];
        if (!cue) return {};
        // mover a legenda LEVA as palavras do karaokê junto (são tempos
        // absolutos — sem o shift, o \k dessincronizaria da caixa arrastada)
        const delta = novo.start - cue.start;
        return {
          cues: dd.cues.map((c, i) => (i === idx ? { ...c, ...novo } : c)),
          words: d.mode === "move" && Math.abs(delta) > 1e-6
            ? dd.words.map((w) => (
                w.start >= cue.start - 0.01 && w.end <= cue.end + 0.01
                  ? { ...w, start: w.start + delta, end: w.end + delta }
                  : w))
            : dd.words,
        };
      });
    }
    else applyLive((dd) => ({ titles: dd.titles.map((x) => (x.id === d.id ? { ...x, ...novo } : x)) }));
  };
  const onTrackUp = () => { trackDragRef.current = null; setSnapGuide(null); };

  // Arrasto do sticker DENTRO do player (posicionamento visual)
  const onStickerPreviewDown = (e: React.PointerEvent, id: string) => {
    const st = stickers.find((x) => x.id === id);
    if (!st || st.movement !== "none") return;
    e.preventDefault();
    e.stopPropagation();
    checkpoint();
    stickerDragRef.current = id;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onStickerPreviewMove = (e: React.PointerEvent) => {
    const id = stickerDragRef.current;
    if (id === null || !videoWrapRef.current || !contentRect) return;
    const rect = videoWrapRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - contentRect.left) / contentRect.w;
    const y = (e.clientY - rect.top - contentRect.top) / contentRect.h;
    applyLive((d) => ({
      stickers: d.stickers.map((s) => (s.id === id
        ? { ...s, x_pct: Math.max(0, Math.min(1, x)), y_pct: Math.max(0, Math.min(1, y)) }
        : s)),
    }));
  };
  const onStickerPreviewUp = () => { stickerDragRef.current = null; };

  // Arrasto do PiP DENTRO do player (posicionamento visual, como o sticker)
  const onPipPreviewDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    checkpoint();
    pipDragRef.current = id;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPipPreviewMove = (e: React.PointerEvent) => {
    const id = pipDragRef.current;
    if (id === null || !videoWrapRef.current || !contentRect) return;
    const rect = videoWrapRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - contentRect.left) / contentRect.w;
    const y = (e.clientY - rect.top - contentRect.top) / contentRect.h;
    applyLive((d) => ({
      pipClips: d.pipClips.map((p) => (p.id === id
        ? { ...p, x_pct: Math.max(0, Math.min(1, x)), y_pct: Math.max(0, Math.min(1, y)) }
        : p)),
    }));
  };
  const onPipPreviewUp = () => { pipDragRef.current = null; };

  // meta acessível em callbacks de polling (não pode ler state velho)
  useEffect(() => { metaRef.current = meta; }, [meta]);

  // Medida do player → retângulo REAL do vídeo (object-fit: contain) para a
  // prévia sobreposta cair exatamente onde o ffmpeg vai desenhar
  useEffect(() => {
    const el = videoWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVideoBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setVideoBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [meta]);
  const contentRect = useMemo(() => {
    if (!meta || !videoBox.w || !videoBox.h || !meta.width || !meta.height) return null;
    const arV = meta.width / meta.height;
    const arB = videoBox.w / videoBox.h;
    const w = arB > arV ? videoBox.h * arV : videoBox.w;
    const h = arB > arV ? videoBox.h : videoBox.w / arV;
    return { left: (videoBox.w - w) / 2, top: (videoBox.h - h) / 2, w, h };
  }, [meta, videoBox]);

  // ── prévia em tempo real de legendas/textos/selos (Fase 2) ────────────────
  // Desenha no canvas sobre o player o que o ffmpeg desenharia em `playhead`.
  // Os stickers seguem em DOM (por baixo) para continuarem arrastáveis — a
  // ordem bate com o motor: stickers → selos → legendas/textos.
  useEffect(() => {
    const cv = overlayRef.current;
    if (!cv || !contentRect) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(contentRect.w));
    const h = Math.max(1, Math.round(contentRect.h));
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // meta.height: o selo é dimensionado em px de VÍDEO (o PIL clampa lá).
    // docPrevia: faixas ocultas pelo olhinho não são desenhadas
    drawScene(ctx, evaluateScene(docPrevia, playhead), { w, h }, loadedFonts, meta?.height || h);
  }, [docPrevia, playhead, contentRect, loadedFonts, meta?.height]);

  // (o playhead fluido vem do relógio mestre a ~60fps — o setInterval de
  // 120ms que existia aqui morreu com o clock da Fase C)

  // Prévia dos clipes de áudio: toca cada clipe na janela dele, no ponto certo
  useEffect(() => {
    const playing = clock.playing;
    for (const c of audioClips) {
      let el = clipAudiosRef.current.get(c.id);
      const active = playing && !faixaOculta("audio") && playhead >= c.start && playhead < c.end;
      if (active) {
        if (!el) {
          el = new Audio(`${API}/editor/audio/${c.upload_id}`);
          clipAudiosRef.current.set(c.id, el);
        }
        el.volume = Math.max(0, Math.min(1, c.volume));
        // o playhead (relógio da timeline original) avança na VELOCIDADE do
        // trecho, mas o clipe toca natural no render. Na prévia, o áudio segue
        // o mesmo ritmo do playhead pra não gaguejar (re-seek constante); soar
        // um pouco lento na câmera lenta é aceitável, travar não é.
        const spSeg = previewEdit
          ? (segments.find((s) => s.keep && playhead >= s.start && playhead < s.end)?.speed ?? 1)
          : 1;
        if (Math.abs(el.playbackRate - spSeg) > 1e-3) el.playbackRate = spSeg;
        const want = playhead - c.start;
        if (Math.abs((el.currentTime || 0) - want) > 0.4) el.currentTime = want;
        if (el.paused) el.play().catch(() => {});
      } else if (el && !el.paused) {
        el.pause();
      }
    }
    for (const [id, el] of clipAudiosRef.current) {
      if (!audioClips.some((c) => c.id === id)) {
        el.pause();
        clipAudiosRef.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead, audioClips, clock.playing]);

  // Prévia do PiP: o relógio mestre comanda cada vídeo sobreposto (é o pool da
  // Fase C em ação — mesma tolerância/ritmo dos clipes de áudio: segue o
  // playhead para não gaguejar; no render ele toca natural)
  useEffect(() => {
    for (const p of pipClips) {
      const el = pipVideosRef.current.get(p.id);
      if (!el) continue;
      const naJanela = !faixaOculta("pip") && playhead >= p.start && playhead < p.end;
      el.volume = Math.max(0, Math.min(1, p.volume));
      el.muted = p.volume <= 0.01;
      if (naJanela) {
        const spSeg = previewEdit
          ? (segments.find((s) => s.keep && playhead >= s.start && playhead < s.end)?.speed ?? 1)
          : 1;
        if (Math.abs(el.playbackRate - spSeg) > 1e-3) el.playbackRate = spSeg;
        const want = p.src_in + (playhead - p.start);
        if (Math.abs((el.currentTime || 0) - want) > 0.4) el.currentTime = want;
        if (clock.playing && el.paused) el.play().catch(() => {});
        if (!clock.playing && !el.paused) el.pause();
      } else if (!el.paused) {
        el.pause();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead, pipClips, clock.playing, previewEdit, segments]);

  const activeStickers = meta
    ? docPrevia.stickers.filter((s) => playhead >= s.start && playhead <= s.end)
    : [];
  const stickerPosKey = (s: Sticker) => {
    const p = STICKER_POSITIONS.find((p) => Math.abs(p.x - s.x_pct) < 0.03 && Math.abs(p.y - s.y_pct) < 0.03);
    return p ? p.key : "custom";
  };

  // ── legendas ───────────────────────────────────────────────────────────────
  const gerarLegendas = async () => {
    if (!meta) return;
    setTranscribing(true);
    try {
      const res = await fetch(`${API}/editor/transcrever`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await videoApiAuthHeaders()) },
        body: JSON.stringify({ edit_id: meta.edit_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao transcrever");
      const timer = setInterval(async () => {
        try {
          const st = await (await fetch(`${API}/status/${data.job_id}`)).json();
          if (st.status === "done") {
            clearInterval(timer); setTranscribing(false);
            apply((d) => ({
              words: st.words || [],
              // reagrupa SEMPRE localmente quando há palavras: os cues do
              // worker não carregam `words`, e sem elas o karaokê não teria de
              // onde tirar o tempo de cada palavra
              cues: st.words?.length
                ? groupWords(st.words, d.cueMode)
                : (st.cues || []),
              subsOn: true,
            }));
            toast.success(`${(st.cues || []).length} legendas geradas — revise o texto se quiser.`);
          } else if (st.status === "error") {
            clearInterval(timer); setTranscribing(false);
            toast.error(st.message || "A transcrição falhou", { duration: 8000 });
          }
        } catch { /* transitório */ }
      }, 3000);
    } catch (e: any) {
      setTranscribing(false);
      toast.error(e.message);
    }
  };

  const sampleFontFamily = loadedFonts.has(subFont) ? `edfont-${subFont}` : "inherit";
  const sampleStyle: React.CSSProperties = {
    fontFamily: sampleFontFamily,
    color: subColor,
    fontSize: { p: 14, m: 18, g: 24, xg: 30 }[subSize],
    ...(subStyle === "box"
      ? { background: "rgba(0,0,0,0.6)", padding: "2px 8px", borderRadius: 4 }
      : { textShadow: "2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000" }),
  };

  // ── render / exportar ──────────────────────────────────────────────────────
  const renderizar = async () => {
    if (!meta || !professional?.slug) return;
    if (!keepSegments.length) { toast.error("Mantenha ao menos um trecho do vídeo."); return; }
    setRendering(true); setResultUrl(""); setRenderProgress(5); setRenderStep("Enviando a edição...");
    try {
      // Pré-voo do PiP: a fonte é um draft e pode ter expirado — o HEAD já
      // restaura do Storage sozinho; se nem isso der, re-carrega da galeria
      // (source_url) e troca o edit_id no doc. Upload local expirado não tem
      // de onde voltar: erro claro em vez de job quebrado.
      let docRender = doc;
      const clipesExternos = [
        ...docPrevia.pipClips.map((x) => ({ ...x, _tipo: "pip" as const })),
        ...seqClips.map((x) => ({ ...x, _tipo: "seq" as const })),
      ];
      if (clipesExternos.length) {
        const trocas = new Map<string, string>();
        for (const p of clipesExternos) {
          try {
            const ping = await fetch(`${API}/editor/video/${p.edit_id}`, { method: "HEAD" });
            if (ping.ok) continue;
          } catch { /* rede — tenta a recarga mesmo assim */ }
          if (!p.source_url) {
            throw new Error(`O vídeo "${p.name}" expirou no servidor — exclua o clipe e envie o arquivo de novo.`);
          }
          setRenderStep(`Recarregando o vídeo "${p.name}"...`);
          const fd = new FormData();
          fd.append("video_url", p.source_url);
          const r = await fetch(`${API}/editor/carregar`, {
            method: "POST", body: fd, headers: await videoApiAuthHeaders(),
          });
          const d2 = await r.json();
          if (!r.ok) throw new Error(d2.detail || `Não consegui recarregar "${p.name}" da galeria.`);
          trocas.set(`${p._tipo}:${p.id}`, d2.edit_id);
        }
        if (trocas.size) {
          const pips = doc.pipClips.map((p) => (trocas.has(`pip:${p.id}`) ? { ...p, edit_id: trocas.get(`pip:${p.id}`)! } : p));
          const seqs = doc.seqClips.map((c) => (trocas.has(`seq:${c.id}`) ? { ...c, edit_id: trocas.get(`seq:${c.id}`)! } : c));
          docRender = { ...doc, pipClips: pips, seqClips: seqs };
          update({ pipClips: pips, seqClips: seqs });   // persiste os ids novos (sem passo de undo)
        }
      }
      const res = await fetch(`${API}/editor/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await videoApiAuthHeaders()) },
        // o payload nasce SEMPRE do doc (editor/serialize.ts) — render e
        // persistência leem a mesma fonte
        body: JSON.stringify(buildRenderPayload(docRender, meta, professional.slug, perfilLogo)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao iniciar a edição");
      setRenderJobId(data.job_id);   // persiste → sair e voltar retoma o acompanhamento
      pollRender(data.job_id);
    } catch (e: any) {
      setRendering(false);
      toast.error(e.message, { duration: 8000 });
    }
  };

  const exportarFormato = async (format: "9:16" | "1:1" | "16:9") => {
    if (!resultUrl || !professional?.slug) return;
    setExporting(format);
    try {
      const res = await fetch(`${API}/editor/exportar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await videoApiAuthHeaders()) },
        body: JSON.stringify({
          professional_slug: professional.slug, video_url: resultUrl, format,
          titulo: titulo.trim(),
          // opções de saída (spec 22); gif ignora fps/codec no motor
          resolucao: expRes, fps: expFps, codec: expCodec, formato: expFormato,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao exportar");
      const timer = setInterval(async () => {
        try {
          const st = await (await fetch(`${API}/status/${data.job_id}`)).json();
          if (st.status === "done") {
            clearInterval(timer); setExporting("");
            if (st.is_gif && st.download_url) {
              // GIF não vai pra galeria (um <video> não toca gif) — baixa direto
              setGifUrl(st.download_url);
              toast.success("GIF pronto! O download começou.", { duration: 8000 });
              const a = document.createElement("a");
              a.href = st.download_url; a.download = "";
              document.body.appendChild(a); a.click(); a.remove();
            } else {
              toast.success(`Versão ${format} pronta — está em Meus Vídeos!`);
              queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
            }
          } else if (st.status === "error") {
            clearInterval(timer); setExporting("");
            toast.error(st.message || "A exportação falhou", { duration: 8000 });
          }
        } catch { /* transitório */ }
      }, 3000);
    } catch (e: any) {
      setExporting("");
      toast.error(e.message);
    }
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <audio ref={audioRef} onEnded={() => setPreviewingTrack("")} />
      <EditorOnboarding aberto={tourAberto} onFechar={() => setTourAberto(false)} />
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
          <Clapperboard className="h-5 w-5" />
        </div>
        <div className="mr-auto">
          <h2 className="font-heading text-xl font-bold leading-tight">Editor de Vídeo</h2>
          <p className="text-xs text-muted-foreground">corte · legendas · efeitos · exportação</p>
        </div>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground"
          title="Como funciona o editor" onClick={() => setTourAberto(true)}>
          <HelpCircle className="h-4 w-4" /> Ajuda
        </Button>
        {meta && (
          <>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={sourceLabel || "Nome do projeto"}
              title="Nome do projeto (salvo automaticamente em Meus projetos)"
              className="h-8 w-44 text-sm"
            />
            {saveError ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600"
                title="As últimas edições estão só neste navegador — verifique sua conexão/sessão">
                <AlertCircle className="h-3.5 w-3.5" /> não sincronizado
              </span>
            ) : savedAt ? (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Projeto salvo automaticamente no seu painel">
                <Check className="h-3.5 w-3.5 text-primary" /> salvo {savedAt}
              </span>
            ) : null}
            <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={recomecar}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Recomeçar
            </Button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Biblioteca */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <Label className="font-semibold flex items-center gap-2"><Film className="h-4 w-4" /> Biblioteca de mídia</Label>
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-sm cursor-pointer hover:border-primary/60 transition">
              {loadingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Enviar vídeo do computador
              <input type="file" className="hidden"
                accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                disabled={loadingSource}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { const fd = new FormData(); fd.append("file", f); carregar(fd, f.name); }
                  e.target.value = "";
                }} />
            </label>
            {/* Meus projetos: edições salvas no painel (sobrevivem a troca de
                máquina — o vídeo-fonte é recarregado sozinho se expirar) */}
            {projects.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium flex items-center gap-1">
                    <FolderOpen className="h-3.5 w-3.5" /> Meus projetos
                  </span>
                  {meta && (
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] ml-auto"
                      onClick={novoProjeto} title="Guarda o projeto atual e começa outro">
                      + Novo projeto
                    </Button>
                  )}
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                  {projects.map((p) => (
                    <div key={p.id}
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition ${p.id === projectId ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"}`}>
                      <button type="button" className="flex-1 text-left truncate py-0.5"
                        disabled={loadingSource}
                        onClick={() => { if (p.id !== projectId) abrirProjeto(p.id); }}
                        title={p.id === projectId ? "Projeto aberto" : `Abrir "${p.name}"`}>
                        {p.name}
                      </button>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(p.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive shrink-0"
                        onClick={() => excluirProjeto(p.id, p.name)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {mp4Videos.length === 0 && <p className="text-xs text-muted-foreground">Seus vídeos gerados aparecem aqui.</p>}
              {mp4Videos.map((v: any) => (
                <button key={v.id} type="button" disabled={loadingSource}
                  onClick={() => { const fd = new FormData(); fd.append("video_url", v.embed_url); carregar(fd, v.title || "Vídeo da galeria", v.embed_url); }}
                  className="w-full flex items-center gap-2 rounded-lg border p-1.5 text-left text-xs hover:border-primary/60 transition">
                  {v.thumbnail_url
                    ? <img src={v.thumbnail_url} className="h-10 w-7 rounded object-cover shrink-0" alt="" />
                    : <div className="h-10 w-7 rounded bg-muted flex items-center justify-center shrink-0"><VideoIcon className="h-3.5 w-3.5" /></div>}
                  <span className="truncate">{v.title || "Sem título"}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Trilha sonora */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <Label id="sec-musica" className="font-semibold flex items-center gap-2"><Music className="h-4 w-4" /> Trilha sonora</Label>
            <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
              <button type="button"
                onClick={() => patch({ musicId: "", musicUploadId: "", musicUploadName: "" })}
                className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs transition ${!musicId && !musicUploadId ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"}`}>
                Sem música (só o áudio original)
              </button>
              {musicas.map((m) => (
                <div key={m.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1 transition ${musicId === m.id ? "border-primary ring-1 ring-primary" : ""}`}>
                  <button type="button" className="flex-1 text-left text-xs py-0.5"
                    onClick={() => patch({ musicId: m.id, musicUploadId: "", musicUploadName: "" })}>
                    {m.label}
                  </button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => previewTrack(m.id)}>
                    {previewingTrack === m.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </Button>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer text-muted-foreground hover:text-foreground transition">
              <Upload className="h-3.5 w-3.5" />
              {musicUploadName ? `♪ ${musicUploadName}` : "Ou envie sua própria música (mp3)"}
              <input type="file" className="hidden" accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMusica(f); e.target.value = ""; }} />
            </label>
            <div className="space-y-2 text-xs">
              <div>
                <div className="flex justify-between"><span>Volume da música</span><span>{musicVolume}%</span></div>
                <input type="range" min={0} max={100} value={musicVolume}
                  onPointerDown={checkpoint}
                  onChange={(e) => update({ musicVolume: Number(e.target.value) })} className="w-full" />
                <p className="text-[10px] text-muted-foreground">15-25% = fundo sob a voz · 80%+ = destaque. O ▶ de prévia toca neste volume.</p>
              </div>
              <div>
                <div className="flex justify-between"><span>Volume do áudio original</span><span>{originalVolume}%</span></div>
                <input type="range" min={0} max={150} value={originalVolume}
                  onPointerDown={checkpoint}
                  onChange={(e) => update({ originalVolume: Number(e.target.value) })} className="w-full" />
              </div>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer" title="O áudio entra subindo no começo">
                  <input type="checkbox" checked={fadeIn} onChange={(e) => patch({ fadeIn: e.target.checked })} />
                  Fade in no início
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={fadeOut} onChange={(e) => patch({ fadeOut: e.target.checked })} />
                  Fade out no final
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer" title="A música abaixa sozinha quando você fala e volta nas pausas">
                  <input type="checkbox" checked={ducking} onChange={(e) => patch({ ducking: e.target.checked })} />
                  Música abaixa na fala
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer"
                  title="Reduz chiado constante da gravação — ar-condicionado, ventilador, ruído de sala">
                  <input type="checkbox" checked={denoise} onChange={(e) => patch({ denoise: e.target.checked })} />
                  <Headphones className="h-3.5 w-3.5" /> Limpar ruído de fundo
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview EM CIMA + Timeline em LARGURA TOTAL embaixo (layout de editor).
          Antes ficavam lado a lado e a timeline espremida tornava o zoom inútil
          (Carlos 16/07) — agora a timeline usa a tela toda. */}
      {meta && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="space-y-4">
              <div className="space-y-2 max-w-md mx-auto w-full">
                <div ref={videoWrapRef} className="relative">
                  {/* o filtro de cor vale só para o VÍDEO: legendas, textos e
                      stickers são queimados depois no motor, então não são
                      filtrados (por isso o filter vai aqui, não no wrapper).
                      SEM controles nativos (Fase C): o relógio mestre rege a
                      prévia — clicar no vídeo toca/pausa. */}
                  <video ref={videoRef} src={previewSrc} playsInline
                    className="w-full max-h-72 rounded-lg bg-black cursor-pointer"
                    style={{ filter: filtroCss(filtro) }}
                    onClick={clock.toggle}
                    onEnded={clock.pause}
                    onPause={() => clipAudiosRef.current.forEach((el) => el.pause())} />
                  {/* convite de play quando parado (decorativo — o clique é no vídeo) */}
                  {!clock.playing && previewSrc && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white">
                        <Play className="h-6 w-6 ml-0.5" />
                      </div>
                    </div>
                  )}
                  {/* prévia dos stickers EXATAMENTE onde o ffmpeg vai desenhar;
                      arraste (quando sem movimento) para posicionar */}
                  {contentRect && activeStickers.map((s) => {
                    const w = contentRect.w * s.scale_pct;
                    let cxPct = s.x_pct;
                    if (s.movement !== "none") {
                      const p = Math.max(0, Math.min(1, (playhead - s.start) / Math.max(0.1, s.end - s.start)));
                      const total = contentRect.w + w;
                      const leftPx = s.movement === "walk-right" ? -w + total * p : contentRect.w - total * p;
                      cxPct = (leftPx + w / 2) / contentRect.w;
                    }
                    const style: React.CSSProperties = {
                      position: "absolute",
                      left: contentRect.left + cxPct * contentRect.w,
                      top: contentRect.top + s.y_pct * contentRect.h,
                      width: w,
                      transform: `translate(-50%,-50%)${s.flip ? " scaleX(-1)" : ""}`,
                      cursor: s.movement === "none" ? "grab" : "default",
                      pointerEvents: s.movement === "none" ? "auto" : "none",
                      touchAction: "none",
                    };
                    const src = `${API}/editor/sticker/${s.upload_id}`;
                    return s.upload_id.endsWith(".webm") ? (
                      <video key={s.id} src={src} muted loop autoPlay playsInline style={style}
                        onPointerDown={(e) => onStickerPreviewDown(e, s.id)}
                        onPointerMove={onStickerPreviewMove} onPointerUp={onStickerPreviewUp} />
                    ) : (
                      <img key={s.id} src={src} alt="" draggable={false} style={style}
                        onPointerDown={(e) => onStickerPreviewDown(e, s.id)}
                        onPointerMove={onStickerPreviewMove} onPointerUp={onStickerPreviewUp} />
                    );
                  })}
                  {/* PiP: vídeo sobre o vídeo (Fase F) — comandado pelo relógio
                      mestre; arraste para posicionar. Acima dos stickers e
                      abaixo das legendas, como no motor. */}
                  {contentRect && !faixaOculta("pip") && pipClips
                    .filter((p) => playhead >= p.start && playhead <= p.end)
                    .map((p) => (
                      <video key={p.id}
                        ref={(el) => {
                          if (el) pipVideosRef.current.set(p.id, el);
                          else pipVideosRef.current.delete(p.id);
                        }}
                        src={p.source_url || `${API}/editor/video/${p.edit_id}`}
                        muted={p.volume <= 0.01} playsInline preload="auto"
                        style={{
                          position: "absolute",
                          left: contentRect.left + p.x_pct * contentRect.w,
                          top: contentRect.top + p.y_pct * contentRect.h,
                          width: contentRect.w * p.scale_pct,
                          opacity: p.opacity,
                          transform: "translate(-50%,-50%)",
                          borderRadius: 6,
                          cursor: "grab",
                          touchAction: "none",
                        }}
                        onPointerDown={(e) => onPipPreviewDown(e, p.id)}
                        onPointerMove={onPipPreviewMove} onPointerUp={onPipPreviewUp} />
                    ))}
                  {/* prévia de legendas/textos/selos: desenhada como o ffmpeg
                      desenha (mesma régua de estilo). Fica ACIMA dos stickers,
                      como no motor, e não intercepta o mouse (o sticker embaixo
                      continua arrastável). */}
                  {contentRect && (
                    <canvas ref={overlayRef}
                      className="absolute pointer-events-none"
                      style={{
                        left: contentRect.left, top: contentRect.top,
                        width: contentRect.w, height: contentRect.h,
                      }} />
                  )}
                </div>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer"
                  title="No play, os trechos removidos são pulados — você vê o resultado antes de renderizar">
                  <input type="checkbox" checked={previewEdit} onChange={(e) => setPreviewEdit(e.target.checked)} />
                  ▶ Prévia da edição (pula os trechos removidos)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-full"
                    title={clock.playing ? "Pausar" : "Tocar"} onClick={clock.toggle}>
                    {clock.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
                  </Button>
                  <span className="tabular-nums">cursor: {fmt(playhead)} / {fmt(meta.duration)}</span>
                  <label className="flex items-center gap-1 ml-2" title="Volume da prévia">
                    <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <input type="range" min={0} max={1} step={0.05} value={previewVol}
                      onChange={(e) => setPreviewVol(Number(e.target.value))} className="w-16" />
                  </label>
                  <span className="ml-auto text-muted-foreground">{meta.width}x{meta.height}</span>
                </div>
              </div>

              <div className="space-y-3 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="font-semibold">Timeline</Label>
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={splitAtPlayhead}>
                    <Scissors className="h-3.5 w-3.5" /> Dividir no cursor
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1" disabled={!state.past.length} onClick={undo}
                    title="Cada clique volta UM passo de edição (agora cobre a edição inteira, não só os cortes)">
                    <Undo2 className="h-3.5 w-3.5" /> Desfazer{state.past.length ? ` (${state.past.length})` : ""}
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    duração final: <b>{fmt(finalDuration)}</b>
                  </span>
                </div>

                {/* Caixinha FIXA de corte por tempo (sempre visível) */}
                <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                  <Scissors className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <span className="font-medium">Remover trecho:</span>
                  <label className="flex items-center gap-1">de
                    <Input value={cutStart} onChange={(e) => setCutStart(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && cortarIntervalo()}
                      placeholder="1:56" className="h-7 w-20 text-xs tabular-nums" />
                  </label>
                  <label className="flex items-center gap-1">até
                    <Input value={cutEnd} onChange={(e) => setCutEnd(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && cortarIntervalo()}
                      placeholder="1:59" className="h-7 w-20 text-xs tabular-nums" />
                  </label>
                  <Button size="sm" variant="destructive" className="h-7"
                    disabled={!cutStart.trim() || !cutEnd.trim()} onClick={cortarIntervalo}>
                    Cortar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-muted-foreground"
                    onClick={() => setCutStart(fmt(playhead))} title="Preenche o início com o cursor">
                    início = cursor
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-muted-foreground"
                    onClick={() => setCutEnd(fmt(playhead))} title="Preenche o fim com o cursor">
                    fim = cursor
                  </Button>
                </div>

                {/* Cortar com IA */}
                <div className="flex items-center gap-2 flex-wrap rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <Wand2 className="h-4 w-4 text-primary shrink-0" />
                  <Input value={aiCutText} onChange={(e) => setAiCutText(e.target.value)}
                    placeholder='Cortar com IA — ex.: "tire as pausas e os erros, deixe uns 40 segundos"'
                    className="h-8 text-xs flex-1 min-w-52" />
                  <Button size="sm" className="h-8" disabled={aiCutting} onClick={cortarComIA}>
                    {aiCutting ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Assistindo o vídeo…</> : "Sugerir cortes"}
                  </Button>
                </div>

                {/* Zoom + snap (Fase 1). Tudo abaixo vive no MESMO container
                    rolável e com a mesma largura — as faixas ficam alinhadas
                    com a timeline em qualquer zoom. */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Zoom</span>
                  <Button size="sm" variant="outline" className="h-6 w-6 p-0"
                    disabled={zoom <= 1} onClick={() => aplicarZoom(zoom / 2)} title="Afastar">
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="tabular-nums w-9 text-center">{zoom}×</span>
                  <Button size="sm" variant="outline" className="h-6 w-6 p-0"
                    disabled={zoom >= 16} onClick={() => aplicarZoom(zoom * 2)} title="Aproximar (mais precisão no corte)">
                    <Plus className="h-3 w-3" />
                  </Button>
                  {zoom > 1 && (
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]"
                      onClick={() => { setZoom(1); if (scrollRef.current) scrollRef.current.scrollLeft = 0; }}>
                      ver tudo
                    </Button>
                  )}
                  {zoom > 1 && winThumbs && (
                    // deixa claro que o zoom mostra um RECORTE navegável do vídeo
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      trecho {Math.floor(winThumbs.t0 / 60)}:{String(Math.round(winThumbs.t0 % 60)).padStart(2, "0")}–{Math.floor(winThumbs.t1 / 60)}:{String(Math.round(winThumbs.t1 % 60)).padStart(2, "0")}
                    </span>
                  )}
                  <label className="flex items-center gap-1.5 cursor-pointer ml-auto"
                    title="Ao arrastar, os blocos grudam no cursor, nos cortes e nas bordas dos outros — sem frestas">
                    <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} />
                    <Magnet className="h-3.5 w-3.5" /> Encaixe
                  </label>
                </div>

                {/* Timeline multi-faixa (Fase E): gutter de CABEÇALHOS à esquerda
                    (fora do scroll — não some no zoom) + faixas à direita. A
                    ordem/condições do gutter ESPELHAM as faixas: régua, fita de
                    vídeo, legendas, textos, stickers, áudio. */}
                <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-1">
                  <div className="space-y-1">
                    <div className="h-4" /> {/* espaço da régua */}
                    <div className="flex items-center gap-1 rounded border bg-muted/40 px-1.5 text-[9px] text-muted-foreground transition-[height] duration-200"
                      style={{ height: alturaFita }}>
                      <Clapperboard className="h-3 w-3 shrink-0" /> <span className="truncate">Vídeo</span>
                    </div>
                    {subsOn && cues.length > 0 && (
                      <div className="flex h-7 items-center gap-1 rounded border bg-emerald-500/10 px-1.5 text-[9px] text-muted-foreground">
                        <Captions className="h-3 w-3 shrink-0" /> <span className="truncate">Legenda</span> {olhoFaixa("subs")}
                      </div>
                    )}
                    {titles.length > 0 && (
                      <div className="flex h-7 items-center gap-1 rounded border bg-amber-500/10 px-1.5 text-[9px] text-muted-foreground">
                        <Type className="h-3 w-3 shrink-0" /> <span className="truncate">Texto</span> {olhoFaixa("text")}
                      </div>
                    )}
                    {stickers.length > 0 && (
                      <div className="flex h-7 items-center gap-1 rounded border bg-violet-500/10 px-1.5 text-[9px] text-muted-foreground">
                        <ImageIcon className="h-3 w-3 shrink-0" /> <span className="truncate">Sticker</span> {olhoFaixa("sticker")}
                      </div>
                    )}
                    {pipClips.length > 0 && (
                      <div className="flex h-7 items-center gap-1 rounded border bg-rose-500/10 px-1.5 text-[9px] text-muted-foreground">
                        <Clapperboard className="h-3 w-3 shrink-0" /> <span className="truncate">Vídeo 2</span> {olhoFaixa("pip")}
                      </div>
                    )}
                    {audioClips.length > 0 && (
                      <div className="flex h-7 items-center gap-1 rounded border bg-sky-500/10 px-1.5 text-[9px] text-muted-foreground">
                        <Headphones className="h-3 w-3 shrink-0" /> <span className="truncate">Áudio</span> {olhoFaixa("audio")}
                      </div>
                    )}
                  </div>
                <div ref={scrollRef} onScroll={pedirJanelaThumbs} className="overflow-x-auto overflow-y-hidden pb-1">
                  <div className="relative space-y-1" style={{ width: `${zoom * 100}%` }}>
                    {/* régua */}
                    <div className="relative h-4 select-none">
                      {rulerMarks.map((t) => (
                        <div key={t} className="absolute top-0 flex flex-col items-start"
                          style={{ left: `${(t / meta.duration) * 100}%` }}>
                          <div className="h-1.5 w-px bg-muted-foreground/50" />
                          <span className="text-[9px] text-muted-foreground tabular-nums -translate-x-1/2 ml-px whitespace-nowrap">
                            {rotuloRegua(t)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div ref={timelineRef} className="relative select-none cursor-col-resize" onMouseDown={onTimelineDown}>
                      <div className="relative rounded-lg overflow-hidden border bg-neutral-800 transition-[height] duration-200"
                        style={{ height: alturaFita }}>
                        {zoom <= 1 ? (
                          // 1×: fita inteira preenche a largura (slot ~natural)
                          <div className="flex h-full w-full">
                            {(meta.thumbs.length ? meta.thumbs : Array(20).fill("")).map((t, i, arr) =>
                              t ? <img key={i} src={t} draggable={false} className="h-full object-cover" style={{ width: `${100 / arr.length}%` }} alt="" />
                                : <div key={i} className={`h-full bg-muted ${thumbsErro ? "" : "animate-pulse"}`}
                                    style={{ width: `${100 / arr.length}%` }} />,
                            )}
                          </div>
                        ) : winThumbs ? (
                          // ampliado: cada quadro em LARGURA NATURAL (w-auto = a proporção
                          // REAL da imagem manda; nunca estica), começando no tempo t0
                          <div className="absolute top-0 bottom-0 flex"
                            style={{ left: `${(winThumbs.t0 / meta.duration) * 100}%` }}>
                            {winThumbs.list.map((t, i) =>
                              t ? <img key={i} src={t} draggable={false} className="h-full w-auto shrink-0" alt="" />
                                : <div key={i} className="h-full shrink-0 bg-muted" style={{ width: Math.round(alturaFita * 0.5625) }} />,
                            )}
                          </div>
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground pointer-events-none animate-pulse">
                            carregando os quadros do trecho…
                          </span>
                        )}
                      </div>
                      {thumbsErro && !meta.thumbs.length && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground pointer-events-none">
                          (sem miniaturas — a timeline funciona normalmente)
                        </span>
                      )}
                      <div className="absolute inset-0 pointer-events-none">
                        {segments.map((s) => (
                          <div key={s.id}
                            className={`absolute top-0 h-full border-2 rounded-sm ${
                              s.keep
                                ? (activeSeg?.id === s.id ? "border-primary" : "border-emerald-400/70")
                                : "border-red-500/70 bg-black/60 backdrop-grayscale"}`}
                            style={{ left: `${(s.start / meta.duration) * 100}%`, width: `${((s.end - s.start) / meta.duration) * 100}%` }}>
                            <button type="button"
                              title={s.keep ? "Remover este trecho" : "Restaurar este trecho"}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); toggleSegment(s.id); }}
                              className={`pointer-events-auto absolute top-0.5 right-0.5 rounded p-0.5 ${
                                s.keep ? "bg-black/50 text-white hover:bg-red-600" : "bg-red-600 text-white hover:bg-emerald-600"}`}>
                              {s.keep ? <Trash2 className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
                            </button>
                            {s.keep && (s.speed ?? 1) !== 1 && (
                              <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 text-white text-[8px] px-1 leading-tight">
                                {(s.speed ?? 1) < 1 ? "🐢" : "⚡"}{String(s.speed).replace(".", ",")}×
                              </span>
                            )}
                          </div>
                        ))}
                        {/* alças das FRONTEIRAS entre trechos: arraste para mover
                            o ponto de corte (o vizinho acompanha) */}
                        {segments.slice(0, -1).map((s) => (
                          <div key={`b${s.id}`}
                            className="pointer-events-auto absolute top-0 bottom-0 w-2 -translate-x-1/2 cursor-ew-resize group"
                            style={{ left: `${(s.end / meta.duration) * 100}%`, touchAction: "none" }}
                            title="Arraste para ajustar onde o corte acontece"
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => onBorderDown(e, s.id)}
                            onPointerMove={onBorderMove}
                            onPointerUp={onBorderUp}
                            onPointerCancel={onBorderUp}>
                            <div className="mx-auto h-full w-0.5 bg-white/70 group-hover:bg-primary group-hover:w-1 transition-all" />
                          </div>
                        ))}
                        <div className="absolute top-[-4px] bottom-[-4px] w-0.5 bg-primary"
                          style={{ left: `${(playhead / meta.duration) * 100}%` }}>
                          <div className="h-2.5 w-2.5 rounded-full bg-primary -translate-x-[45%]" />
                        </div>
                      </div>
                    </div>

                    {/* guia do encaixe: mostra em que ponto o bloco grudou */}
                    {snapGuide !== null && (
                      <div className="absolute top-4 bottom-0 w-px bg-amber-400 pointer-events-none z-10"
                        style={{ left: `${(snapGuide / meta.duration) * 100}%` }} />
                    )}

                    {/* Faixas (estilo CapCut): legendas, textos, stickers e áudio.
                        Arraste o bloco pra mover no tempo; borda direita estica. */}
                    {subsOn && cues.length > 0 && (
                      <div className={`relative h-7 rounded border bg-emerald-500/5 overflow-hidden ${faixaOculta("subs") ? "opacity-40" : ""}`}>
                        {cues.map((c, i) => (
                          <div key={i}
                            className="absolute top-0.5 bottom-0.5 rounded bg-emerald-600/70 border border-emerald-300/60 text-[9px] text-white cursor-grab select-none flex items-center px-1 overflow-hidden"
                            style={{ left: `${(c.start / meta.duration) * 100}%`, width: `${Math.max(1.2, ((c.end - c.start) / meta.duration) * 100)}%`, touchAction: "none" }}
                            title={`${c.text} · ${fmt(c.start)}–${fmt(c.end)} — arraste pra mover; borda direita estica`}
                            onPointerDown={(e) => onTrackDown(e, "cue", String(i), "move")}
                            onPointerMove={onTrackMove} onPointerUp={onTrackUp}>
                            <span className="truncate pointer-events-none">{c.text || "(legenda)"}</span>
                            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/40"
                              style={{ touchAction: "none" }}
                              onPointerDown={(e) => onTrackDown(e, "cue", String(i), "resize")} />
                          </div>
                        ))}
                      </div>
                    )}
                    {titles.length > 0 && (
                      <div className={`relative h-7 rounded border bg-amber-500/5 overflow-hidden ${faixaOculta("text") ? "opacity-40" : ""}`}>
                        {titles.map((t) => (
                          <div key={t.id}
                            className="absolute top-0.5 bottom-0.5 rounded bg-amber-500/70 border border-amber-300/60 text-[9px] text-white cursor-grab select-none flex items-center px-1 overflow-hidden"
                            style={{ left: `${(t.start / meta.duration) * 100}%`, width: `${Math.max(1.2, ((t.end - t.start) / meta.duration) * 100)}%`, touchAction: "none" }}
                            title={`${t.text} · ${fmt(t.start)}–${fmt(t.end)} — arraste pra mover; borda direita estica`}
                            onPointerDown={(e) => onTrackDown(e, "title", t.id, "move")}
                            onPointerMove={onTrackMove} onPointerUp={onTrackUp}>
                            <span className="truncate pointer-events-none">T {t.text || "(texto)"}</span>
                            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/40"
                              style={{ touchAction: "none" }}
                              onPointerDown={(e) => onTrackDown(e, "title", t.id, "resize")} />
                          </div>
                        ))}
                      </div>
                    )}
                    {stickers.length > 0 && (
                      <div className={`relative h-7 rounded border bg-violet-500/5 overflow-hidden ${faixaOculta("sticker") ? "opacity-40" : ""}`}>
                        {stickers.map((s) => (
                          <div key={s.id}
                            className="absolute top-0.5 bottom-0.5 rounded bg-violet-500/70 border border-violet-300/60 text-[9px] text-white cursor-grab select-none flex items-center px-1 overflow-hidden"
                            style={{ left: `${(s.start / meta.duration) * 100}%`, width: `${Math.max(1.2, ((s.end - s.start) / meta.duration) * 100)}%`, touchAction: "none" }}
                            title={`${s.name} · ${fmt(s.start)}–${fmt(s.end)} — arraste pra mover; borda direita estica`}
                            onPointerDown={(e) => onTrackDown(e, "sticker", s.id, "move")}
                            onPointerMove={onTrackMove} onPointerUp={onTrackUp}>
                            <span className="truncate pointer-events-none">🖼 {s.name}</span>
                            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/40"
                              style={{ touchAction: "none" }}
                              onPointerDown={(e) => onTrackDown(e, "sticker", s.id, "resize")} />
                          </div>
                        ))}
                      </div>
                    )}
                    {pipClips.length > 0 && (
                      <div className={`relative h-7 rounded border bg-rose-500/5 overflow-hidden ${faixaOculta("pip") ? "opacity-40" : ""}`}>
                        {pipClips.map((p) => (
                          <div key={p.id}
                            className="absolute top-0.5 bottom-0.5 rounded bg-rose-500/70 border border-rose-300/60 text-[9px] text-white cursor-grab select-none flex items-center px-1 overflow-hidden"
                            style={{ left: `${(p.start / meta.duration) * 100}%`, width: `${Math.max(1.2, ((p.end - p.start) / meta.duration) * 100)}%`, touchAction: "none" }}
                            title={`${p.name} · ${fmt(p.start)}–${fmt(p.end)} — arraste pra mover; borda direita estica`}
                            onPointerDown={(e) => onTrackDown(e, "pip", p.id, "move")}
                            onPointerMove={onTrackMove} onPointerUp={onTrackUp}>
                            <span className="truncate pointer-events-none">▶ {p.name}</span>
                            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/40"
                              style={{ touchAction: "none" }}
                              onPointerDown={(e) => onTrackDown(e, "pip", p.id, "resize")} />
                          </div>
                        ))}
                      </div>
                    )}
                    {audioClips.length > 0 && (
                      <div className={`relative h-7 rounded border bg-sky-500/5 overflow-hidden ${faixaOculta("audio") ? "opacity-40" : ""}`}>
                        {audioClips.map((c) => (
                          <div key={c.id}
                            className="absolute top-0.5 bottom-0.5 rounded bg-sky-500/70 border border-sky-300/60 text-[9px] text-white cursor-grab select-none flex items-center px-1 overflow-hidden"
                            style={{ left: `${(c.start / meta.duration) * 100}%`, width: `${Math.max(1.2, ((c.end - c.start) / meta.duration) * 100)}%`, touchAction: "none" }}
                            title={`${c.name} · ${fmt(c.start)}–${fmt(c.end)} — arraste pra mover; borda direita estica`}
                            onPointerDown={(e) => onTrackDown(e, "audio", c.id, "move")}
                            onPointerMove={onTrackMove} onPointerUp={onTrackUp}>
                            <span className="truncate pointer-events-none">🎧 {c.name}</span>
                            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/40"
                              style={{ touchAction: "none" }}
                              onPointerDown={(e) => onTrackDown(e, "audio", c.id, "resize")} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                </div>

                {/* Adicionar conteúdo às faixas — a resposta de "como adiciono
                    uma trilha": cada tipo leva à seção que o cria */}
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="text-muted-foreground">Adicionar:</span>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => irParaSecao("sec-legendas")}><Captions className="h-3 w-3" /> Legendas</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => irParaSecao("sec-textos")}><Type className="h-3 w-3" /> Texto</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => irParaSecao("sec-stickers")}><ImageIcon className="h-3 w-3" /> Sticker</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => irParaSecao("sec-audio")}><Headphones className="h-3 w-3" /> Narração/efeito</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => irParaSecao("sec-musica")}><Music className="h-3 w-3" /> Música</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1 border-rose-300/60"
                    title="Vídeo SOBRE o vídeo (PiP): um 2º vídeo em janela, com posição e som próprios"
                    onClick={() => setDialogVideo("pip")}>
                    <Clapperboard className="h-3 w-3" /> + Vídeo (PiP)
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1"
                    title="Emendar um vídeo DEPOIS do fim da edição atual (juntar takes, fechar com uma chamada)"
                    onClick={() => setDialogVideo("seq")}>
                    <Film className="h-3 w-3" /> + Vídeo no fim
                  </Button>
                </div>

                {/* Escolha de um 2º vídeo: PiP (sobre) ou sequência (no fim) */}
                {dialogVideo && (
                  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                    onClick={() => !pipLoading && setDialogVideo(null)}>
                    <div className="w-full max-w-sm rounded-xl border bg-background p-4 space-y-3 shadow-lg"
                      onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {dialogVideo === "pip"
                          ? <Clapperboard className="h-4 w-4 text-primary" />
                          : <Film className="h-4 w-4 text-primary" />}
                        <span className="font-semibold text-sm">
                          {dialogVideo === "pip" ? "Vídeo sobre o vídeo (PiP)" : "Emendar vídeo no fim"}
                        </span>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-auto"
                          disabled={pipLoading} onClick={() => setDialogVideo(null)}>✕</Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {dialogVideo === "pip"
                          ? <>Entra no cursor ({fmt(playhead)}) como uma janela sobre o vídeo —
                             arraste no player para posicionar; mova/estique na faixa rosa.</>
                          : <>Entra DEPOIS do fim da edição atual, emendado na sequência —
                             bom para juntar takes ou fechar com uma chamada. Ajuste o trecho
                             usado na seção "Vídeos em sequência".</>}
                      </p>
                      <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-2.5 text-xs cursor-pointer hover:border-primary/60 transition">
                        {pipLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        Enviar vídeo do computador
                        <input type="file" className="hidden"
                          accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                          disabled={pipLoading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) { const fd = new FormData(); fd.append("file", f); (dialogVideo === "pip" ? adicionarPip : adicionarSeq)(fd, f.name.replace(/\.[^.]+$/, "")); }
                            e.target.value = "";
                          }} />
                      </label>
                      <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                        {mp4Videos.length === 0 && (
                          <p className="text-xs text-muted-foreground">Sem vídeos na galeria — envie um arquivo acima.</p>
                        )}
                        {mp4Videos.map((v: any) => (
                          <button key={v.id} type="button" disabled={pipLoading}
                            onClick={() => { const fd = new FormData(); fd.append("video_url", v.embed_url); (dialogVideo === "pip" ? adicionarPip : adicionarSeq)(fd, v.title || "Vídeo da galeria", v.embed_url); }}
                            className="w-full flex items-center gap-2 rounded-lg border p-1.5 text-left text-xs hover:border-primary/60 transition">
                            {v.thumbnail_url
                              ? <img src={v.thumbnail_url} className="h-10 w-7 rounded object-cover shrink-0" alt="" />
                              : <div className="h-10 w-7 rounded bg-muted flex items-center justify-center shrink-0"><VideoIcon className="h-3.5 w-3.5" /></div>}
                            <span className="truncate">{v.title || "Sem título"}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeSeg && (
                  <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                    <span className="font-medium">Trecho sob o cursor {activeSeg.keep ? "(mantido)" : "(removido)"}:</span>
                    <label className="flex items-center gap-1">início
                      <Input value={startField} onChange={(e) => setStartField(e.target.value)}
                        onBlur={() => applyBound("start", parseTime(startField))}
                        onKeyDown={(e) => e.key === "Enter" && applyBound("start", parseTime(startField))}
                        className="h-7 w-20 text-xs tabular-nums" />
                    </label>
                    <label className="flex items-center gap-1">fim
                      <Input value={endField} onChange={(e) => setEndField(e.target.value)}
                        onBlur={() => applyBound("end", parseTime(endField))}
                        onKeyDown={(e) => e.key === "Enter" && applyBound("end", parseTime(endField))}
                        className="h-7 w-20 text-xs tabular-nums" />
                    </label>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => applyBound("start", playhead)}>Início = cursor</Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => applyBound("end", playhead)}>Fim = cursor</Button>
                    <Button size="sm" variant={activeSeg.keep ? "destructive" : "default"} className="h-7"
                      onClick={() => toggleSegment(activeSeg.id)}>
                      {activeSeg.keep ? "Remover trecho" : "Restaurar trecho"}
                    </Button>
                    {activeSeg.keep && (
                      <label className="flex items-center gap-1" title="Câmera lenta ou acelerado só neste trecho">
                        Velocidade
                        <select className="h-7 rounded border bg-background px-1"
                          value={activeSeg.speed ?? 1}
                          onChange={(e) => {
                            const sp = Number(e.target.value);
                            apply((d) => ({ segments: d.segments.map((s) => (s.id === activeSeg.id ? { ...s, speed: sp } : s)) }));
                          }}>
                          <option value={0.5}>🐢 0,5× (lenta)</option>
                          <option value={1}>1× normal</option>
                          <option value={1.5}>1,5×</option>
                          <option value={2}>⚡ 2× (rápida)</option>
                        </select>
                      </label>
                    )}
                  </div>
                )}

                {/* Capa de entrada (logo) */}
                <div className="flex items-center gap-3 flex-wrap text-xs rounded-lg border bg-muted/30 px-3 py-2">
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                    <input type="checkbox" checked={introOn} onChange={(e) => patch({ introOn: e.target.checked })} />
                    <Clapperboard className="h-3.5 w-3.5" /> Capa de entrada com a logo
                  </label>
                  {introOn && (
                    <>
                      <div className="flex gap-1">
                        {perfilLogo && (
                          <button type="button" onClick={() => patch({ introSource: "perfil" })}
                            className={`rounded-full border px-2 py-0.5 transition ${introSource === "perfil" ? "border-primary ring-1 ring-primary font-medium" : "hover:border-primary/50"}`}>
                            Logo do perfil
                          </button>
                        )}
                        <label className={`rounded-full border px-2 py-0.5 cursor-pointer transition ${introSource === "upload" ? "border-primary ring-1 ring-primary font-medium" : "hover:border-primary/50"}`}>
                          {introUploadName ? `🖼 ${introUploadName.slice(0, 18)}` : "Enviar imagem"}
                          <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;
                              try {
                                const fd = new FormData();
                                fd.append("file", f);
                                const res = await fetch(`${API}/editor/carregar-logo`, {
                                  method: "POST", body: fd, headers: await videoApiAuthHeaders(),
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.detail || "Falha ao enviar a imagem");
                                patch({ introUploadId: data.logo_upload_id, introUploadName: f.name, introSource: "upload" });
                              } catch (err: any) { toast.error(err.message); }
                            }} />
                        </label>
                      </div>
                      <label className="flex items-center gap-1">por
                        <select className="h-7 rounded border bg-background px-1" value={introDur}
                          onChange={(e) => patch({ introDur: Number(e.target.value) })}>
                          <option value={1.5}>1,5s</option><option value={2}>2s</option>
                          <option value={3}>3s</option><option value={4}>4s</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1">efeito
                        <select className="h-7 rounded border bg-background px-1" value={introEffect}
                          onChange={(e) => patch({ introEffect: e.target.value as "zoom" | "slide" | "fade" })}>
                          <option value="zoom">Zoom suave</option>
                          <option value="slide">Deslizar</option>
                          <option value="fade">Estático</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5">fundo
                        <input type="color" value={introBg} onPointerDown={checkpoint}
                          onChange={(e) => update({ introBg: e.target.value })}
                          className="h-7 w-9 rounded border cursor-pointer" />
                      </label>
                      {/* mini prévia da capa */}
                      <span className="inline-flex items-center justify-center rounded border h-9 w-16 overflow-hidden"
                        style={{ background: introBg }}>
                        {(introSource === "perfil" ? perfilLogo : "") && (
                          <img src={perfilLogo} alt="" className="max-h-6 max-w-12 object-contain" />
                        )}
                        {introSource === "upload" && introUploadName && <span className="text-[9px]">🖼</span>}
                      </span>
                      {!perfilLogo && introSource === "perfil" && (
                        <span className="text-muted-foreground">Sem logo no perfil — envie uma imagem.</span>
                      )}
                    </>
                  )}
                </div>

                {/* Acabamento + Render */}
                <div className="flex items-center gap-3 flex-wrap text-xs rounded-lg border bg-muted/30 px-3 py-2">
                  <span className="font-medium">Acabamento:</span>
                  <label className="flex items-center gap-1.5" title="Como um trecho vira o próximo">
                    Emendas
                    <select className="h-7 rounded border bg-background px-1" value={transition}
                      onChange={(e) => patch({ transition: e.target.value })}>
                      {TRANSICOES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Leve zoom alternado a cada trecho — disfarça as emendas">
                    <input type="checkbox" checked={punchIn} onChange={(e) => patch({ punchIn: e.target.checked })} />
                    Zoom alternado nos cortes
                  </label>
                  {segments.filter((s) => s.keep).length < 2 && transition !== "none" && (
                    <span className="text-muted-foreground">
                      (a emenda só aparece com 2+ trechos)
                    </span>
                  )}
                </div>

                {/* Filtro de cor (prévia ao vivo no player) + Efeito (prévia
                    pela amostra real: VHS/granulado/glitch não têm equivalente
                    fiel em CSS, e aproximar faria a prévia mentir) */}
                <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                    <div className="space-y-2 min-w-0">
                      <div>
                        <div className="flex items-center gap-2 text-xs">
                          <Palette className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium">Filtro de cor</span>
                          <span className="text-muted-foreground">— ao vivo no player</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap mt-1">
                          {FILTRO_IDS.map((id) => (
                            <button key={id} type="button"
                              onClick={() => patch({ filtro: id })}
                              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                                filtro === id ? "border-primary ring-1 ring-primary font-medium" : "hover:border-primary/50"}`}>
                              {FILTROS[id].label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-xs">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium">Efeito</span>
                          <span className="text-muted-foreground">— veja na amostra ao lado</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap mt-1">
                          {EFEITOS.map((e) => (
                            <button key={e.id} type="button"
                              onClick={() => patch({ efeito: e.id })}
                              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                                efeito === e.id ? "border-primary ring-1 ring-primary font-medium" : "hover:border-primary/50"}`}>
                              {e.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* amostra REAL: o frame do cursor passado pelo ffmpeg */}
                    <div className="shrink-0 space-y-1">
                      <div className="relative rounded border bg-muted/40 overflow-hidden"
                        style={{ width: 124, height: 124 }}>
                        {amostraUrl ? (
                          <img src={amostraUrl} alt="Amostra com filtro e efeito"
                            className="h-full w-full object-contain" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground text-center px-2">
                            {amostraErro || "amostra do cursor"}
                          </div>
                        )}
                        {amostraCarregando && (
                          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] text-muted-foreground text-center leading-tight">
                        frame real do<br />seu vídeo
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stickers/sobreposições + clipes de áudio posicionados */}
      {meta && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Stickers */}
              <div className="space-y-2">
                <Label id="sec-stickers" className="font-semibold flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Stickers e sobreposições</Label>
                <p className="text-[11px] text-muted-foreground">
                  Imagem, GIF animado ou WebM com fundo transparente sobre o vídeo (ex.: um gatinho
                  andando enquanto você fala). Entra no cursor; mova/estique na <b>faixa roxa</b> da
                  timeline e <b>arraste no player</b> para posicionar.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-1.5 text-xs cursor-pointer hover:border-primary/60 transition">
                    {uploadingSticker ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Enviar sticker (png · gif · webm)
                    <input type="file" className="hidden"
                      accept="image/png,image/webp,image/jpeg,image/gif,video/webm"
                      disabled={uploadingSticker}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadSticker(f);
                        e.target.value = "";
                      }} />
                  </label>
                </div>
                {/* Gerar com IA (fundo verde → transparência automática) */}
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Wand2 className="h-4 w-4 text-primary shrink-0" />
                    <Input value={iaDesc} onChange={(e) => setIaDesc(e.target.value)}
                      placeholder='Gerar sticker animado com IA — ex.: "um gatinho laranja fofo andando"'
                      className="h-8 text-xs flex-1 min-w-48" disabled={!!stickerJob} />
                    <select className="h-8 rounded border bg-background px-1 text-xs" value={iaDur}
                      disabled={!!stickerJob}
                      onChange={(e) => setIaDur(Number(e.target.value))}>
                      <option value={5}>5s</option><option value={10}>10s</option>
                    </select>
                    <Button size="sm" className="h-8" disabled={!!stickerJob || !iaDesc.trim()} onClick={gerarStickerIA}>
                      {stickerJob ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Gerando…</> : "✨ Gerar"}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    A IA cria a animação e remove o fundo sozinha (leva ~2 min). Pode sair da tela —
                    o sticker entra na timeline quando ficar pronto.
                    {iaStep && <b> · {iaStep}</b>}
                  </p>
                </div>
                {stickers.map((s) => (
                  <div key={s.id} className="flex items-center gap-1.5 text-xs flex-wrap rounded border px-2 py-1">
                    {s.upload_id.endsWith(".webm")
                      ? <video src={`${API}/editor/sticker/${s.upload_id}`} muted loop autoPlay playsInline className="h-8 w-8 rounded object-contain bg-muted/50 shrink-0" />
                      : <img src={`${API}/editor/sticker/${s.upload_id}`} alt="" className="h-8 w-8 rounded object-contain bg-muted/50 shrink-0" />}
                    <span className="truncate max-w-28" title={s.name}>{s.name}</span>
                    <span className="tabular-nums text-muted-foreground">{fmt(s.start)}–{fmt(s.end)}</span>
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-muted-foreground"
                      title="Leva o começo do sticker até o cursor"
                      onClick={() => apply((d) => ({
                        stickers: d.stickers.map((p) => {
                          if (p.id !== s.id || !meta) return p;
                          const len = p.end - p.start;
                          const ns = Math.max(0, Math.min(meta.duration - len, playhead));
                          return { ...p, start: ns, end: ns + len };
                        }),
                      }))}>
                      → cursor
                    </Button>
                    <select className="h-7 rounded border bg-background px-1" value={s.scale_pct}
                      title="Tamanho (fração da largura do vídeo)"
                      onChange={(e) => apply((d) => ({ stickers: d.stickers.map((p) => (p.id === s.id ? { ...p, scale_pct: Number(e.target.value) } : p)) }))}>
                      {STICKER_SIZES.map((z) => <option key={z.label} value={z.value}>{z.label}</option>)}
                    </select>
                    <select className="h-7 rounded border bg-background px-1" value={s.movement}
                      onChange={(e) => {
                        const mv = e.target.value as StickerMovement;
                        apply((d) => ({
                          stickers: d.stickers.map((p) => (p.id === s.id
                            ? { ...p, movement: mv, flip: mv === "walk-left" ? true : mv === "walk-right" ? false : p.flip }
                            : p)),
                        }));
                      }}>
                      <option value="none">Parado</option>
                      <option value="walk-right">🚶 Atravessa →</option>
                      <option value="walk-left">🚶 Atravessa ←</option>
                    </select>
                    {s.movement === "none" && (
                      <select className="h-7 rounded border bg-background px-1" value={stickerPosKey(s)}
                        onChange={(e) => {
                          const p = STICKER_POSITIONS.find((p) => p.key === e.target.value);
                          if (p) apply((d) => ({ stickers: d.stickers.map((x) => (x.id === s.id ? { ...x, x_pct: p.x, y_pct: p.y } : x)) }));
                        }}>
                        {STICKER_POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                        <option value="custom" disabled>Personalizado (arrastado)</option>
                      </select>
                    )}
                    <label className="flex items-center gap-1 cursor-pointer" title="Espelhar horizontalmente">
                      <input type="checkbox" checked={s.flip}
                        onChange={(e) => apply((d) => ({ stickers: d.stickers.map((p) => (p.id === s.id ? { ...p, flip: e.target.checked } : p)) }))} />
                      espelhar
                    </label>
                    {s.animated && (
                      <label className="flex items-center gap-1 cursor-pointer" title="Repete a animação enquanto estiver na tela">
                        <input type="checkbox" checked={s.loop}
                          onChange={(e) => apply((d) => ({ stickers: d.stickers.map((p) => (p.id === s.id ? { ...p, loop: e.target.checked } : p)) }))} />
                        loop
                      </label>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground ml-auto"
                      title="Duplicar este sticker" onClick={() => duplicarSticker(s.id)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                      onClick={() => apply((d) => ({ stickers: d.stickers.filter((p) => p.id !== s.id) }))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* PiP: vídeo sobre o vídeo (Fase F) */}
              {pipClips.length > 0 && (
                <div className="space-y-2">
                  <Label className="font-semibold flex items-center gap-2"><Clapperboard className="h-4 w-4" /> Vídeo sobre o vídeo (PiP)</Label>
                  {pipClips.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5 text-xs flex-wrap rounded border px-2 py-1">
                      <span className="truncate max-w-32 font-medium">{p.name}</span>
                      <span className="tabular-nums text-muted-foreground">{fmt(p.start)}–{fmt(p.end)}</span>
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-muted-foreground"
                        title="Leva o começo do clipe até o cursor"
                        onClick={() => apply((d) => ({ pipClips: d.pipClips.map((x) => (x.id === p.id
                          ? { ...x, start: playhead, end: Math.min(meta.duration, playhead + (x.end - x.start)) } : x)) }))}>
                        → cursor
                      </Button>
                      <label className="flex items-center gap-1" title="Começar do segundo X do vídeo sobreposto">
                        a partir de
                        <Input type="number" min={0} step={0.5} max={Math.max(0, p.natural_dur - 0.3)}
                          value={p.src_in} className="h-7 w-14 text-xs tabular-nums" onFocus={checkpoint}
                          onChange={(e) => {
                            if (e.target.value === "") return;
                            const v = Math.max(0, Math.min(p.natural_dur - 0.3, Number(e.target.value)));
                            applyLive((d) => ({ pipClips: d.pipClips.map((x) => (x.id === p.id ? { ...x, src_in: v } : x)) }));
                          }} />s
                      </label>
                      <select className="h-7 rounded border bg-background px-1" value={p.scale_pct}
                        onChange={(e) => apply((d) => ({ pipClips: d.pipClips.map((x) => (x.id === p.id ? { ...x, scale_pct: Number(e.target.value) } : x)) }))}>
                        <option value={0.25}>Pequeno</option>
                        <option value={0.35}>Médio</option>
                        <option value={0.5}>Grande</option>
                        {![0.25, 0.35, 0.5].includes(p.scale_pct) && <option value={p.scale_pct} disabled>Personalizado</option>}
                      </select>
                      <label className="flex items-center gap-1" title="Volume do áudio do vídeo sobreposto (0 = mudo)">
                        <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <input type="range" min={0} max={1} step={0.05} value={p.volume} className="w-14"
                          onPointerDown={checkpoint}
                          onChange={(e) => applyLive((d) => ({ pipClips: d.pipClips.map((x) => (x.id === p.id ? { ...x, volume: Number(e.target.value) } : x)) }))} />
                      </label>
                      <label className="flex items-center gap-1" title="Opacidade da janela">
                        <input type="range" min={0.2} max={1} step={0.05} value={p.opacity} className="w-14"
                          onPointerDown={checkpoint}
                          onChange={(e) => applyLive((d) => ({ pipClips: d.pipClips.map((x) => (x.id === p.id ? { ...x, opacity: Number(e.target.value) } : x)) }))} />
                      </label>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground ml-auto"
                        title="Duplicar este clipe" onClick={() => duplicarPip(p.id)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                        onClick={() => apply((d) => ({ pipClips: d.pipClips.filter((x) => x.id !== p.id) }))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Vídeos EMENDADOS no fim (sequência) */}
              {seqClips.length > 0 && (
                <div className="space-y-2">
                  <Label className="font-semibold flex items-center gap-2"><Film className="h-4 w-4" /> Vídeos em sequência (no fim)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Emendados <b>depois</b> do vídeo principal, na ordem abaixo. O render sai completo;
                    a prévia do trecho emendado chega em breve (como a capa de entrada).
                  </p>
                  {seqClips.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-1.5 text-xs flex-wrap rounded border px-2 py-1">
                      <span className="text-muted-foreground tabular-nums">{i + 1}º</span>
                      <span className="truncate max-w-36 font-medium">{c.name}</span>
                      <label className="flex items-center gap-1" title="Usar a partir do segundo X da fonte">
                        de
                        <Input type="number" min={0} step={0.5} max={Math.max(0, c.natural_dur - 0.3)}
                          value={c.src_in} className="h-7 w-14 text-xs tabular-nums" onFocus={checkpoint}
                          onChange={(e) => {
                            if (e.target.value === "") return;
                            const v = Math.max(0, Math.min(c.natural_dur - 0.3, Number(e.target.value)));
                            applyLive((d) => ({ seqClips: d.seqClips.map((x) => (x.id === c.id
                              ? { ...x, src_in: v, src_out: Math.max(v + 0.3, x.src_out) } : x)) }));
                          }} />
                      </label>
                      <label className="flex items-center gap-1" title="Usar até o segundo X da fonte">
                        até
                        <Input type="number" min={0.3} step={0.5} max={c.natural_dur}
                          value={c.src_out} className="h-7 w-14 text-xs tabular-nums" onFocus={checkpoint}
                          onChange={(e) => {
                            if (e.target.value === "") return;
                            const v = Math.max(c.src_in + 0.3, Math.min(c.natural_dur, Number(e.target.value)));
                            applyLive((d) => ({ seqClips: d.seqClips.map((x) => (x.id === c.id ? { ...x, src_out: v } : x)) }));
                          }} />s
                      </label>
                      <span className="text-muted-foreground tabular-nums">({fmt(Math.max(0, c.src_out - c.src_in))})</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-auto" disabled={i === 0}
                        title="Mover para antes"
                        onClick={() => apply((d) => {
                          const arr = [...d.seqClips];
                          const j = arr.findIndex((x) => x.id === c.id);
                          if (j > 0) [arr[j - 1], arr[j]] = [arr[j], arr[j - 1]];
                          return { seqClips: arr };
                        })}>↑</Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={i === seqClips.length - 1}
                        title="Mover para depois"
                        onClick={() => apply((d) => {
                          const arr = [...d.seqClips];
                          const j = arr.findIndex((x) => x.id === c.id);
                          if (j >= 0 && j < arr.length - 1) [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                          return { seqClips: arr };
                        })}>↓</Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                        onClick={() => apply((d) => ({ seqClips: d.seqClips.filter((x) => x.id !== c.id) }))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Clipes de áudio posicionados */}
              <div className="space-y-2">
                <Label id="sec-audio" className="font-semibold flex items-center gap-2"><Headphones className="h-4 w-4" /> Efeitos sonoros e narrações</Label>
                <p className="text-[11px] text-muted-foreground">
                  Áudio que toca num <b>ponto exato</b> do vídeo (efeito, vinheta, narração) — além da
                  trilha global. Entra no cursor; mova/estique na <b>faixa azul</b> da timeline.
                </p>
                {/* voice over: grava aqui e vira um clipe na faixa azul */}
                <Button size="sm" variant={gravando ? "destructive" : "outline"}
                  className="h-8 gap-1.5 w-fit" disabled={uploadingClip}
                  onClick={gravarNarracao}
                  title={gravando ? "Parar e colocar na timeline" : "Gravar narração pelo microfone, a partir do cursor"}>
                  {gravando ? (
                    <><Square className="h-3 w-3 fill-current" /> Parar ({fmt(gravSegs)})</>
                  ) : (
                    <><Mic className="h-3.5 w-3.5" /> Gravar narração no cursor</>
                  )}
                </Button>
                {gravando && (
                  <p className="text-[10px] text-muted-foreground">
                    Gravando… fale e clique em Parar. A narração entra em {fmt(playhead)}.
                  </p>
                )}
                <label className="flex items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-1.5 text-xs cursor-pointer hover:border-primary/60 transition w-fit">
                  {uploadingClip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Enviar áudio (mp3 · wav · m4a)
                  <input type="file" className="hidden"
                    accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac"
                    disabled={uploadingClip || gravando}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadClip(f);
                      e.target.value = "";
                    }} />
                </label>
                {audioClips.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5 text-xs flex-wrap rounded border px-2 py-1">
                    <Music className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                    <span className="truncate max-w-32" title={c.name}>{c.name}</span>
                    <span className="tabular-nums text-muted-foreground">{fmt(c.start)}–{fmt(c.end)}</span>
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-muted-foreground"
                      title="Leva o começo do áudio até o cursor"
                      onClick={() => apply((d) => ({
                        audioClips: d.audioClips.map((p) => {
                          if (p.id !== c.id || !meta) return p;
                          const len = p.end - p.start;
                          const ns = Math.max(0, Math.min(meta.duration - len, playhead));
                          return { ...p, start: ns, end: ns + len };
                        }),
                      }))}>
                      → cursor
                    </Button>
                    <label className="flex items-center gap-1 flex-1 min-w-28" title="Volume do clipe">
                      <Volume2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <input type="range" min={0} max={150} value={Math.round(c.volume * 100)}
                        className="flex-1" onPointerDown={checkpoint}
                        onChange={(e) => applyLive((d) => ({ audioClips: d.audioClips.map((p) => (p.id === c.id ? { ...p, volume: Number(e.target.value) / 100 } : p)) }))} />
                      <span className="tabular-nums w-9 text-right">{Math.round(c.volume * 100)}%</span>
                    </label>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                      title="Duplicar este áudio" onClick={() => duplicarClip(c.id)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                      onClick={() => apply((d) => ({ audioClips: d.audioClips.filter((p) => p.id !== c.id) }))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legendas + Textos */}
      {meta && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Label id="sec-legendas" className="font-semibold flex items-center gap-2"><Captions className="h-4 w-4" /> Legendas</Label>
              <Button size="sm" variant="outline" className="h-7 gap-1" disabled={transcribing} onClick={gerarLegendas}>
                {transcribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {cues.length ? "Gerar de novo da fala" : "Gerar legendas da fala"}
              </Button>
              {cues.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={subsOn} onChange={(e) => patch({ subsOn: e.target.checked })} />
                  Incluir no vídeo ({cues.length} falas)
                </label>
              )}
            </div>
            {cues.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-2 text-xs">
                  <div className="flex gap-1.5 flex-wrap">
                    {SUB_PRESETS.map((p) => (
                      <Button key={p.label} size="sm" variant="secondary" className="h-7 text-xs"
                        onClick={() => patch({ subFont: p.font, subSize: p.size, subColor: p.color, subStyle: p.style, subPos: p.pos })}>
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  {words.length > 0 && (
                    <div className="flex gap-1.5">
                      {(["frases", "karaoke"] as const).map((m) => (
                        <button key={m} type="button"
                          onClick={() => patch({ cueMode: m, cues: groupWords(words, m) })}
                          className={`rounded-full border px-2.5 py-0.5 transition ${cueMode === m ? "border-primary ring-1 ring-primary font-medium" : "hover:border-primary/50"}`}>
                          {m === "frases" ? "Frases (~6 palavras)" : "⚡ Karaokê (2-3 palavras)"}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <select className="h-8 rounded border bg-background px-2" value={subFont} onChange={(e) => patch({ subFont: e.target.value })}>
                      {fontes.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <select className="h-8 rounded border bg-background px-2" value={subSize} onChange={(e) => patch({ subSize: e.target.value as SubSize })}>
                      <option value="p">Pequena</option><option value="m">Média</option>
                      <option value="g">Grande</option><option value="xg">Gigante</option>
                    </select>
                    <select className="h-8 rounded border bg-background px-2" value={subStyle} onChange={(e) => patch({ subStyle: e.target.value as SubStyle })}>
                      <option value="outline">Contorno</option><option value="box">Caixa escura</option>
                    </select>
                    <select className="h-8 rounded border bg-background px-2" value={subPos} onChange={(e) => patch({ subPos: e.target.value as SubPos })}>
                      <option value="bottom">Embaixo</option><option value="center">Centro</option><option value="top">Topo</option>
                    </select>
                    <label className="flex items-center gap-1.5">
                      Cor <input type="color" value={subColor} onPointerDown={checkpoint}
                        onChange={(e) => update({ subColor: e.target.value })} className="h-8 w-10 rounded border cursor-pointer" />
                    </label>
                  </div>
                  <div className="rounded-lg bg-neutral-800 h-24 flex justify-center overflow-hidden"
                    style={{ alignItems: subPos === "top" ? "flex-start" : subPos === "center" ? "center" : "flex-end", paddingTop: 10, paddingBottom: 10 }}>
                    <span style={sampleStyle}>Sua legenda fica assim ✨</span>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {cues.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <span className="tabular-nums text-muted-foreground w-14 shrink-0">{fmt(c.start)}</span>
                      <Input value={c.text} className="h-7 text-xs" onFocus={checkpoint}
                        onChange={(e) => applyLive((d) => ({ cues: d.cues.map((p, j) => (j === i ? { ...p, text: e.target.value } : p)) }))} />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive shrink-0"
                        onClick={() => apply((d) => ({ cues: d.cues.filter((_, j) => j !== i) }))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {cues.length === 0 && (
              <p className="text-xs text-muted-foreground">
                A IA transcreve a fala do vídeo e cria legendas sincronizadas — você edita o texto,
                escolhe fonte, tamanho, cor, estilo (contorno ou caixa) e posição antes de queimar no vídeo.
              </p>
            )}

            {/* Textos/títulos manuais */}
            <div className="border-t pt-3 space-y-2">
              <Label id="sec-textos" className="font-semibold text-sm flex items-center gap-1.5"><Type className="h-3.5 w-3.5" /> Textos no vídeo</Label>
              <p className="text-[11px] text-muted-foreground">
                Dica: <b>|</b> separa título e subtítulo — a 1ª linha sai grande e o resto menor,
                automático. Com posição <b>Canto esq. (selo)</b> + estilo <b>Caixa</b>:
                {" "}<code>Daiane Cenci|Ayurveda · Alimentação Integrativa</code> = selo profissional.
              </p>
              <div className="flex gap-1.5 flex-wrap items-center text-xs">
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  placeholder='Ex.: "Daiane Cenci|Naturóloga"' className="h-8 text-xs max-w-56" />
                <label className="flex items-center gap-1">por
                  <Input type="number" min={1} max={30} value={newTitleDur}
                    onChange={(e) => setNewTitleDur(Math.max(1, Math.min(30, Number(e.target.value) || 3)))}
                    className="h-8 w-14 text-xs" />s
                </label>
                {/* sem texto fora dos "|" não há o que desenhar (e o motor
                    quebrava com um texto só de pipes) */}
                <Button size="sm" variant="outline" className="h-8"
                  disabled={!newTitle.replace(/\|/g, "").trim()}
                  onClick={() => {
                    if (!meta) return;
                    const tid = newId();
                    apply((d) => ({
                      titles: [...d.titles, {
                        id: tid,
                        start: playhead, end: Math.min(meta.duration, playhead + newTitleDur),
                        text: newTitle.trim(), font_id: d.subFont, size: d.subSize,
                        color: d.subColor, style: d.subStyle, position: "center" as TitlePos,
                      }],
                    }));
                    setNewTitle("");
                    toast.success("Texto adicionado a partir do cursor — ajuste o estilo na lista.");
                  }}>
                  + Adicionar no cursor ({fmt(playhead)})
                </Button>
              </div>
              {titles.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5 text-xs flex-wrap rounded border px-2 py-1">
                  <span className="tabular-nums text-muted-foreground">{fmt(t.start)}–{fmt(t.end)}</span>
                  <Input value={t.text} className="h-7 text-xs flex-1 min-w-32" onFocus={checkpoint}
                    onChange={(e) => applyLive((d) => ({ titles: d.titles.map((p) => (p.id === t.id ? { ...p, text: e.target.value } : p)) }))} />
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-muted-foreground"
                    title="Leva o começo do texto até o cursor"
                    onClick={() => apply((d) => ({ titles: d.titles.map((p) => (p.id === t.id ? paraOCursor(p) : p)) }))}>
                    → cursor
                  </Button>
                  <label className="flex items-center gap-1" title="Quanto tempo o texto fica na tela">
                    <Input type="number" min={0.5} max={60} step={0.5}
                      value={Number((t.end - t.start).toFixed(1))}
                      className="h-7 w-14 text-xs tabular-nums"
                      onFocus={checkpoint}
                      onChange={(e) => {
                        // digitação = contínua (applyLive): o ajuste inteiro vira
                        // 1 passo de Desfazer, não um por tecla
                        if (e.target.value === "") return;   // deixa apagar pra redigitar
                        const len = Math.max(0.5, Math.min(60, Number(e.target.value)));
                        applyLive((d) => ({
                          titles: d.titles.map((p) => (p.id === t.id
                            ? { ...p, end: Math.min(meta?.duration ?? p.end, p.start + len) } : p)),
                        }));
                      }} />s
                  </label>
                  <select className="h-7 rounded border bg-background px-1" value={t.font_id}
                    onChange={(e) => apply((d) => ({ titles: d.titles.map((p) => (p.id === t.id ? { ...p, font_id: e.target.value } : p)) }))}>
                    {fontes.map((f) => <option key={f.id} value={f.id}>{f.label.split(" (")[0]}</option>)}
                  </select>
                  <select className="h-7 rounded border bg-background px-1" value={t.size}
                    onChange={(e) => apply((d) => ({ titles: d.titles.map((p) => (p.id === t.id ? { ...p, size: e.target.value as SubSize } : p)) }))}>
                    <option value="p">P</option><option value="m">M</option><option value="g">G</option><option value="xg">XG</option>
                  </select>
                  <select className="h-7 rounded border bg-background px-1" value={t.position}
                    onChange={(e) => apply((d) => ({ titles: d.titles.map((p) => (p.id === t.id ? { ...p, position: e.target.value as TitlePos } : p)) }))}>
                    <option value="top">Topo</option><option value="center">Centro</option><option value="bottom">Embaixo</option>
                    <option value="left-bottom">◧ Esq. baixo (selo)</option>
                    <option value="left-center">◧ Esq. centro</option>
                    <option value="left-top">◩ Esq. topo</option>
                  </select>
                  <input type="color" value={t.color} className="h-7 w-8 rounded border cursor-pointer"
                    onPointerDown={checkpoint}
                    onChange={(e) => applyLive((d) => ({ titles: d.titles.map((p) => (p.id === t.id ? { ...p, color: e.target.value } : p)) }))} />
                  <select className="h-7 rounded border bg-background px-1" value={t.style}
                    onChange={(e) => apply((d) => ({ titles: d.titles.map((p) => (p.id === t.id ? { ...p, style: e.target.value as SubStyle } : p)) }))}>
                    <option value="outline">Contorno</option><option value="box">Caixa</option>
                  </select>
                  {/* animações (spec 12): entram/saem/repetem — veja no player */}
                  <label className="flex items-center gap-1" title="Como o texto ENTRA na tela">
                    <LogIn className="h-3.5 w-3.5 text-muted-foreground" />
                    <select className="h-7 rounded border bg-background px-1" value={t.anim_in ?? "nenhuma"}
                      onChange={(e) => apply((d) => ({ titles: d.titles.map((p) => (p.id === t.id ? { ...p, anim_in: e.target.value as AnimIn } : p)) }))}>
                      {ANIM_IN_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1" title="Como o texto SAI da tela">
                    <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
                    <select className="h-7 rounded border bg-background px-1" value={t.anim_out ?? "nenhuma"}
                      onChange={(e) => apply((d) => ({ titles: d.titles.map((p) => (p.id === t.id ? { ...p, anim_out: e.target.value as AnimOut } : p)) }))}>
                      {ANIM_OUT_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1" title="Movimento contínuo enquanto o texto está na tela">
                    <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                    <select className="h-7 rounded border bg-background px-1" value={t.anim_loop ?? "nenhuma"}
                      onChange={(e) => apply((d) => ({ titles: d.titles.map((p) => (p.id === t.id ? { ...p, anim_loop: e.target.value as AnimLoop } : p)) }))}>
                      {ANIM_LOOP_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </label>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground ml-auto"
                    title="Duplicar este texto" onClick={() => duplicarTexto(t.id)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                    onClick={() => apply((d) => ({ titles: d.titles.filter((p) => p.id !== t.id) }))}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rodapé: renderizar (pedido do Carlos — o fluxo termina aqui) */}
      {meta && (
        <Card className="border-primary/40">
          <CardContent className="pt-5 space-y-4">
            {!keepSegments.length && (
              <div className="flex items-center gap-2 flex-wrap rounded-lg border border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 text-xs">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <span>
                  Todos os trechos do vídeo estão <b>removidos</b> na timeline — por isso o salvar
                  está travado (duração 0:00). Restaure o que quer manter:
                </span>
                <Button size="sm" className="h-7"
                  onClick={() => {
                    // 1 trecho [0..duração]: cobre inclusive regiões que algum
                    // ajuste antigo tenha deixado órfãs
                    patch({ segments: [{ id: 1, start: 0, end: meta.duration, keep: true }] });
                    toast.success("Vídeo inteiro restaurado — remova só o que não quiser.");
                  }}>
                  Restaurar o vídeo inteiro
                </Button>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Input value={titulo} onFocus={checkpoint}
                onChange={(e) => update({ titulo: e.target.value })}
                placeholder="Título do vídeo editado (opcional)" className="text-sm max-w-xs" />
              <Button size="lg" onClick={renderizar} disabled={rendering || !keepSegments.length} className="gap-2">
                {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {rendering ? `${renderProgress}% — ${renderStep}` : "Renderizar e salvar"}
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                duração final: <b>{fmt(finalDuration)}</b>
              </span>
              {rendering && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> Pode sair da tela — o vídeo cai em Meus Vídeos.
                </span>
              )}
            </div>

            {resultUrl && (
              <div className="pt-1 space-y-2">
                <Label className="font-semibold text-primary flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Edição pronta</Label>
                <video src={resultUrl} controls playsInline className="w-full max-h-72 rounded-lg bg-black" />

                {/* opções de saída (spec 22) */}
                <div className="flex items-center gap-2 flex-wrap text-xs rounded-lg border bg-muted/30 px-3 py-2">
                  <span className="font-medium">Opções de saída:</span>
                  <label className="flex items-center gap-1">Qualidade
                    <select className="h-7 rounded border bg-background px-1"
                      value={expFormato === "gif" ? "480p" : expRes}
                      disabled={expFormato === "gif"}
                      onChange={(e) => setExpRes(e.target.value)}>
                      {(expFormato === "gif" ? [{ id: "480p", label: "480p" }] : EXPORT_RESOLUCOES)
                        .map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1">FPS
                    <select className="h-7 rounded border bg-background px-1" value={expFps}
                      disabled={expFormato === "gif"}
                      onChange={(e) => setExpFps(Number(e.target.value))}>
                      {EXPORT_FPS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1">Formato
                    <select className="h-7 rounded border bg-background px-1" value={expFormato}
                      onChange={(e) => setExpFormato(e.target.value)}>
                      {EXPORT_FORMATOS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </label>
                  {expFormato !== "gif" && codecsDisp.length > 1 && (
                    <label className="flex items-center gap-1">Codec
                      <select className="h-7 rounded border bg-background px-1" value={expCodec}
                        onChange={(e) => setExpCodec(e.target.value)}>
                        {EXPORT_CODECS.filter((c) => codecsDisp.includes(c.id))
                          .map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </label>
                  )}
                  {expFormato === "gif" && (
                    <span className="text-muted-foreground">GIF sai curto, sem som, em 480p</span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-muted-foreground">Gerar para:</span>
                  {(["9:16", "1:1", "16:9"] as const).map((f) => (
                    <Button key={f} size="sm" variant="outline" className="h-7"
                      disabled={!!exporting} onClick={() => exportarFormato(f)}>
                      {exporting === f ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                      {f === "9:16" ? "📱 Reels 9:16" : f === "1:1" ? "◻ Feed 1:1" : "🖥 YouTube 16:9"}
                    </Button>
                  ))}
                  {exporting && (
                    <span className="text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Pode sair da tela — cai em Meus Vídeos.
                    </span>
                  )}
                </div>
                {gifUrl && (
                  <a href={gifUrl} download
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Download className="h-3.5 w-3.5" /> Baixar o GIF de novo (não vai para Meus Vídeos)
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

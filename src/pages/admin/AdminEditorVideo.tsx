/**
 * Editor de Vídeo — corte + música + legendas + textos + stickers + clipes de
 * áudio posicionados (motor próprio no video-api, código SEPARADO do
 * Institucional e do Criar Vídeo).
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
 *   - PERSISTÊNCIA: toda a edição (cortes, música, legendas, textos, estilos)
 *     é salva no navegador a cada mudança e restaurada ao voltar; o vídeo é
 *     servido pelo backend (GET /editor/video/{id}), então sobrevive a F5 —
 *     inclusive uploads. Se o arquivo expirar no servidor, aviso claro.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { videoApiAuthHeaders } from "@/lib/videoApi";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";
const EDITOR_STORAGE_KEY = "pp-editor-video";

type Segment = { id: number; start: number; end: number; keep: boolean };
type EditMeta = { edit_id: string; duration: number; width: number; height: number; has_audio: boolean; thumbs: string[]; preview_url?: string };
type Cue = { start: number; end: number; text: string };
type SubSize = "p" | "m" | "g" | "xg";
type SubStyle = "outline" | "box";
type SubPos = "bottom" | "center" | "top";
// Textos aceitam também o canto esquerdo (estilo selo/lower-third — Carlos 06/07)
type TitlePos = SubPos | "left-bottom" | "left-center" | "left-top";
type Title = { start: number; end: number; text: string; font_id: string; size: SubSize; color: string; style: SubStyle; position: TitlePos };

// Stickers/sobreposições (Carlos 10/07): imagem, GIF ou WebM-alpha sobre o
// vídeo, com posição (centro em % da tela), tamanho, movimento e loop.
type StickerMovement = "none" | "walk-right" | "walk-left";
type Sticker = {
  id: number; upload_id: string; name: string; animated: boolean;
  natural_dur: number; start: number; end: number;
  x_pct: number; y_pct: number; scale_pct: number;
  movement: StickerMovement; loop: boolean; flip: boolean;
};
// Clipes de áudio POSICIONADOS (efeito sonoro/narração em ponto exato) —
// diferentes da trilha global: cada um tem início/fim/volume próprios.
type AudioClip = {
  id: number; upload_id: string; name: string; natural_dur: number;
  start: number; end: number; volume: number;
};
// Job de geração de sticker por IA — persistido pra sobreviver à navegação
type StickerJob = { job_id: string; at: number; desc: string };

const STICKER_SIZES: { value: number; label: string }[] = [
  { value: 0.12, label: "P" }, { value: 0.22, label: "M" },
  { value: 0.32, label: "G" }, { value: 0.45, label: "XG" },
];
const STICKER_POSITIONS = [
  { key: "id", label: "Canto inf. direito", x: 0.84, y: 0.76 },
  { key: "ie", label: "Canto inf. esquerdo", x: 0.16, y: 0.76 },
  { key: "sd", label: "Canto sup. direito", x: 0.84, y: 0.18 },
  { key: "se", label: "Canto sup. esquerdo", x: 0.16, y: 0.18 },
  { key: "c", label: "Centro", x: 0.5, y: 0.5 },
  { key: "cb", label: "Centro embaixo", x: 0.5, y: 0.78 },
];

const SUB_PRESETS = [
  { label: "🔥 Viral amarelo", font: "anton", size: "g" as SubSize, color: "#FFE14D", style: "box" as SubStyle, pos: "bottom" as SubPos },
  { label: "✨ Clean branco", font: "poppins", size: "m" as SubSize, color: "#FFFFFF", style: "outline" as SubStyle, pos: "bottom" as SubPos },
  { label: "📱 TikTok caixa", font: "bevietnam", size: "g" as SubSize, color: "#FFFFFF", style: "box" as SubStyle, pos: "bottom" as SubPos },
  { label: "🎬 Cinema", font: "bebas", size: "m" as SubSize, color: "#F5F5F5", style: "outline" as SubStyle, pos: "bottom" as SubPos },
];

// Espelho do agrupamento do backend — reagrupa words em cues sem nova transcrição
const groupWords = (ws: Cue[], mode: "frases" | "karaoke"): Cue[] => {
  const maxW = mode === "karaoke" ? 3 : 6;
  const maxC = mode === "karaoke" ? 22 : 42;
  const cues: Cue[] = [];
  let cur: Cue[] = [];
  const flush = () => {
    if (cur.length) cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((x) => x.text).join(" ") });
    cur = [];
  };
  for (const w of ws) {
    if (cur.length && (cur.length >= maxW || w.start - cur[cur.length - 1].end > 0.6 ||
        cur.reduce((a, x) => a + x.text.length + 1, 0) + w.text.length > maxC)) flush();
    cur.push(w);
  }
  flush();
  return cues;
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toFixed(1).padStart(4, "0")}`;
};
const parseTime = (v: string): number | null => {
  const t = v.trim().replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const m = t.match(/^(\d+):(\d{1,2}(\.\d+)?)$/);
  if (m) return parseInt(m[1]) * 60 + parseFloat(m[2]);
  return null;
};

export default function AdminEditorVideo() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [meta, setMeta] = useState<EditMeta | null>(null);
  const [previewSrc, setPreviewSrc] = useState("");
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");

  const [segments, setSegments] = useState<Segment[]>([]);
  const [history, setHistory] = useState<Segment[][]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [startField, setStartField] = useState("");
  const [endField, setEndField] = useState("");
  const [cutStart, setCutStart] = useState("");   // caixinha FIXA de corte por tempo
  const [cutEnd, setCutEnd] = useState("");
  const [previewEdit, setPreviewEdit] = useState(true);   // play pula trechos removidos

  const [musicas, setMusicas] = useState<{ id: string; label: string }[]>([]);
  const [musicId, setMusicId] = useState("");
  const [musicUploadId, setMusicUploadId] = useState("");
  const [musicUploadName, setMusicUploadName] = useState("");
  const [musicVolume, setMusicVolume] = useState(20);
  const [originalVolume, setOriginalVolume] = useState(100);
  const [fadeOut, setFadeOut] = useState(true);
  const [previewingTrack, setPreviewingTrack] = useState("");

  const [fontes, setFontes] = useState<{ id: string; label: string }[]>([]);
  const [subsOn, setSubsOn] = useState(false);
  const [cues, setCues] = useState<Cue[]>([]);
  const [words, setWords] = useState<Cue[]>([]);
  const [cueMode, setCueMode] = useState<"frases" | "karaoke">("frases");
  const [transcribing, setTranscribing] = useState(false);
  const [subFont, setSubFont] = useState("bevietnam");
  const [subSize, setSubSize] = useState<SubSize>("m");
  const [subColor, setSubColor] = useState("#FFFFFF");
  const [subStyle, setSubStyle] = useState<SubStyle>("outline");
  const [subPos, setSubPos] = useState<SubPos>("bottom");
  const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set());

  const [titles, setTitles] = useState<Title[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newTitleDur, setNewTitleDur] = useState(3);

  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [audioClips, setAudioClips] = useState<AudioClip[]>([]);
  const [uploadingSticker, setUploadingSticker] = useState(false);
  const [uploadingClip, setUploadingClip] = useState(false);
  const [iaDesc, setIaDesc] = useState("");
  const [iaDur, setIaDur] = useState(5);
  const [iaStep, setIaStep] = useState("");
  const [stickerJob, setStickerJob] = useState<StickerJob | null>(null);
  const [videoBox, setVideoBox] = useState({ w: 0, h: 0 });

  const [transition, setTransition] = useState<"none" | "fade">("none");
  const [ducking, setDucking] = useState(true);
  const [punchIn, setPunchIn] = useState(false);

  // capa de entrada (logo)
  const [introOn, setIntroOn] = useState(false);
  const [introSource, setIntroSource] = useState<"perfil" | "upload">("perfil");
  const [introUploadId, setIntroUploadId] = useState("");
  const [introUploadName, setIntroUploadName] = useState("");
  const [introDur, setIntroDur] = useState(2);
  const [introBg, setIntroBg] = useState("#FFFFFF");
  const [introEffect, setIntroEffect] = useState<"zoom" | "slide" | "fade">("zoom");
  const perfilLogo = ((professional as any)?.logo_url as string) || "";

  const [aiCutText, setAiCutText] = useState("");
  const [aiCutting, setAiCutting] = useState(false);
  const [exporting, setExporting] = useState("");

  const [titulo, setTitulo] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderJobId, setRenderJobId] = useState("");   // persiste: retoma o acompanhamento ao voltar
  const [renderStep, setRenderStep] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const restoredRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<EditMeta | null>(null);
  const clipAudiosRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const trackDragRef = useRef<{ kind: "sticker" | "audio"; id: number; mode: "move" | "resize"; grab: number } | null>(null);
  const stickerDragRef = useRef<number | null>(null);
  const stickerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    fetch(`${API}/editor/musicas`).then((r) => r.json()).then((d) => setMusicas(d.musicas || [])).catch(() => {});
    fetch(`${API}/editor/fontes`).then((r) => r.json()).then((d) => setFontes(d.fontes || [])).catch(() => {});
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
            setStickers((prev) => [...prev, {
              id: Date.now(), upload_id: st.sticker_upload_id,
              name: `✨ ${job.desc.slice(0, 24)}`, animated: true,
              natural_dur: Number(st.duration) || 5,
              start: job.at, end: Math.min(m.duration, job.at + dur),
              x_pct: 0.84, y_pct: 0.76, scale_pct: 0.26,
              movement: walk ? "walk-right" : "none", loop: true, flip: false,
            }]);
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
        const saved = JSON.parse(localStorage.getItem(EDITOR_STORAGE_KEY) || "null");
        if (saved?.meta?.edit_id) fd.append("replace_edit_id", saved.meta.edit_id);
      } catch { /* sem draft anterior */ }
      await carregar(fd, title);
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
        const s = JSON.parse(raw);
        if (!s?.meta?.edit_id) { restoredRef.current = true; return; }
        // Ping NÃO-destrutivo: só descarta com 404 EXPLÍCITO (arquivo realmente
        // morto). Servidor ocupado/rede instável → restaura mesmo assim.
        const head = await fetch(`${API}/editor/video/${s.meta.edit_id}`, { method: "HEAD" }).catch(() => null);
        if (head && head.status === 404) {
          localStorage.removeItem(EDITOR_STORAGE_KEY);
          toast.info("A edição anterior expirou no servidor — carregue o vídeo de novo.", { duration: 8000 });
          restoredRef.current = true;
          return;
        }
        if (!head || !head.ok) {
          toast.info("O servidor está ocupado — restaurei suas edições; o vídeo pode demorar um pouco pra carregar.", { duration: 8000 });
        }
        setMeta(s.meta);
        setPreviewSrc(s.meta.preview_url || `${API}/editor/video/${s.meta.edit_id}`);
        setSourceLabel(s.sourceLabel || "");
        setSegments(s.segments?.length ? s.segments : [{ id: 1, start: 0, end: s.meta.duration, keep: true }]);
        setMusicId(s.musicId || ""); setMusicUploadId(s.musicUploadId || ""); setMusicUploadName(s.musicUploadName || "");
        setMusicVolume(s.musicVolume ?? 20); setOriginalVolume(s.originalVolume ?? 100); setFadeOut(s.fadeOut ?? true);
        setSubsOn(!!s.subsOn); setCues(s.cues || []); setWords(s.words || []); setCueMode(s.cueMode || "frases");
        setSubFont(s.subFont || "bevietnam"); setSubSize(s.subSize || "m"); setSubColor(s.subColor || "#FFFFFF");
        setSubStyle(s.subStyle || "outline"); setSubPos(s.subPos || "bottom");
        setTitles(s.titles || []); setTransition(s.transition || "none");
        setStickers(s.stickers || []); setAudioClips(s.audioClips || []);
        setDucking(s.ducking ?? true); setPunchIn(!!s.punchIn); setTitulo(s.titulo || "");
        setIntroOn(!!s.introOn); setIntroSource(s.introSource || "perfil");
        setIntroUploadId(s.introUploadId || ""); setIntroUploadName(s.introUploadName || "");
        setIntroDur(s.introDur ?? 2); setIntroBg(s.introBg || "#FFFFFF");
        setIntroEffect(s.introEffect || "zoom");
        setResultUrl(s.resultUrl || "");
        if (s.stickerJob?.job_id) {
          // geração de sticker em andamento — retoma o acompanhamento
          setStickerJob(s.stickerJob);
          setIaStep("Retomando a geração do sticker...");
          pollStickerJob(s.stickerJob);
        }
        if (s.renderJobId) {
          // havia uma renderização em andamento — RETOMA o acompanhamento
          setRenderJobId(s.renderJobId);
          setRendering(true);
          setRenderStep("Retomando o acompanhamento...");
          pollRender(s.renderJobId);
          toast.info("Sua renderização continuou no servidor — acompanhando de novo.", { duration: 7000 });
        } else {
          toast.success("Edição anterior restaurada — continue de onde parou.");
        }
      } catch { /* estado corrompido — segue vazio */ }
      restoredRef.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restoredRef.current) return;
    if (!meta) { localStorage.removeItem(EDITOR_STORAGE_KEY); return; }
    try {
      localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify({
        meta, sourceLabel, segments, musicId, musicUploadId, musicUploadName,
        musicVolume, originalVolume, fadeOut, subsOn, cues, words, cueMode,
        subFont, subSize, subColor, subStyle, subPos, titles, transition,
        ducking, punchIn, titulo, resultUrl, renderJobId,
        introOn, introSource, introUploadId, introUploadName, introDur, introBg, introEffect,
        stickers, audioClips, stickerJob,
      }));
    } catch { /* localStorage cheio — ignora */ }
  }, [meta, sourceLabel, segments, musicId, musicUploadId, musicUploadName,
      musicVolume, originalVolume, fadeOut, subsOn, cues, words, cueMode,
      subFont, subSize, subColor, subStyle, subPos, titles, transition,
      ducking, punchIn, titulo, resultUrl, renderJobId,
      introOn, introSource, introUploadId, introUploadName, introDur, introBg, introEffect,
      stickers, audioClips, stickerJob]);

  // Prévia da trilha respeita o slider em tempo real
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.min(1, musicVolume / 100);
  }, [musicVolume, previewingTrack]);

  // Fonte real do servidor via @font-face → amostra idêntica ao resultado
  useEffect(() => {
    if (!subFont || loadedFonts.has(subFont)) return;
    const face = new FontFace(`edfont-${subFont}`, `url(${API}/editor/fonte/${subFont})`);
    face.load().then((f) => {
      (document as any).fonts.add(f);
      setLoadedFonts((prev) => new Set(prev).add(subFont));
    }).catch(() => {});
  }, [subFont, loadedFonts]);

  const resetEditor = (m: EditMeta, label: string) => {
    setMeta(m);
    // preview pela CDN do Storage (inicia mais rápido); fallback = worker
    setPreviewSrc(m.preview_url || `${API}/editor/video/${m.edit_id}`);
    setSourceLabel(label);
    setSegments([{ id: 1, start: 0, end: m.duration, keep: true }]);
    setHistory([]); setPlayhead(0); setResultUrl(""); setCues([]); setWords([]);
    setSubsOn(false); setTitles([]);
    setStickers([]); setAudioClips([]);
    clipAudiosRef.current.forEach((el) => el.pause());
    clipAudiosRef.current.clear();
  };

  const recomecar = () => {
    if (!confirm("Descartar esta edição e recomeçar?")) return;
    if (meta?.edit_id) {
      // limpa o arquivo de trabalho no servidor (tmp + Storage) — best-effort
      fetch(`${API}/editor/descartar/${meta.edit_id}`, { method: "DELETE" }).catch(() => {});
    }
    setMeta(null); setPreviewSrc(""); setSourceLabel(""); setSegments([]); setHistory([]);
    setCues([]); setWords([]); setTitles([]); setResultUrl(""); setSubsOn(false);
    setRenderJobId("");
    setStickers([]); setAudioClips([]); setStickerJob(null); setIaStep("");
    if (stickerPollRef.current) clearInterval(stickerPollRef.current);
    clipAudiosRef.current.forEach((el) => el.pause());
    clipAudiosRef.current.clear();
    localStorage.removeItem(EDITOR_STORAGE_KEY);
  };

  const carregar = async (form: FormData, label: string) => {
    setLoadingSource(true);
    try {
      if (meta?.edit_id) form.append("replace_edit_id", meta.edit_id);   // descarta o draft anterior
      const res = await fetch(`${API}/editor/carregar`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao carregar o vídeo");
      resetEditor(data, label);
      toast.success("Vídeo carregado! Clique na timeline para posicionar o cursor.");
    } catch (e: any) {
      toast.error(e.message, { duration: 7000 });
    } finally {
      setLoadingSource(false);
    }
  };

  // ── timeline ───────────────────────────────────────────────────────────────
  const pushHistory = () => setHistory((h) => [...h.slice(-19), segments.map((s) => ({ ...s }))]);
  const undo = () => setHistory((h) => {
    if (!h.length) return h;
    setSegments(h[h.length - 1]);
    return h.slice(0, -1);
  });

  const seekTo = (t: number) => {
    const clamped = Math.max(0, Math.min(meta?.duration ?? 0, t));
    setPlayhead(clamped);
    if (videoRef.current) videoRef.current.currentTime = clamped;
  };
  const posFromEvent = (clientX: number) => {
    if (!timelineRef.current || !meta) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * meta.duration;
  };
  const onTimelineDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    seekTo(posFromEvent(e.clientX));
  };
  useEffect(() => {
    const move = (e: MouseEvent) => { if (draggingRef.current) seekTo(posFromEvent(e.clientX)); };
    const up = () => { draggingRef.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.duration]);

  // Prévia da edição: durante o PLAY, pula os trechos removidos (pausado, o
  // cursor vai a qualquer lugar — inclusive dentro de trecho removido).
  const onVideoTime = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (previewEdit && !v.paused && segments.length) {
      const removed = segments.find((s) => !s.keep && v.currentTime >= s.start && v.currentTime < s.end - 0.05);
      if (removed) {
        const next = segments
          .filter((s) => s.keep && s.end > removed.end - 0.05)
          .sort((a, b) => a.start - b.start)[0];
        if (next) v.currentTime = Math.max(next.start, removed.end);
        else v.pause();
      }
    }
    if (!draggingRef.current) setPlayhead(v.currentTime);
  };

  const splitAtPlayhead = () => {
    if (!meta) return;
    const seg = segments.find((s) => playhead > s.start + 0.2 && playhead < s.end - 0.2);
    if (!seg) { toast.info("Posicione o cursor DENTRO de um trecho para dividir."); return; }
    pushHistory();
    setSegments((prev) => {
      const next: Segment[] = [];
      let nid = Math.max(...prev.map((p) => p.id)) + 1;
      for (const s of prev) {
        if (s.id === seg.id) {
          next.push({ ...s, end: playhead });
          next.push({ id: nid++, start: playhead, end: s.end, keep: s.keep });
        } else next.push(s);
      }
      return next;
    });
  };

  const toggleSegment = (id: number) => {
    pushHistory();
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, keep: !s.keep } : s)));
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
    pushHistory();
    setSegments((prev) => {
      const next: Segment[] = [];
      let nid = Math.max(0, ...prev.map((p) => p.id)) + 1;
      for (const s of prev) {
        if (s.end <= ca || s.start >= cb) { next.push(s); continue; }
        if (s.start < ca) next.push({ id: nid++, start: s.start, end: ca, keep: s.keep });
        next.push({ id: nid++, start: Math.max(s.start, ca), end: Math.min(s.end, cb), keep: false });
        if (s.end > cb) next.push({ id: nid++, start: cb, end: s.end, keep: s.keep });
      }
      return next.filter((s) => s.end - s.start >= 0.15);
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
    pushHistory();
    // Encolher um trecho NÃO apaga a região: a sobra vira trecho REMOVIDO
    // (restaurável na timeline) — antes ela sumia sem volta (bug do Carlos:
    // "reverto e só volta o último corte").
    setSegments((prev) => {
      const next: Segment[] = [];
      let nid = Math.max(0, ...prev.map((p) => p.id)) + 1;
      for (const s of prev) {
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
      return next;
    });
  };

  const keepSegments = segments.filter((s) => s.keep);
  const finalDuration = keepSegments.reduce((a, s) => a + (s.end - s.start), 0);

  // ── cortar com IA ──────────────────────────────────────────────────────────
  const applyAiSegments = (keeps: { start: number; end: number }[]) => {
    if (!meta || !keeps.length) return;
    pushHistory();
    const segs: Segment[] = [];
    let id = 1, cursor = 0;
    for (const k of keeps) {
      const s = Math.max(0, k.start), e = Math.min(meta.duration, k.end);
      if (s > cursor + 0.05) segs.push({ id: id++, start: cursor, end: s, keep: false });
      segs.push({ id: id++, start: s, end: e, keep: true });
      cursor = e;
    }
    if (cursor < meta.duration - 0.05) segs.push({ id: id++, start: cursor, end: meta.duration, keep: false });
    setSegments(segs);
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
      const res = await fetch(`${API}/editor/carregar-musica`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao enviar a música");
      setMusicUploadId(data.music_upload_id); setMusicUploadName(file.name); setMusicId("");
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
      const res = await fetch(`${API}/editor/carregar-sticker`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao enviar o sticker");
      const start = Math.min(playhead, Math.max(0, meta.duration - 1));
      const dur = data.animated && data.duration > 0.5 ? Math.max(2, data.duration) : 4;
      setStickers((prev) => [...prev, {
        id: Date.now(), upload_id: data.sticker_upload_id, name: file.name,
        animated: !!data.animated, natural_dur: data.duration || 0,
        start, end: Math.min(meta.duration, start + dur),
        x_pct: 0.84, y_pct: 0.76, scale_pct: 0.22,
        movement: "none", loop: true, flip: false,
      }]);
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
      const res = await fetch(`${API}/editor/carregar-musica`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao enviar o áudio");
      const start = Math.min(playhead, Math.max(0, meta.duration - 1));
      const nat = Number(data.duration) || 5;
      setAudioClips((prev) => [...prev, {
        id: Date.now(), upload_id: data.music_upload_id, name: file.name,
        natural_dur: nat, start,
        end: Math.min(meta.duration, start + nat), volume: 1,
      }]);
      toast.success("Áudio adicionado a partir do cursor — mova/estique o bloco azul na timeline.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploadingClip(false);
    }
  };

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
  const onTrackDown = (e: React.PointerEvent, kind: "sticker" | "audio", id: number, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    const item = kind === "sticker"
      ? stickers.find((s) => s.id === id)
      : audioClips.find((c) => c.id === id);
    if (!item || !meta) return;
    trackDragRef.current = { kind, id, mode, grab: posFromEvent(e.clientX) - item.start };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onTrackMove = (e: React.PointerEvent) => {
    const d = trackDragRef.current;
    if (!d || !meta) return;
    const t = posFromEvent(e.clientX);
    const apply = <T extends { start: number; end: number; natural_dur: number }>(item: T): T => {
      if (d.mode === "move") {
        const len = item.end - item.start;
        const ns = Math.max(0, Math.min(meta.duration - len, t - d.grab));
        return { ...item, start: ns, end: ns + len };
      }
      let ne = Math.max(item.start + 0.3, Math.min(meta.duration, t));
      // áudio não estica além do arquivo; sticker pode (loop/último frame)
      if (d.kind === "audio") ne = Math.min(ne, item.start + (item.natural_dur || 9999));
      return { ...item, end: ne };
    };
    if (d.kind === "sticker") setStickers((prev) => prev.map((s) => (s.id === d.id ? apply(s) : s)));
    else setAudioClips((prev) => prev.map((c) => (c.id === d.id ? apply(c) : c)));
  };
  const onTrackUp = () => { trackDragRef.current = null; };

  // Arrasto do sticker DENTRO do player (posicionamento visual)
  const onStickerPreviewDown = (e: React.PointerEvent, id: number) => {
    const st = stickers.find((x) => x.id === id);
    if (!st || st.movement !== "none") return;
    e.preventDefault();
    e.stopPropagation();
    stickerDragRef.current = id;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onStickerPreviewMove = (e: React.PointerEvent) => {
    const id = stickerDragRef.current;
    if (id === null || !videoWrapRef.current || !contentRect) return;
    const rect = videoWrapRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - contentRect.left) / contentRect.w;
    const y = (e.clientY - rect.top - contentRect.top) / contentRect.h;
    setStickers((prev) => prev.map((s) => (s.id === id
      ? { ...s, x_pct: Math.max(0, Math.min(1, x)), y_pct: Math.max(0, Math.min(1, y)) }
      : s)));
  };
  const onStickerPreviewUp = () => { stickerDragRef.current = null; };

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

  // Playhead fluido durante o play (timeupdate nativo é ~4Hz — pouco pra
  // prévia de sticker andando e sincronização dos clipes de áudio)
  useEffect(() => {
    if (!meta) return;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused && !draggingRef.current) setPlayhead(v.currentTime);
    }, 120);
    return () => clearInterval(id);
  }, [meta]);

  // Prévia dos clipes de áudio: toca cada clipe na janela dele, no ponto certo
  useEffect(() => {
    const v = videoRef.current;
    const playing = !!v && !v.paused;
    for (const c of audioClips) {
      let el = clipAudiosRef.current.get(c.id);
      const active = playing && playhead >= c.start && playhead < c.end;
      if (active) {
        if (!el) {
          el = new Audio(`${API}/editor/audio/${c.upload_id}`);
          clipAudiosRef.current.set(c.id, el);
        }
        el.volume = Math.max(0, Math.min(1, c.volume));
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
  }, [playhead, audioClips]);

  const activeStickers = meta
    ? stickers.filter((s) => playhead >= s.start && playhead <= s.end)
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edit_id: meta.edit_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao transcrever");
      const timer = setInterval(async () => {
        try {
          const st = await (await fetch(`${API}/status/${data.job_id}`)).json();
          if (st.status === "done") {
            clearInterval(timer); setTranscribing(false);
            setWords(st.words || []);
            setCues(cueMode === "karaoke" && st.words?.length ? groupWords(st.words, "karaoke") : (st.cues || []));
            setSubsOn(true);
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
      const res = await fetch(`${API}/editor/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await videoApiAuthHeaders()) },
        body: JSON.stringify({
          professional_slug: professional.slug,
          edit_id: meta.edit_id,
          keep_segments: keepSegments.map((s) => ({ start: s.start, end: s.end })),
          music_id: musicUploadId ? "" : musicId,
          music_upload_id: musicUploadId,
          music_volume: musicVolume / 100,
          original_volume: originalVolume / 100,
          fade_out: fadeOut,
          titulo: titulo.trim(),
          subtitles: subsOn && cues.length
            ? { cues, font_id: subFont, size: subSize, color: subColor, style: subStyle, position: subPos }
            : undefined,
          titles: titles.length ? titles : undefined,
          stickers: stickers.length ? stickers.map((s) => ({
            sticker_upload_id: s.upload_id, start: s.start, end: s.end,
            x_pct: s.x_pct, y_pct: s.y_pct, scale_pct: s.scale_pct,
            movement: s.movement, loop: s.loop, flip: s.flip,
          })) : undefined,
          audio_clips: audioClips.length ? audioClips.map((c) => ({
            upload_id: c.upload_id, start: c.start, end: c.end, volume: c.volume,
          })) : undefined,
          transition,
          ducking,
          punch_in: punchIn,
          intro: introOn && (introSource === "upload" ? introUploadId : perfilLogo)
            ? {
                ...(introSource === "upload"
                  ? { logo_upload_id: introUploadId }
                  : { image_url: perfilLogo }),
                duration: introDur,
                bg: introBg,
                effect: introEffect,
              }
            : undefined,
        }),
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
        body: JSON.stringify({ professional_slug: professional.slug, video_url: resultUrl, format, titulo: titulo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao exportar");
      const timer = setInterval(async () => {
        try {
          const st = await (await fetch(`${API}/status/${data.job_id}`)).json();
          if (st.status === "done") {
            clearInterval(timer); setExporting("");
            toast.success(`Versão ${format} pronta — está em Meus Vídeos!`);
            queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
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
    <div className="space-y-4">
      <audio ref={audioRef} onEnded={() => setPreviewingTrack("")} />
      <div className="flex items-center gap-2 flex-wrap">
        <Scissors className="h-5 w-5 text-primary" />
        <h2 className="font-heading text-xl font-bold">Editor de Vídeo</h2>
        <Badge variant="secondary">corte · música · legendas</Badge>
        {meta && (
          <>
            <span className="text-xs text-muted-foreground truncate">— {sourceLabel}</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={recomecar}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Recomeçar
            </Button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Biblioteca */}
        <Card>
          <CardContent className="pt-4 space-y-3">
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
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {mp4Videos.length === 0 && <p className="text-xs text-muted-foreground">Seus vídeos gerados aparecem aqui.</p>}
              {mp4Videos.map((v: any) => (
                <button key={v.id} type="button" disabled={loadingSource}
                  onClick={() => { const fd = new FormData(); fd.append("video_url", v.embed_url); carregar(fd, v.title || "Vídeo da galeria"); }}
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
          <CardContent className="pt-4 space-y-3">
            <Label className="font-semibold flex items-center gap-2"><Music className="h-4 w-4" /> Trilha sonora</Label>
            <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
              <button type="button"
                onClick={() => { setMusicId(""); setMusicUploadId(""); setMusicUploadName(""); }}
                className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs transition ${!musicId && !musicUploadId ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"}`}>
                Sem música (só o áudio original)
              </button>
              {musicas.map((m) => (
                <div key={m.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1 transition ${musicId === m.id ? "border-primary ring-1 ring-primary" : ""}`}>
                  <button type="button" className="flex-1 text-left text-xs py-0.5"
                    onClick={() => { setMusicId(m.id); setMusicUploadId(""); setMusicUploadName(""); }}>
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
                  onChange={(e) => setMusicVolume(Number(e.target.value))} className="w-full" />
                <p className="text-[10px] text-muted-foreground">15-25% = fundo sob a voz · 80%+ = destaque. O ▶ de prévia toca neste volume.</p>
              </div>
              <div>
                <div className="flex justify-between"><span>Volume do áudio original</span><span>{originalVolume}%</span></div>
                <input type="range" min={0} max={150} value={originalVolume}
                  onChange={(e) => setOriginalVolume(Number(e.target.value))} className="w-full" />
              </div>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={fadeOut} onChange={(e) => setFadeOut(e.target.checked)} />
                  Fade out no final
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer" title="A música abaixa sozinha quando você fala e volta nas pausas">
                  <input type="checkbox" checked={ducking} onChange={(e) => setDucking(e.target.checked)} />
                  Música abaixa na fala
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview + Timeline JUNTOS (pedido do Carlos: preview colado na timeline) */}
      {meta && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,320px)_1fr] gap-4 items-start">
              <div className="space-y-2">
                <div ref={videoWrapRef} className="relative">
                  <video ref={videoRef} src={previewSrc} controls playsInline
                    className="w-full max-h-72 rounded-lg bg-black"
                    onTimeUpdate={onVideoTime}
                    onPause={() => clipAudiosRef.current.forEach((el) => el.pause())} />
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
                </div>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer"
                  title="No play, os trechos removidos são pulados — você vê o resultado antes de renderizar">
                  <input type="checkbox" checked={previewEdit} onChange={(e) => setPreviewEdit(e.target.checked)} />
                  ▶ Prévia da edição (pula os trechos removidos)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <span className="tabular-nums">cursor: {fmt(playhead)} / {fmt(meta.duration)}</span>
                  <span className="ml-auto text-muted-foreground">{meta.width}x{meta.height}</span>
                </div>
              </div>

              <div className="space-y-3 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="font-semibold">Timeline</Label>
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={splitAtPlayhead}>
                    <Scissors className="h-3.5 w-3.5" /> Dividir no cursor
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1" disabled={!history.length} onClick={undo}
                    title="Cada clique volta UM passo de edição">
                    <Undo2 className="h-3.5 w-3.5" /> Desfazer{history.length ? ` (${history.length})` : ""}
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    duração final: <b>{fmt(finalDuration)}</b>
                  </span>
                </div>

                {/* Caixinha FIXA de corte por tempo (sempre visível) */}
                <div className="flex items-center gap-2 flex-wrap rounded-lg border px-3 py-2 text-xs">
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

                <div ref={timelineRef} className="relative select-none cursor-col-resize" onMouseDown={onTimelineDown}>
                  <div className="flex h-16 rounded-lg overflow-hidden border">
                    {meta.thumbs.map((t, i) =>
                      t ? <img key={i} src={t} draggable={false} className="h-full object-cover" style={{ width: `${100 / meta.thumbs.length}%` }} alt="" />
                        : <div key={i} className="h-full bg-muted" style={{ width: `${100 / meta.thumbs.length}%` }} />,
                    )}
                  </div>
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
                      </div>
                    ))}
                    <div className="absolute top-[-4px] bottom-[-4px] w-0.5 bg-primary"
                      style={{ left: `${(playhead / meta.duration) * 100}%` }}>
                      <div className="h-2.5 w-2.5 rounded-full bg-primary -translate-x-[45%]" />
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
                  <span>0:00</span><span>{fmt(meta.duration / 2)}</span><span>{fmt(meta.duration)}</span>
                </div>

                {/* Faixas extras (estilo CapCut): stickers e clipes de áudio.
                    Arraste o bloco pra mover no tempo; borda direita estica. */}
                {stickers.length > 0 && (
                  <div className="relative h-7 rounded border bg-violet-500/5 overflow-hidden">
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
                {audioClips.length > 0 && (
                  <div className="relative h-7 rounded border bg-sky-500/5 overflow-hidden">
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
                  </div>
                )}

                {/* Capa de entrada (logo) */}
                <div className="flex items-center gap-3 flex-wrap text-xs rounded-lg border px-3 py-2">
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                    <input type="checkbox" checked={introOn} onChange={(e) => setIntroOn(e.target.checked)} />
                    🎬 Capa de entrada com a logo
                  </label>
                  {introOn && (
                    <>
                      <div className="flex gap-1">
                        {perfilLogo && (
                          <button type="button" onClick={() => setIntroSource("perfil")}
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
                                const res = await fetch(`${API}/editor/carregar-logo`, { method: "POST", body: fd });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.detail || "Falha ao enviar a imagem");
                                setIntroUploadId(data.logo_upload_id);
                                setIntroUploadName(f.name);
                                setIntroSource("upload");
                              } catch (err: any) { toast.error(err.message); }
                            }} />
                        </label>
                      </div>
                      <label className="flex items-center gap-1">por
                        <select className="h-7 rounded border bg-background px-1" value={introDur}
                          onChange={(e) => setIntroDur(Number(e.target.value))}>
                          <option value={1.5}>1,5s</option><option value={2}>2s</option>
                          <option value={3}>3s</option><option value={4}>4s</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1">efeito
                        <select className="h-7 rounded border bg-background px-1" value={introEffect}
                          onChange={(e) => setIntroEffect(e.target.value as "zoom" | "slide" | "fade")}>
                          <option value="zoom">Zoom suave</option>
                          <option value="slide">Deslizar</option>
                          <option value="fade">Estático</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5">fundo
                        <input type="color" value={introBg} onChange={(e) => setIntroBg(e.target.value)}
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
                <div className="flex items-center gap-3 flex-wrap text-xs rounded-lg border px-3 py-2">
                  <span className="font-medium">Acabamento:</span>
                  <label className="flex items-center gap-1.5">Emendas
                    <select className="h-7 rounded border bg-background px-1" value={transition}
                      onChange={(e) => setTransition(e.target.value as "none" | "fade")}>
                      <option value="none">Corte seco</option>
                      <option value="fade">Suave (crossfade)</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Leve zoom alternado a cada trecho — disfarça as emendas">
                    <input type="checkbox" checked={punchIn} onChange={(e) => setPunchIn(e.target.checked)} />
                    Zoom alternado nos cortes
                  </label>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Stickers */}
              <div className="space-y-2">
                <Label className="font-semibold flex items-center gap-2">🖼 Stickers e sobreposições</Label>
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
                      onClick={() => setStickers((prev) => prev.map((p) => {
                        if (p.id !== s.id || !meta) return p;
                        const len = p.end - p.start;
                        const ns = Math.max(0, Math.min(meta.duration - len, playhead));
                        return { ...p, start: ns, end: ns + len };
                      }))}>
                      → cursor
                    </Button>
                    <select className="h-7 rounded border bg-background px-1" value={s.scale_pct}
                      title="Tamanho (fração da largura do vídeo)"
                      onChange={(e) => setStickers((prev) => prev.map((p) => (p.id === s.id ? { ...p, scale_pct: Number(e.target.value) } : p)))}>
                      {STICKER_SIZES.map((z) => <option key={z.label} value={z.value}>{z.label}</option>)}
                    </select>
                    <select className="h-7 rounded border bg-background px-1" value={s.movement}
                      onChange={(e) => {
                        const mv = e.target.value as StickerMovement;
                        setStickers((prev) => prev.map((p) => (p.id === s.id
                          ? { ...p, movement: mv, flip: mv === "walk-left" ? true : mv === "walk-right" ? false : p.flip }
                          : p)));
                      }}>
                      <option value="none">Parado</option>
                      <option value="walk-right">🚶 Atravessa →</option>
                      <option value="walk-left">🚶 Atravessa ←</option>
                    </select>
                    {s.movement === "none" && (
                      <select className="h-7 rounded border bg-background px-1" value={stickerPosKey(s)}
                        onChange={(e) => {
                          const p = STICKER_POSITIONS.find((p) => p.key === e.target.value);
                          if (p) setStickers((prev) => prev.map((x) => (x.id === s.id ? { ...x, x_pct: p.x, y_pct: p.y } : x)));
                        }}>
                        {STICKER_POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                        <option value="custom" disabled>Personalizado (arrastado)</option>
                      </select>
                    )}
                    <label className="flex items-center gap-1 cursor-pointer" title="Espelhar horizontalmente">
                      <input type="checkbox" checked={s.flip}
                        onChange={(e) => setStickers((prev) => prev.map((p) => (p.id === s.id ? { ...p, flip: e.target.checked } : p)))} />
                      espelhar
                    </label>
                    {s.animated && (
                      <label className="flex items-center gap-1 cursor-pointer" title="Repete a animação enquanto estiver na tela">
                        <input type="checkbox" checked={s.loop}
                          onChange={(e) => setStickers((prev) => prev.map((p) => (p.id === s.id ? { ...p, loop: e.target.checked } : p)))} />
                        loop
                      </label>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive ml-auto"
                      onClick={() => setStickers((prev) => prev.filter((p) => p.id !== s.id))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Clipes de áudio posicionados */}
              <div className="space-y-2">
                <Label className="font-semibold flex items-center gap-2">🎧 Efeitos sonoros e narrações</Label>
                <p className="text-[11px] text-muted-foreground">
                  Áudio que toca num <b>ponto exato</b> do vídeo (efeito, vinheta, narração) — além da
                  trilha global. Entra no cursor; mova/estique na <b>faixa azul</b> da timeline.
                </p>
                <label className="flex items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-1.5 text-xs cursor-pointer hover:border-primary/60 transition w-fit">
                  {uploadingClip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Enviar áudio (mp3 · wav · m4a)
                  <input type="file" className="hidden"
                    accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac"
                    disabled={uploadingClip}
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
                      onClick={() => setAudioClips((prev) => prev.map((p) => {
                        if (p.id !== c.id || !meta) return p;
                        const len = p.end - p.start;
                        const ns = Math.max(0, Math.min(meta.duration - len, playhead));
                        return { ...p, start: ns, end: ns + len };
                      }))}>
                      → cursor
                    </Button>
                    <label className="flex items-center gap-1 flex-1 min-w-28" title="Volume do clipe">
                      🔊
                      <input type="range" min={0} max={150} value={Math.round(c.volume * 100)}
                        className="flex-1"
                        onChange={(e) => setAudioClips((prev) => prev.map((p) => (p.id === c.id ? { ...p, volume: Number(e.target.value) / 100 } : p)))} />
                      <span className="tabular-nums w-9 text-right">{Math.round(c.volume * 100)}%</span>
                    </label>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                      onClick={() => setAudioClips((prev) => prev.filter((p) => p.id !== c.id))}>
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
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="font-semibold flex items-center gap-2"><Captions className="h-4 w-4" /> Legendas</Label>
              <Button size="sm" variant="outline" className="h-7 gap-1" disabled={transcribing} onClick={gerarLegendas}>
                {transcribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {cues.length ? "Gerar de novo da fala" : "Gerar legendas da fala"}
              </Button>
              {cues.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={subsOn} onChange={(e) => setSubsOn(e.target.checked)} />
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
                        onClick={() => { setSubFont(p.font); setSubSize(p.size); setSubColor(p.color); setSubStyle(p.style); setSubPos(p.pos); }}>
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  {words.length > 0 && (
                    <div className="flex gap-1.5">
                      {(["frases", "karaoke"] as const).map((m) => (
                        <button key={m} type="button"
                          onClick={() => { setCueMode(m); setCues(groupWords(words, m)); }}
                          className={`rounded-full border px-2.5 py-0.5 transition ${cueMode === m ? "border-primary ring-1 ring-primary font-medium" : "hover:border-primary/50"}`}>
                          {m === "frases" ? "Frases (~6 palavras)" : "⚡ Karaokê (2-3 palavras)"}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <select className="h-8 rounded border bg-background px-2" value={subFont} onChange={(e) => setSubFont(e.target.value)}>
                      {fontes.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <select className="h-8 rounded border bg-background px-2" value={subSize} onChange={(e) => setSubSize(e.target.value as SubSize)}>
                      <option value="p">Pequena</option><option value="m">Média</option>
                      <option value="g">Grande</option><option value="xg">Gigante</option>
                    </select>
                    <select className="h-8 rounded border bg-background px-2" value={subStyle} onChange={(e) => setSubStyle(e.target.value as SubStyle)}>
                      <option value="outline">Contorno</option><option value="box">Caixa escura</option>
                    </select>
                    <select className="h-8 rounded border bg-background px-2" value={subPos} onChange={(e) => setSubPos(e.target.value as SubPos)}>
                      <option value="bottom">Embaixo</option><option value="center">Centro</option><option value="top">Topo</option>
                    </select>
                    <label className="flex items-center gap-1.5">
                      Cor <input type="color" value={subColor} onChange={(e) => setSubColor(e.target.value)} className="h-8 w-10 rounded border cursor-pointer" />
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
                      <Input value={c.text} className="h-7 text-xs"
                        onChange={(e) => setCues((prev) => prev.map((p, j) => (j === i ? { ...p, text: e.target.value } : p)))} />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive shrink-0"
                        onClick={() => setCues((prev) => prev.filter((_, j) => j !== i))}>
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
              <Label className="font-semibold text-sm">Textos no vídeo</Label>
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
                <Button size="sm" variant="outline" className="h-8" disabled={!newTitle.trim()}
                  onClick={() => {
                    if (!meta) return;
                    setTitles((prev) => [...prev, {
                      start: playhead, end: Math.min(meta.duration, playhead + newTitleDur),
                      text: newTitle.trim(), font_id: subFont, size: subSize,
                      color: subColor, style: subStyle, position: "center",
                    }]);
                    setNewTitle("");
                    toast.success("Texto adicionado a partir do cursor — ajuste o estilo na lista.");
                  }}>
                  + Adicionar no cursor ({fmt(playhead)})
                </Button>
              </div>
              {titles.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs flex-wrap rounded border px-2 py-1">
                  <span className="tabular-nums text-muted-foreground">{fmt(t.start)}–{fmt(t.end)}</span>
                  <Input value={t.text} className="h-7 text-xs flex-1 min-w-32"
                    onChange={(e) => setTitles((prev) => prev.map((p, j) => (j === i ? { ...p, text: e.target.value } : p)))} />
                  <select className="h-7 rounded border bg-background px-1" value={t.font_id}
                    onChange={(e) => setTitles((prev) => prev.map((p, j) => (j === i ? { ...p, font_id: e.target.value } : p)))}>
                    {fontes.map((f) => <option key={f.id} value={f.id}>{f.label.split(" (")[0]}</option>)}
                  </select>
                  <select className="h-7 rounded border bg-background px-1" value={t.size}
                    onChange={(e) => setTitles((prev) => prev.map((p, j) => (j === i ? { ...p, size: e.target.value as SubSize } : p)))}>
                    <option value="p">P</option><option value="m">M</option><option value="g">G</option><option value="xg">XG</option>
                  </select>
                  <select className="h-7 rounded border bg-background px-1" value={t.position}
                    onChange={(e) => setTitles((prev) => prev.map((p, j) => (j === i ? { ...p, position: e.target.value as TitlePos } : p)))}>
                    <option value="top">Topo</option><option value="center">Centro</option><option value="bottom">Embaixo</option>
                    <option value="left-bottom">◧ Esq. baixo (selo)</option>
                    <option value="left-center">◧ Esq. centro</option>
                    <option value="left-top">◩ Esq. topo</option>
                  </select>
                  <input type="color" value={t.color} className="h-7 w-8 rounded border cursor-pointer"
                    onChange={(e) => setTitles((prev) => prev.map((p, j) => (j === i ? { ...p, color: e.target.value } : p)))} />
                  <select className="h-7 rounded border bg-background px-1" value={t.style}
                    onChange={(e) => setTitles((prev) => prev.map((p, j) => (j === i ? { ...p, style: e.target.value as SubStyle } : p)))}>
                    <option value="outline">Contorno</option><option value="box">Caixa</option>
                  </select>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                    onClick={() => setTitles((prev) => prev.filter((_, j) => j !== i))}>
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
          <CardContent className="pt-4 space-y-3">
            {!keepSegments.length && (
              <div className="flex items-center gap-2 flex-wrap rounded-lg border border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 text-xs">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <span>
                  Todos os trechos do vídeo estão <b>removidos</b> na timeline — por isso o salvar
                  está travado (duração 0:00). Restaure o que quer manter:
                </span>
                <Button size="sm" className="h-7"
                  onClick={() => {
                    pushHistory();
                    // 1 trecho [0..duração]: cobre inclusive regiões que algum
                    // ajuste antigo tenha deixado órfãs
                    setSegments([{ id: 1, start: 0, end: meta.duration, keep: true }]);
                    toast.success("Vídeo inteiro restaurado — remova só o que não quiser.");
                  }}>
                  Restaurar o vídeo inteiro
                </Button>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)}
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
                <Label className="font-semibold text-emerald-600">✓ Edição pronta</Label>
                <video src={resultUrl} controls playsInline className="w-full max-h-72 rounded-lg bg-black" />
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-muted-foreground">Exportar para outra plataforma:</span>
                  {(["9:16", "1:1", "16:9"] as const).map((f) => (
                    <Button key={f} size="sm" variant="outline" className="h-7"
                      disabled={!!exporting} onClick={() => exportarFormato(f)}>
                      {exporting === f ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                      {f === "9:16" ? "📱 Reels 9:16" : f === "1:1" ? "◻ Feed 1:1" : "🖥 YouTube 16:9"}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Editor de Vídeo — corte + música + legendas + textos (motor próprio no
 * video-api, código SEPARADO do Institucional e do Criar Vídeo).
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
type EditMeta = { edit_id: string; duration: number; width: number; height: number; has_audio: boolean; thumbs: string[] };
type Cue = { start: number; end: number; text: string };
type SubSize = "p" | "m" | "g" | "xg";
type SubStyle = "outline" | "box";
type SubPos = "bottom" | "center" | "top";
type Title = { start: number; end: number; text: string; font_id: string; size: SubSize; color: string; style: SubStyle; position: SubPos };

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

  const [meta, setMeta] = useState<EditMeta | null>(null);
  const [previewSrc, setPreviewSrc] = useState("");
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");

  const [segments, setSegments] = useState<Segment[]>([]);
  const [history, setHistory] = useState<Segment[][]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [startField, setStartField] = useState("");
  const [endField, setEndField] = useState("");
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

  const [transition, setTransition] = useState<"none" | "fade">("none");
  const [ducking, setDucking] = useState(true);
  const [punchIn, setPunchIn] = useState(false);

  const [aiCutText, setAiCutText] = useState("");
  const [aiCutting, setAiCutting] = useState(false);
  const [exporting, setExporting] = useState("");

  const [titulo, setTitulo] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderStep, setRenderStep] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const restoredRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── PERSISTÊNCIA: restaura ao entrar; salva a cada mudança ────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(EDITOR_STORAGE_KEY);
        if (!raw) { restoredRef.current = true; return; }
        const s = JSON.parse(raw);
        if (!s?.meta?.edit_id) { restoredRef.current = true; return; }
        const head = await fetch(`${API}/editor/video/${s.meta.edit_id}`, { method: "HEAD" });
        if (!head.ok) {
          localStorage.removeItem(EDITOR_STORAGE_KEY);
          toast.info("A edição anterior expirou no servidor — carregue o vídeo de novo.", { duration: 7000 });
          restoredRef.current = true;
          return;
        }
        setMeta(s.meta);
        setPreviewSrc(`${API}/editor/video/${s.meta.edit_id}`);
        setSourceLabel(s.sourceLabel || "");
        setSegments(s.segments?.length ? s.segments : [{ id: 1, start: 0, end: s.meta.duration, keep: true }]);
        setMusicId(s.musicId || ""); setMusicUploadId(s.musicUploadId || ""); setMusicUploadName(s.musicUploadName || "");
        setMusicVolume(s.musicVolume ?? 20); setOriginalVolume(s.originalVolume ?? 100); setFadeOut(s.fadeOut ?? true);
        setSubsOn(!!s.subsOn); setCues(s.cues || []); setWords(s.words || []); setCueMode(s.cueMode || "frases");
        setSubFont(s.subFont || "bevietnam"); setSubSize(s.subSize || "m"); setSubColor(s.subColor || "#FFFFFF");
        setSubStyle(s.subStyle || "outline"); setSubPos(s.subPos || "bottom");
        setTitles(s.titles || []); setTransition(s.transition || "none");
        setDucking(s.ducking ?? true); setPunchIn(!!s.punchIn); setTitulo(s.titulo || "");
        setResultUrl(s.resultUrl || "");
        toast.success("Edição anterior restaurada — continue de onde parou.");
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
        ducking, punchIn, titulo, resultUrl,
      }));
    } catch { /* localStorage cheio — ignora */ }
  }, [meta, sourceLabel, segments, musicId, musicUploadId, musicUploadName,
      musicVolume, originalVolume, fadeOut, subsOn, cues, words, cueMode,
      subFont, subSize, subColor, subStyle, subPos, titles, transition,
      ducking, punchIn, titulo, resultUrl]);

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
    setPreviewSrc(`${API}/editor/video/${m.edit_id}`);   // servido pelo backend → sobrevive a F5
    setSourceLabel(label);
    setSegments([{ id: 1, start: 0, end: m.duration, keep: true }]);
    setHistory([]); setPlayhead(0); setResultUrl(""); setCues([]); setWords([]);
    setSubsOn(false); setTitles([]);
  };

  const recomecar = () => {
    if (!confirm("Descartar esta edição e recomeçar?")) return;
    setMeta(null); setPreviewSrc(""); setSourceLabel(""); setSegments([]); setHistory([]);
    setCues([]); setWords([]); setTitles([]); setResultUrl(""); setSubsOn(false);
    localStorage.removeItem(EDITOR_STORAGE_KEY);
  };

  const carregar = async (form: FormData, label: string) => {
    setLoadingSource(true);
    try {
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
    setSegments((prev) => prev.map((s) => {
      if (s.id !== activeSeg.id) return s;
      if (which === "start") return { ...s, start: Math.min(v, s.end - 0.2) };
      return { ...s, end: Math.max(v, s.start + 0.2) };
    }));
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
          transition,
          ducking,
          punch_in: punchIn,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao iniciar a edição");
      const jobId = data.job_id;
      pollRef.current = setInterval(async () => {
        try {
          const st = await (await fetch(`${API}/status/${jobId}`)).json();
          setRenderProgress(st.progress ?? 0); setRenderStep(st.step ?? "");
          if (st.status === "done") {
            if (pollRef.current) clearInterval(pollRef.current);
            setRendering(false); setResultUrl(st.video_url);
            toast.success("Edição pronta! O vídeo já está em Meus Vídeos.");
            queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
          } else if (st.status === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            setRendering(false);
            toast.error(st.message || "A edição falhou", { duration: 9000 });
          }
        } catch { /* transitório */ }
      }, 3000);
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
                <video ref={videoRef} src={previewSrc} controls playsInline
                  className="w-full max-h-72 rounded-lg bg-black"
                  onTimeUpdate={onVideoTime} />
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
                  <Button size="sm" variant="ghost" className="h-7 gap-1" disabled={!history.length} onClick={undo}>
                    <Undo2 className="h-3.5 w-3.5" /> Desfazer
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    duração final: <b>{fmt(finalDuration)}</b>
                  </span>
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
              <div className="flex gap-1.5 flex-wrap items-center text-xs">
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  placeholder='Ex.: "Agende sua sessão 💛"' className="h-8 text-xs max-w-56" />
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
                    onChange={(e) => setTitles((prev) => prev.map((p, j) => (j === i ? { ...p, position: e.target.value as SubPos } : p)))}>
                    <option value="top">Topo</option><option value="center">Centro</option><option value="bottom">Embaixo</option>
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

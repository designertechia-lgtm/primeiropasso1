/**
 * Editor de Vídeo — corte + música + legendas, layout mesa de edição (Pitivi):
 * biblioteca | trilha sonora | preview em cima; TIMELINE embaixo.
 *
 * Interação da timeline (revisada 06/07 após feedback do Carlos):
 *   - clicar/arrastar em QUALQUER lugar da faixa POSICIONA o cursor (seek);
 *   - cada trecho tem um botão próprio de remover/restaurar (não rouba o clique);
 *   - o trecho sob o cursor pode ser ajustado FINO por tempo digitado (mm:ss.d)
 *     ou pelos botões "Início/Fim = cursor".
 *
 * O trabalho pesado é do video-api (/editor/*, ffmpeg local — sem custo de
 * API); render e transcrição são jobs no servidor (Nível 2).
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

type Segment = { id: number; start: number; end: number; keep: boolean };
type EditMeta = { edit_id: string; duration: number; width: number; height: number; has_audio: boolean; thumbs: string[] };
type Cue = { start: number; end: number; text: string };
type SubSize = "p" | "m" | "g" | "xg";
type SubStyle = "outline" | "box";
type SubPos = "bottom" | "center" | "top";

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

  const [musicas, setMusicas] = useState<{ id: string; label: string }[]>([]);
  const [musicId, setMusicId] = useState("");
  const [musicUploadId, setMusicUploadId] = useState("");
  const [musicUploadName, setMusicUploadName] = useState("");
  const [musicVolume, setMusicVolume] = useState(20);
  const [originalVolume, setOriginalVolume] = useState(100);
  const [fadeOut, setFadeOut] = useState(true);
  const [previewingTrack, setPreviewingTrack] = useState("");

  // legendas
  const [fontes, setFontes] = useState<{ id: string; label: string }[]>([]);
  const [subsOn, setSubsOn] = useState(false);
  const [cues, setCues] = useState<Cue[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [subFont, setSubFont] = useState("bevietnam");
  const [subSize, setSubSize] = useState<SubSize>("m");
  const [subColor, setSubColor] = useState("#FFFFFF");
  const [subStyle, setSubStyle] = useState<SubStyle>("outline");
  const [subPos, setSubPos] = useState<SubPos>("bottom");
  const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set());

  const [titulo, setTitulo] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderStep, setRenderStep] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
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

  // Prévia da trilha respeita o slider EM TEMPO REAL (era volume fixo — o
  // "volume não funciona" que o Carlos viu era isto; o render está provado ok).
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.min(1, musicVolume / 100);
  }, [musicVolume, previewingTrack]);

  // Fonte real do servidor via @font-face → a amostra fica igual ao resultado.
  useEffect(() => {
    if (!subFont || loadedFonts.has(subFont)) return;
    const face = new FontFace(`edfont-${subFont}`, `url(${API}/editor/fonte/${subFont})`);
    face.load().then((f) => {
      (document as any).fonts.add(f);
      setLoadedFonts((prev) => new Set(prev).add(subFont));
    }).catch(() => {});
  }, [subFont, loadedFonts]);

  const resetEditor = (m: EditMeta, src: string, label: string) => {
    setMeta(m); setPreviewSrc(src); setSourceLabel(label);
    setSegments([{ id: 1, start: 0, end: m.duration, keep: true }]);
    setHistory([]); setPlayhead(0); setResultUrl(""); setCues([]); setSubsOn(false);
  };

  const carregar = async (form: FormData, src: string, label: string) => {
    setLoadingSource(true);
    try {
      const res = await fetch(`${API}/editor/carregar`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao carregar o vídeo");
      resetEditor(data, src, label);
      toast.success("Vídeo carregado! Clique na timeline para posicionar o cursor.");
    } catch (e: any) {
      toast.error(e.message, { duration: 7000 });
    } finally {
      setLoadingSource(false);
    }
  };

  // ── timeline: clique/arrasto = POSICIONAR CURSOR (seek) ────────────────────
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

  // trecho sob o cursor = trecho "ativo" (ajuste fino por tempo digitado)
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
      const jobId = data.job_id;
      const timer = setInterval(async () => {
        try {
          const st = await (await fetch(`${API}/status/${jobId}`)).json();
          if (st.status === "done") {
            clearInterval(timer); setTranscribing(false);
            setCues(st.cues || []); setSubsOn(true);
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

  // ── render ─────────────────────────────────────────────────────────────────
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

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <audio ref={audioRef} onEnded={() => setPreviewingTrack("")} />
      <div className="flex items-center gap-2">
        <Scissors className="h-5 w-5 text-primary" />
        <h2 className="font-heading text-xl font-bold">Editor de Vídeo</h2>
        <Badge variant="secondary">corte · música · legendas</Badge>
        {meta && <span className="text-xs text-muted-foreground truncate">— {sourceLabel}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                  if (f) { const fd = new FormData(); fd.append("file", f); carregar(fd, URL.createObjectURL(f), f.name); }
                  e.target.value = "";
                }} />
            </label>
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {mp4Videos.length === 0 && <p className="text-xs text-muted-foreground">Seus vídeos gerados aparecem aqui.</p>}
              {mp4Videos.map((v: any) => (
                <button key={v.id} type="button" disabled={loadingSource}
                  onClick={() => { const fd = new FormData(); fd.append("video_url", v.embed_url); carregar(fd, v.embed_url, v.title || "Vídeo da galeria"); }}
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
            <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
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
                <p className="text-[10px] text-muted-foreground">15-25% = fundo sob a voz · 80%+ = música em destaque. O ▶ de prévia toca neste volume.</p>
              </div>
              <div>
                <div className="flex justify-between"><span>Volume do áudio original</span><span>{originalVolume}%</span></div>
                <input type="range" min={0} max={150} value={originalVolume}
                  onChange={(e) => setOriginalVolume(Number(e.target.value))} className="w-full" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={fadeOut} onChange={(e) => setFadeOut(e.target.checked)} />
                Fade out no final
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardContent className="pt-4 space-y-2">
            <Label className="font-semibold">Preview</Label>
            {meta ? (
              <>
                <video ref={videoRef} src={previewSrc} controls playsInline
                  className="w-full max-h-64 rounded-lg bg-black"
                  onTimeUpdate={(e) => { if (!draggingRef.current) setPlayhead(e.currentTarget.currentTime); }} />
                <div className="flex items-center gap-2 text-xs">
                  <span className="tabular-nums">cursor: {fmt(playhead)} / {fmt(meta.duration)}</span>
                  <span className="ml-auto text-muted-foreground">{meta.width}x{meta.height}</span>
                </div>
              </>
            ) : (
              <div className="h-40 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                Escolha um vídeo na biblioteca
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Legendas */}
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
                {/* estilo */}
                <div className="space-y-2 text-xs">
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
                  {/* amostra com a FONTE REAL do servidor */}
                  <div className="rounded-lg bg-neutral-800 h-24 flex items-center justify-center overflow-hidden"
                    style={{ alignItems: subPos === "top" ? "flex-start" : subPos === "center" ? "center" : "flex-end", paddingTop: 10, paddingBottom: 10 }}>
                    <span style={sampleStyle}>Sua legenda fica assim ✨</span>
                  </div>
                </div>
                {/* cues editáveis */}
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
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {meta && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="font-semibold">Timeline</Label>
              <Button size="sm" variant="outline" className="h-7 gap-1" onClick={splitAtPlayhead}>
                <Scissors className="h-3.5 w-3.5" /> Dividir no cursor
              </Button>
              <Button size="sm" variant="ghost" className="h-7 gap-1" disabled={!history.length} onClick={undo}>
                <Undo2 className="h-3.5 w-3.5" /> Desfazer
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">
                Clique/arraste na faixa para posicionar o cursor · duração final: <b>{fmt(finalDuration)}</b>
              </span>
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

            {/* ajuste fino do trecho sob o cursor */}
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

            {/* Render */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título do vídeo editado (opcional)" className="text-sm max-w-xs" />
              <Button onClick={renderizar} disabled={rendering || !keepSegments.length} className="gap-2">
                {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {rendering ? `${renderProgress}% — ${renderStep}` : "Renderizar e salvar"}
              </Button>
              {rendering && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> Pode sair da tela — o vídeo cai em Meus Vídeos.
                </span>
              )}
            </div>

            {resultUrl && (
              <div className="pt-2 space-y-2">
                <Label className="font-semibold text-emerald-600">✓ Edição pronta</Label>
                <video src={resultUrl} controls playsInline className="w-full max-h-72 rounded-lg bg-black" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Editor de Vídeo — corte + música, layout mesa de edição (modelo Pitivi):
 * biblioteca de mídia à esquerda, trilha sonora ao centro, preview à direita,
 * TIMELINE com thumbnails embaixo (dividir no playhead / remover trechos).
 *
 * O trabalho pesado é do video-api (/editor/*, ffmpeg local — sem custo de
 * API): o render roda como job no servidor (Nível 2 — sobrevive a fechar a
 * página; o resultado cai em "Meus Vídeos" de qualquer forma).
 */
import { useEffect, useRef, useState } from "react";
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
  Scissors, Play, Pause, Loader2, Music, Upload, Film, Trash2,
  RotateCcw, CheckCircle2, AlertCircle, Video as VideoIcon,
} from "lucide-react";
import { videoApiAuthHeaders } from "@/lib/videoApi";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

type Segment = { id: number; start: number; end: number; keep: boolean };
type EditMeta = { edit_id: string; duration: number; width: number; height: number; has_audio: boolean; thumbs: string[] };

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
};

export default function AdminEditorVideo() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  // fonte carregada no editor
  const [meta, setMeta] = useState<EditMeta | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string>("");
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");

  // timeline / cortes
  const [segments, setSegments] = useState<Segment[]>([]);
  const [history, setHistory] = useState<Segment[][]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);

  // música
  const [musicas, setMusicas] = useState<{ id: string; label: string }[]>([]);
  const [musicId, setMusicId] = useState<string>("");
  const [musicUploadId, setMusicUploadId] = useState<string>("");
  const [musicUploadName, setMusicUploadName] = useState<string>("");
  const [musicVolume, setMusicVolume] = useState(15);      // %
  const [originalVolume, setOriginalVolume] = useState(100); // %
  const [fadeOut, setFadeOut] = useState(true);
  const [previewingTrack, setPreviewingTrack] = useState<string>("");

  // render
  const [titulo, setTitulo] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderStep, setRenderStep] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // biblioteca = Meus Vídeos (mesma query da galeria)
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
    fetch(`${API}/editor/musicas`)
      .then((r) => r.json())
      .then((d) => setMusicas(d.musicas || []))
      .catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const resetEditor = (m: EditMeta, src: string, label: string) => {
    setMeta(m);
    setPreviewSrc(src);
    setSourceLabel(label);
    setSegments([{ id: 1, start: 0, end: m.duration, keep: true }]);
    setHistory([]);
    setPlayhead(0);
    setResultUrl("");
  };

  const carregarUpload = async (file: File) => {
    setLoadingSource(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/editor/carregar`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao carregar o vídeo");
      resetEditor(data, URL.createObjectURL(file), file.name);
      toast.success("Vídeo carregado! Use a timeline para marcar os cortes.");
    } catch (e: any) {
      toast.error(e.message, { duration: 7000 });
    } finally {
      setLoadingSource(false);
    }
  };

  const carregarDaGaleria = async (v: any) => {
    setLoadingSource(true);
    try {
      const form = new FormData();
      form.append("video_url", v.embed_url);
      const res = await fetch(`${API}/editor/carregar`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao carregar o vídeo");
      resetEditor(data, v.embed_url, v.title || "Vídeo da galeria");
    } catch (e: any) {
      toast.error(e.message, { duration: 7000 });
    } finally {
      setLoadingSource(false);
    }
  };

  // ── timeline ────────────────────────────────────────────────────────────────
  const pushHistory = () => setHistory((h) => [...h.slice(-19), segments.map((s) => ({ ...s }))]);

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setSegments(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };

  const seekTo = (t: number) => {
    const clamped = Math.max(0, Math.min(meta?.duration ?? 0, t));
    setPlayhead(clamped);
    if (videoRef.current) videoRef.current.currentTime = clamped;
  };

  const timelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current || !meta) return;
    const rect = timelineRef.current.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * meta.duration);
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

  const keepSegments = segments.filter((s) => s.keep);
  const finalDuration = keepSegments.reduce((a, s) => a + (s.end - s.start), 0);

  // ── música ──────────────────────────────────────────────────────────────────
  const previewTrack = (id: string) => {
    if (!audioRef.current) return;
    if (previewingTrack === id) {
      audioRef.current.pause();
      setPreviewingTrack("");
      return;
    }
    audioRef.current.src = `${API}/editor/musica/${id}`;
    audioRef.current.volume = 0.5;
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
      setMusicUploadId(data.music_upload_id);
      setMusicUploadName(file.name);
      setMusicId("");
      toast.success("Música carregada!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── render ──────────────────────────────────────────────────────────────────
  const renderizar = async () => {
    if (!meta || !professional?.slug) return;
    if (!keepSegments.length) { toast.error("Mantenha ao menos um trecho do vídeo."); return; }
    setRendering(true);
    setResultUrl("");
    setRenderProgress(5);
    setRenderStep("Enviando a edição...");
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao iniciar a edição");
      const jobId = data.job_id;
      pollRef.current = setInterval(async () => {
        try {
          const st = await (await fetch(`${API}/status/${jobId}`)).json();
          setRenderProgress(st.progress ?? 0);
          setRenderStep(st.step ?? "");
          if (st.status === "done") {
            if (pollRef.current) clearInterval(pollRef.current);
            setRendering(false);
            setResultUrl(st.video_url);
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

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <audio ref={audioRef} onEnded={() => setPreviewingTrack("")} />
      <div className="flex items-center gap-2">
        <Scissors className="h-5 w-5 text-primary" />
        <h2 className="font-heading text-xl font-bold">Editor de Vídeo</h2>
        <Badge variant="secondary">corte + música</Badge>
        {meta && <span className="text-xs text-muted-foreground truncate">— {sourceLabel}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Biblioteca de mídia */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Label className="font-semibold flex items-center gap-2"><Film className="h-4 w-4" /> Biblioteca de mídia</Label>
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-sm cursor-pointer hover:border-primary/60 transition">
              {loadingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Enviar vídeo do computador
              <input
                type="file" className="hidden"
                accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                disabled={loadingSource}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) carregarUpload(f); e.target.value = ""; }}
              />
            </label>
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {mp4Videos.length === 0 && (
                <p className="text-xs text-muted-foreground">Seus vídeos gerados aparecem aqui.</p>
              )}
              {mp4Videos.map((v: any) => (
                <button
                  key={v.id} type="button" disabled={loadingSource}
                  onClick={() => carregarDaGaleria(v)}
                  className="w-full flex items-center gap-2 rounded-lg border p-1.5 text-left text-xs hover:border-primary/60 transition"
                >
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
            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
              <button
                type="button"
                onClick={() => { setMusicId(""); setMusicUploadId(""); setMusicUploadName(""); }}
                className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs transition ${!musicId && !musicUploadId ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"}`}
              >
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
                <video
                  ref={videoRef} src={previewSrc} playsInline
                  className="w-full max-h-64 rounded-lg bg-black"
                  onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                />
                <div className="flex items-center gap-2 text-xs">
                  <Button size="sm" variant="outline" className="h-7"
                    onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}>
                    {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <span className="tabular-nums">{fmt(playhead)} / {fmt(meta.duration)}</span>
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
                <RotateCcw className="h-3.5 w-3.5" /> Desfazer
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">
                Clique num trecho para manter/remover · duração final: <b>{fmt(finalDuration)}</b>
              </span>
            </div>

            <div ref={timelineRef} className="relative select-none cursor-crosshair" onClick={timelineClick}>
              {/* faixa de thumbnails */}
              <div className="flex h-16 rounded-lg overflow-hidden border">
                {meta.thumbs.map((t, i) =>
                  t ? <img key={i} src={t} className="h-full object-cover" style={{ width: `${100 / meta.thumbs.length}%` }} alt="" />
                    : <div key={i} className="h-full bg-muted" style={{ width: `${100 / meta.thumbs.length}%` }} />,
                )}
              </div>
              {/* segmentos */}
              <div className="absolute inset-0">
                {segments.map((s) => (
                  <div
                    key={s.id}
                    onClick={(e) => { e.stopPropagation(); toggleSegment(s.id); }}
                    title={s.keep ? "Clique para REMOVER este trecho" : "Clique para restaurar"}
                    className={`absolute top-0 h-full border-2 rounded-sm cursor-pointer transition ${
                      s.keep ? "border-emerald-400/80 hover:bg-emerald-400/10"
                             : "border-red-500/70 bg-black/60 backdrop-grayscale hover:bg-black/50"}`}
                    style={{
                      left: `${(s.start / meta.duration) * 100}%`,
                      width: `${((s.end - s.start) / meta.duration) * 100}%`,
                    }}
                  >
                    {!s.keep && (
                      <Trash2 className="h-4 w-4 text-red-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    )}
                  </div>
                ))}
                {/* playhead */}
                <div className="absolute top-[-4px] bottom-[-4px] w-0.5 bg-primary pointer-events-none"
                  style={{ left: `${(playhead / meta.duration) * 100}%` }}>
                  <div className="h-2.5 w-2.5 rounded-full bg-primary -translate-x-[45%]" />
                </div>
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>0:00</span><span>{fmt(meta.duration / 2)}</span><span>{fmt(meta.duration)}</span>
            </div>

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

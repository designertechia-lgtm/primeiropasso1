/**
 * CORTADOR de clipe da sequência — tela sobreposta ao editor.
 *
 * Abre o vídeo emendado sozinho (player + fita de quadros + trechos manter/
 * remover, a mesma linguagem da timeline principal), e ao concluir devolve as
 * janelas mantidas. Quem chama transforma cada janela num SeqClip da mesma
 * fonte ("parte 1", "parte 2") — partes da mesma fonte emendam em corte seco.
 *
 * Estado 100% LOCAL: enquanto o cortador está aberto, o documento do editor não
 * muda; cancelar não deixa rastro e concluir gasta UM passo de desfazer.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scissors, Play, Pause, Trash2, RotateCcw, Check, Shuffle, ChevronDown } from "lucide-react";
import { API, fmt, parseTime, type SeqClip } from "./types";
import { videoApiAuthHeaders } from "@/lib/videoApi";
import {
  segsIniciais, dividirEm, janelasMantidas, duracaoMantida, type TrimSeg,
} from "./seqTrim";
import TransicaoPicker, { TransicaoDemo, AvisoPrevia } from "./TransicaoPicker";
import { TRANSICOES, transicaoLabel } from "./filtros";

type Props = {
  clip: SeqClip;
  /** `transicao` = como as PARTES emendam entre si ("none" = corte seco). */
  onConcluir: (partes: { src_in: number; src_out: number }[], transicao: string) => void;
  onCancelar: () => void;
};

export default function SeqTrimDialog({ clip, onConcluir, onCancelar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fitaRef = useRef<HTMLDivElement>(null);
  const arrastandoRef = useRef(false);
  const [segs, setSegs] = useState<TrimSeg[]>(() => segsIniciais(clip));
  const [playhead, setPlayhead] = useState(clip.src_in);
  const [tocando, setTocando] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [thumbsFalhou, setThumbsFalhou] = useState(false);
  const [deField, setDeField] = useState("");
  const [ateField, setAteField] = useState("");
  // como as PARTES emendam entre si. Nasce no que o clipe já tem (reabrir o
  // cortador não muda a escolha anterior); "none" = corte seco, o padrão de
  // sempre — partes só existem quando o usuário tirou um pedaço do MEIO.
  const [transicao, setTransicao] = useState(clip.transition_in ?? "none");
  const [abriuTransicao, setAbriuTransicao] = useState(false);

  const dur = Math.max(clip.natural_dur, clip.src_out, 0.1);
  const partes = useMemo(() => janelasMantidas(segs), [segs]);
  const totalMantido = useMemo(() => duracaoMantida(segs), [segs]);
  const segAtual = segs.find((s) => playhead >= s.start && playhead < s.end);

  // fita de quadros do clipe (o worker cacheia por edit_id+count)
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const n = Math.max(10, Math.min(40, Math.ceil(dur / 2)));
        const res = await fetch(`${API}/editor/thumbs/${clip.edit_id}?count=${n}&height=60`,
          { headers: await videoApiAuthHeaders() });
        if (!res.ok) throw new Error(String(res.status));
        const lista: string[] = (await res.json()).thumbs || [];
        if (!vivo) return;
        if (lista.filter(Boolean).length >= lista.length / 2) setThumbs(lista);
        else setThumbsFalhou(true);
      } catch {
        if (vivo) setThumbsFalhou(true);   // fita cinza: o corte funciona igual
      }
    })();
    return () => { vivo = false; };
  }, [clip.edit_id, dur]);

  // o player é a fonte do tempo aqui (uma fonte só — não precisa do relógio mestre)
  const tempoDaPosicao = (clientX: number) => {
    const box = fitaRef.current;
    if (!box) return 0;
    const r = box.getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur));
  };
  const irPara = (t: number) => {
    setPlayhead(t);
    if (videoRef.current) videoRef.current.currentTime = t;
  };
  useEffect(() => {
    const move = (e: MouseEvent) => { if (arrastandoRef.current) irPara(tempoDaPosicao(e.clientX)); };
    const up = () => { arrastandoRef.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dur]);

  const alternarPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setTocando(true); }
    else { v.pause(); setTocando(false); }
  };

  const dividir = () => {
    const novo = dividirEm(segs, playhead);
    if (novo === segs) return;
    setSegs(novo);
  };
  const alternarSeg = (id: number) =>
    setSegs((ss) => ss.map((s) => (s.id === id ? { ...s, keep: !s.keep } : s)));

  const aplicarCampo = (campo: "de" | "ate") => {
    if (!segAtual) return;
    const txt = campo === "de" ? deField : ateField;
    const t = parseTime(txt);
    if (t === null) return;
    setSegs((ss) => ss.map((s) => {
      if (s.id !== segAtual.id) return s;
      return campo === "de"
        ? { ...s, start: Math.max(0, Math.min(s.end - 0.2, t)) }
        : { ...s, end: Math.min(dur, Math.max(s.start + 0.2, t)) };
    }));
    if (campo === "de") setDeField(""); else setAteField("");
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Scissors className="h-4 w-4 text-primary" />
            Cortar "{clip.name}" antes de montar
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Marque o que fica e o que sai deste clipe. Ao concluir, ele volta para a
            posição dele na sequência — se sobrar mais de um trecho, vira "parte 1",
            "parte 2"… emendadas em corte seco (sem transição entre elas).
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg overflow-hidden bg-black">
          <video ref={videoRef}
            src={clip.source_url || `${API}/editor/video/${clip.edit_id}`}
            playsInline preload="metadata"
            className="w-full max-h-[38vh] object-contain bg-black cursor-pointer"
            onClick={alternarPlay}
            onTimeUpdate={(e) => setPlayhead((e.target as HTMLVideoElement).currentTime)}
            onPlay={() => setTocando(true)}
            onPause={() => setTocando(false)}
            onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = clip.src_in; }} />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={alternarPlay}>
            {tocando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {tocando ? "Pausar" : "Tocar"}
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {fmt(playhead)} / {fmt(dur)}
          </span>
          <Button size="sm" variant="outline" className="h-7 gap-1 ml-auto" onClick={dividir}>
            <Scissors className="h-3.5 w-3.5" /> Dividir no cursor
          </Button>
        </div>

        {/* fita: clique/arraste posiciona o cursor; os trechos vão por cima */}
        <div ref={fitaRef}
          className="relative h-16 rounded-lg overflow-hidden border bg-neutral-800 cursor-col-resize select-none"
          onMouseDown={(e) => { arrastandoRef.current = true; irPara(tempoDaPosicao(e.clientX)); }}>
          <div className="flex h-full w-full">
            {(thumbs.length ? thumbs : Array(20).fill("")).map((t, i, arr) =>
              t ? <img key={i} src={t} draggable={false} className="h-full object-cover"
                    style={{ width: `${100 / arr.length}%` }} alt="" />
                : <div key={i} className={`h-full bg-muted ${thumbsFalhou ? "" : "animate-pulse"}`}
                    style={{ width: `${100 / arr.length}%` }} />,
            )}
          </div>
          <div className="absolute inset-0 pointer-events-none">
            {segs.map((s) => (
              <div key={s.id}
                className={`absolute top-0 h-full border-2 rounded-sm ${
                  s.keep
                    ? (segAtual?.id === s.id ? "border-primary" : "border-emerald-400/70")
                    : "border-red-500/70 bg-black/60 backdrop-grayscale"}`}
                style={{ left: `${(s.start / dur) * 100}%`, width: `${((s.end - s.start) / dur) * 100}%` }}>
                <button type="button"
                  title={s.keep ? "Tirar este trecho do clipe" : "Trazer este trecho de volta"}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); alternarSeg(s.id); }}
                  className={`pointer-events-auto absolute top-0.5 right-0.5 rounded p-0.5 ${
                    s.keep ? "bg-black/50 text-white hover:bg-red-600" : "bg-red-600 text-white hover:bg-emerald-600"}`}>
                  {s.keep ? <Trash2 className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
                </button>
              </div>
            ))}
            <div className="absolute top-0 bottom-0 w-0.5 bg-primary"
              style={{ left: `${Math.min(100, (playhead / dur) * 100)}%` }} />
          </div>
        </div>

        {/* ajuste fino do trecho sob o cursor */}
        {segAtual && (
          <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              Trecho sob o cursor: <b className="tabular-nums">{fmt(segAtual.start)}–{fmt(segAtual.end)}</b>
              {segAtual.keep ? " (fica)" : " (sai)"}
            </span>
            <label className="flex items-center gap-1 ml-auto">
              de
              <Input value={deField} onChange={(e) => setDeField(e.target.value)}
                onBlur={() => aplicarCampo("de")}
                onKeyDown={(e) => { if (e.key === "Enter") aplicarCampo("de"); }}
                placeholder={fmt(segAtual.start)} className="h-7 w-20 text-xs tabular-nums" />
            </label>
            <label className="flex items-center gap-1">
              até
              <Input value={ateField} onChange={(e) => setAteField(e.target.value)}
                onBlur={() => aplicarCampo("ate")}
                onKeyDown={(e) => { if (e.key === "Enter") aplicarCampo("ate"); }}
                placeholder={fmt(segAtual.end)} className="h-7 w-20 text-xs tabular-nums" />
            </label>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
              onClick={() => alternarSeg(segAtual.id)}>
              {segAtual.keep ? "Tirar do clipe" : "Trazer de volta"}
            </Button>
          </div>
        )}

        {/* Como as PARTES emendam entre si. Só aparece quando existem 2+ partes
            — com uma parte só não há emenda nenhuma para configurar. */}
        {partes.length > 1 && (
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <button type="button"
              onClick={() => setAbriuTransicao((v) => !v)}
              className="flex w-full items-center gap-2 text-xs">
              <Shuffle className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">Entre as partes:</span>
              <TransicaoDemo anim={TRANSICOES.find((t) => t.id === transicao)?.anim || "corte"}
                className="h-4 w-7" />
              <span className="text-muted-foreground">
                {transicao === "none" ? "Corte seco" : transicaoLabel(transicao)}
              </span>
              <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${abriuTransicao ? "rotate-180" : ""}`} />
            </button>
            {abriuTransicao && (
              <div className="mt-2 space-y-2">
                <TransicaoPicker value={transicao} onChange={setTransicao}
                  labelNone="Corte seco" compacto />
                <AvisoPrevia />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {partes.length === 0
              ? "Nada sobrou — mantenha ao menos um trecho."
              : <>Vai ficar com <b className="tabular-nums">{fmt(totalMantido)}</b>
                 {partes.length > 1 ? ` em ${partes.length} partes` : ""}</>}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancelar}>Cancelar</Button>
            <Button size="sm" className="gap-1" disabled={partes.length === 0}
              onClick={() => onConcluir(partes, partes.length > 1 ? transicao : "none")}>
              <Check className="h-3.5 w-3.5" /> Concluir
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

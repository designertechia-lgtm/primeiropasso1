/**
 * Relógio MESTRE da prévia (Fase C do multi-track).
 *
 * Antes o relógio ERA o <video> (controles nativos + onTimeUpdate a ~4Hz +
 * um setInterval de 120ms): o cursor pulsava, o karaokê/sticker andavam em
 * saltos e — decisivo — um único elemento nunca conseguiria reger N fontes.
 * Agora o tempo vive AQUI (rAF, ~60fps) e o <video> é uma FONTE COMANDADA:
 * segue o relógio por playbackRate e é corrigido por seek quando desvia
 * mais de 0,15s (o mesmo padrão de tolerância dos clipes de áudio).
 *
 * `avancarPlayhead` é PURO e espelha o comportamento histórico do onVideoTime:
 * na "prévia da edição" o play pula trechos removidos e anda na velocidade de
 * cada trecho; pausado, o cursor vai a qualquer lugar. Nas próximas fases o
 * mesmo relógio comanda um POOL de <video> (1 por fonte visível) e um canvas
 * compositor desenha as camadas — o motor já está pronto para isso.
 */
import { useEffect, useRef, useState } from "react";
import type { Segment } from "./types";

/** Velocidade do trecho keep sob o instante `t` (1 fora deles e na prévia crua). */
export function speedEm(t: number, segments: Segment[], previewEdit: boolean): number {
  if (!previewEdit) return 1;
  return segments.find((s) => s.keep && t >= s.start && t < s.end)?.speed ?? 1;
}

/** Avança o cursor `dt` segundos (tempo REAL) na timeline ORIGINAL.
 *  Prévia da edição ligada: anda na velocidade do trecho e PULA os removidos —
 *  consumindo o dt por partes (um tick pode cruzar a fronteira de um trecho).
 *  Devolve o novo instante e se a prévia chegou ao fim. */
export function avancarPlayhead(
  t: number, dt: number, segments: Segment[], previewEdit: boolean, duration: number,
): { t: number; fim: boolean } {
  if (!previewEdit || !segments.length) {
    const nt = t + dt;
    return { t: Math.min(nt, duration), fim: nt >= duration - 1e-3 };
  }
  let cur = t;
  let rest = dt;
  // guarda anti-loop: nunca há mais fronteiras que trechos num tick de ~16ms
  for (let g = 0; g < segments.length + 2 && rest > 1e-6; g++) {
    const seg = segments.find((s) => s.keep && cur >= s.start - 1e-6 && cur < s.end);
    if (!seg) {
      // trecho removido (ou fresta): salta para o próximo keep — igual ao
      // onVideoTime histórico (v.currentTime = próximo keep)
      const next = segments
        .filter((s) => s.keep && s.end > cur + 0.05 && s.start >= cur - 0.05)
        .sort((a, b) => a.start - b.start)[0];
      if (!next) return { t: cur, fim: true };
      cur = Math.max(next.start, cur);
      continue;
    }
    const sp = seg.speed ?? 1;
    const alcance = cur + rest * sp;    // dt real × velocidade = avanço na fonte
    if (alcance < seg.end) return { t: alcance, fim: false };
    rest -= (seg.end - cur) / sp;
    cur = seg.end;
  }
  return { t: cur, fim: cur >= duration - 0.05 };
}

type ClockOpts = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  segments: Segment[];
  previewEdit: boolean;
  /** chamado a cada tick (e em seek) com o instante novo — vira o playhead */
  onTick: (t: number) => void;
};

export type PreviewClock = {
  playing: boolean;
  toggle: () => void;
  pause: () => void;
  /** move o relógio E a fonte (clique na timeline, botões "= cursor", reset) */
  seek: (t: number) => void;
};

export function usePreviewClock(opts: ClockOpts): PreviewClock {
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(0);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  // refs para o rAF ler sempre o valor da RENDERIZAÇÃO ATUAL (sem closure velha)
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const playingRef = useRef(false);

  const syncFonte = (t: number, sp: number, tocando: boolean) => {
    const v = optsRef.current.videoRef.current;
    if (!v) return;
    if (Math.abs(v.currentTime - t) > 0.15) v.currentTime = t;
    if (Math.abs(v.playbackRate - sp) > 1e-3) v.playbackRate = sp;
    if (tocando && v.paused) v.play().catch(() => {});
    if (!tocando && !v.paused) v.pause();
  };

  const parar = () => {
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    const v = optsRef.current.videoRef.current;
    if (v && !v.paused) v.pause();
  };

  const tick = (now: number) => {
    if (!playingRef.current) return;
    const { duration, segments, previewEdit, onTick } = optsRef.current;
    // dt truncado a 100ms: aba em segundo plano congela o rAF — ao voltar, o
    // relógio não dá um salto gigante (a fonte é re-sincronizada pelo seek)
    const dt = Math.min(0.1, Math.max(0, (now - lastRef.current) / 1000));
    lastRef.current = now;
    const r = avancarPlayhead(tRef.current, dt, segments, previewEdit, duration);
    tRef.current = r.t;
    onTick(r.t);
    if (r.fim) { parar(); syncFonte(r.t, 1, false); return; }
    syncFonte(r.t, speedEm(r.t, segments, previewEdit), true);
    rafRef.current = requestAnimationFrame(tick);
  };

  const play = () => {
    if (playingRef.current) return;
    const { duration, segments, previewEdit } = optsRef.current;
    // play no fim = recomeça (comportamento de player)
    const r = avancarPlayhead(tRef.current, 0.001, segments, previewEdit, duration);
    if (r.fim || tRef.current >= duration - 0.05) {
      tRef.current = segments.find((s) => s.keep)?.start ?? 0;
      optsRef.current.onTick(tRef.current);
    }
    playingRef.current = true;
    setPlaying(true);
    lastRef.current = performance.now();
    syncFonte(tRef.current, speedEm(tRef.current, segments, previewEdit), true);
    rafRef.current = requestAnimationFrame(tick);
  };

  const seek = (t: number) => {
    const { duration, onTick } = optsRef.current;
    const clamped = Math.max(0, Math.min(duration || 0, t));
    tRef.current = clamped;
    onTick(clamped);
    const v = optsRef.current.videoRef.current;
    if (v) v.currentTime = clamped;
  };

  // aba escondida: pausa de verdade (senão o vídeo tocaria sozinho sem relógio)
  useEffect(() => {
    const vis = () => { if (document.hidden && playingRef.current) parar(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { playing, toggle: () => (playingRef.current ? parar() : play()), pause: parar, seek };
}

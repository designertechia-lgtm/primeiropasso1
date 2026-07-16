/**
 * Prova da Fase A do multi-track: o adaptador `docFlatToTracks` (front) tem de
 * produzir os MESMOS tempos que o motor (remap_cues/_norm_segments/remap_spans).
 *
 * Os números esperados abaixo foram tirados do MOTOR REAL (video_editor.py)
 * rodando os mesmos casos — ver scratchpad/ref_motor.py. Se o motor mudar a
 * conta, este teste quebra e obriga a atualizar `timelineFinalDe`. É o que
 * garante que a timeline final do modelo novo bate com a do modelo provado.
 */
import { describe, it, expect } from "vitest";
import { timelineFinalDe, origToFinal, docFlatToTracks, type VideoClip, type TextClip, type AudioClipT } from "./tracksModel";
import { emptyDoc, type EditorDoc } from "./documentReducer";
import { snapshotFromStored } from "./serialize";
import type { Segment } from "./types";

const seg = (id: number, start: number, end: number, keep: boolean, speed = 1): Segment =>
  ({ id, start, end, keep, speed });

describe("timelineFinalDe — espelho de _norm_segments/remap (motor)", () => {
  it("sem transição: trecho normal + câmera lenta 0,5×", () => {
    // keep [0,2]@1x e [3,5]@0.5x
    const keep = [seg(1, 0, 2, true, 1), seg(2, 3, 5, true, 0.5)];
    const { segs, xf, totalFinal } = timelineFinalDe(keep, false, 0);
    expect(xf).toBe(0);
    expect(segs[0].finalStart).toBeCloseTo(0, 3);
    expect(segs[1].finalStart).toBeCloseTo(2, 3);   // dur do 1º = 2/1 = 2
    expect(totalFinal).toBeCloseTo(6, 3);           // 2 + (2/0.5=4) = 6

    // legenda [3.5,4.5] no trecho lento → motor deu [3.0, 5.0]
    expect(origToFinal(3.5, segs)).toBeCloseTo(3.0, 3);
    expect(origToFinal(4.5, segs)).toBeCloseTo(5.0, 3);
    // sticker [0.5,1.5] no trecho normal → motor deu [0.5, 1.5]
    expect(origToFinal(0.5, segs)).toBeCloseTo(0.5, 3);
    expect(origToFinal(1.5, segs)).toBeCloseTo(1.5, 3);
  });

  it("com transição (xfade 0,4): o crossfade encurta a timeline", () => {
    // keep [0,2]@1x e [4,7]@1x, transição ligada
    const keep = [seg(1, 0, 2, true, 1), seg(2, 4, 7, true, 1)];
    const { segs, xf } = timelineFinalDe(keep, true, 0);
    expect(xf).toBeCloseTo(0.4, 3);                 // min(0.4, min(2,3)*0.9)
    // legenda [4.5,5.5] no 2º trecho → motor deu [2.1, 3.1]
    expect(origToFinal(4.5, segs)).toBeCloseTo(2.1, 3);
    expect(origToFinal(5.5, segs)).toBeCloseTo(3.1, 3);
  });

  it("instante fora dos trechos keep → null", () => {
    const keep = [seg(1, 0, 2, true, 1), seg(2, 3, 5, true, 0.5)];
    const { segs } = timelineFinalDe(keep, false, 0);
    expect(origToFinal(2.5, segs)).toBeNull();      // caiu no trecho removido
  });
});

describe("docFlatToTracks — doc flat v8 → faixas, tempos batendo com o motor", () => {
  const docBase = (over: Partial<EditorDoc>): EditorDoc => ({
    ...emptyDoc(),
    segments: [seg(1, 0, 2, true, 1), seg(2, 2, 3, false), seg(3, 3, 5, true, 0.5)],
    transition: "none",
    ...over,
  });

  it("faixa base: 1 VideoClip por trecho keep, da fonte única, com velocidade", () => {
    const tracks = docFlatToTracks(docBase({}), "fonteA");
    const base = tracks.find((t) => t.id === "video-base")!;
    expect(base.clips).toHaveLength(2);
    const c0 = base.clips[0] as VideoClip;
    const c1 = base.clips[1] as VideoClip;
    expect(c0.source_id).toBe("fonteA");
    expect(c0.timeline_start).toBeCloseTo(0, 3);
    expect(c0.timeline_end).toBeCloseTo(2, 3);
    expect(c1.speed).toBe(0.5);
    expect(c1.timeline_start).toBeCloseTo(2, 3);
    expect(c1.timeline_end).toBeCloseTo(6, 3);      // 2 + 2/0.5
  });

  it("legenda karaokê no trecho lento cai na janela remapeada [3.0, 5.0]", () => {
    const doc = docBase({
      subsOn: true, cueMode: "karaoke",
      cues: [{ start: 3.5, end: 4.5, text: "oi mundo" }],
      words: [{ start: 3.5, end: 4.0, text: "oi" }, { start: 4.0, end: 4.5, text: "mundo" }],
    });
    const tracks = docFlatToTracks(doc, "fonteA");
    const txt = tracks.find((t) => t.id === "text")!;
    const cue = txt.clips[0] as TextClip;
    expect(cue.timeline_start).toBeCloseTo(3.0, 3);
    expect(cue.timeline_end).toBeCloseTo(5.0, 3);
    expect(cue.karaoke).toBe(true);
    expect(cue.words).toHaveLength(2);
  });

  it("clipe de áudio NÃO estica na câmera lenta (duração natural)", () => {
    const doc = docBase({
      audioClips: [{ id: "x", upload_id: "narr.mp3", name: "n", natural_dur: 1,
                     start: 3.2, end: 4.2, volume: 1 }],
    });
    const tracks = docFlatToTracks(doc, "fonteA");
    const aud = tracks.find((t) => t.id === "audio")!;
    const clip = aud.clips[0] as AudioClipT;
    expect(clip.timeline_start).toBeCloseTo(2.4, 3);   // motor: 2.4
    expect(clip.timeline_end).toBeCloseTo(3.4, 3);     // natural 1.0, não estica
  });
});

describe("forward-compat: projeto salvo antes do multi-track não quebra", () => {
  it("doc v2 salvo SEM tracks volta com tracks:[] e o resto intacto", () => {
    // um snapshot v2 gravado hoje (sem os campos novos no doc)
    const salvo = {
      v: 2, meta: { edit_id: "abc", duration: 10, width: 1080, height: 1920,
                    has_audio: true, thumbs: [] },
      sourceLabel: "meu vídeo", sourceUrl: "", resultUrl: "", renderJobId: "",
      stickerJob: null, projectId: 7, projectName: "Projeto",
      doc: { segments: [{ id: 1, start: 0, end: 10, keep: true }], subColor: "#FF0000" },
    };
    const snap = snapshotFromStored(salvo)!;
    expect(snap).not.toBeNull();
    expect(snap.doc.tracks).toEqual([]);               // campo novo herdou o default
    expect(snap.doc.canvasW).toBe(0);
    expect(snap.doc.subColor).toBe("#FF0000");         // campo antigo preservado
    expect(snap.doc.segments).toHaveLength(1);
    expect(snap.projectId).toBe(7);
  });
});

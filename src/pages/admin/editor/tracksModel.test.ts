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
import { timelineFinalDe, origToFinal, docFlatToTracks, duracaoFinalDe, type VideoClip, type TextClip, type AudioClipT } from "./tracksModel";
import { emptyDoc, type EditorDoc } from "./documentReducer";
import { snapshotFromStored, aplicarFaixasOcultas } from "./serialize";
import type { Segment, SeqClip } from "./types";

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

  it("intro + transição com 1 trecho SÓ ainda crossfada (a capa é um part)", () => {
    // v8: parts = [intro, trecho] → used_xfade; head = intro - xf = 1,6
    const keep = [seg(1, 0, 4, true, 1)];
    const { segs, xf } = timelineFinalDe(keep, true, 2);
    expect(xf).toBeCloseTo(0.4, 3);
    expect(segs[0].finalStart).toBeCloseTo(1.6, 3);   // max(0, 2 - 0.4)
    expect(origToFinal(1.0, segs)).toBeCloseTo(2.6, 3);
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
    // legendas ficam na faixa PRÓPRIA "subs" (títulos na "text") — o motor v9
    // trata cada papel como o v8 (estilo único + karaokê vs estilo por texto)
    const subs = tracks.find((t) => t.id === "subs")!;
    const cue = subs.clips[0] as TextClip;
    expect(cue.timeline_start).toBeCloseTo(3.0, 3);
    expect(cue.timeline_end).toBeCloseTo(5.0, 3);
    expect(cue.karaoke).toBe(true);
    expect(cue.words).toHaveLength(2);
    // words também na timeline FINAL (esticadas pelo 0,5×), como o remap_cues
    expect(cue.words![0].start).toBeCloseTo(3.0, 3);
    expect(cue.words![0].end).toBeCloseTo(4.0, 3);
    expect(cue.words![1].end).toBeCloseTo(5.0, 3);
  });

  it("título ATRAVESSANDO o corte vira 2 pedaços contíguos (como remap_cues)", () => {
    // [1.5,3.5] cruza o removido [2,3]: pedaço 1 em [1.5,2.0] (trecho 1×) e
    // pedaço 2 em [2.0,3.0] (trecho 0,5× estica 0,5s→1,0s)
    const doc = docBase({
      titles: [{ id: "1", start: 1.5, end: 3.5, text: "cruza", font_id: "bevietnam",
                 size: "m", color: "#FFF", style: "outline", position: "center" }],
    });
    const txt = docFlatToTracks(doc, "fonteA").find((t) => t.id === "text")!;
    expect(txt.clips).toHaveLength(2);
    expect((txt.clips[0] as TextClip).timeline_start).toBeCloseTo(1.5, 3);
    expect((txt.clips[0] as TextClip).timeline_end).toBeCloseTo(2.0, 3);
    expect((txt.clips[1] as TextClip).timeline_start).toBeCloseTo(2.0, 3);
    expect((txt.clips[1] as TextClip).timeline_end).toBeCloseTo(3.0, 3);
  });

  it("legenda começando DENTRO do removido preserva só a parte visível", () => {
    // [2.2,3.8]: o começo caiu no removido [2,3] — o v8 mostra [3,3.8] do
    // trecho lento → final [2.0, 3.6]. (Antes o adaptador DESCARTAVA o cue.)
    const doc = docBase({
      subsOn: true, cues: [{ start: 2.2, end: 3.8, text: "parcial" }],
    });
    const subs = docFlatToTracks(doc, "fonteA").find((t) => t.id === "subs")!;
    expect(subs.clips).toHaveLength(1);
    expect((subs.clips[0] as TextClip).timeline_start).toBeCloseTo(2.0, 3);
    expect((subs.clips[0] as TextClip).timeline_end).toBeCloseTo(3.6, 3);
  });

  it("sticker atravessando o corte vira pedaços com src_in retomando", () => {
    const doc = docBase({
      stickers: [{ id: "1", upload_id: "stk", name: "s", natural_dur: 4, animated: true,
                   start: 1.5, end: 3.5, x_pct: 0.5, y_pct: 0.5, scale_pct: 0.2,
                   movement: "none", loop: true, flip: false }],
    });
    const pip = docFlatToTracks(doc, "fonteA").find((t) => t.id === "video-pip")!;
    expect(pip.clips).toHaveLength(2);
    const p0 = pip.clips[0] as VideoClip;
    const p1 = pip.clips[1] as VideoClip;
    expect(p0.src_in).toBeCloseTo(0, 3);
    expect(p0.timeline_start).toBeCloseTo(1.5, 3);
    expect(p1.src_in).toBeCloseTo(1.5, 3);   // retoma a animação no ponto certo
    expect(p1.timeline_start).toBeCloseTo(2.0, 3);
    expect(p1.timeline_end).toBeCloseTo(3.0, 3);
  });

  it("áudio começando no removido: 1 span do primeiro momento visível", () => {
    // [2.5,4.0]: primeiro momento visível = 3.0 (final 2.0); src_in compensa
    // os 0,5s que caíram no removido; duração segue a da janela (1,5s)
    const doc = docBase({
      audioClips: [{ id: "x", upload_id: "narr", name: "n", natural_dur: 1.5,
                     start: 2.5, end: 4.0, volume: 1 }],
    });
    const aud = docFlatToTracks(doc, "fonteA").find((t) => t.id === "audio")!;
    expect(aud.clips).toHaveLength(1);
    const c = aud.clips[0] as AudioClipT;
    expect(c.timeline_start).toBeCloseTo(2.0, 3);
    expect(c.timeline_end).toBeCloseTo(3.5, 3);
    expect(c.src_in).toBeCloseTo(0.5, 3);
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

describe("PiP de vídeo (Fase F) — faixa 'pip', span contínuo como o áudio", () => {
  it("PiP começando em removido: src_in compensa e o span não estica", () => {
    // pip [2.5,4.0] src_in 1.0: primeiro momento visível = 3.0 (final 2.0);
    // compensa 0.5 → src_in 1.5; duração da janela (1.5s) SEM esticar no 0,5×
    const doc: EditorDoc = {
      ...emptyDoc(),
      segments: [seg(1, 0, 2, true, 1), seg(2, 2, 3, false), seg(3, 3, 5, true, 0.5)],
      pipClips: [{ id: "1", edit_id: "pipsrc", name: "reação", natural_dur: 6,
                   source_url: "", start: 2.5, end: 4.0, src_in: 1.0,
                   x_pct: 0.7, y_pct: 0.25, scale_pct: 0.35, opacity: 0.9, volume: 0.5 }],
    };
    const pip = docFlatToTracks(doc, "fonteA").find((t) => t.id === "pip")!;
    expect(pip.clips).toHaveLength(1);
    const c = pip.clips[0] as VideoClip;
    expect(c.source_id).toBe("pipsrc");
    expect(c.timeline_start).toBeCloseTo(2.0, 3);
    expect(c.timeline_end).toBeCloseTo(3.5, 3);      // 1.5s naturais
    expect(c.src_in).toBeCloseTo(1.5, 3);
    expect(c.volume).toBeCloseTo(0.5, 3);
    expect(c.transform.opacidade).toBeCloseTo(0.9, 3);
    expect(c.loop).toBe(false);
  });
});

describe("vídeos em SEQUÊNCIA (Fase F) — emendados na faixa base", () => {
  it("seq entra depois do último trecho, descontando o xf da emenda", () => {
    // keep [0,4]@1 + 2 emendados (3s e 2s) com dissolve: xf = 0.4
    // seq1 = [4-0.4, 6.6]; seq2 = [3.6+3-0.4, +2]
    const doc: EditorDoc = {
      ...emptyDoc(),
      segments: [seg(1, 0, 4, true, 1)],
      transition: "dissolve",
      seqClips: [
        { id: "a", edit_id: "vidB", name: "take 2", natural_dur: 6,
          source_url: "", src_in: 1, src_out: 4 },
        { id: "b", edit_id: "vidC", name: "fecho", natural_dur: 2,
          source_url: "", src_in: 0, src_out: 2 },
      ],
    };
    const base = docFlatToTracks(doc, "fonteA").find((t) => t.id === "video-base")!;
    expect(base.clips).toHaveLength(3);
    const s1 = base.clips[1] as VideoClip;
    const s2 = base.clips[2] as VideoClip;
    expect(s1.source_id).toBe("vidB");
    expect(s1.src_in).toBeCloseTo(1, 3);
    expect(s1.timeline_start).toBeCloseTo(3.6, 3);   // 4 - xf
    expect(s1.timeline_end).toBeCloseTo(6.6, 3);
    expect(s1.transition_in).toBe("dissolve");
    expect(s2.source_id).toBe("vidC");
    expect(s2.timeline_start).toBeCloseTo(6.2, 3);   // 3.6 + 3 - xf
    // corte seco: sem desconto
    const seco = docFlatToTracks({ ...doc, transition: "none" }, "fonteA")
      .find((t) => t.id === "video-base")!;
    expect((seco.clips[1] as VideoClip).timeline_start).toBeCloseTo(4.0, 3);
  });

  it("emendado CURTO clampa o xf de todas as emendas (como o motor)", () => {
    // keep 4s + seq de 0.3s: xf = min(0.4, 0.3*0.9) = 0.27
    const { xf } = timelineFinalDe([seg(1, 0, 4, true, 1)], true, 0, [0.3]);
    expect(xf).toBeCloseTo(0.27, 3);
  });
});

describe("emenda por PARTES da mesma fonte — corte seco (cortador de clipe)", () => {
  // o cortador divide UM vídeo em "parte 1 / parte 2": crossfadear o vídeo com
  // ele mesmo faria fantasma e comeria duração que o usuário não pediu
  const partes = (t: string): EditorDoc => ({
    ...emptyDoc(),
    segments: [seg(1, 0, 4, true, 1)],
    transition: t,
    seqClips: [
      { id: "p1", edit_id: "vidB", name: "take (parte 1)", natural_dur: 6,
        source_url: "", src_in: 1, src_out: 4 },
      { id: "p2", edit_id: "vidB", name: "take (parte 2)", natural_dur: 6,
        source_url: "", src_in: 4, src_out: 6 },
      { id: "c", edit_id: "vidC", name: "fecho", natural_dur: 2,
        source_url: "", src_in: 0, src_out: 2 },
    ],
  });

  it("seco entre as partes; crossfade nas emendas entre fontes diferentes", () => {
    const base = docFlatToTracks(partes("dissolve"), "fonteA")
      .find((t) => t.id === "video-base")!;
    const [, p1, p2, c] = base.clips as VideoClip[];
    // principal → parte 1: fontes diferentes, crossfada (4 - 0.4)
    expect(p1.timeline_start).toBeCloseTo(3.6, 3);
    expect(p1.transition_in).toBe("dissolve");
    // parte 1 → parte 2: MESMA fonte, contíguo e SEM transição
    expect(p1.timeline_end).toBeCloseTo(6.6, 3);
    expect(p2.timeline_start).toBeCloseTo(6.6, 3);
    expect(p2.transition_in).toBeUndefined();
    expect(p2.timeline_end).toBeCloseTo(8.6, 3);
    // parte 2 → outra fonte: volta a crossfadar
    expect(c.timeline_start).toBeCloseTo(8.2, 3);
    expect(c.transition_in).toBe("dissolve");
  });

  it("a regra é por ADJACÊNCIA: reordenar separa as partes e o fade volta", () => {
    const doc = partes("dissolve");
    const [p1, p2, c] = doc.seqClips;
    const base = docFlatToTracks({ ...doc, seqClips: [p1, c, p2] }, "fonteA")
      .find((t) => t.id === "video-base")!;
    const clips = base.clips as VideoClip[];
    expect(clips[2].transition_in).toBe("dissolve");   // p1 → c (fontes difs)
    expect(clips[3].transition_in).toBe("dissolve");   // c → p2 (fontes difs)
  });

  it("transição none: tudo seco e contíguo, mesmo entre fontes diferentes", () => {
    const base = docFlatToTracks(partes("none"), "fonteA")
      .find((t) => t.id === "video-base")!;
    const [, p1, p2, c] = base.clips as VideoClip[];
    expect(p1.timeline_start).toBeCloseTo(4.0, 3);
    expect(p2.timeline_start).toBeCloseTo(7.0, 3);
    expect(c.timeline_start).toBeCloseTo(9.0, 3);
    expect(p1.transition_in).toBeUndefined();
    expect(c.transition_in).toBeUndefined();
  });

  it("parte CURTA da mesma fonte ainda clampa o xf global (min sobre parts)", () => {
    const doc: EditorDoc = {
      ...emptyDoc(),
      segments: [seg(1, 0, 4, true, 1)],
      transition: "dissolve",
      seqClips: [
        { id: "p1", edit_id: "vidB", name: "a", natural_dur: 6, source_url: "",
          src_in: 0, src_out: 3 },
        { id: "p2", edit_id: "vidB", name: "b", natural_dur: 6, source_url: "",
          src_in: 3, src_out: 3.3 },                    // 0,3s → xf = 0.27
      ],
    };
    const base = docFlatToTracks(doc, "fonteA").find((t) => t.id === "video-base")!;
    const [, p1, p2] = base.clips as VideoClip[];
    expect(p1.timeline_start).toBeCloseTo(3.73, 3);     // 4 - 0.27
    expect(p2.timeline_start).toBeCloseTo(p1.timeline_end, 3);   // seco
  });
});

describe("transição POR EMENDA (escolha explícita vence a regra padrão)", () => {
  const doc3 = (over: Partial<SeqClip>[] = []): EditorDoc => ({
    ...emptyDoc(),
    segments: [seg(1, 0, 4, true, 1)],
    transition: "dissolve",
    seqClips: [
      { id: "p1", edit_id: "vidB", name: "take (parte 1)", natural_dur: 6,
        source_url: "", src_in: 1, src_out: 4, ...over[0] },
      { id: "p2", edit_id: "vidB", name: "take (parte 2)", natural_dur: 6,
        source_url: "", src_in: 4, src_out: 6, ...over[1] },
      { id: "c", edit_id: "vidC", name: "fecho", natural_dur: 2,
        source_url: "", src_in: 0, src_out: 2, ...over[2] },
    ],
  });

  it("partes da mesma fonte PODEM ter transição quando pedida no cortador", () => {
    // o cortador funde partes encostadas, então 2 partes = há um buraco entre
    // elas: o conteúdo dos dois lados é diferente e não há fantasma
    const base = docFlatToTracks(doc3([{}, { transition_in: "zoom" }]), "fonteA")
      .find((t) => t.id === "video-base")!;
    const [, p1, p2] = base.clips as VideoClip[];
    expect(p2.transition_in).toBe("zoom");
    expect(p2.timeline_start).toBeCloseTo(p1.timeline_end - 0.4, 3);   // descontou xf
  });

  it("corte seco EXPLÍCITO entre fontes diferentes vence a global", () => {
    const base = docFlatToTracks(doc3([{}, {}, { transition_in: "none" }]), "fonteA")
      .find((t) => t.id === "video-base")!;
    const [, , p2, c] = base.clips as VideoClip[];
    expect(c.transition_in).toBeUndefined();
    expect(c.timeline_start).toBeCloseTo(p2.timeline_end, 3);         // contíguo
  });

  it("cada emenda pode ter uma transição DIFERENTE", () => {
    const base = docFlatToTracks(
      doc3([{ transition_in: "iris" }, { transition_in: "varrer_esq" }, { transition_in: "flash" }]),
      "fonteA").find((t) => t.id === "video-base")!;
    const [, p1, p2, c] = base.clips as VideoClip[];
    expect(p1.transition_in).toBe("iris");
    expect(p2.transition_in).toBe("varrer_esq");
    expect(c.transition_in).toBe("flash");
  });

  it("global SECA + emenda com transição: o xf existe só para o emendado", () => {
    // sem isto o xf seria 0 e a transição escolhida sairia com duração zero,
    // ou seja, não sairia. Os trechos do PRINCIPAL seguem secos.
    const doc: EditorDoc = {
      ...emptyDoc(),
      segments: [seg(1, 0, 4, true, 1), seg(2, 5, 9, true, 1)],
      transition: "none",
      seqClips: [{ id: "c", edit_id: "vidC", name: "fecho", natural_dur: 3,
        source_url: "", src_in: 0, src_out: 3, transition_in: "fade" }],
    };
    const base = docFlatToTracks(doc, "fonteA").find((t) => t.id === "video-base")!;
    const [t1, t2, c] = base.clips as VideoClip[];
    // os 2 trechos do principal continuam CONTÍGUOS (a global é corte seco)
    expect(t2.timeline_start).toBeCloseTo(t1.timeline_end, 3);
    // e o emendado descontou o xf da transição que ele pediu
    expect(c.transition_in).toBe("fade");
    expect(c.timeline_start).toBeCloseTo(t2.timeline_end - 0.4, 3);
    expect(duracaoFinalDe(doc)).toBeCloseTo(4 + 4 + 3 - 0.4, 3);
  });

  it("projeto SALVO antes da feature (sem transition_in) não muda de resultado", () => {
    // regressão zero por construção: campo ausente = herda a regra de sempre
    const antigo = docFlatToTracks(doc3(), "fonteA").find((t) => t.id === "video-base")!;
    const [, p1, p2, c] = antigo.clips as VideoClip[];
    expect(p1.transition_in).toBe("dissolve");     // fontes diferentes → global
    expect(p2.transition_in).toBeUndefined();      // mesma fonte → seco
    expect(c.transition_in).toBe("dissolve");
  });
});

describe("duracaoFinalDe — o contador da tela bate com o arquivo que sai", () => {
  it("sem emendados: é o totalFinal dos cortes", () => {
    const doc: EditorDoc = {
      ...emptyDoc(),
      segments: [seg(1, 0, 2, true, 1), seg(2, 4, 7, true, 1)],
      transition: "dissolve",
    };
    expect(duracaoFinalDe(doc)).toBeCloseTo(4.6, 3);    // 2 + 3 - 0.4
  });

  it("com emendados mistos (fade + seco): bate com o fim do último clipe", () => {
    const doc: EditorDoc = {
      ...emptyDoc(),
      segments: [seg(1, 0, 4, true, 1)],
      transition: "dissolve",
      seqClips: [
        { id: "p1", edit_id: "vidB", name: "a", natural_dur: 6, source_url: "",
          src_in: 1, src_out: 4 },
        { id: "p2", edit_id: "vidB", name: "b", natural_dur: 6, source_url: "",
          src_in: 4, src_out: 6 },
        { id: "c", edit_id: "vidC", name: "c", natural_dur: 2, source_url: "",
          src_in: 0, src_out: 2 },
      ],
    };
    const base = docFlatToTracks(doc, "fonteA").find((t) => t.id === "video-base")!;
    const ultimo = base.clips[base.clips.length - 1] as VideoClip;
    expect(duracaoFinalDe(doc)).toBeCloseTo(ultimo.timeline_end, 3);
    expect(duracaoFinalDe(doc)).toBeCloseTo(10.2, 3);   // 3.6+3 | +2 | -0.4 +2
  });

  it("emendado menor que 0,15s é ignorado (mesmo piso do adaptador)", () => {
    const doc: EditorDoc = {
      ...emptyDoc(),
      segments: [seg(1, 0, 4, true, 1)],
      transition: "none",
      seqClips: [
        { id: "x", edit_id: "vidB", name: "poeira", natural_dur: 6,
          source_url: "", src_in: 1, src_out: 1.1 },
      ],
    };
    expect(duracaoFinalDe(doc)).toBeCloseTo(4, 3);
    const base = docFlatToTracks(doc, "fonteA").find((t) => t.id === "video-base")!;
    expect(base.clips).toHaveLength(1);
  });
});

describe("aplicarFaixasOcultas (olhinho) — o que você vê é o que o render faz", () => {
  it("faixa oculta sai do doc efetivo; conteúdo original fica intacto", () => {
    const doc: EditorDoc = {
      ...emptyDoc(),
      subsOn: true, cues: [{ start: 1, end: 2, text: "olá" }],
      titles: [{ id: "1", start: 0, end: 2, text: "t", font_id: "bevietnam",
                 size: "m", color: "#FFF", style: "outline", position: "center" }],
      trackFlags: { text: { hidden: true }, subs: { hidden: true } },
    };
    const efetivo = aplicarFaixasOcultas(doc);
    expect(efetivo.titles).toHaveLength(0);
    expect(efetivo.subsOn).toBe(false);
    expect(doc.titles).toHaveLength(1);   // o guardado não muda
    expect(doc.cues).toHaveLength(1);
    // sem flag = passa direto (mesma referência, zero custo)
    expect(aplicarFaixasOcultas({ ...doc, trackFlags: {} }).titles).toHaveLength(1);
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

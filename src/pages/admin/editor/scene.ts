/**
 * Engine de prévia (Fase 2) — o que aparece na tela no instante `t`.
 *
 * Até aqui, legendas e textos só existiam DEPOIS do render (minutos): a pessoa
 * escrevia e torcia. `evaluateScene` diz o que está visível em `t` e `drawScene`
 * desenha no canvas sobre o player.
 *
 * REGRA DE OURO: quem renderiza de verdade é o ffmpeg (ASS via libass). Este
 * arquivo ESPELHA a régua do motor — as constantes abaixo são cópia de
 * `video-api/services/video_editor.py` (_SUB_SIZES, _SUB_POSITIONS, _ass_style,
 * _selo_png, burn_overlays). Mudou lá, muda aqui, senão a prévia mente.
 *
 * Conferido contra o render real (frame 1080x1920 do próprio motor):
 *   - centro horizontal do texto: 0-1px;
 *   - base da legenda (bottom): 4px (0,2% da altura);
 *   - selo: margem 4,5% da largura e 8% da altura — bate.
 *
 * O QUE A PRÉVIA NÃO PROMETE (divergências conhecidas e aceitas):
 *   - quebra de linha: a libass usa WrapStyle 0; aqui é aproximação por largura;
 *   - o glifo dentro da linha varia alguns px (métrica da fonte);
 *   - `\b0`: na bevietnam (a padrão), as linhas depois do "|" trocam no motor
 *     para a face Medium da família, e a rota /editor/fonte serve só a Bold —
 *     a prévia desenha essas linhas em Bold. Na poppins não muda nada (a
 *     família só tem Bold e ExtraBold, então o \b0 cai na Bold mesmo).
 */
import type { AudioClip, Cue, Sticker, SubPos, SubSize, SubStyle, Title, TitlePos } from "./types";
import type { EditorDoc } from "./documentReducer";

/** PlayResY do ASS: toda a régua de tamanho/margem vive nesta altura virtual. */
export const PLAY_RES_Y = 384;
/** _SUB_SIZES do motor. */
export const SUB_SIZES: Record<SubSize, number> = { p: 12, m: 15, g: 19, xg: 24 };
/** _SUB_POSITIONS do motor: (Alignment do ASS, MarginV). */
export const SUB_POSITIONS: Record<TitlePos, { align: number; marginV: number }> = {
  bottom: { align: 2, marginV: 30 },
  center: { align: 5, marginV: 10 },
  top: { align: 8, marginV: 40 },
  "left-bottom": { align: 1, marginV: 48 },
  "left-center": { align: 4, marginV: 10 },
  "left-top": { align: 7, marginV: 40 },
};
/** MarginL/MarginR fixos no _ass_style. */
export const ASS_MARGIN_LR = 30;
/** O SELO não passa por ASS: é PNG (PIL) posicionado por FRAÇÃO DO FRAME
 *  (burn_overlays: margin_x = width*0.045; y = height*0.08). Usar a régua ASS
 *  aqui punha o selo ~9% da largura fora do lugar. */
export const SELO_MARGIN_X_PCT = 0.045;
export const SELO_MARGIN_Y_PCT = 0.08;
/** Fonte padrão do motor quando o font_id não está na whitelist
 *  (_ass_style cai em SUBTITLE_FONTS[0]; _selo_png em font_file("bevietnam")). */
export const FONTE_PADRAO = "bevietnam";

/** Texto no canto esquerdo + Caixa vira SELO-ARTE (PIL) no motor, não ASS. */
export const isSelo = (t: { position: TitlePos; style: SubStyle }) =>
  t.position.startsWith("left") && t.style === "box";

export type TextoNaTela = {
  id: string;
  text: string;
  font_id: string;
  size: SubSize;
  color: string;
  style: SubStyle;
  position: TitlePos;
};

export type Cena = {
  legenda: TextoNaTela | null;
  textos: TextoNaTela[];
  selos: TextoNaTela[];
  stickers: Sticker[];
  audios: AudioClip[];
};

const ativo = (x: { start: number; end: number }, t: number) => t >= x.start && t <= x.end;

/**
 * Espelha o `remap_cues` do motor: textos NÃO se sobrepõem no render — quem
 * começa antes é truncado pouco antes do próximo (e some se ficar < 0,15s).
 * Sem isso a prévia mostrava dois textos onde o vídeo mostra um.
 * (Stickers e áudios PODEM coexistir — é o `remap_spans`, sem truncagem.)
 */
export function truncarSobrepostos<T extends { start: number; end: number; text?: string }>(itens: T[]): T[] {
  const ord = [...itens].sort((a, b) => a.start - b.start);
  const out = ord.map((c, i) => {
    const prox = ord[i + 1];
    if (prox && c.end > prox.start) {
      return { ...c, end: Math.max(c.start + 0.05, prox.start - 0.03) };
    }
    return c;
  });
  // Sem filtro de duração mínima aqui de propósito: o motor aplica os 0,15s
  // ANTES de truncar (sobre a interseção com o trecho mantido) e nunca
  // revalida — a truncagem tem piso próprio (start+0.05) e o motor MANTÉM
  // itens de 50-140ms. Filtrar depois sumia da prévia um texto que o vídeo
  // mostra (como flash).
  return out.filter((c) => (c.text ?? "").trim() !== "");
}

/** O que está visível/audível em `t`. Pura: mesma entrada, mesma cena. */
export function evaluateScene(doc: EditorDoc, t: number): Cena {
  const cue: Cue | undefined = doc.subsOn
    ? truncarSobrepostos(doc.cues).find((c) => ativo(c, t))
    : undefined;
  // o motor passa TODOS os títulos (selos inclusive) por remap_cues ANTES de
  // separar selo de texto — a truncagem enxerga os dois grupos juntos
  const visiveis = truncarSobrepostos(doc.titles).filter((x) => ativo(x, t));
  return {
    legenda: cue
      ? {
          id: "sub", text: cue.text, font_id: doc.subFont, size: doc.subSize,
          color: doc.subColor, style: doc.subStyle, position: doc.subPos as TitlePos,
        }
      : null,
    textos: visiveis.filter((x) => !isSelo(x)),
    selos: visiveis.filter((x) => isSelo(x)),
    stickers: doc.stickers.filter((s) => ativo(s, t)),
    audios: doc.audioClips.filter((c) => ativo(c, t)),
  };
}

/** Fontes que a cena precisa ter carregadas para desenhar fiel. */
export function fontesDaCena(doc: EditorDoc): string[] {
  const ids = new Set<string>();
  if (doc.subsOn && doc.cues.length) ids.add(doc.subFont);
  for (const t of doc.titles) ids.add(t.font_id);
  return [...ids].filter(Boolean);
}

type Rect = { w: number; h: number };

/** Fonte a usar no desenho. Espelha o fallback do motor: font_id fora da
 *  whitelist cai na fonte padrão (SUBTITLE_FONTS[0] = bevietnam), não numa
 *  fonte do sistema — usar sans-serif fazia a prévia mentir peso e largura. */
const familia = (fontId: string, carregadas: Set<string>) => {
  if (carregadas.has(fontId)) return `edfont-${fontId}`;
  if (carregadas.has(FONTE_PADRAO)) return `edfont-${FONTE_PADRAO}`;
  return "sans-serif";   // nem a padrão carregou ainda — transitório
};

/** Quebra o texto na largura útil (o motor usa WrapStyle 0; aqui é aproximação). */
function quebrar(ctx: CanvasRenderingContext2D, texto: string, maxW: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of texto.split("\n")) {
    const palavras = paragrafo.split(" ");
    let atual = "";
    for (const p of palavras) {
      const tentativa = atual ? `${atual} ${p}` : p;
      if (ctx.measureText(tentativa).width > maxW && atual) {
        linhas.push(atual);
        atual = p;
      } else atual = tentativa;
    }
    linhas.push(atual);
  }
  return linhas.filter((l) => l !== "");
}

/**
 * Desenha um texto do jeito que o ASS desenharia: `size` na régua de 384,
 * alinhamento/margem da tabela, contorno (BorderStyle 1) ou caixa translúcida
 * (BorderStyle 3, &H66000000 = 60% de opacidade).
 */
function desenharTexto(
  ctx: CanvasRenderingContext2D, item: TextoNaTela, rect: Rect, carregadas: Set<string>,
) {
  const escala = rect.h / PLAY_RES_Y;
  const { align, marginV } = SUB_POSITIONS[item.position] ?? SUB_POSITIONS.bottom;
  const fsBase = SUB_SIZES[item.size] ?? SUB_SIZES.m;
  const margemLR = ASS_MARGIN_LR * escala;
  const maxW = rect.w - margemLR * 2;

  // "|" = TÍTULO|subtítulo: 1ª linha no tamanho escolhido, o resto a ~55%
  // (espelha o \fs do burn_overlays). O motor escapa { } (viram parênteses,
  // senão a libass leria como tag de override).
  const escapar = (s: string) => s.replace(/\{/g, "(").replace(/\}/g, ")");
  const temPipe = item.text.includes("|");
  const partes = item.text.split("|").map((s) => s.trim()).filter(Boolean);
  const blocos: { texto: string; px: number }[] = [];
  if (temPipe && partes.length > 1) {
    blocos.push({ texto: escapar(partes[0]), px: fsBase * escala });
    for (const resto of partes.slice(1)) blocos.push({ texto: escapar(resto), px: Math.max(8, Math.round(fsBase * 0.55)) * escala });
  } else {
    // com pipe "solto" ("Daiane |"), o motor descarta a parte vazia — usar
    // item.text cru deixaria o "|" aparecendo só na prévia
    blocos.push({ texto: escapar(temPipe ? (partes[0] ?? "") : item.text), px: fsBase * escala });
  }

  // mede tudo antes: o bloco inteiro é posicionado como uma unidade
  const linhas: { texto: string; px: number }[] = [];
  for (const b of blocos) {
    ctx.font = `${b.px}px "${familia(item.font_id, carregadas)}", sans-serif`;
    for (const l of quebrar(ctx, b.texto, maxW)) linhas.push({ texto: l, px: b.px });
  }
  if (!linhas.length) return;

  const alturaLinha = (px: number) => px * 1.2;
  const alturaTotal = linhas.reduce((a, l) => a + alturaLinha(l.px), 0);

  // vertical: 1-3 = base, 4-6 = meio (libass ignora MarginV), 7-9 = topo
  let topo: number;
  if (align <= 3) topo = rect.h - marginV * escala - alturaTotal;
  else if (align <= 6) topo = (rect.h - alturaTotal) / 2;
  else topo = marginV * escala;

  const esquerda = align % 3 === 1;   // 1,4,7 = esquerda; senão centro
  let y = topo;
  for (const l of linhas) {
    ctx.font = `${l.px}px "${familia(item.font_id, carregadas)}", sans-serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = esquerda ? "left" : "center";
    const x = esquerda ? margemLR : rect.w / 2;
    const larg = ctx.measureText(l.texto).width;

    if (item.style === "box") {
      const padX = 0.28 * l.px, padY = 0.14 * l.px;
      const bx = esquerda ? x - padX : x - larg / 2 - padX;
      ctx.fillStyle = "rgba(0,0,0,0.6)";   // &H66000000
      ctx.fillRect(bx, y - padY, larg + padX * 2, alturaLinha(l.px) + padY * 2 - l.px * 0.2);
      ctx.fillStyle = item.color;
      ctx.fillText(l.texto, x, y);
    } else {
      ctx.lineJoin = "round";
      // Outline: 2 no _ass_style (régua de 384). strokeText centra o traço na
      // borda do glifo — metade cai pra dentro; dobrar deixa as 2 unidades
      // visíveis pra fora, como a libass desenha.
      ctx.lineWidth = 2 * 2 * escala;
      ctx.strokeStyle = "#000";
      ctx.strokeText(l.texto, x, y);
      ctx.fillStyle = item.color;
      ctx.fillText(l.texto, x, y);
    }
    y += alturaLinha(l.px);
  }
}

/**
 * Selo/lower-third: aproximação do `_selo_png` + do overlay do `burn_overlays`.
 * ATENÇÃO: o selo NÃO usa a régua ASS — é PNG posicionado por fração do frame
 * (x = width*0.045; y = height*0.08), e os clamps do PIL (max(14, ...)) valem
 * em PIXEL DE VÍDEO, não no tamanho do player. Por isso tudo aqui é calculado
 * no espaço do vídeo (`videoH`) e só no fim convertido para a tela.
 */
function desenharSelo(
  ctx: CanvasRenderingContext2D, item: TextoNaTela, rect: Rect,
  carregadas: Set<string>, videoH: number,
) {
  const partes = item.text.split("|").map((s) => s.trim()).filter(Boolean);
  const titulo = partes[0] || "";
  // o motor junta TODOS os extras: "Nome|A|B" → "A · B"
  const sub = partes.length > 1 ? partes.slice(1).join(" · ").toUpperCase() : "";
  if (!titulo) return;

  // tela ÷ vídeo: desenha no espaço do vídeo e encolhe para o player
  const k = rect.h / Math.max(1, videoH);
  const fs = SUB_SIZES[item.size] ?? SUB_SIZES.m;
  const titlePx = Math.max(14, Math.round(fs * videoH / PLAY_RES_Y));
  const subPx = Math.max(10, Math.round(titlePx * 0.52));
  const fam = familia(item.font_id, carregadas);
  const padX = Math.round(titlePx * 0.85), padY = Math.round(titlePx * 0.55);
  const gap = Math.round(titlePx * 0.32);
  // `//` do Python é divisão inteira, não arredondamento (max(4, title_px//6))
  const accent = Math.max(4, Math.floor(titlePx / 6));

  // O PIL mede a BBOX DA TINTA (textbbox), não o corpo da fonte — medir pelo
  // corpo deixava a caixa ~17% mais alta que a do render.
  ctx.font = `${titlePx}px "${fam}", sans-serif`;
  const mt = ctx.measureText(titulo);
  const tw = mt.actualBoundingBoxRight + mt.actualBoundingBoxLeft;
  const th = mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent;
  ctx.font = `${subPx}px "${fam}", sans-serif`;
  const ms = sub ? ctx.measureText(sub) : null;
  const sw = ms ? ms.actualBoundingBoxRight + ms.actualBoundingBoxLeft : 0;
  const sh = ms ? ms.actualBoundingBoxAscent + ms.actualBoundingBoxDescent : 0;

  // dimensões em px de vídeo → px de tela
  const w = (accent + padX + Math.max(tw, sw) + padX) * k;
  const h = (padY + th + (sub ? gap + sh : 0) + padY) * k;
  const margemY = Math.round(videoH * SELO_MARGIN_Y_PCT) * k;
  const x = rect.w * SELO_MARGIN_X_PCT;
  const y = item.position === "left-top" ? margemY
    : item.position === "left-center" ? (rect.h - h) / 2
    : rect.h - h - margemY;

  const r = Math.round(titlePx * 0.35) * k;
  const caixa = (x0: number, y0: number, w0: number, h0: number, cor: string) => {
    ctx.fillStyle = cor;
    ctx.beginPath();
    // roundRect não existe em toda engine — desenha na mão
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r);
    ctx.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r);
    ctx.arcTo(x0, y0 + h0, x0, y0, r);
    ctx.arcTo(x0, y0, x0 + w0, y0, r);
    ctx.closePath();
    ctx.fill();
  };
  caixa(x, y, w, h, "rgba(8,8,12,0.80)");
  caixa(x, y, accent * k + r, h, item.color);
  caixa(x + accent * k, y, w - accent * k, h, "rgba(8,8,12,0.80)");

  // baseline alphabetic + ascent da tinta = o `pad_y - tb[1]` do PIL (encosta o
  // TOPO DA TINTA no padding, não o topo do corpo da fonte)
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = item.color;
  ctx.font = `${titlePx * k}px "${fam}", sans-serif`;
  const mtd = ctx.measureText(titulo);
  ctx.fillText(titulo, x + (accent + padX) * k, y + padY * k + mtd.actualBoundingBoxAscent);
  if (sub) {
    ctx.fillStyle = "rgb(226,226,230)";
    ctx.font = `${subPx * k}px "${fam}", sans-serif`;
    const msd = ctx.measureText(sub);
    ctx.fillText(sub, x + (accent + padX) * k,
      y + (padY + th + gap) * k + msd.actualBoundingBoxAscent);
  }
}

/**
 * Ordem de empilhamento do motor (stickers ficam embaixo, em DOM, para
 * continuarem arrastáveis): selos → LEGENDA → textos.
 * A legenda vem antes dos textos porque o burn_overlays emite as legendas em
 * `Dialogue: 0` e os títulos em `Dialogue: 1` — e a libass desenha por Layer
 * crescente, ou seja, o TÍTULO fica por cima da legenda.
 * `videoH` = altura real do vídeo: o selo é dimensionado em px de vídeo.
 */
export function drawScene(
  ctx: CanvasRenderingContext2D, cena: Cena, rect: Rect,
  carregadas: Set<string>, videoH: number,
) {
  ctx.clearRect(0, 0, rect.w, rect.h);
  for (const s of cena.selos) desenharSelo(ctx, s, rect, carregadas, videoH);
  if (cena.legenda) desenharTexto(ctx, cena.legenda, rect, carregadas);
  for (const t of cena.textos) desenharTexto(ctx, t, rect, carregadas);
}

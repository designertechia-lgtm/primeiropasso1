/**
 * EIXO VISUAL da timeline — o mapa entre o tempo real da fonte e a posição
 * desenhada quando existem trechos "excluídos de vez".
 *
 * Pedido do Carlos (11/08): excluir de vez tem de REMOVER o trecho da tela,
 * não só tirar o botão de restaurar — o bloco vermelho continuava ocupando o
 * mesmo espaço e parecia que nada tinha acontecido. Mas o documento continua
 * guardando os trechos no tempo da FONTE (é assim que o worker corta), então
 * a remoção é do DESENHO: o eixo colapsa as regiões excluídas a largura zero
 * e todo elemento da timeline (trechos, legendas, playhead, régua, cliques)
 * passa a se posicionar pelo tempo VISUAL em vez do tempo bruto.
 *
 * Funções puras de propósito: o teste cobre as contas sem montar componente.
 */

export type SegEixo = { start: number; end: number; keep: boolean; dismissed?: boolean };
export type FaixaEixo = { start: number; end: number; visivel: boolean };

/** Partição de [0, durTotal] em faixas visíveis/colapsadas. Colapsa APENAS
 *  trecho removido E excluído de vez; tudo o mais (inclusive a cauda dos
 *  vídeos emendados, além do último segment) fica visível. */
export function construirEixo(segs: SegEixo[], durTotal: number): FaixaEixo[] {
  const ocultos = segs
    .filter((s) => !s.keep && s.dismissed && s.end > s.start)
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(durTotal, s.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const out: FaixaEixo[] = [];
  let cursor = 0;
  for (const o of ocultos) {
    if (o.start > cursor + 1e-9) out.push({ start: cursor, end: o.start, visivel: true });
    // segments não se sobrepõem (partição), mas o clamp protege de lixo
    const ini = Math.max(cursor, o.start);
    if (o.end > ini + 1e-9) out.push({ start: ini, end: o.end, visivel: false });
    cursor = Math.max(cursor, o.end);
  }
  if (durTotal > cursor + 1e-9) out.push({ start: cursor, end: durTotal, visivel: true });
  if (!out.length) out.push({ start: 0, end: Math.max(durTotal, 0.001), visivel: true });
  return out;
}

/** Duração desenhada (soma das faixas visíveis). Nunca devolve 0: com tudo
 *  colapsado (estado impossível na prática — sempre sobra um keep), cai na
 *  duração real para não dividir por zero. */
export function durVisual(eixo: FaixaEixo[]): number {
  const v = eixo.reduce((a, f) => a + (f.visivel ? f.end - f.start : 0), 0);
  return v > 1e-6 ? v : Math.max(eixo[eixo.length - 1]?.end ?? 0.001, 0.001);
}

/** Tempo real → tempo visual (segundos desenhados antes de `t`). Dentro de uma
 *  faixa colapsada, todo instante cai na costura (mesmo ponto). */
export function paraVisual(eixo: FaixaEixo[], t: number): number {
  let acc = 0;
  for (const f of eixo) {
    if (t <= f.start) return acc;
    if (!f.visivel) continue;
    if (t < f.end) return acc + (t - f.start);
    acc += f.end - f.start;
  }
  return acc;
}

/** Tempo visual → tempo real. Um clique exatamente na costura devolve o início
 *  da próxima faixa visível (o vídeo continua dali). */
export function paraReal(eixo: FaixaEixo[], tv: number): number {
  let resto = Math.max(0, tv);
  let ultimoFim = 0;
  for (const f of eixo) {
    if (!f.visivel) { ultimoFim = f.end; continue; }
    const larg = f.end - f.start;
    if (resto < larg) return f.start + resto;
    resto -= larg;
    ultimoFim = f.end;
  }
  return ultimoFim;
}

/** Posições (em tempo VISUAL) das costuras — onde desenhar o marcador de
 *  "houve um corte definitivo aqui". Costuras encostadas fundem numa só. */
export function costurasVisuais(eixo: FaixaEixo[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const f of eixo) {
    if (f.visivel) { acc += f.end - f.start; continue; }
    if (!out.length || Math.abs(out[out.length - 1] - acc) > 1e-6) out.push(acc);
  }
  return out;
}

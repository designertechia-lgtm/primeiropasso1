// ANCORA-DOC: contorno do teto de linhas do PostgREST.
//
// O PostgREST corta a resposta em `max_rows` (1000 no projeto) e NÃO devolve
// erro — o front recebe uma lista curta achando que é a lista inteira. Já mordeu
// duas vezes: a contagem "Nx" das séries de bloqueio saía menor que a real, e o
// calendário deixava de exibir eventos numa agenda grande.
//
// Uso: passe uma função que monta a query com .range(from, to).

export async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 1000;
  const maxRows = opts.maxRows ?? 50_000;
  const out: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    // Página incompleta significa fim do conjunto — não há próxima.
    if (!data || data.length < pageSize) break;
  }

  return out;
}

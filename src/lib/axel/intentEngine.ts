/**
 * Motor de Intenção do Axel
 * --------------------------
 * Substitui a antiga abordagem frágil de `texto.includes(palavra)` por um
 * matcher tolerante a acentos, pontuação e sinônimos, com pontuação por
 * relevância. Assim o Axel "entende a intenção" em vez de exigir a palavra exata.
 */

export interface MatchableIntent {
  id: string;
  /** Palavras/expressões que disparam a intenção (podem conter acentos). */
  keywords: string[];
  /** Peso da intenção. Maior = preferida em caso de empate. Padrão: 1. */
  priority?: number;
}

/**
 * Normaliza o texto: minúsculas, sem acentos, sem pontuação e espaços colapsados.
 * Ex.: "Configurar Teleconsulta?!" -> "configurar teleconsulta"
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9\s]/g, " ") // remove pontuação
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Distância de edição (Levenshtein) limitada — usada para tolerar erros de
 * digitação em palavras (ex.: "agnda" ~ "agenda").
 */
function isFuzzyMatch(word: string, keyword: string): boolean {
  if (keyword.length < 5) return false; // evita falsos positivos em palavras curtas
  if (Math.abs(word.length - keyword.length) > 1) return false;

  const m = word.length;
  const n = keyword.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        word[i - 1] === keyword[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n] <= 1; // até 1 caractere de diferença
}

/**
 * Pontua o quanto um texto combina com uma intenção.
 * - Frase exata (multi-palavra) presente: +3 (+ tamanho da frase)
 * - Palavra exata: +2
 * - Substring: +1
 * - Erro de digitação (fuzzy): +1
 */
export function scoreIntent(normalizedText: string, intent: MatchableIntent): number {
  const words = normalizedText.split(" ").filter(Boolean);
  const wordSet = new Set(words);
  let score = 0;

  for (const rawKw of intent.keywords) {
    const kw = normalize(rawKw);
    if (!kw) continue;

    if (kw.includes(" ")) {
      // Expressão com múltiplas palavras
      if (normalizedText.includes(kw)) {
        score += 3 + kw.split(" ").length;
      }
      continue;
    }

    if (wordSet.has(kw)) {
      score += 2;
    } else if (normalizedText.includes(kw)) {
      score += 1;
    } else if (words.some((w) => isFuzzyMatch(w, kw))) {
      score += 1;
    }
  }

  return score * (intent.priority ?? 1);
}

export interface IntentMatch<T> {
  intent: T;
  score: number;
}

/**
 * Resolve a melhor intenção para um texto. Retorna null se nenhuma atingir
 * o limiar mínimo (evita responder algo aleatório).
 */
export function resolveIntent<T extends MatchableIntent>(
  text: string,
  intents: T[],
  threshold = 2,
): IntentMatch<T> | null {
  const normalized = normalize(text);
  if (!normalized) return null;

  let best: T | null = null;
  let bestScore = 0;

  for (const intent of intents) {
    const s = scoreIntent(normalized, intent);
    if (s > bestScore) {
      bestScore = s;
      best = intent;
    }
  }

  return best && bestScore >= threshold ? { intent: best, score: bestScore } : null;
}

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Texto de mensagem de chat com a formatação leve que os agentes escrevem.
 *
 * Os modelos respondem em markdown por hábito ("**Qual é o tema?**"), mas os
 * balões renderizavam a string crua — o usuário lia os asteriscos na tela. Em
 * vez de puxar uma biblioteca de markdown (peso e superfície que um balão de
 * chat não precisa), este renderizador cobre só o que aparece de verdade numa
 * conversa e devolve elementos React: nada de HTML injetado, sem risco de o
 * texto do modelo virar marcação executável.
 *
 * Aceita as duas convenções que convivem aqui — a do markdown (`**negrito**`)
 * e a do WhatsApp (`*negrito*`, `_itálico_`, `~riscado~`) — porque o usuário
 * escreve como escreve no WhatsApp e o modelo responde em markdown.
 *
 * `variant="documento"` para textos longos fora de um balão (DNA da Marca):
 * num chat um `##` vira só uma linha em negrito, mas num texto de várias
 * seções o título precisa respirar e se destacar do parágrafo anterior.
 * A variante também desfaz o empate do asterisco solto: `*assim*` é negrito
 * no WhatsApp e itálico no markdown. Num balão quem escreve costuma ser
 * gente (WhatsApp vence); num documento o texto veio do modelo, que escreve
 * markdown — então lá `*assim*` sai em itálico, como o modelo pretendia.
 */

type Variante = "chat" | "documento";

/** Ordem importa: `**` tem de ser tentado antes de `*`. */
const INLINE_RE = /(\*\*.+?\*\*|__.+?__|\*[^\s*][^*]*?\*|_[^\s_][^_]*?_|~[^\s~][^~]*?~|`[^`]+?`)/g;

function inline(texto: string, chave: string, variante: Variante): ReactNode[] {
  const partes: ReactNode[] = [];
  let ultimo = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(texto)) !== null) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    const t = m[0];
    const k = `${chave}-${n++}`;
    if (t.startsWith("**") || t.startsWith("__")) {
      partes.push(<strong key={k} className="font-semibold">{t.slice(2, -2)}</strong>);
    } else if (t.startsWith("`")) {
      partes.push(
        <code key={k} className="rounded bg-foreground/10 px-1 py-px font-mono text-[0.92em]">{t.slice(1, -1)}</code>,
      );
    } else if (t.startsWith("*")) {
      partes.push(variante === "documento"
        ? <em key={k}>{t.slice(1, -1)}</em>
        : <strong key={k} className="font-semibold">{t.slice(1, -1)}</strong>);
    } else if (t.startsWith("_")) {
      partes.push(<em key={k}>{t.slice(1, -1)}</em>);
    } else {
      partes.push(<s key={k} className="opacity-70">{t.slice(1, -1)}</s>);
    }
    ultimo = m.index + t.length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

const RE_MARCADOR = /^\s*[-*•]\s+(.*)$/;
const RE_NUMERO = /^\s*(\d+)[.)]\s+(.*)$/;
/** Título de seção que o modelo às vezes usa: "## Passo 1" ou "**Passo 1**" sozinho na linha. */
const RE_TITULO = /^\s*#{1,6}\s+(.*)$/;

type Bloco =
  | { tipo: "p"; linhas: string[] }
  | { tipo: "titulo"; texto: string }
  | { tipo: "marcadores"; itens: string[] }
  | { tipo: "numerada"; itens: string[]; inicio: number };

function blocos(texto: string): Bloco[] {
  const saida: Bloco[] = [];
  for (const linha of (texto || "").split("\n")) {
    const vazia = linha.trim() === "";
    const ultimo = saida[saida.length - 1];

    if (vazia) {
      // Linha em branco fecha o bloco corrente — o espaçamento entre blocos é
      // dado pelo layout, não por parágrafos vazios empilhados.
      if (ultimo && ultimo.tipo === "p") saida.push({ tipo: "p", linhas: [] });
      continue;
    }

    const titulo = RE_TITULO.exec(linha);
    if (titulo) { saida.push({ tipo: "titulo", texto: titulo[1] }); continue; }

    const num = RE_NUMERO.exec(linha);
    if (num) {
      if (ultimo && ultimo.tipo === "numerada") ultimo.itens.push(num[2]);
      else saida.push({ tipo: "numerada", itens: [num[2]], inicio: Number(num[1]) || 1 });
      continue;
    }

    const marc = RE_MARCADOR.exec(linha);
    if (marc) {
      if (ultimo && ultimo.tipo === "marcadores") ultimo.itens.push(marc[1]);
      else saida.push({ tipo: "marcadores", itens: [marc[1]] });
      continue;
    }

    if (ultimo && ultimo.tipo === "p") ultimo.linhas.push(linha);
    else saida.push({ tipo: "p", linhas: [linha] });
  }
  return saida.filter((b) => b.tipo !== "p" || b.linhas.length > 0);
}

export function ChatTexto({
  texto,
  className,
  variant = "chat",
}: {
  texto: string;
  className?: string;
  variant?: Variante;
}) {
  const partes = blocos(texto);
  return (
    <div className={cn("space-y-2 break-words", className)}>
      {partes.map((b, i) => {
        if (b.tipo === "titulo") {
          return (
            <p
              key={i}
              className={
                variant === "documento"
                  ? "pt-2 text-[0.95rem] font-semibold tracking-tight text-foreground first:pt-0"
                  : "font-semibold"
              }
            >
              {inline(b.texto, `t${i}`, variant)}
            </p>
          );
        }
        if (b.tipo === "numerada") {
          return (
            <ol key={i} start={b.inicio} className="list-outside list-decimal space-y-1 pl-5 marker:text-current/60">
              {b.itens.map((it, j) => <li key={j} className="pl-0.5">{inline(it, `o${i}-${j}`, variant)}</li>)}
            </ol>
          );
        }
        if (b.tipo === "marcadores") {
          return (
            <ul key={i} className="list-outside list-disc space-y-1 pl-5 marker:text-current/60">
              {b.itens.map((it, j) => <li key={j} className="pl-0.5">{inline(it, `u${i}-${j}`, variant)}</li>)}
            </ul>
          );
        }
        // Quebras dentro do mesmo parágrafo são preservadas (endereço, lista
        // solta, verso) sem virar espaço entre blocos.
        return (
          <p key={i} className="whitespace-pre-line">
            {inline(b.linhas.join("\n"), `p${i}`, variant)}
          </p>
        );
      })}
    </div>
  );
}

export default ChatTexto;

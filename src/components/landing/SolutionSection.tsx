import { useState } from "react";
import { Lightbulb, Target, RefreshCw, Shield, Zap, CheckCircle2, ChevronDown } from "lucide-react";
import { splitHeadline } from "@/lib/landing/sections";

// 6 cards: preenche 2 linhas cheias na grade de 3 colunas (sem card órfão).
const DEFAULT_ITEMS = [
  { title: "Autoconhecimento", desc: "Entenda seus padrões de pensamento e como eles influenciam suas emoções e comportamentos." },
  { title: "Objetivos Claros", desc: "Juntos, definimos metas terapêuticas que fazem sentido para a sua vida real." },
  { title: "Novas Perspectivas", desc: "Aprenda a mudar a forma como você percebe os desafios, com técnicas práticas e baseadas em evidências." },
  { title: "Espaço Seguro", desc: "Atendimento 100% ético e sigiloso, onde você pode se expressar sem julgamentos." },
  { title: "Ferramentas Práticas", desc: "Estratégias e exercícios que você leva para o dia a dia, muito além das sessões." },
  { title: "Acolhimento Contínuo", desc: "Um acompanhamento próximo e humano em cada etapa do seu processo." },
];

const ICONS = [Lightbulb, Target, RefreshCw, Shield, Zap, CheckCircle2];

interface SolutionItem { title: string; desc: string; }

interface SolutionSectionProps {
  title?: string;
  subtitle?: string;
  // Tolera [{title,desc}] (editor) e ["texto"] (formato cru do gerador) — nunca quebra.
  items?: Array<SolutionItem | string>;
}

function itemTitle(s: SolutionItem | string): string {
  return typeof s === "string" ? s : (s?.title ?? "");
}
function itemDesc(s: SolutionItem | string): string {
  return typeof s === "string" ? "" : (s?.desc ?? "");
}

// Remove qualquer marcação de negrito (**) do contexto — o gerador às vezes embrulha frases ou o
// parágrafo todo em **, deixando tudo pesado. O contexto do card fica em peso normal, sempre.
const cleanText = (text: string) => (text ?? "").replace(/\*\*/g, "");

export default function SolutionSection({ title, subtitle, items }: SolutionSectionProps) {
  const displayTitle = title || "Como a terapia pode ajudar?";
  const displaySubtitle = subtitle || "A Terapia Cognitivo-Comportamental (TCC) é uma abordagem prática e cientificamente comprovada que ajuda você a transformar pensamentos e comportamentos.";
  const displayItems = (items && items.length > 0) ? items : DEFAULT_ITEMS;
  const [titleLead, titleAccent] = splitHeadline(displayTitle);

  // Cards expansíveis: começam fechados; cada um abre e fecha ao clicar (inclusive o primeiro).
  const [openItems, setOpenItems] = useState<number[]>([]);
  const toggle = (i: number) =>
    setOpenItems((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  // Itens COM descrição = etapas (cards accordion). Itens só-texto (string crua, sem descrição) são
  // introdução do método — distribuídos como parágrafo acima dos cards, não viram card.
  const stepItems = displayItems.filter((it) => itemDesc(it).trim() !== "");
  const introTexts = displayItems
    .filter((it) => itemDesc(it).trim() === "")
    .map((it) => cleanText(itemTitle(it)))
    .filter((t) => t !== "");
  // Fallback: se NENHUM item tem descrição, não dá pra separar — mostra todos como cards.
  const cardItems = stepItems.length > 0 ? stepItems : displayItems;
  const intros = stepItems.length > 0 ? introTexts : [];

  return (
    <>
      {/* Auras decorativas (o fundo base vem do <Section> via zebra) */}
      <div className="absolute -top-40 right-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] -z-10 opacity-60 animate-pulse" style={{ animationDuration: '12s' }} />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px] -z-10 opacity-60 animate-pulse" style={{ animationDuration: '9s' }} />

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="max-w-2xl mx-auto text-center mb-12 flex flex-col items-center gap-5">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground leading-[1.15] tracking-tight text-balance">
            {titleLead}{titleAccent ? <> <span className="text-primary">{titleAccent}</span></> : null}
          </h2>
          <span aria-hidden className="block h-1 w-16 rounded-full bg-gradient-to-r from-primary to-accent opacity-80" />
          <p className="max-w-xl text-muted-foreground text-base md:text-lg leading-relaxed text-pretty">
            {displaySubtitle}
          </p>
        </div>

        {/* Introdução do método (texto solto vindo dos dados) — distribuído acima dos cards. */}
        {intros.length > 0 && (
          <div className="max-w-2xl mx-auto -mt-2 mb-10 space-y-4 text-center">
            {intros.map((t, idx) => (
              <p key={idx} className="text-foreground/80 text-base md:text-lg leading-relaxed text-pretty">
                {t}
              </p>
            ))}
          </div>
        )}

        {/* Cards de etapa em grid (rows) — título + ícone sempre visíveis, contexto abre ao clicar.
            items-start: ao abrir, o card cresce pra baixo sem esticar/desalinhar os vizinhos. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto items-start">
          {cardItems.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            const title = cleanText(itemTitle(s));
            const desc = cleanText(itemDesc(s));
            // Só vira accordion quando há título curto E descrição. Item sem descrição (ex.: string
            // crua do gerador) é texto corrido — mostra em peso normal, sem chevron e sem expandir.
            const expandable = desc.trim() !== "" && title.trim() !== "";
            const isOpen = expandable && openItems.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={expandable ? () => toggle(i) : undefined}
                aria-expanded={expandable ? isOpen : undefined}
                className={`group w-full text-left bg-background/60 backdrop-blur-xl p-6 md:p-7 rounded-3xl border border-foreground/5 shadow-lg transition-all duration-300 overflow-hidden ${expandable ? "hover:shadow-primary/20 cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-center gap-4">
                  <span className="flex-none inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    <Icon className="h-6 w-6" strokeWidth={1.5} />
                  </span>
                  {expandable ? (
                    <h3 className="flex-1 font-heading text-lg md:text-xl font-bold text-foreground group-hover:text-primary transition-colors duration-300">
                      {title || desc}
                    </h3>
                  ) : (
                    <p className="flex-1 text-foreground/80 text-base leading-relaxed">
                      {title || desc}
                    </p>
                  )}
                  {expandable && (
                    <ChevronDown className={`flex-none h-5 w-5 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                  )}
                </div>

                {/* Contexto que expande/recolhe (animação por grid-rows) — só quando há descrição */}
                {expandable && (
                  <div className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"}`}>
                    <div className="overflow-hidden">
                      <p className="text-foreground/80 text-base leading-relaxed pl-16 pr-6 pb-1">
                        {desc}
                      </p>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

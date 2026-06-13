import { useState } from "react";
import { Lightbulb, Target, RefreshCw, Shield, Zap, CheckCircle2, ChevronDown } from "lucide-react";

const DEFAULT_ITEMS = [
  { title: "Autoconhecimento", desc: "Entenda seus padrões de pensamento e como eles influenciam suas emoções e comportamentos." },
  { title: "Objetivos Claros", desc: "Juntos, definimos metas terapêuticas que fazem sentido para a sua vida real." },
  { title: "Novas Perspectivas", desc: "Aprenda a mudar a forma como você percebe os desafios, com técnicas práticas e baseadas em evidências." },
  { title: "Espaço Seguro", desc: "Atendimento 100% ético e sigiloso, onde você pode se expressar sem julgamentos." },
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

// Palavras-chave positivas para destacar em negrito
const solutionKeywords = [
  "personalizada", "sob medida", "avançada", "inovadora", "simplificada", "suporte",
  "contínuo", "eficazes", "bem-estar", "autoconhecimento", "metas", "perspectivas",
  "práticas", "evidências", "seguro", "ético", "sigiloso", "tecnologias", "intuitivos",
  "otimizando", "perfeitamente"
];

const renderWithHighlights = (text: string) => {
  let parts = (text ?? "").split(/(\*\*.*?\*\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
    }

    let result: React.ReactNode[] = [part];
    solutionKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b(${keyword}s?)\\b`, 'gi');
      result = result.flatMap(r => {
        if (typeof r === 'string') {
          const split = r.split(regex);
          return split.map((s, j) =>
            s.toLowerCase().includes(keyword.toLowerCase())
              ? <strong key={`${i}-${j}-${keyword}`} className="font-semibold text-foreground/90">{s}</strong>
              : s
          );
        }
        return r;
      });
    });
    return <span key={i}>{result}</span>;
  });
};

export default function SolutionSection({ title, subtitle, items }: SolutionSectionProps) {
  const displayTitle = title || "Como a terapia pode ajudar?";
  const displaySubtitle = subtitle || "A Terapia Cognitivo-Comportamental (TCC) é uma abordagem prática e cientificamente comprovada que ajuda você a transformar pensamentos e comportamentos.";
  const displayItems = (items && items.length > 0) ? items : DEFAULT_ITEMS;

  // Cards expansíveis: o 1º já abre por padrão (não esconde todo o contexto de cara).
  const [openItems, setOpenItems] = useState<number[]>([0]);
  const toggle = (i: number) =>
    setOpenItems((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  return (
    <>
      {/* Auras decorativas (o fundo base vem do <Section> via zebra) */}
      <div className="absolute -top-40 right-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] -z-10 opacity-60 animate-pulse" style={{ animationDuration: '12s' }} />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px] -z-10 opacity-60 animate-pulse" style={{ animationDuration: '9s' }} />

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="max-w-2xl mx-auto text-center mb-10 space-y-6">
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-foreground leading-tight">
            {displayTitle}
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl leading-relaxed">
            {displaySubtitle}
          </p>
        </div>

        {/* Cards expansíveis — título + ícone sempre visíveis, contexto abre ao clicar */}
        <div className="grid sm:grid-cols-2 gap-5 max-w-4xl mx-auto items-start">
          {displayItems.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            const isOpen = openItems.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="group text-left bg-background/60 backdrop-blur-xl p-6 md:p-7 rounded-3xl border border-foreground/5 shadow-lg hover:shadow-primary/20 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
              >
                <div className="flex items-center gap-4">
                  <span className="flex-none inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    <Icon className="h-6 w-6" strokeWidth={1.5} />
                  </span>
                  <h3 className="flex-1 font-heading text-lg md:text-xl font-bold text-foreground group-hover:text-primary transition-colors duration-300">
                    {itemTitle(s)}
                  </h3>
                  <ChevronDown className={`flex-none h-5 w-5 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </div>

                {/* Contexto que expande/recolhe (animação por grid-rows) */}
                <div className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="overflow-hidden">
                    <p className="text-foreground/80 text-base leading-relaxed pl-16">
                      {renderWithHighlights(itemDesc(s))}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

import { Lightbulb, Target, RefreshCw, Shield, Zap, CheckCircle2 } from "lucide-react";

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

        {/* Stepper vertical numerado — o método em etapas, com o conteúdo sempre visível */}
        <ol className="relative max-w-3xl mx-auto">
          {displayItems.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            const isLast = i === displayItems.length - 1;
            return (
              <li key={i} className="group relative flex gap-5 md:gap-6 pb-10 last:pb-0">
                {/* Linha conectora da timeline (some no último passo) */}
                {!isLast && (
                  <span className="absolute left-6 md:left-7 top-12 md:top-14 bottom-0 w-px bg-gradient-to-b from-primary/40 to-primary/5" aria-hidden />
                )}

                {/* Marcador numerado */}
                <div className="relative z-10 flex-none flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground font-heading text-xl md:text-2xl font-bold shadow-lg shadow-primary/20 transition-transform duration-300 group-hover:scale-105">
                  {i + 1}
                </div>

                {/* Conteúdo da etapa — sempre visível */}
                <div className="flex-1 pt-1.5">
                  <h3 className="font-heading text-xl md:text-2xl font-bold text-foreground flex items-center gap-2 group-hover:text-primary transition-colors duration-300">
                    <Icon className="h-5 w-5 text-primary flex-none" strokeWidth={1.5} />
                    {itemTitle(s)}
                  </h3>
                  <p className="mt-2 text-foreground/80 text-base md:text-lg leading-relaxed">
                    {renderWithHighlights(itemDesc(s))}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

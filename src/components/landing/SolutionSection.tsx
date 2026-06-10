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
    <section className="py-20 md:py-32 relative overflow-hidden bg-background">
      {/* Background Dinâmico - Auras Suaves */}
      <div className="absolute inset-0 bg-muted/30" />
      <div className="absolute -top-40 right-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] -z-10 opacity-60 animate-pulse" style={{ animationDuration: '12s' }} />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px] -z-10 opacity-60 animate-pulse" style={{ animationDuration: '9s' }} />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center mb-16 space-y-6">
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-foreground leading-tight">
            {displayTitle}
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl leading-relaxed">
            {displaySubtitle}
          </p>
        </div>

        {/* Grid de Soluções com Glassmorphism */}
        <div className="grid sm:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {displayItems.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div 
                key={i} 
                className="group relative bg-background/60 backdrop-blur-xl p-8 lg:p-10 rounded-[2rem] border border-foreground/5 shadow-lg hover:-translate-y-2 hover:shadow-primary/20 transition-all duration-500 overflow-hidden flex flex-col items-center text-center"
              >
                {/* Linha de brilho superior no hover */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary/50 to-accent/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Glow sutil atrás do ícone */}
                <div className="absolute top-10 w-24 h-24 bg-primary/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground text-primary transition-all duration-500 z-10">
                  <Icon className="h-8 w-8" strokeWidth={1.5} />
                </div>
                
                <h3 className="font-heading text-2xl font-bold text-foreground mb-4 z-10 group-hover:text-primary transition-colors duration-300">
                  {itemTitle(s)}
                </h3>

                <p className="text-foreground/80 text-base md:text-lg leading-relaxed z-10">
                  {renderWithHighlights(itemDesc(s))}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

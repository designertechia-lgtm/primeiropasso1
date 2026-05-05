import { Lightbulb, Target, RefreshCw, Shield } from "lucide-react";

const DEFAULT_ITEMS = [
  { title: "Autoconhecimento", desc: "Entenda seus padrões de pensamento e como eles influenciam suas emoções e comportamentos." },
  { title: "Objetivos Claros", desc: "Juntos, definimos metas terapêuticas que fazem sentido para a sua vida real." },
  { title: "Novas Perspectivas", desc: "Aprenda a mudar a forma como você percebe os desafios, com técnicas práticas e baseadas em evidências." },
  { title: "Espaço Seguro", desc: "Atendimento 100% ético e sigiloso, onde você pode se expressar sem julgamentos." },
];

const ICONS = [Lightbulb, Target, RefreshCw, Shield];

interface SolutionItem { title: string; desc: string; }

interface SolutionSectionProps {
  title?: string;
  subtitle?: string;
  items?: SolutionItem[];
}

export default function SolutionSection({ title, subtitle, items }: SolutionSectionProps) {
  const displayTitle = title || "Como a terapia pode ajudar?";
  const displaySubtitle = subtitle || "A Terapia Cognitivo-Comportamental (TCC) é uma abordagem prática e cientificamente comprovada que ajuda você a transformar pensamentos e comportamentos.";
  const displayItems = (items && items.length > 0) ? items : DEFAULT_ITEMS;

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
            {displayTitle}
          </h2>
          <p className="text-muted-foreground text-lg">
            {displaySubtitle}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {displayItems.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div key={i} className="text-center p-6 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
                  <Icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-serif text-xl font-semibold text-foreground mb-2">{s.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

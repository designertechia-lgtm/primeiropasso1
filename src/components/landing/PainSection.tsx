import { CircleAlert, Brain, Heart, Moon, Users } from "lucide-react";

const DEFAULT_ITEMS = [
  { text: "Pensamentos acelerados que não param" },
  { text: "Dificuldade para dormir ou descansar de verdade" },
  { text: "Ansiedade que aperta o peito sem motivo aparente" },
  { text: "Relacionamentos que desgastam ao invés de nutrir" },
  { text: "Sensação de que algo precisa mudar, mas não sabe por onde começar" },
];

const ICONS = [Brain, Moon, Heart, Users, CircleAlert];

interface PainItem { text: string; }

interface PainSectionProps {
  title?: string;
  subtitle?: string;
  items?: PainItem[];
}

export default function PainSection({ title, subtitle, items }: PainSectionProps) {
  const displayTitle = title || "Você sente que seus pensamentos estão no controle?";
  const displaySubtitle = subtitle || "Reconhecer o que você sente é o primeiro passo. Se você se identifica com algum desses sinais, saiba que não precisa enfrentar isso sozinho(a).";
  const displayItems = (items && items.length > 0) ? items : DEFAULT_ITEMS;

  return (
    <section className="py-16 md:py-24 bg-muted/50">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
            {displayTitle}
          </h2>
          <p className="text-muted-foreground text-lg">
            {displaySubtitle}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {displayItems.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div key={i} className="flex items-start gap-3 bg-card p-5 rounded-xl border border-border shadow-sm">
                <Icon className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-foreground text-sm leading-relaxed">{s.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

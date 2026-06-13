import { CircleAlert, Brain, Heart, Moon, Users, AlertTriangle } from "lucide-react";

const DEFAULT_ITEMS = [
  { text: "Pensamentos acelerados que não param" },
  { text: "Dificuldade para dormir ou descansar de verdade" },
  { text: "Ansiedade que aperta o peito sem motivo aparente" },
  { text: "Relacionamentos que desgastam ao invés de nutrir" },
  { text: "Sensação de que algo precisa mudar, mas não sabe por onde começar" },
];

const ICONS = [Brain, Moon, Heart, Users, CircleAlert, AlertTriangle];

interface PainItem { text: string; }

interface PainSectionProps {
  title?: string;
  subtitle?: string;
  // Tolera tanto [{text}] (formato do editor) quanto ["texto"] (formato cru do gerador).
  items?: Array<PainItem | string>;
}

// Extrai o texto de um item seja ele objeto {text} ou string crua — nunca quebra.
function itemText(s: PainItem | string): string {
  return typeof s === "string" ? s : (s?.text ?? "");
}

// Palavras-chave de dor para destacar em negrito
const painKeywords = [
  "ansiedade", "frustração", "isolado", "exausto", "emocionalmente", "desgastam",
  "acelerados", "dificuldade", "aperta", "repetitivas", "bugs", "prazos", "medo",
  "insegurança", "esgotamento", "burnout", "estresse", "dor"
];

const renderWithHighlights = (text: string) => {
  let parts = (text ?? "").split(/(\*\*.*?\*\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
    }

    let result: React.ReactNode[] = [part];
    painKeywords.forEach(keyword => {
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

export default function PainSection({ title, subtitle, items }: PainSectionProps) {
  const displayTitle = title || "Você sente que seus pensamentos estão no controle?";
  const displaySubtitle = subtitle || "Reconhecer o que você sente é o primeiro passo. Se você se identifica com algum desses sinais, saiba que não precisa enfrentar isso sozinho(a).";
  const displayItems = (items && items.length > 0) ? items : DEFAULT_ITEMS;

  return (
    <>
      {/* Auras decorativas (o fundo base vem do <Section> via zebra) */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] -z-10 opacity-70 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[100px] -z-10 opacity-70 animate-pulse" style={{ animationDuration: '10s' }} />

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="max-w-2xl mx-auto text-center mb-10 space-y-6">
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-foreground leading-tight">
            {displayTitle}
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl leading-relaxed">
            {displaySubtitle}
          </p>
        </div>

        {/* Stepper vertical numerado — sinais listados, sempre visíveis */}
        <ol className="relative max-w-3xl mx-auto">
          {displayItems.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            const isLast = i === displayItems.length - 1;
            return (
              <li key={i} className="group relative flex gap-5 md:gap-6 pb-8 last:pb-0">
                {/* Linha conectora da timeline (some no último) */}
                {!isLast && (
                  <span className="absolute left-6 md:left-7 top-12 md:top-14 bottom-0 w-px bg-gradient-to-b from-primary/40 to-primary/5" aria-hidden />
                )}

                {/* Marcador numerado */}
                <div className="relative z-10 flex-none flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground font-heading text-xl md:text-2xl font-bold shadow-lg shadow-primary/20 transition-transform duration-300 group-hover:scale-105">
                  {i + 1}
                </div>

                {/* Sinal — sempre visível */}
                <div className="flex-1 flex items-start gap-3 pt-2.5">
                  <Icon className="h-5 w-5 text-primary flex-none mt-0.5" strokeWidth={1.5} />
                  <p className="text-foreground/80 text-base md:text-lg leading-relaxed">
                    {renderWithHighlights(itemText(s))}
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

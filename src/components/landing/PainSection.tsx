import { CircleAlert, Brain, Heart, Moon, Users, AlertTriangle } from "lucide-react";
import { splitHeadline } from "@/lib/landing/sections";

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
  const [titleLead, titleAccent] = splitHeadline(displayTitle);

  return (
    <>
      {/* Auras decorativas (o fundo base vem do <Section> via zebra) */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] -z-10 opacity-70 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[100px] -z-10 opacity-70 animate-pulse" style={{ animationDuration: '10s' }} />

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

        {/* Layout em cards (mosaico, flex-wrap centralizado) */}
        <div className="flex flex-wrap justify-center gap-6 max-w-5xl mx-auto">
          {displayItems.map((s, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div
                key={i}
                className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] group"
              >
                <div className="h-full flex flex-col gap-4 bg-background/60 backdrop-blur-xl p-8 rounded-3xl border border-foreground/5 shadow-lg hover:-translate-y-2 hover:shadow-primary/20 transition-all duration-500 relative overflow-hidden">
                  {/* Detalhe de gradiente sutil no topo do card */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/40 to-accent/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  {/* Ícone em destaque */}
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-500">
                    <Icon className="h-7 w-7" strokeWidth={1.5} />
                  </div>

                  <p className="text-foreground/80 text-base md:text-lg leading-relaxed mt-2">
                    {renderWithHighlights(itemText(s))}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

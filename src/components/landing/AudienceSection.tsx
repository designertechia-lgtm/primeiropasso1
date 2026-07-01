import { CheckCircle2, MinusCircle } from "lucide-react";
import { splitHeadline } from "@/lib/landing/sections";

interface AudienceItem { text: string; }

interface AudienceSectionProps {
  title?: string;
  // Tolera [{text}] (formato do editor) e ["texto"] (formato cru do gerador) — nunca quebra.
  forItems?: Array<AudienceItem | string>;
  notForItems?: Array<AudienceItem | string>;
}

// Extrai o texto de um item seja ele objeto {text} ou string crua.
function itemText(x: AudienceItem | string): string {
  return typeof x === "string" ? x : (x?.text ?? "");
}

const DEFAULT_FOR = [
  "Está pronto(a) para se comprometer com o próprio processo de mudança",
  "Sente que chegou a hora de cuidar da saúde emocional com seriedade",
  "Quer entender a raiz do que sente, e não apenas aliviar os sintomas",
  "Busca um espaço seguro, ético e sem julgamentos para se abrir",
];

const DEFAULT_NOT_FOR = [
  "Procura uma solução mágica e imediata, sem envolvimento no processo",
  "Espera que a mudança aconteça sem nenhum esforço da sua parte",
  "Não está aberto(a) a olhar para dentro e rever alguns padrões",
];

export default function AudienceSection({ title, forItems, notForItems }: AudienceSectionProps) {
  const displayTitle = title || "Este acompanhamento é para você?";
  const displayFor = (forItems && forItems.length > 0) ? forItems : DEFAULT_FOR;
  const displayNotFor = (notForItems && notForItems.length > 0) ? notForItems : DEFAULT_NOT_FOR;
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
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Coluna "É para você se…" */}
          <div className="flex flex-col gap-4 bg-background/60 backdrop-blur-xl rounded-3xl border border-foreground/5 p-6 md:p-8 shadow-lg">
            <h3 className="font-heading text-xl md:text-2xl font-bold text-foreground">
              É para você se…
            </h3>
            <ul className="flex flex-col gap-4 mt-2">
              {displayFor.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 flex-none text-primary mt-0.5" strokeWidth={1.75} />
                  <span className="text-foreground/80 text-base leading-relaxed text-pretty">
                    {itemText(item)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Coluna "Talvez não seja o momento se…" (opacidade um pouco menor) */}
          <div className="flex flex-col gap-4 bg-background/60 backdrop-blur-xl rounded-3xl border border-foreground/5 p-6 md:p-8 shadow-lg opacity-90">
            <h3 className="font-heading text-xl md:text-2xl font-bold text-muted-foreground">
              Talvez não seja o momento se…
            </h3>
            <ul className="flex flex-col gap-4 mt-2">
              {displayNotFor.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <MinusCircle className="h-6 w-6 flex-none text-muted-foreground mt-0.5" strokeWidth={1.75} />
                  <span className="text-muted-foreground text-base leading-relaxed text-pretty">
                    {itemText(item)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

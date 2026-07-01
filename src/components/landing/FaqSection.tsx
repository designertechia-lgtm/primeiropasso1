import { splitHeadline } from "@/lib/landing/sections";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

interface FaqItem { q: string; a: string; }

interface FaqSectionProps {
  title?: string;
  items?: Array<FaqItem>;
}

// O primeiro item é OBRIGATÓRIO por responsabilidade ética: deixa claro que o acompanhamento
// complementa, e não substitui, tratamento médico/psicológico.
const DEFAULT_ITEMS: FaqItem[] = [
  {
    q: "Isto substitui acompanhamento médico ou psicológico?",
    a: "Não. Este acompanhamento complementa o cuidado com a sua saúde e não substitui tratamento médico, psiquiátrico ou psicológico quando ele for necessário. Se você já faz algum tratamento, ele deve continuar. Em caso de urgência ou risco à sua vida, procure imediatamente um serviço de emergência (como o SAMU 192 ou o pronto-socorro mais próximo) ou o CVV (188).",
  },
  {
    q: "Quanto tempo leva o processo?",
    a: "Cada pessoa tem o seu ritmo — não existe um prazo fixo. Algumas questões trazem alívio já nas primeiras semanas, enquanto mudanças mais profundas amadurecem ao longo do acompanhamento. O importante é que cada etapa faça sentido para a sua vida, e não correr contra o relógio.",
  },
  {
    q: "O atendimento é online ou presencial?",
    a: "O acompanhamento pode ser feito de forma online, presencial ou combinando os dois, conforme a sua necessidade e disponibilidade. O formato online mantém o mesmo cuidado, sigilo e acolhimento do presencial, com a comodidade de você participar de onde estiver.",
  },
  {
    q: "Já tentei de tudo e nada funcionou. Será que funciona pra mim?",
    a: "É muito comum sentir isso — e não significa que você é um \"caso perdido\". Muitas vezes, o que faltou não foi esforço, mas olhar para a raiz certa do que você sente. Aqui o processo parte de escutar a sua história com atenção e construir, junto com você, um caminho que respeite o seu momento.",
  },
];

export default function FaqSection({ title, items }: FaqSectionProps) {
  const displayTitle = title || "Perguntas frequentes";
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
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="flex flex-col gap-4">
            {displayItems.map((item, i) => (
              <AccordionItem
                key={i}
                value={"item-" + i}
                className="bg-background/60 backdrop-blur-xl rounded-3xl border border-foreground/5 shadow-lg px-6 md:px-8 border-b-0"
              >
                <AccordionTrigger className="font-heading text-left text-base md:text-lg font-bold text-foreground hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed text-base text-pretty">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </>
  );
}

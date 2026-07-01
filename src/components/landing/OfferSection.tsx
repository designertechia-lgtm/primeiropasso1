import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { splitHeadline } from "@/lib/landing/sections";
import { buildWhatsAppLink, buildLandingCtaMessage } from "@/lib/utils";

// Seção "Oferta / como funciona" — a seção decisiva de conversão (modelo Daiane).
// UMA oferta principal + passos de "como funciona" + CTA primária destacada (WhatsApp).
interface OfferStep { title: string; desc: string; }

interface OfferSectionProps {
  title?: string;
  description?: string;
  // Tolera [{title,desc}] (editor) e ["texto"] (formato cru do gerador).
  steps?: Array<OfferStep | string>;
  priceNote?: string;
  whatsapp?: string;
  ctaMessage?: string;
  campaignRef?: string;
  onWhatsAppClick?: () => void;
}

const DEFAULT_STEPS: OfferStep[] = [
  { title: "1. Primeiro contato", desc: "Você envia uma mensagem e conversamos sobre o que está buscando." },
  { title: "2. Primeira conversa", desc: "Um encontro para entender a sua história, sem compromisso de continuar." },
  { title: "3. Acompanhamento", desc: "Construímos juntos um caminho que respeita o seu momento e a sua rotina." },
];

const stepTitle = (s: OfferStep | string) => (typeof s === "string" ? s : (s?.title ?? ""));
const stepDesc = (s: OfferStep | string) => (typeof s === "string" ? "" : (s?.desc ?? ""));
const clean = (t: string) => (t ?? "").replace(/\*\*/g, "");

export default function OfferSection({
  title, description, steps, priceNote, whatsapp, ctaMessage, campaignRef, onWhatsAppClick,
}: OfferSectionProps) {
  const displayTitle = title || "Como podemos caminhar juntos";
  const displayDescription = description || "Dê o primeiro passo no seu tempo. A primeira conversa é o espaço para você entender como o acompanhamento pode ajudar — sem pressa e sem compromisso.";
  const displaySteps = (steps && steps.length > 0) ? steps : DEFAULT_STEPS;
  const [titleLead, titleAccent] = splitHeadline(displayTitle);

  const whatsappLink = whatsapp
    ? buildWhatsAppLink(whatsapp, buildLandingCtaMessage(ctaMessage, campaignRef))
    : null;

  return (
    <>
      {/* Auras decorativas (o fundo base vem do <Section> via zebra) */}
      <div className="absolute -top-32 left-1/3 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] -z-10 opacity-60 animate-pulse" style={{ animationDuration: '11s' }} />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[100px] -z-10 opacity-60 animate-pulse" style={{ animationDuration: '9s' }} />

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="max-w-2xl mx-auto text-center mb-12 flex flex-col items-center gap-5">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground leading-[1.15] tracking-tight text-balance">
            {titleLead}{titleAccent ? <> <span className="text-primary">{titleAccent}</span></> : null}
          </h2>
          <span aria-hidden className="block h-1 w-16 rounded-full bg-gradient-to-r from-primary to-accent opacity-80" />
          <p className="max-w-xl text-muted-foreground text-base md:text-lg leading-relaxed text-pretty">
            {clean(displayDescription)}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {displaySteps.map((s, i) => {
            const t = clean(stepTitle(s));
            const d = clean(stepDesc(s));
            return (
              <div key={i} className="flex flex-col gap-3 bg-background/60 backdrop-blur-xl p-6 md:p-7 rounded-3xl border border-foreground/5 shadow-lg">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-primary/10 text-primary font-heading font-bold">
                  {i + 1}
                </span>
                <h3 className="font-heading text-lg font-bold text-foreground">{t || d}</h3>
                {t && d && <p className="text-foreground/80 text-sm leading-relaxed">{d}</p>}
              </div>
            );
          })}
        </div>

        {priceNote && (
          <p className="mt-8 text-center text-sm text-muted-foreground max-w-xl mx-auto">{clean(priceNote)}</p>
        )}

        {whatsappLink && (
          <div className="mt-10 flex justify-center">
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" onClick={onWhatsAppClick}>
              <Button size="lg" className="text-base gap-2 shadow-lg hover:shadow-xl transition-shadow duration-300">
                Quero dar o primeiro passo <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </div>
        )}
      </div>
    </>
  );
}

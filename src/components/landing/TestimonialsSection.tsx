import { useState } from "react";
import { Star, Quote, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { splitHeadline } from "@/lib/landing/sections";
import TestimonialDialog from "@/components/landing/TestimonialDialog";

// Seção "Prova social" (modelo Daiane). Mostra os depoimentos APROVADOS e um botão
// para o lead deixar o seu (entra pendente, o profissional aprova em /admin/landing).
export interface Testimonial {
  id: string;
  author_name: string;
  author_context?: string | null;
  text: string;
  rating?: number | null;
}

interface TestimonialsSectionProps {
  title?: string;
  subtitle?: string;
  testimonials?: Testimonial[];
  professionalId: string;
  professionalName?: string;
  // No preview do editor não queremos abrir o dialog real; desativa o clique.
  interactive?: boolean;
}

function Stars({ rating }: { rating?: number | null }) {
  if (!rating) return null;
  return (
    <div className="flex gap-0.5" aria-label={`${rating} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-4 w-4 ${n <= rating ? "text-primary fill-primary" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

export default function TestimonialsSection({
  title, subtitle, testimonials = [], professionalId, professionalName, interactive = true,
}: TestimonialsSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const displayTitle = title || "Quem já deu o primeiro passo";
  const displaySubtitle = subtitle || "Histórias de pessoas que decidiram cuidar de si.";
  const [titleLead, titleAccent] = splitHeadline(displayTitle);
  const hasItems = testimonials.length > 0;

  return (
    <>
      {/* Auras decorativas (o fundo base vem do <Section> via zebra) */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] -z-10 opacity-70 animate-pulse" style={{ animationDuration: '9s' }} />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[100px] -z-10 opacity-70 animate-pulse" style={{ animationDuration: '11s' }} />

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="max-w-2xl mx-auto text-center mb-12 flex flex-col items-center gap-5">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground leading-[1.15] tracking-tight text-balance">
            {titleLead}{titleAccent ? <> <span className="text-primary">{titleAccent}</span></> : null}
          </h2>
          <span aria-hidden className="block h-1 w-16 rounded-full bg-gradient-to-r from-primary to-accent opacity-80" />
          {displaySubtitle && (
            <p className="max-w-xl text-muted-foreground text-base md:text-lg leading-relaxed text-pretty">
              {displaySubtitle}
            </p>
          )}
        </div>

        {hasItems ? (
          <div className="flex flex-wrap justify-center gap-6 max-w-5xl mx-auto">
            {testimonials.map((t) => (
              <div
                key={t.id}
                className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] flex flex-col gap-4 bg-background/60 backdrop-blur-xl p-7 rounded-3xl border border-foreground/5 shadow-lg"
              >
                <Quote className="h-7 w-7 text-primary/40" />
                <Stars rating={t.rating} />
                <p className="text-foreground/80 text-base leading-relaxed text-pretty flex-1">{t.text}</p>
                <div className="pt-2 border-t border-foreground/5">
                  <p className="font-heading font-semibold text-foreground">{t.author_name}</p>
                  {t.author_context && <p className="text-xs text-muted-foreground">{t.author_context}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground max-w-md mx-auto">
            Seja o primeiro a compartilhar sua experiência.
          </p>
        )}

        <div className="mt-10 flex justify-center">
          <Button
            variant="outline"
            size="lg"
            className="gap-2"
            onClick={() => interactive && setDialogOpen(true)}
          >
            <MessageSquarePlus className="h-5 w-5" />
            Deixar meu depoimento
          </Button>
        </div>
      </div>

      {interactive && (
        <TestimonialDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          professionalId={professionalId}
          professionalName={professionalName}
        />
      )}
    </>
  );
}

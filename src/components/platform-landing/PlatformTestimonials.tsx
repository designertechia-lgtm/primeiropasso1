import { Quote } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "Triplicou meu engajamento sem aumentar uma hora de gravação. Os roteiros são tecnicamente sólidos.",
    name: "Dra. Carolina Mendes",
    crp: "CRP 06/123456 · São Paulo, SP",
    initials: "CM",
  },
  {
    quote:
      "Finalmente um pipeline que entende o CFP. Não preciso revisar cada legenda atrás de violação de resolução.",
    name: "Dr. Ricardo Almeida",
    crp: "CRP 04/098765 · Belo Horizonte, MG",
    initials: "RA",
  },
  {
    quote:
      "Pago menos do que pagaria a um social media — e o conteúdo é de alguém que entende TCC de verdade.",
    name: "Dra. Patrícia Souza",
    crp: "CRP 07/234567 · Porto Alegre, RS",
    initials: "PS",
  },
];

export default function PlatformTestimonials() {
  return (
    <section
      id="depoimentos"
      className="py-20 md:py-28 bg-gradient-to-b from-muted/40 to-background"
    >
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-2xl mx-auto text-center mb-14 md:mb-16">
          <p className="text-sm uppercase tracking-[0.18em] text-accent font-semibold mb-3">
            Quem já usa
          </p>
          <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight tracking-tight">
            Terapeutas que recuperaram suas{" "}
            <span className="text-primary">tardes de quarta-feira.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map(({ quote, name, crp, initials }) => (
            <figure
              key={name}
              className="bg-card border border-border rounded-2xl p-7 flex flex-col gap-5 hover:shadow-md transition-shadow"
            >
              <Quote
                className="h-7 w-7 text-primary/60 shrink-0"
                aria-hidden
              />
              <blockquote className="text-base md:text-lg text-foreground/85 leading-relaxed flex-1">
                "{quote}"
              </blockquote>
              <figcaption className="flex items-center gap-3 pt-2 border-t border-border">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center font-heading font-semibold text-primary text-sm">
                  {initials}
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">
                    {name}
                  </p>
                  <p className="text-xs text-foreground/60">{crp}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

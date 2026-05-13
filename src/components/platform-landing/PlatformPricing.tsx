import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const TIERS = [
  {
    name: "Starter",
    price: "R$ 97",
    period: "/mês",
    description: "Landing, agenda e atendimento via agente WhatsApp.",
    features: [
      "Landing per-tenant + agenda",
      "Agente WhatsApp · 200 msgs/mês",
      "Artigos no blog (ilimitado)",
      "Templates da sua especialidade",
      "Biblioteca de ideias (50/mês)",
      "Pagamento via Pix",
    ],
    cta: "Começar Starter",
    featured: false,
  },
  {
    name: "Pro",
    price: "R$ 197",
    period: "/mês",
    description: "Pipeline completo de vídeo, multi-formato e CRM.",
    features: [
      "Tudo do Starter +",
      "10 créditos de vídeo premium",
      "Multi-formato: vídeo + carrossel + post + blog",
      "Avatar real (HeyGen) + voz clonada",
      "CRM Kanban completo",
      "Publica em YouTube, TikTok, Instagram, LinkedIn",
      "Biblioteca completa de ideias",
    ],
    cta: "Começar Pro",
    featured: true,
    badge: "Mais escolhido",
  },
  {
    name: "Scale",
    price: "R$ 397",
    period: "/mês",
    description: "Para quem quer escala, IAs premium e inteligência completa.",
    features: [
      "Tudo do Pro +",
      "30 créditos de vídeo premium",
      "Multi-IA: Kling, Veo, Sora, Pika",
      "Avatares fotorrealistas extras",
      "Analytics + sugestão de tópicos",
      "Resposta automática DMs/comentários",
      "Calendário editorial inteligente",
      "Suporte prioritário",
    ],
    cta: "Começar Scale",
    featured: false,
  },
];

const CREDIT_PACKS = [
  { credits: 10, price: "R$ 29" },
  { credits: 30, price: "R$ 79" },
  { credits: 70, price: "R$ 149" },
];

export default function PlatformPricing() {
  return (
    <section id="precos" className="py-20 md:py-28 bg-background">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-2xl mx-auto text-center mb-14 md:mb-16">
          <p className="text-sm uppercase tracking-[0.18em] text-accent font-semibold mb-3">
            Preços
          </p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight tracking-tight">
            Plano mensal + créditos.{" "}
            <span className="text-primary">Cancele quando quiser.</span>
          </h2>
          <p className="text-base text-foreground/70 mt-4">
            Sem fidelidade. Sem taxa de adesão. Pagamento via Pix ou cartão.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl p-7 md:p-8 flex flex-col gap-6 transition-all ${
                tier.featured
                  ? "bg-card border-2 border-primary shadow-xl scale-[1.02] md:scale-[1.04]"
                  : "bg-card border border-border hover:shadow-md"
              }`}
            >
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-semibold shadow whitespace-nowrap">
                  {tier.badge}
                </span>
              )}
              <div>
                <h3 className="font-serif text-2xl font-semibold text-foreground mb-2">
                  {tier.name}
                </h3>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {tier.description}
                </p>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="font-serif text-5xl font-bold text-foreground tracking-tight">
                  {tier.price}
                </span>
                <span className="text-foreground/60 text-base">{tier.period}</span>
              </div>

              <ul className="flex flex-col gap-3 flex-1">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-3 text-sm text-foreground/85"
                  >
                    <Check
                      className={`h-5 w-5 shrink-0 mt-0.5 ${
                        tier.featured ? "text-accent" : "text-primary"
                      }`}
                      aria-hidden
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link to="/cadastro" className="w-full">
                <Button
                  size="lg"
                  className={`w-full ${
                    tier.featured
                      ? "bg-accent hover:bg-accent/90 text-accent-foreground"
                      : ""
                  }`}
                  variant={tier.featured ? "default" : "outline"}
                >
                  {tier.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <div className="bg-muted/40 border border-border rounded-2xl p-7 md:p-9 max-w-3xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
            <div className="flex-1 text-center md:text-left">
              <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                Precisa de mais? Compre créditos avulsos.
              </h3>
              <p className="text-sm text-foreground/70">
                Sem mudar de plano. Pacotes via Pix, validade de 12 meses.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {CREDIT_PACKS.map(({ credits, price }) => (
                <div
                  key={credits}
                  className="bg-card border border-border rounded-xl px-4 py-3 text-center min-w-[6rem]"
                >
                  <div className="font-serif text-lg font-semibold text-foreground">
                    {credits} créditos
                  </div>
                  <div className="text-sm text-accent font-medium">{price}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

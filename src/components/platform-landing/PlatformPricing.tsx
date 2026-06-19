import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import {
  useSubscriptionPlans,
  SUBSCRIPTION_PLANS_DEFAULTS,
  type SubscriptionPlan,
} from "@/hooks/useSubscriptionPlans";
import { useOwnerCreditPacks, type CreditPack } from "@/hooks/useOwnerStats";

const CREDIT_PACKS_FALLBACK: Pick<CreditPack, "id" | "credits" | "price_brl" | "bonus_credits">[] = [
  { id: "fallback_10", credits: 10, price_brl: 29, bonus_credits: 0 },
  { id: "fallback_30", credits: 30, price_brl: 79, bonus_credits: 0 },
  { id: "fallback_70", credits: 70, price_brl: 149, bonus_credits: 0 },
];

const brl = (v: number) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function PlatformPricing() {
  const { data: plansData } = useSubscriptionPlans(false);
  const { data: packsData } = useOwnerCreditPacks();

  const tiers: SubscriptionPlan[] =
    plansData && plansData.length > 0 ? plansData : SUBSCRIPTION_PLANS_DEFAULTS;

  const activePacks = (packsData ?? []).filter((p) => p.active);
  const packs =
    activePacks.length > 0
      ? activePacks.map((p) => ({
          id: p.id,
          credits: (p.credits ?? 0) + (p.bonus_credits ?? 0),
          price_brl: Number(p.price_brl),
        }))
      : CREDIT_PACKS_FALLBACK.map((p) => ({
          id: p.id,
          credits: p.credits,
          price_brl: Number(p.price_brl),
        }));

  return (
    <section id="precos" className="py-20 md:py-28 bg-background">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-2xl mx-auto text-center mb-14 md:mb-16">
          <p className="text-sm uppercase tracking-[0.18em] text-accent font-semibold mb-3">
            Preços
          </p>
          <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight tracking-tight">
            Plano mensal + créditos.{" "}
            <span className="text-primary">Cancele quando quiser.</span>
          </h2>
          <p className="text-base text-foreground/70 mt-4">
            Sem fidelidade. Sem taxa de adesão. Pagamento via Pix ou cartão.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {tiers.map((tier) => (
            <div
              key={tier.id}
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
                <h3 className="font-heading text-2xl font-semibold text-foreground mb-2">
                  {tier.name}
                </h3>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {tier.description}
                </p>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="font-heading text-5xl font-bold text-foreground tracking-tight">
                  {brl(tier.monthly_price_brl)}
                </span>
                <span className="text-foreground/60 text-base">/mês</span>
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
                  {tier.cta_label}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <div className="bg-muted/40 border border-border rounded-2xl p-7 md:p-9 max-w-3xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
            <div className="flex-1 text-center md:text-left">
              <h3 className="font-heading text-xl font-semibold text-foreground mb-2">
                Precisa de mais? Compre créditos avulsos.
              </h3>
              <p className="text-sm text-foreground/70">
                Sem mudar de plano. Pacotes via Pix, validade de 12 meses.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {packs.map((p) => (
                <div
                  key={p.id}
                  className="bg-card border border-border rounded-xl px-4 py-3 text-center min-w-[6rem]"
                >
                  <div className="font-heading text-lg font-semibold text-foreground">
                    {p.credits} créditos
                  </div>
                  <div className="text-sm text-accent font-medium">{brl(p.price_brl)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

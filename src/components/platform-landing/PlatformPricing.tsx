import { Link } from "react-router-dom";
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
    <section id="precos" className="bg-pp-bg py-24 px-7">
      <div className="mx-auto max-w-[1150px]">
        <div className="mx-auto mb-14 max-w-[680px] text-center">
          <p className="mb-[14px] text-[13px] font-semibold uppercase tracking-[0.18em] text-pp-accent">
            Preços
          </p>
          <h2 className="font-display text-[clamp(30px,4vw,48px)] font-bold leading-[1.08] tracking-[-0.01em] text-pp-ink">
            Plano mensal + créditos.{" "}
            <span className="text-pp-accent">Cancele quando quiser.</span>
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-pp-muted">
            Sem fidelidade. Sem taxa de adesão. Pagamento via Pix ou cartão.
          </p>
        </div>

        <div className="grid items-stretch gap-[22px] [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={
                tier.featured
                  ? "relative flex -translate-y-2 flex-col gap-[22px] rounded-[22px] border-2 border-pp-sage bg-pp-card p-[34px] shadow-[0_24px_50px_-18px_rgba(135,169,107,.5)]"
                  : "flex flex-col gap-[22px] rounded-[22px] border border-pp-border bg-pp-card p-[34px]"
              }
            >
              {tier.featured && tier.badge && (
                <span className="absolute -top-[14px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-pp-accent px-4 py-[6px] text-[12px] font-semibold text-white shadow-[0_6px_14px_rgba(88,126,69,.4)]">
                  {tier.badge}
                </span>
              )}

              <div>
                <h3 className="mb-2 font-display text-[24px] font-semibold text-pp-ink">
                  {tier.name}
                </h3>
                <p className="text-[14px] leading-[1.5] text-pp-muted">
                  {tier.description}
                </p>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="font-display text-[46px] font-bold text-pp-ink">
                  {brl(tier.monthly_price_brl)}
                </span>
                <span className="text-[15px] text-pp-muted2">/mês</span>
              </div>

              <ul className="flex flex-1 list-none flex-col gap-3 p-0">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex gap-[11px] text-[14.5px] text-pp-ink-soft"
                  >
                    <Check
                      className={`mt-[2px] h-5 w-5 shrink-0 ${
                        tier.featured ? "text-pp-accent" : "text-pp-sage"
                      }`}
                      strokeWidth={2.4}
                      aria-hidden
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/cadastro"
                className={
                  tier.featured
                    ? "inline-flex h-[50px] items-center justify-center rounded-[12px] bg-pp-accent text-[15.5px] font-semibold text-white shadow-[0_10px_24px_rgba(88,126,69,.35)]"
                    : "inline-flex h-[50px] items-center justify-center rounded-[12px] border border-pp-accent bg-transparent text-[15.5px] font-semibold text-pp-accent"
                }
              >
                {tier.cta_label}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-6 rounded-[22px] border border-pp-border bg-pp-surface2 p-[30px]">
          <div className="min-w-[240px] flex-1">
            <h3 className="mb-[6px] font-display text-[20px] font-semibold text-pp-ink">
              Precisa de mais? Compre créditos avulsos.
            </h3>
            <p className="text-[14px] text-pp-muted">
              Sem mudar de plano. Pacotes via Pix, validade de 12 meses.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {packs.map((p) => (
              <div
                key={p.id}
                className="min-w-[108px] rounded-[14px] border border-pp-border bg-pp-card px-5 py-[14px] text-center"
              >
                <div className="font-display text-[18px] font-semibold text-pp-ink">
                  {p.credits} créditos
                </div>
                <div className="text-[14px] font-semibold text-pp-accent">
                  {brl(p.price_brl)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

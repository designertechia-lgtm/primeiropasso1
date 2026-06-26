import { Link } from "react-router-dom";
import {
  Megaphone,
  BarChart3,
  Sparkles,
  ArrowRight,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

interface Benefit {
  icon: LucideIcon;
  title: string;
  text: string;
}

const BENEFITS: Benefit[] = [
  {
    icon: Megaphone,
    title: "Campanhas no automático",
    text: "A IA monta as campanhas no Google e gera os criativos — imagem e vídeo. Roda no seu cartão: você define o orçamento, a plataforma cuida do resto.",
  },
  {
    icon: BarChart3,
    title: "Do clique ao agendamento",
    text: "Relatório que vai além do clique: impressões, leads, conversas no WhatsApp e agendamentos. Você vê o custo real por paciente.",
  },
  {
    icon: Sparkles,
    title: "Presença que atrai sozinha",
    text: "Vídeos, artigos e posts alimentam suas redes e seus anúncios. Sua presença digital cresce enquanto você atende.",
  },
];

const FUNNEL: { label: string; value: string }[] = [
  { label: "Impressões", value: "12,4 mil" },
  { label: "Cliques", value: "840" },
  { label: "Leads", value: "96" },
  { label: "Agendamentos", value: "31" },
];

export default function PlatformTrafego() {
  return (
    <section className="relative overflow-hidden bg-pp-forest text-pp-bg py-24 px-7">
      {/* Glow decorativo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[120px] -right-[100px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(135,169,107,.2),transparent_65%)] pp-anim-glow"
      />

      <div className="relative mx-auto max-w-[1200px]">
        <div className="mx-auto mb-14 max-w-[720px] text-center">
          <p className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.18em] text-pp-sage-light">
            Tráfego pago + presença digital
          </p>
          <h2 className="font-display text-[clamp(30px,4vw,48px)] font-bold leading-[1.08] tracking-[-0.01em]">
            Apareça, atraia e veja cada real{" "}
            <span className="italic text-pp-sage-light">virar paciente.</span>
          </h2>
          <p className="mt-[18px] text-[17px] leading-[1.6] text-pp-bg/75">
            A plataforma cria o seu conteúdo, monta os seus anúncios e mostra o
            resultado — do primeiro clique ao agendamento confirmado.
          </p>
        </div>

        {/* 3 benefícios */}
        <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="rounded-[20px] border border-pp-bg/10 bg-[#243524] p-[30px]"
            >
              <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-pp-sage/15">
                <Icon
                  className="h-[26px] w-[26px] text-pp-sage-light"
                  strokeWidth={2}
                  aria-hidden
                />
              </div>
              <h3 className="mb-3 font-display text-[21px] font-semibold text-pp-bg">
                {title}
              </h3>
              <p className="text-[15px] leading-[1.6] text-pp-bg/70">{text}</p>
            </div>
          ))}
        </div>

        {/* Painel de resultados (funil) */}
        <div className="mt-[22px] rounded-[22px] border border-pp-bg/10 bg-pp-forest-deep p-[30px]">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-4">
              {FUNNEL.map((step, i) => (
                <div key={step.label} className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="font-display text-[26px] font-bold text-pp-sage-light">
                      {step.value}
                    </div>
                    <div className="text-[12px] text-pp-bg/55">{step.label}</div>
                  </div>
                  {i < FUNNEL.length - 1 && (
                    <ChevronRight
                      className="h-5 w-5 shrink-0 text-pp-bg/30"
                      aria-hidden
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="rounded-[14px] bg-pp-sage/15 px-5 py-3 text-center">
              <div className="text-[11px] uppercase tracking-[0.12em] text-pp-sage-light">
                Custo por paciente
              </div>
              <div className="font-display text-[24px] font-bold text-pp-bg">
                R$ 42
              </div>
            </div>
          </div>
          <p className="mt-4 text-[12.5px] text-pp-bg/45">
            Exemplo ilustrativo — o relatório real puxa os números das suas
            campanhas e da sua agenda.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Link
            to="/cadastro"
            className="inline-flex h-[54px] items-center gap-[9px] rounded-[13px] bg-pp-sage px-[30px] text-[16.5px] font-semibold text-pp-forest shadow-[0_10px_30px_rgba(135,169,107,.4)]"
          >
            Criar conta gratuita
            <ArrowRight aria-hidden strokeWidth={2.2} className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </div>
    </section>
  );
}

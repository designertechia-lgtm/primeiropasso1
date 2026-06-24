import { Clock, HelpCircle, TrendingDown, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface PainCard {
  icon: LucideIcon;
  title: string;
  text: string;
}

const cards: PainCard[] = [
  {
    icon: Clock,
    title: "Falta tempo",
    text: "Entre atendimentos, supervisão e estudo, não sobra hora pra gravar, editar e legendar vídeo.",
  },
  {
    icon: HelpCircle,
    title: "Não sabe roteirizar",
    text: "Transformar uma sessão de TCC em 60 segundos virais sem perder o rigor técnico é um ofício à parte.",
  },
  {
    icon: TrendingDown,
    title: "Algoritmo punitivo",
    text: "Postou três vezes e parou? O alcance despenca. Consistência semanal vira o gargalo.",
  },
  {
    icon: AlertTriangle,
    title: "Risco ético",
    text: "Um vídeo mal redigido pode quebrar resoluções do CFP — e nenhum editor entende disso.",
  },
];

export default function PlatformPain() {
  return (
    <section className="bg-pp-bg px-7 py-24">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto mb-14 max-w-[640px] text-center">
          <h2 className="m-0 font-display text-[clamp(30px,4vw,48px)] font-bold leading-[1.08] tracking-[-0.01em] text-pp-ink">
            Você sabe que precisa estar online.{" "}
            <span className="italic text-[#a09384]">Mas…</span>
          </h2>
        </div>

        <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
          {cards.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="rounded-[18px] border border-pp-border bg-pp-card p-7"
            >
              <div className="mb-[18px] flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-pp-danger/[0.09]">
                <Icon
                  className="h-[22px] w-[22px] text-pp-danger"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </div>
              <h3 className="m-0 mb-2 font-display text-[19px] font-semibold text-pp-ink">
                {title}
              </h3>
              <p className="m-0 text-[14.5px] leading-[1.55] text-pp-muted">
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

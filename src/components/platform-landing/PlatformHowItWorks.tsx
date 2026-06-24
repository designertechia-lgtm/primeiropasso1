import { Sparkles, Wand2, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Step = {
  n: string;
  icon: LucideIcon;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    n: "01",
    icon: Sparkles,
    title: "Você escolhe o tema",
    body: "Selecione um tópico do banco TCC ou descreva uma ideia. A IA sugere ângulos virais respeitando o CFP.",
  },
  {
    n: "02",
    icon: Wand2,
    title: "A plataforma produz",
    body: "Roteiro, áudio com sua voz, vídeo com seu avatar, legenda animada, capa e hashtags. Tudo em poucos minutos.",
  },
  {
    n: "03",
    icon: Send,
    title: "Você aprova no WhatsApp",
    body: "Recebe um preview. Aprova → publica em YouTube, TikTok e Instagram. Reprova → ajusta. Você no controle.",
  },
];

export default function PlatformHowItWorks() {
  return (
    <section id="como-funciona" className="bg-pp-surface py-24 px-7">
      <div className="mx-auto max-w-[1100px]">
        <div className="mx-auto mb-[60px] max-w-[680px] text-center">
          <p className="mb-[14px] text-[13px] font-semibold uppercase tracking-[0.18em] text-pp-accent">
            Como funciona
          </p>
          <h2 className="font-display text-[clamp(30px,4vw,48px)] font-bold leading-[1.08] tracking-[-0.01em] text-pp-ink">
            Três passos.{" "}
            <span className="text-pp-accent">Do tema ao Reels publicado.</span>
          </h2>
        </div>

        <div className="relative grid gap-[34px] [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {STEPS.map(({ n, icon: Icon, title, body }) => (
            <div key={n} className="text-center">
              <div className="relative mx-auto mb-6 h-[100px] w-[100px]">
                <div className="flex h-[100px] w-[100px] items-center justify-center rounded-[24px] bg-pp-sage shadow-[0_14px_30px_-8px_rgba(135,169,107,.5)]">
                  <Icon
                    className="h-[42px] w-[42px] text-pp-forest"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                </div>
                <span className="absolute -right-[10px] -top-[10px] flex h-[38px] w-[38px] items-center justify-center rounded-full bg-pp-accent font-display text-[15px] font-bold text-white shadow-[0_4px_10px_rgba(0,0,0,.2)]">
                  {n}
                </span>
              </div>
              <h3 className="mb-3 font-display text-[22px] font-semibold text-pp-ink">
                {title}
              </h3>
              <p className="mx-auto max-w-[300px] text-[15px] leading-[1.6] text-pp-muted">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

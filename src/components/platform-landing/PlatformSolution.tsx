import { MessageCircle, Layers, Network, Sparkles, type LucideIcon } from "lucide-react";

interface Pillar {
  icon: LucideIcon;
  title: string;
  text: string;
}

const PILLARS: Pillar[] = [
  {
    icon: MessageCircle,
    title: "Agente WhatsApp que agenda sozinho",
    text: "Conversa por texto, áudio ou imagem. Negocia preço dentro da sua faixa, busca horários reais na sua agenda e cria agendamentos sem você intervir. Você só recebe o lead já marcado.",
  },
  {
    icon: Layers,
    title: "Uma ideia, cinco formatos",
    text: "Mesmo tema vira vídeo curto, carrossel, post estático, artigo de blog e e-book lead-magnet. O calendário editorial distribui pela semana com horários otimizados.",
  },
  {
    icon: Network,
    title: "Pronto para sua especialidade",
    text: "Kit completo de marca por especialidade — TCC, ansiedade infantil, casais, lutos, autoestima. Cores, fontes, música e biblioteca curada de ideias virais validadas semanalmente.",
  },
  {
    icon: Sparkles,
    title: "Multi-IA, paga só o que usa",
    text: "Avatar fotorrealista, cenas cinematográficas, qualidade institucional e B-roll dinâmico — escolhe o motor ideal pra cada vídeo. Sistema de créditos flexível via Pix.",
  },
];

export default function PlatformSolution() {
  return (
    <section className="bg-pp-surface py-24 px-7">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto mb-14 max-w-[680px] text-center">
          <p className="mb-[14px] text-[13px] font-semibold uppercase tracking-[0.18em] text-pp-accent">
            A solução
          </p>
          <h2 className="font-display text-[clamp(30px,4vw,48px)] font-bold leading-[1.08] tracking-[-0.01em] text-pp-ink">
            Quatro pilares.{" "}
            <span className="text-pp-accent">Um consultório que cresce sozinho.</span>
          </h2>
        </div>

        <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
          {PILLARS.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="rounded-[20px] border border-pp-border bg-pp-card p-[34px]"
            >
              <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-pp-sage/15">
                <Icon
                  className="h-[26px] w-[26px] text-pp-accent"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </div>
              <h3 className="mb-3 font-display text-[23px] font-semibold text-pp-ink">
                {title}
              </h3>
              <p className="text-[15.5px] leading-[1.6] text-pp-muted">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

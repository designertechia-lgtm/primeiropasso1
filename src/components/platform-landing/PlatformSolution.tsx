import { useEffect, useRef, useState } from "react";
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
    text: "Conteúdo e agente adaptados à sua abordagem — TCC, ansiedade infantil, casais, lutos, autoestima. A IA usa a sua especialidade e os seus próprios materiais (PDFs) pra falar no seu tom.",
  },
  {
    icon: Sparkles,
    title: "Multi-IA, paga só o que usa",
    text: "Avatar fotorrealista, cenas cinematográficas, qualidade institucional e B-roll dinâmico — escolhe o motor ideal pra cada vídeo. Sistema de créditos flexível via Pix.",
  },
];

const ROTATE_MS = 3000;

export default function PlatformSolution() {
  const [active, setActive] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const pausedRef = useRef(false);
  const dirRef = useRef(1); // 1 = avançando p/ direita, -1 = voltando p/ esquerda

  // Em md+ um card fica aberto por vez (auto-play); em mobile todos abrem empilhados.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Auto-play "ping-pong": abre 1→2→3→4 (último) e depois VOLTA fechando
  // 3→2→1→… em loop contínuo. Pausa no hover.
  useEffect(() => {
    if (!isDesktop) return;
    const timer = window.setInterval(() => {
      if (pausedRef.current) return;
      setActive((prev) => {
        let dir = dirRef.current;
        let next = prev + dir;
        if (next > PILLARS.length - 1) {
          dir = -1;
          next = prev - 1;
        } else if (next < 0) {
          dir = 1;
          next = prev + 1;
        }
        dirRef.current = dir;
        return next;
      });
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [isDesktop]);

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

        {/* Cards numa fileira; cada um mantém o título e abre PARA BAIXO revelando o texto. */}
        <div
          className="grid items-start gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))]"
          onMouseEnter={() => {
            pausedRef.current = true;
          }}
          onMouseLeave={() => {
            pausedRef.current = false;
          }}
        >
          {PILLARS.map((pillar, i) => {
            const on = !isDesktop || active === i;
            const Icon = pillar.icon;
            return (
              <button
                type="button"
                key={pillar.title}
                onClick={() => setActive(i)}
                aria-expanded={on}
                className={`rounded-[20px] bg-pp-card p-[28px] text-left transition-[border-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pp-accent focus-visible:ring-offset-2 ${
                  on
                    ? "border border-pp-sage/50 shadow-[0_18px_40px_-22px_rgba(88,126,69,.5)]"
                    : "border border-pp-border"
                }`}
              >
                <div className="mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-pp-sage/15">
                  <Icon
                    className="h-[26px] w-[26px] text-pp-accent"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </div>
                <h3 className="font-display text-[20px] font-semibold leading-[1.25] text-pp-ink">
                  {pillar.title}
                </h3>
                {/* Contexto: abre para baixo (max-height) quando o card está ativo. */}
                <div
                  className="overflow-hidden transition-[max-height,opacity] duration-500 ease-out"
                  style={{ maxHeight: on ? "340px" : "0px", opacity: on ? 1 : 0 }}
                >
                  <p className="mt-3 text-[15px] leading-[1.6] text-pp-muted">
                    {pillar.text}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

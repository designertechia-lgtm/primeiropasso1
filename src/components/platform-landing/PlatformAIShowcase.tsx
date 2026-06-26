import { useEffect, useRef, useState } from "react";
import { BrainCircuit, Mic, Video, MessageCircle, type LucideIcon } from "lucide-react";

interface AIPanel {
  icon: LucideIcon;
  title: string;
  sub: string;
  body: string;
}

const AI_PANELS: AIPanel[] = [
  {
    icon: BrainCircuit,
    title: "Roteirista com TCC",
    sub: "Roteiros no formato viral",
    body: "Roteiros validados pelas Resoluções do CFP. Hook, insight e CTA já no formato viral. Você edita antes de produzir.",
  },
  {
    icon: Mic,
    title: "Voz clonada do terapeuta",
    sub: "Sua voz, com naturalidade",
    body: "Calibração com 30s de áudio. Sua voz com nuances emocionais — não locutor genérico. Paciente reconhece você.",
  },
  {
    icon: Video,
    title: "Vídeo com seu rosto",
    sub: "Avatar realista + cenas cinematográficas",
    body: "Escolha o motor por contexto: avatar realista para conexão, cinematográfico para mensagens, B-roll para variações.",
  },
  {
    icon: MessageCircle,
    title: "Agente conversacional",
    sub: "Responde no seu estilo, com seus PDFs",
    body: "Lê os PDFs que você sobe e responde no seu estilo. Negocia, agenda, encaminha quando o caso é sensível.",
  },
];

const ROTATE_MS = 3400;

export default function PlatformAIShowcase() {
  const [activeAI, setActiveAI] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const pausedRef = useRef(false);

  // O accordion horizontal (flexGrow, overlay colapsado, auto-rotate) só vale a
  // partir de md. Em mobile os 4 painéis ficam empilhados e sempre expandidos.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    // Decisão de produto: a landing anima SEMPRE (auto-rotate ativo mesmo com
    // "reduzir movimento" no sistema). O accordion horizontal só existe em md+.
    if (!isDesktop) return;

    const timer = window.setInterval(() => {
      if (!pausedRef.current) {
        setActiveAI((prev) => (prev + 1) % AI_PANELS.length);
      }
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [isDesktop]);

  return (
    <section className="bg-pp-bg py-24 px-7">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto mb-14 max-w-[680px] text-center">
          <p className="mb-[14px] text-[13px] font-semibold uppercase tracking-[0.18em] text-pp-accent">
            Sob o capô
          </p>
          <h2 className="font-display text-[clamp(30px,4vw,48px)] font-bold leading-[1.08] tracking-[-0.01em] text-pp-ink">
            Quatro IAs especializadas{" "}
            <span className="text-pp-accent">trabalham por você.</span>
          </h2>
          <p className="mt-[18px] text-[17px] leading-[1.6] text-pp-muted">
            Cada uma escolhida pela melhor performance na sua função. Você não
            precisa entender de nenhuma delas.
          </p>
        </div>

        <div
          className="flex flex-col md:flex-row md:items-stretch gap-[14px]"
          onMouseEnter={() => {
            pausedRef.current = true;
          }}
          onMouseLeave={() => {
            pausedRef.current = false;
          }}
        >
          {AI_PANELS.map((panel, i) => {
            // Em mobile cada painel fica sempre aberto e expandido; o estado
            // ativo/colapsado do accordion só existe a partir de md.
            const on = !isDesktop || activeAI === i;
            const Icon = panel.icon;
            return (
              <button
                type="button"
                key={panel.title}
                onClick={() => setActiveAI(i)}
                aria-expanded={on}
                aria-label={`${panel.title} — ${on ? "aberto" : "fechado"}`}
                style={{
                  flexGrow: isDesktop ? (on ? 4 : 1) : undefined,
                  transition:
                    "flex-grow .55s cubic-bezier(.4,0,.2,1), border-color .4s ease, box-shadow .4s ease",
                  boxShadow:
                    isDesktop && on
                      ? "0 20px 44px -20px rgba(88,126,69,.45)"
                      : "none",
                }}
                className={`relative h-auto md:h-[380px] w-full text-left min-w-0 md:basis-0 cursor-pointer overflow-hidden rounded-[20px] bg-pp-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pp-accent focus-visible:ring-offset-2 ${
                  on ? "border border-[#c3d3ad]" : "border border-pp-border"
                }`}
              >
                <div
                  className="pointer-events-none absolute -right-[46px] -top-[46px] h-[150px] w-[150px] rounded-full bg-[radial-gradient(circle,rgba(135,169,107,.22),transparent_70%)]"
                  aria-hidden
                />

                {/* ATIVO */}
                <div
                  style={{ opacity: on ? 1 : 0, transition: "opacity .45s ease" }}
                  className="relative box-border w-full md:w-[360px] md:max-w-[80vw] p-[34px]"
                >
                  <div className="mb-[18px] flex h-[48px] w-[48px] items-center justify-center rounded-[13px] bg-[#E8E0D6]">
                    <Icon className="h-6 w-6 stroke-pp-accent" aria-hidden />
                  </div>
                  <h3 className="font-display text-[21px] font-semibold text-pp-ink">
                    {panel.title}
                  </h3>
                  <p className="my-[6px] mb-4 font-mono text-[11.5px] text-pp-muted2">
                    {panel.sub}
                  </p>
                  <p className="text-[14.5px] leading-[1.6] text-pp-muted">
                    {panel.body}
                  </p>
                </div>

                {/* FECHADO (overlay colapsado só em md+) */}
                <div
                  style={{
                    opacity: on ? 0 : 1,
                    transition: "opacity .4s ease",
                    pointerEvents: on ? "none" : "auto",
                  }}
                  className="hidden md:flex absolute inset-0 flex-col items-center justify-between bg-pp-card py-[30px]"
                >
                  <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-[#E8E0D6]">
                    <Icon className="h-6 w-6 stroke-pp-accent" aria-hidden />
                  </div>
                  <div
                    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    className="whitespace-nowrap font-display text-[16px] font-semibold tracking-[0.01em] text-pp-ink"
                  >
                    {panel.title}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import { Sparkles, Wand2, Send } from "lucide-react";

const STEPS = [
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
    body: "Recebe um preview. Aprova → publica em YouTube/TikTok/Instagram. Reprova → ajusta. Você no controle.",
  },
];

export default function PlatformHowItWorks() {
  return (
    <section id="como-funciona" className="py-20 md:py-28 bg-background">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-2xl mx-auto text-center mb-14 md:mb-16">
          <p className="text-sm uppercase tracking-[0.18em] text-accent font-semibold mb-3">
            Como funciona
          </p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight tracking-tight">
            Três passos.{" "}
            <span className="text-primary">Do tema ao Reels publicado.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8 relative">
          <div
            className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-border to-transparent"
            aria-hidden
          />
          {STEPS.map(({ n, icon: Icon, title, body }) => (
            <div key={n} className="relative flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                  <Icon className="h-10 w-10" aria-hidden />
                </div>
                <span className="absolute -top-2 -right-2 w-9 h-9 rounded-full bg-accent text-accent-foreground font-serif font-bold text-sm flex items-center justify-center shadow">
                  {n}
                </span>
              </div>
              <h3 className="font-serif text-xl md:text-2xl font-semibold text-foreground mb-3">
                {title}
              </h3>
              <p className="text-base text-foreground/75 leading-relaxed max-w-xs">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

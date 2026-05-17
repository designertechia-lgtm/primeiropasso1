import { MessageSquareHeart, Layers, Palette, Sparkles } from "lucide-react";

const FEATURES = [
  {
    icon: MessageSquareHeart,
    title: "Agente WhatsApp que agenda sozinho",
    body: "Conversa por texto, áudio ou imagem. Negocia preço dentro da sua faixa, busca horários reais na sua agenda e cria agendamentos sem você intervir. Você só recebe o lead já marcado.",
  },
  {
    icon: Layers,
    title: "Uma ideia, cinco formatos",
    body: "Mesmo tema vira vídeo curto, carrossel Instagram, post estático, artigo de blog e e-book lead-magnet. Calendário editorial distribui pela semana com horários otimizados.",
  },
  {
    icon: Palette,
    title: "Pronto para sua especialidade",
    body: "Kit completo de marca por especialidade — TCC, ansiedade infantil, casais, lutos, autoestima. Cores, fontes, música e biblioteca curada de ideias virais validadas semanalmente.",
  },
  {
    icon: Sparkles,
    title: "Multi-IA, paga só o que usa",
    body: "Avatar fotorrealista, cenas cinematográficas, qualidade institucional e B-roll dinâmico — escolhe o motor ideal pra cada vídeo. Sistema de créditos flexível via Pix.",
  },
];

export default function PlatformSolution() {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-b from-background to-muted/40">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-2xl mx-auto text-center mb-14 md:mb-16">
          <p className="text-sm uppercase tracking-[0.18em] text-accent font-semibold mb-3">
            A solução
          </p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight tracking-tight">
            Quatro pilares.{" "}
            <span className="text-primary">Um consultório que cresce sozinho.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-5 md:gap-6">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-card border border-border rounded-2xl p-7 md:p-8 hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                <Icon className="h-6 w-6 text-primary" aria-hidden />
              </div>
              <h3 className="font-serif text-xl md:text-2xl font-semibold text-foreground mb-3">
                {title}
              </h3>
              <p className="text-base text-foreground/75 leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

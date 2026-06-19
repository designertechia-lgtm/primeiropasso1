import { Brain, Mic, Video, MessageCircle } from "lucide-react";

const ENGINES = [
  {
    icon: Brain,
    title: "Roteirista com TCC",
    subtitle: "Gemini 2.0 Flash",
    body: "Roteiros validados pelas Resoluções do CFP. Hook, insight e CTA já no formato viral. Você edita antes de produzir.",
    accent: "from-primary/20 to-primary/5",
    iconColor: "text-primary",
  },
  {
    icon: Mic,
    title: "Voz clonada do terapeuta",
    subtitle: "ElevenLabs Multilingual",
    body: "Calibração com 30s de áudio. Sua voz com nuances emocionais — não locutor genérico. Paciente reconhece você.",
    accent: "from-accent/20 to-accent/5",
    iconColor: "text-accent",
  },
  {
    icon: Video,
    title: "Vídeo com seu rosto",
    subtitle: "Motores premium · Multi-IA",
    body: "Escolha o motor por contexto: avatar realista para conexão, cinematográfico para mensagens, B-roll para variações.",
    accent: "from-primary/20 to-primary/5",
    iconColor: "text-primary",
  },
  {
    icon: MessageCircle,
    title: "Agente conversacional",
    subtitle: "GPT-4o + RAG personalizado",
    body: "Lê os PDFs que você sobe (artigos, livros, transcrições) e responde no seu estilo. Negocia, agenda, encaminha quando sensível.",
    accent: "from-accent/20 to-accent/5",
    iconColor: "text-accent",
  },
];

export default function PlatformAIShowcase() {
  return (
    <section className="py-20 md:py-28 bg-background">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-2xl mx-auto text-center mb-14 md:mb-16">
          <p className="text-sm uppercase tracking-[0.18em] text-accent font-semibold mb-3">
            Sob o capô
          </p>
          <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight tracking-tight">
            Quatro IAs especializadas{" "}
            <span className="text-primary">trabalham por você.</span>
          </h2>
          <p className="text-base md:text-lg text-foreground/70 mt-4 leading-relaxed">
            Cada uma escolhida pela melhor performance na sua função. Você não
            precisa entender de nenhuma delas.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {ENGINES.map(({ icon: Icon, title, subtitle, body, accent, iconColor }) => (
            <div
              key={title}
              className="relative bg-card border border-border rounded-2xl p-6 flex flex-col gap-4 hover:shadow-md transition-shadow overflow-hidden"
            >
              <div
                className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${accent} blur-2xl`}
                aria-hidden
              />
              <div className="relative">
                <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center mb-3">
                  <Icon className={`h-5 w-5 ${iconColor}`} aria-hidden />
                </div>
                <h3 className="font-heading text-lg font-semibold text-foreground leading-tight">
                  {title}
                </h3>
                <p className="text-xs text-foreground/55 mt-1 font-mono tracking-tight">
                  {subtitle}
                </p>
              </div>
              <p className="relative text-sm text-foreground/75 leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

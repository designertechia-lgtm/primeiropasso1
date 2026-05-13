import { Clock, FileQuestion, TrendingDown, AlertTriangle } from "lucide-react";

const PAINS = [
  {
    icon: Clock,
    title: "Falta tempo",
    body: "Entre atendimentos, supervisão e estudo, não sobra hora pra gravar, editar e legendar vídeo.",
  },
  {
    icon: FileQuestion,
    title: "Não sabe roteirizar",
    body: "Transformar uma sessão de TCC em 60 segundos virais sem perder o rigor técnico é um ofício à parte.",
  },
  {
    icon: TrendingDown,
    title: "Algoritmo punitivo",
    body: "Postou três vezes e parou? O alcance despenca. Consistência semanal vira o gargalo.",
  },
  {
    icon: AlertTriangle,
    title: "Risco ético",
    body: "Um vídeo mal redigido pode quebrar resoluções do CFP — e nenhum editor entende disso.",
  },
];

export default function PlatformPain() {
  return (
    <section className="py-20 md:py-28 bg-background">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-2xl mx-auto text-center mb-14 md:mb-16">
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight tracking-tight">
            Você sabe que precisa estar online.{" "}
            <span className="text-foreground/60">Mas...</span>
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {PAINS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-card border border-border rounded-2xl p-6 hover:shadow-md transition-shadow"
            >
              <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center mb-4">
                <Icon className="h-5 w-5 text-destructive" aria-hidden />
              </div>
              <h3 className="font-serif text-lg font-semibold text-foreground mb-2">
                {title}
              </h3>
              <p className="text-sm text-foreground/70 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

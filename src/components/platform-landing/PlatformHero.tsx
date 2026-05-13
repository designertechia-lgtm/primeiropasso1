import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, PlayCircle, ShieldCheck, Sparkles } from "lucide-react";

export default function PlatformHero() {
  return (
    <section
      id="hero"
      className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden"
    >
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-br from-background via-muted/40 to-secondary/20"
        aria-hidden
      />
      <div
        className="absolute -top-24 -right-24 w-[28rem] h-[28rem] rounded-full bg-primary/10 blur-3xl -z-10"
        aria-hidden
      />
      <div
        className="absolute -bottom-32 -left-24 w-[24rem] h-[24rem] rounded-full bg-accent/10 blur-3xl -z-10"
        aria-hidden
      />

      <div className="container mx-auto max-w-6xl px-4">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="flex flex-col gap-6 max-w-xl">
            <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium tracking-wide">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Em conformidade com CFP e LGPD
            </div>

            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-semibold text-foreground leading-[1.1] tracking-tight">
              Seu consultório com{" "}
              <span className="text-primary">presença digital e IA</span>
              {" "}que atende sozinha.
            </h1>

            <p className="text-lg md:text-xl text-foreground/75 leading-relaxed">
              Vídeos com seu avatar, carrosséis, posts e artigos a partir de uma
              só ideia. Um agente no WhatsApp que{" "}
              <strong className="font-semibold">conversa, negocia e agenda</strong>
              {" "}por você. Tudo personalizado para sua especialidade.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link to="/cadastro">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground gap-2 shadow-md hover:shadow-lg transition-shadow"
                >
                  Começar grátis
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#como-funciona">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto gap-2"
                >
                  <PlayCircle className="h-4 w-4" />
                  Ver como funciona
                </Button>
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1 text-sm text-foreground/60">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
                Multi-IA: HeyGen, Kling, Veo
              </span>
              <span className="h-3 w-px bg-border" aria-hidden />
              <span>Sem cartão de crédito</span>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/5] max-w-md mx-auto">
              <div
                className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-primary/20 via-secondary/15 to-accent/20 blur-2xl"
                aria-hidden
              />
              <div className="relative h-full rounded-[2rem] bg-card border border-border shadow-2xl overflow-hidden">
                <div
                  className="absolute top-4 left-1/2 -translate-x-1/2 w-32 h-6 bg-foreground/10 rounded-full"
                  aria-hidden
                />
                <div className="h-full w-full bg-gradient-to-b from-primary/5 via-background to-accent/5 flex flex-col items-center justify-center p-8 gap-4">
                  <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
                    <PlayCircle className="h-10 w-10 text-primary" aria-hidden />
                  </div>
                  <p className="font-serif text-xl text-center text-foreground/80">
                    "Como reconhecer pensamentos automáticos em 30 segundos"
                  </p>
                  <div className="flex items-center gap-2 text-xs text-foreground/60">
                    <span className="px-2 py-1 rounded-full bg-muted">TCC</span>
                    <span className="px-2 py-1 rounded-full bg-muted">Ansiedade</span>
                    <span className="px-2 py-1 rounded-full bg-muted">9:16</span>
                  </div>
                  <div className="mt-2 pt-3 border-t border-border w-full flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-foreground/60">
                      <span className="w-2 h-2 rounded-full bg-accent" aria-hidden />
                      Carrossel · LinkedIn
                    </div>
                    <div className="flex items-center gap-2 text-xs text-foreground/60">
                      <span className="w-2 h-2 rounded-full bg-accent" aria-hidden />
                      Artigo · Blog
                    </div>
                    <div className="flex items-center gap-2 text-xs text-foreground/60">
                      <span className="w-2 h-2 rounded-full bg-primary" aria-hidden />
                      Mesma ideia · 4 formatos
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

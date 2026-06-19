import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function PlatformCTA() {
  return (
    <section className="py-20 md:py-28 bg-background">
      <div className="container mx-auto max-w-4xl px-4">
        <div className="relative rounded-3xl bg-gradient-to-br from-primary via-primary to-accent p-10 md:p-14 lg:p-16 overflow-hidden text-center">
          <div
            className="absolute inset-0 opacity-30 mix-blend-overlay"
            style={{
              backgroundImage:
                "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.4), transparent 50%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.25), transparent 45%)",
            }}
            aria-hidden
          />

          <div className="relative flex flex-col items-center gap-6">
            <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl font-semibold text-primary-foreground leading-tight tracking-tight max-w-2xl">
              Pronto para postar consistente, sem queimar suas tardes editando?
            </h2>
            <p className="text-base md:text-lg text-primary-foreground/85 max-w-xl leading-relaxed">
              Cadastro em menos de 2 minutos. Sem cartão. Primeiro vídeo grátis.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link to="/cadastro">
                <Button
                  size="lg"
                  className="bg-background text-primary hover:bg-background/90 gap-2 font-semibold shadow-lg"
                >
                  Criar conta gratuita
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  Já tenho conta
                </Button>
              </Link>
            </div>

            <div className="flex items-center gap-2 text-sm text-primary-foreground/80 pt-3">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              <span>Em conformidade com CFP nº 011/2018 e LGPD</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

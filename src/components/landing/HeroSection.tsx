import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface HeroSectionProps {
  title?: string;
  subtitle?: string;
  whatsapp?: string;
  photoUrl?: string;
  slug?: string;
}

export default function HeroSection({ title, subtitle, whatsapp, photoUrl, slug }: HeroSectionProps) {
  const whatsappLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=Olá! Gostaria de agendar uma consulta.`
    : "#";

  return (
    <section id="hero" className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
      <div className="container mx-auto px-4 py-20 md:py-32 relative">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
              {title || "Dê o primeiro passo para uma mente equilibrada"}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-lg">
              {subtitle || "A terapia é um espaço seguro para você se reconectar consigo mesmo. Vamos caminhar juntos nessa jornada."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="text-base gap-2">
                  Agendar Consulta <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              {slug && (
                <a href={`/${slug}/agendar`}>
                  <Button size="lg" variant="outline" className="text-base">
                    Ver Horários
                  </Button>
                </a>
              )}
            </div>
          </div>
          <div className="flex justify-center">
            {photoUrl ? (
              <img src={photoUrl} alt="Profissional" className="rounded-2xl shadow-xl max-h-[450px] object-cover" />
            ) : (
              <div className="w-full max-w-sm aspect-[3/4] rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <span className="text-muted-foreground text-sm">Foto do profissional</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

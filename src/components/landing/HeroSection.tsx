import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface HeroSectionProps {
  title?: string;
  subtitle?: string;
  whatsapp?: string;
  photoUrl?: string;
  heroImageUrl?: string;
  slug?: string;
  professionalName?: string;
  crp?: string;
}

export default function HeroSection({ title, subtitle, whatsapp, photoUrl, heroImageUrl, slug, professionalName, crp }: HeroSectionProps) {
  const displayImage = heroImageUrl || photoUrl;
  const whatsappLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=Olá! Gostaria de agendar uma consulta.`
    : "#";

  return (
    <section id="hero" className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
      <div className="container mx-auto px-4 py-20 md:py-32 relative">
        <div className="flex flex-col items-center text-center gap-8">
          {/* Profile Photo - Hero Protagonist */}
          <div className="relative">
            {displayImage ? (
              <div className="relative">
                <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 blur-md" />
                <img
                  src={displayImage}
                  alt={professionalName || "Profissional"}
                  className="relative w-48 h-48 md:w-64 md:h-64 lg:w-72 lg:h-72 rounded-full object-cover border-4 border-background shadow-2xl"
                />
              </div>
            ) : (
              <div className="w-48 h-48 md:w-64 md:h-64 lg:w-72 lg:h-72 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border-4 border-background shadow-xl">
                <span className="text-muted-foreground text-sm">Foto do profissional</span>
              </div>
            )}
          </div>

          {/* Name & CRP */}
          {(professionalName || crp) && (
            <div className="space-y-1">
              {professionalName && (
                <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground">
                  {professionalName}
                </h2>
              )}
              {crp && (
                <p className="text-sm text-muted-foreground tracking-wide uppercase">
                  CRP {crp}
                </p>
              )}
            </div>
          )}

          {/* Title & Subtitle */}
          <div className="max-w-2xl space-y-4">
            <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
              {title || "Dê o primeiro passo para uma mente equilibrada"}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              {subtitle || "A terapia é um espaço seguro para você se reconectar consigo mesmo. Vamos caminhar juntos nessa jornada."}
            </p>
          </div>

          {/* CTA Buttons */}
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
      </div>
    </section>
  );
}

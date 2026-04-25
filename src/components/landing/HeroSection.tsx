import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { DEMO_PROFESSIONAL } from "@/data/demoProfessional";

type PhotoStyle = "portrait" | "circle" | "square";

const PHOTO_STYLES: Record<PhotoStyle, { shape: string; aspect: string }> = {
  portrait: { shape: "rounded-[2rem]",  aspect: "aspect-[3/4]"  },
  circle:   { shape: "rounded-full",    aspect: "aspect-square" },
  square:   { shape: "rounded-[1rem]",  aspect: "aspect-square" },
};

const OVERLAY_COLORS: Record<string, string> = {
  dark:    "0,0,0",
  light:   "255,255,255",
  primary: "var(--overlay-primary,0,0,0)",
};

interface HeroSectionProps {
  title?: string;
  subtitle?: string;
  whatsapp?: string;
  photoUrl?: string;
  heroImageUrl?: string;
  heroBgUrl?: string;
  heroBgOpacity?: number;
  heroBgOverlay?: string;
  slug?: string;
  professionalName?: string;
  crp?: string;
  photoStyle?: string;
  photoFit?: string;
}

export default function HeroSection({ title, subtitle, whatsapp, photoUrl, heroImageUrl, heroBgUrl, heroBgOpacity = 70, heroBgOverlay = "dark", slug, professionalName, crp, photoStyle = "portrait", photoFit = "contain" }: HeroSectionProps) {
  const displayImage = heroImageUrl || photoUrl || DEMO_PROFESSIONAL.hero_image_url || DEMO_PROFESSIONAL.photo_url;
  const displayName = professionalName && professionalName !== "Profissional" ? professionalName : DEMO_PROFESSIONAL.full_name;
  const displayCrp = crp || DEMO_PROFESSIONAL.crp;
  const displayTitle = title || DEMO_PROFESSIONAL.hero_title;
  const displaySubtitle = subtitle || DEMO_PROFESSIONAL.hero_subtitle;
  const whatsappLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=Olá! Gostaria de agendar uma consulta.`
    : "#";

  const overlayRgb = heroBgOverlay === "primary"
    ? null
    : (OVERLAY_COLORS[heroBgOverlay] ?? OVERLAY_COLORS.dark);
  const overlayAlpha = heroBgOpacity / 100;

  return (
    <section id="hero" className="relative overflow-hidden">
      {heroBgUrl && (
        <>
          <img
            src={heroBgUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {heroBgOverlay !== "none" && (
            overlayRgb
              ? <div className="absolute inset-0" style={{ background: `rgba(${overlayRgb},${overlayAlpha})` }} />
              : <div className="absolute inset-0 bg-primary" style={{ opacity: overlayAlpha }} />
          )}
        </>
      )}
      <div className={`absolute inset-0 bg-gradient-to-br from-primary/10 via-background/60 to-secondary/10 ${heroBgUrl ? "opacity-60" : ""}`} />
      <div className="container mx-auto px-4 py-20 md:py-32 relative">
        <div className="flex flex-col items-center text-center gap-8">
          {/* Profile Photo - Hero Protagonist */}
          {(() => {
            const style = PHOTO_STYLES[(photoStyle as PhotoStyle)] ?? PHOTO_STYLES.portrait;
            const fitClass = photoFit === "cover" ? "object-cover object-top" : "object-contain";
            return (
              <div className="relative">
                {displayImage ? (
                  <div className="relative">
                    <div className={`absolute -inset-3 ${style.shape} bg-gradient-to-br from-primary/30 to-accent/30 blur-md`} />
                    <img
                      src={displayImage}
                      alt={displayName || "Profissional"}
                      className={`relative w-56 md:w-72 lg:w-80 ${style.aspect} ${style.shape} ${fitClass} border-4 border-background shadow-2xl`}
                    />
                  </div>
                ) : (
                  <div className={`w-56 md:w-72 lg:w-80 ${style.aspect} ${style.shape} bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border-4 border-background shadow-xl`}>
                    <span className="text-muted-foreground text-sm">Foto do profissional</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Name & CRP */}
          {(displayName || displayCrp) && (
            <div className="space-y-1">
              {displayName && (
                <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground">
                  {displayName}
                </h2>
              )}
              {displayCrp && (
                <p className="text-sm text-muted-foreground tracking-wide uppercase">
                  {displayCrp}
                </p>
              )}
            </div>
          )}

          {/* Title & Subtitle */}
          <div className="max-w-2xl space-y-4">
            <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
              {displayTitle}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              {displaySubtitle}
            </p>
          </div>

          {/* CTA Buttons */}
          {whatsapp && (
            <div className="flex flex-col sm:flex-row gap-3">
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="text-base gap-2">
                  Agenda <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

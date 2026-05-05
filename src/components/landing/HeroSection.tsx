import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { DEMO_PROFESSIONAL } from "@/data/demoProfessional";

type PhotoStyle = "portrait" | "circle" | "square" | "horizontal";

const PHOTO_STYLES: Record<PhotoStyle, { shape: string; aspect: string }> = {
  portrait: { shape: "rounded-[2rem]", aspect: "aspect-auto" },
  circle: { shape: "rounded-full", aspect: "aspect-square" },
  square: { shape: "rounded-[2rem]", aspect: "aspect-square" },
  horizontal: { shape: "rounded-[2rem]", aspect: "aspect-[4/3]" },
};

const OVERLAY_COLORS: Record<string, string> = {
  dark: "0,0,0",
  light: "255,255,255",
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

const DEFAULT_HERO_BG = "/hero-bg-default.jpg";

export default function HeroSection({ title, subtitle, whatsapp, photoUrl, heroImageUrl, heroBgUrl, heroBgOpacity = 70, heroBgOverlay = "dark", slug, professionalName, crp, photoStyle = "portrait", photoFit = "contain" }: HeroSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const activeBgUrl = heroBgUrl || DEFAULT_HERO_BG;
  const isVideo = /\.(mp4|webm|ogg|mov|m4v)($|\?)/i.test(activeBgUrl);

  useEffect(() => {
    if (isVideo && videoRef.current) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = true;
      videoRef.current.play().catch(e => console.log("Autoplay failed:", e));
    }
  }, [activeBgUrl, isVideo]);

  const displayImage = heroImageUrl || photoUrl || DEMO_PROFESSIONAL.hero_image_url || DEMO_PROFESSIONAL.photo_url;
  const displayName = professionalName && professionalName !== "Profissional" ? professionalName : DEMO_PROFESSIONAL.full_name;
  const displayCrp = crp || DEMO_PROFESSIONAL.crp;
  const displayTitle = title || DEMO_PROFESSIONAL.hero_title;
  const displaySubtitle = subtitle || DEMO_PROFESSIONAL.hero_subtitle;
  const whatsappLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=Olá! Gostaria de agendar um horário.`
    : "#";

  const isDefaultBg = !heroBgUrl; // usando fallback, sem bg customizado
  const overlayRgb = heroBgOverlay === "primary"
    ? null
    : (OVERLAY_COLORS[heroBgOverlay] ?? OVERLAY_COLORS.dark);
    
  // O controle de opacidade agora afeta o painel de vidro (card).
  // O overlay do vídeo fica fixo em 15% (ou 30% se for padrão) para deixar o vídeo brilhar.
  const overlayAlpha = isDefaultBg ? 0.30 : 0.15;

  return (
    <section id="hero" className="relative overflow-hidden">
      <>
        {(() => {
          if (isVideo) {
            return (
              <video
                ref={videoRef}
                src={activeBgUrl}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
            );
          }
          return (
            <img
              src={activeBgUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          );
        })()}
        {heroBgOverlay !== "none" && (
          overlayRgb
            ? <div className="absolute inset-0" style={{ background: `rgba(${overlayRgb},${overlayAlpha})` }} />
            : <div className="absolute inset-0 bg-primary" style={{ opacity: overlayAlpha }} />
        )}
      </>
      <div className={`absolute inset-0 bg-gradient-to-br from-primary/10 via-background/60 to-secondary/10 ${isDefaultBg ? "opacity-20" : "opacity-50"}`} />
      <div className="container mx-auto px-4 pt-28 pb-16 md:pt-36 md:pb-24 relative min-h-[90vh] flex items-center justify-center">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-16 w-full max-w-6xl">
          {/* Profile Photo - Hero Protagonist */}
          {(() => {
            const style = PHOTO_STYLES[(photoStyle as PhotoStyle)] ?? PHOTO_STYLES.portrait;
            const fitClass = photoFit === "cover" ? "object-cover object-top" : "object-contain";
            return (
              <div className="flex-1 w-full flex justify-center lg:justify-center">
                <div className="w-full max-w-[16rem] sm:max-w-xs md:max-w-[20rem] relative">
                  {displayImage ? (
                    <div className="relative group">
                    <div className={`absolute -inset-3 ${style.shape} bg-gradient-to-br from-primary/30 to-accent/30 blur-md`} />
                    <img
                      src={displayImage}
                      alt={displayName || "Profissional"}
                      className={`relative w-full ${style.aspect} ${style.shape} ${fitClass} border-4 border-background shadow-2xl`}
                    />
                  </div>
                ) : (
                  <div className={`w-full ${style.aspect} ${style.shape} bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border-4 border-background shadow-xl`}>
                    <span className="text-muted-foreground text-sm">Foto do profissional</span>
                  </div>
                )}
              </div>
            </div>
            );
          })()}

          {/* Text & CTA Container (Glassmorphism & Animation) */}
          <div className="flex-1 w-full flex justify-center lg:justify-center">
            <div 
              className="flex flex-col items-center lg:items-start text-center lg:text-left gap-5 md:gap-6 p-8 md:p-10 lg:p-12 rounded-[2rem] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-1000 ease-out w-full max-w-2xl"
              style={{ backgroundColor: `hsl(var(--background) / ${heroBgOpacity / 100})` }}
            >
            {/* Name & CRP */}
            {(displayName || displayCrp) && (
              <div className="space-y-1">
                {displayName && (
                  <h2 className="font-serif text-2xl md:text-3xl font-bold text-black dark:text-white drop-shadow-md">
                    {displayName}
                  </h2>
                )}
                {displayCrp && (
                  <p className="text-sm text-black/80 dark:text-white/80 tracking-wide uppercase font-semibold drop-shadow-sm">
                    {displayCrp}
                  </p>
                )}
              </div>
            )}

            {/* Title & Subtitle */}
            <div className="max-w-2xl space-y-4">
              <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-bold text-black dark:text-white leading-tight drop-shadow-md">
                {displayTitle}
              </h1>
              <p className="text-lg md:text-xl text-black/90 dark:text-white/90 leading-relaxed font-medium drop-shadow-sm">
                {displaySubtitle}
              </p>
            </div>

            {/* CTA Buttons */}
            {whatsapp && (
              <div className="flex flex-col sm:flex-row gap-3 pt-4 w-full justify-center lg:justify-start">
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="text-base gap-2 shadow-lg hover:shadow-xl transition-shadow duration-300 w-full sm:w-auto">
                    Agendar Horário <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { ShieldCheck, Lock, Award, Youtube, Music2, Instagram } from "lucide-react";

const BADGES = [
  { icon: ShieldCheck, label: "CFP nº 011/2018" },
  { icon: Lock, label: "LGPD" },
  { icon: Award, label: "Roteiros validados em TCC" },
];

const PLATFORMS = [
  { icon: Youtube, label: "YouTube Shorts" },
  { icon: Music2, label: "TikTok" },
  { icon: Instagram, label: "Instagram Reels" },
];

export default function PlatformLogoBar() {
  return (
    <section className="py-10 md:py-14 border-y border-border bg-muted/30">
      <div className="container mx-auto max-w-6xl px-4">
        <p className="text-center text-xs uppercase tracking-[0.18em] text-foreground/60 mb-6 font-medium">
          Conformidade clínica · Publicação automática
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 md:gap-x-12">
          {BADGES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 text-foreground/70 transition-colors hover:text-foreground"
            >
              <Icon className="h-4 w-4 text-primary transition-transform duration-300 group-hover:scale-110" aria-hidden />
              <span className="text-sm font-medium">{label}</span>
            </div>
          ))}
          <div className="h-5 w-px bg-border hidden md:block" aria-hidden />
          {PLATFORMS.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 text-foreground/70 transition-colors hover:text-foreground"
            >
              <Icon className="h-4 w-4 text-accent" aria-hidden />
              <span className="text-sm font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

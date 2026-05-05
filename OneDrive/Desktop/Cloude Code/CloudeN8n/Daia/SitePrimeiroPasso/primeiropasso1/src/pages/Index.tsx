import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { DEMO_PROFESSIONAL } from "@/data/demoProfessional";
import ProfessionalLanding from "./ProfessionalLanding";
import LandingHeader from "@/components/landing/LandingHeader";
import HeroSection from "@/components/landing/HeroSection";
import PainSection from "@/components/landing/PainSection";
import SolutionSection from "@/components/landing/SolutionSection";
import AboutSection from "@/components/landing/AboutSection";
import ContentSection from "@/components/landing/ContentSection";
import LeadCaptureSection from "@/components/landing/LeadCaptureSection";
import LandingFooter from "@/components/landing/LandingFooter";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

function hexToHSL(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export default function Index() {
  const { data: professional, isLoading } = useQuery({
    queryKey: ["single-professional"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("slug")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const demoStyles = useMemo(() => {
    const styles: Record<string, string> = {};
    const contrastFg = (hslStr: string) => {
      const l = parseInt(hslStr.split(" ")[2]);
      return l > 55 ? "220 15% 10%" : "210 40% 98%";
    };
    const primaryHSL = hexToHSL(DEMO_PROFESSIONAL.primary_color);
    const secondaryHSL = hexToHSL(DEMO_PROFESSIONAL.secondary_color);
    const bgHSL = hexToHSL(DEMO_PROFESSIONAL.background_color);

    if (primaryHSL) {
      styles["--primary"] = primaryHSL;
      styles["--primary-foreground"] = contrastFg(primaryHSL);
      const parts = primaryHSL.split(" ");
      const h = parts[0];
      const s = parseInt(parts[1]);
      const l = parseInt(parts[2]);
      const accentHSL = `${h} ${Math.min(s + 6, 100)}% ${Math.max(l - 15, 10)}%`;
      styles["--accent"] = accentHSL;
      styles["--accent-foreground"] = contrastFg(accentHSL);
      styles["--ring"] = primaryHSL;
    }
    if (secondaryHSL) {
      styles["--secondary"] = secondaryHSL;
      styles["--secondary-foreground"] = contrastFg(secondaryHSL);
    }
    if (bgHSL) {
      styles["--background"] = bgHSL;
      const parts = bgHSL.split(" ");
      const h = parts[0];
      const s = parseInt(parts[1]);
      const l = parseInt(parts[2]);
      const cardHSL = `${h} ${Math.max(s - 5, 0)}% ${Math.min(l + 2, 100)}%`;
      styles["--card"] = cardHSL;
      styles["--popover"] = cardHSL;
      styles["--muted"] = `${h} ${Math.max(s - 10, 0)}% ${Math.max(l - 5, 0)}%`;
      styles["--border"] = `${h} ${Math.max(s - 10, 0)}% ${Math.max(l - 10, 0)}%`;
      styles["--input"] = `${h} ${Math.max(s - 10, 0)}% ${Math.max(l - 10, 0)}%`;
      const fgVal = l < 50
        ? `${h} ${Math.max(s - 15, 0)}% 90%`
        : `${h} ${Math.min(s + 10, 100)}% 15%`;
      const mutedFgVal = l < 50
        ? `${h} ${Math.max(s - 15, 0)}% 60%`
        : `${h} ${Math.max(s - 5, 0)}% 45%`;
      styles["--foreground"] = fgVal;
      styles["--card-foreground"] = fgVal;
      styles["--popover-foreground"] = fgVal;
      styles["--muted-foreground"] = mutedFgVal;
    }
    return styles;
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground font-serif text-lg">Carregando...</div>
      </div>
    );
  }

  // Real professional exists — render their landing page
  if (professional) {
    return <ProfessionalLanding slugOverride={professional.slug} />;
  }

  // No professional registered — show demo profile
  const demo = DEMO_PROFESSIONAL;

  return (
    <div className="min-h-screen bg-background" style={demoStyles as React.CSSProperties}>
      {/* Demo banner */}
      <div className="bg-primary text-primary-foreground text-center py-2.5 px-4 text-sm flex items-center justify-center gap-3 flex-wrap">
        <span className="flex items-center gap-1.5">
          <Info className="h-4 w-4" />
          Este é um perfil de demonstração
        </span>
        <Link to="/cadastro">
          <Button size="sm" variant="secondary" className="text-xs h-7">
            Cadastre-se como profissional
          </Button>
        </Link>
      </div>

      <LandingHeader
        professionalName={demo.full_name}
        whatsapp={demo.whatsapp}
        slug={demo.slug}
      />
      <HeroSection
        title={demo.hero_title}
        subtitle={demo.hero_subtitle}
        whatsapp={demo.whatsapp}
        photoUrl={demo.photo_url}
        heroImageUrl={demo.hero_image_url}
        slug={demo.slug}
        professionalName={demo.full_name}
        crp={demo.crp}
      />
      <PainSection />
      <SolutionSection />
      <AboutSection
        name={demo.full_name}
        bio={demo.bio}
        crp={demo.crp}
        photoUrl={demo.photo_url}
        aboutImageUrl={demo.about_image_url}
        approaches={demo.approaches}
      />
      <ContentSection articles={[]} videos={[]} slug={demo.slug} />
      <LeadCaptureSection slug={demo.slug} whatsapp={demo.whatsapp} />
      <LandingFooter professionalName={demo.full_name} whatsapp={demo.whatsapp} />
    </div>
  );
}

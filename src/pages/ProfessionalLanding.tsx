import { useParams } from "react-router-dom";
import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LandingHeader from "@/components/landing/LandingHeader";
import HeroSection from "@/components/landing/HeroSection";
import PainSection from "@/components/landing/PainSection";
import SolutionSection from "@/components/landing/SolutionSection";
import AboutSection from "@/components/landing/AboutSection";
import ContentSection from "@/components/landing/ContentSection";
import LeadCaptureSection from "@/components/landing/LeadCaptureSection";
import LandingFooter from "@/components/landing/LandingFooter";

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

export default function ProfessionalLanding({ slugOverride }: { slugOverride?: string }) {
  const { slug: paramSlug } = useParams<{ slug: string }>();
  const slug = slugOverride || paramSlug;
  const { data: professional, isLoading, error } = useQuery({
    queryKey: ["professional", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });


  const { data: articles = [] } = useQuery({
    queryKey: ["articles", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("articles")
        .select("id, title, slug, image_url, published_at")
        .eq("professional_id", professional!.id)
        .eq("published", true)
        .order("published_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const { data: videos = [] } = useQuery({
    queryKey: ["videos", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, title, description, embed_url")
        .eq("professional_id", professional!.id)
        .eq("published", true)
        .order("published_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const isDarkModeEnabled = !!(professional as any)?.dark_mode;
  const [dark, setDark] = useState(isDarkModeEnabled);
  const toggleDark = useCallback(() => setDark((d) => !d), []);

  const customStyles = useMemo(() => {
    if (!professional) return undefined;
    const prof = professional as any;
    const isDark = dark;
    const styles: Record<string, string> = {};

    const activePrimary = (isDark && prof.dark_primary_color) ? prof.dark_primary_color : professional.primary_color;
    const activeSecondary = (isDark && prof.dark_secondary_color) ? prof.dark_secondary_color : professional.secondary_color;
    const activeBg = (isDark && prof.dark_background_color) ? prof.dark_background_color : prof.background_color;

    const contrastFg = (hslStr: string) => {
      const l = parseInt(hslStr.split(" ")[2]);
      return l > 55 ? "220 15% 10%" : "210 40% 98%";
    };

    const primaryHSL = activePrimary ? hexToHSL(activePrimary) : null;
    const secondaryHSL = activeSecondary ? hexToHSL(activeSecondary) : null;
    const bgHSL = activeBg ? hexToHSL(activeBg) : null;
    const hasDarkCustomColors = isDark && (prof.dark_primary_color || prof.dark_secondary_color || prof.dark_background_color);

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

    if (bgHSL && (!isDark || hasDarkCustomColors)) {
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
    return Object.keys(styles).length > 0 ? styles : undefined;
  }, [professional, dark]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground font-serif text-lg">Carregando...</div>
      </div>
    );
  }

  if (error || !professional) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="font-serif text-3xl font-bold text-foreground">Profissional não encontrado</h1>
          <p className="text-muted-foreground">Verifique o endereço e tente novamente.</p>
        </div>
      </div>
    );
  }

  const name = (professional as any).full_name || "Profissional";

  return (
    <div className={`min-h-screen bg-background ${dark ? 'dark' : ''}`} style={customStyles as React.CSSProperties}>
      <LandingHeader
        professionalName={name}
        whatsapp={professional.whatsapp ?? undefined}
        logoUrl={professional.logo_url ?? undefined}
        slug={professional.slug}
        darkModeEnabled={isDarkModeEnabled}
        dark={dark}
        onToggleDark={toggleDark}
      />
      <HeroSection
        title={professional.hero_title ?? undefined}
        subtitle={professional.hero_subtitle ?? undefined}
        whatsapp={professional.whatsapp ?? undefined}
        photoUrl={professional.photo_url ?? undefined}
        heroImageUrl={professional.hero_image_url ?? undefined}
        slug={professional.slug}
        professionalName={name}
        crp={professional.crp ?? undefined}
        photoStyle={(professional as any).photo_style ?? "portrait"}
        photoFit={(professional as any).photo_fit ?? "contain"}
      />
      <PainSection
        title={(professional as any).pain_title ?? undefined}
        subtitle={(professional as any).pain_subtitle ?? undefined}
        items={(professional as any).pain_items ?? undefined}
      />
      <SolutionSection
        title={(professional as any).solution_title ?? undefined}
        subtitle={(professional as any).solution_subtitle ?? undefined}
        items={(professional as any).solution_items ?? undefined}
      />
      <AboutSection
        name={name}
        bio={professional.bio ?? undefined}
        crp={professional.crp ?? undefined}
        photoUrl={professional.photo_url ?? undefined}
        aboutImageUrl={professional.about_image_url ?? undefined}
        approaches={professional.approaches ?? undefined}
      />
      <ContentSection articles={articles} videos={videos} slug={professional.slug} />
      <LeadCaptureSection slug={professional.slug} whatsapp={professional.whatsapp ?? undefined} />
      <LandingFooter professionalName={name} whatsapp={professional.whatsapp ?? undefined} />
    </div>
  );
}
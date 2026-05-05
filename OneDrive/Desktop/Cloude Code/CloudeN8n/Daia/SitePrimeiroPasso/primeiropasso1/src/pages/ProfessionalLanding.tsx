import { useParams } from "react-router-dom";
import { useMemo, useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LandingHeader from "@/components/landing/LandingHeader";
import HeroSection from "@/components/landing/HeroSection";
import PainSection from "@/components/landing/PainSection";
import SolutionSection from "@/components/landing/SolutionSection";
import AboutSection from "@/components/landing/AboutSection";
import ContentSection from "@/components/landing/ContentSection";
import ContactSection from "@/components/landing/ContactSection";
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


  const { data: rawArticles = [] } = useQuery({
    queryKey: ["articles", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("articles")
        .select("id, title, slug, cover_image_url, published_at, created_at, published")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const articles = useMemo(() => {
    const pub = rawArticles
      .filter((a) => a.published)
      .sort((a, b) => new Date(b.published_at ?? b.created_at ?? 0).getTime() - new Date(a.published_at ?? a.created_at ?? 0).getTime())
      .slice(0, 3);
    if (pub.length > 0) return pub;
    return rawArticles
      .filter((a) => !a.published)
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      .slice(0, 3);
  }, [rawArticles]);

  const { data: rawVideos = [] } = useQuery({
    queryKey: ["videos", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, title, description, embed_url, thumbnail_url, published_at, created_at, published")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const videos = useMemo(() => {
    const pub = rawVideos
      .filter((v) => v.published)
      .sort((a, b) => new Date(b.published_at ?? b.created_at ?? 0).getTime() - new Date(a.published_at ?? a.created_at ?? 0).getTime())
      .slice(0, 3);
    if (pub.length > 0) return pub;
    return rawVideos
      .filter((v) => !v.published)
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      .slice(0, 3);
  }, [rawVideos]);

  const isDarkModeEnabled = !!(professional as any)?.dark_mode;
  const darkKey = `dark_${slug}`;
  const [dark, setDark] = useState(() => localStorage.getItem(`dark_${slug}`) === "1");
  const toggleDark = useCallback(() => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem(darkKey, next ? "1" : "0");
      return next;
    });
  }, [darkKey]);

  // Quando o profissional carrega pela primeira vez e não há preferência salva, usa o padrão do banco
  const darkInitialized = useRef(false);
  if (professional && !darkInitialized.current) {
    darkInitialized.current = true;
    if (localStorage.getItem(darkKey) === null) {
      setDark(!!(professional as any)?.dark_mode);
    }
  }

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
    const fontMap: Record<string, string> = {
      inter:        "Inter, system-ui, sans-serif",
      poppins:      "'Poppins', sans-serif",
      lato:         "'Lato', sans-serif",
      playfair:     "'Playfair Display', serif",
      merriweather: "'Merriweather', serif",
    };
    const sizeMap: Record<string, string> = { sm: "0.9", md: "1.0", lg: "1.1", xl: "1.2" };
    const ff = prof.font_family as string | undefined;
    const fs = prof.font_size_scale as string | undefined;
    if (ff && fontMap[ff]) styles["font-family"] = fontMap[ff];
    if (fs && sizeMap[fs]) styles["font-size"] = `${sizeMap[fs]}rem`;

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
        heroBgUrl={(professional as any).hero_bg_url ?? undefined}
        heroBgOpacity={(professional as any).hero_bg_opacity ?? 70}
        heroBgOverlay={(professional as any).hero_bg_overlay ?? "dark"}
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
      <ContentSection articles={articles} videos={videos} slug={professional.slug} whatsapp={professional.whatsapp} />
      <ContactSection
        title={(professional as any).contact_title ?? undefined}
        subtitle={(professional as any).contact_subtitle ?? undefined}
        whatsapp={professional.whatsapp ?? undefined}
        phone={(professional as any).phone ?? undefined}
        email={(professional as any).email ?? undefined}
        instagram={(professional as any).instagram ?? undefined}
      />
      <LandingFooter professionalName={name} whatsapp={professional.whatsapp ?? undefined} />
    </div>
  );
}
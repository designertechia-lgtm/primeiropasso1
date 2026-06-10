import { useParams, useSearchParams } from "react-router-dom";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
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
import { buildLandingVars, getFontScale, GOOGLE_FONTS_URL } from "@/lib/landing/buildLandingVars";

export default function ProfessionalLanding({ slugOverride }: { slugOverride?: string }) {
  const { slug: paramSlug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
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
    return buildLandingVars(professional as any, dark ? "dark" : "light");
  }, [professional, dark]);

  // "Tamanho do texto": escala o root font-size enquanto a landing está montada. É o único ponto que
  // afeta os utilitários text-* (rem) do Tailwind. Usa % para respeitar a preferência do navegador.
  const fontScaleKey = (professional as any)?.font_size_scale as string | undefined;
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.fontSize;
    html.style.fontSize = `${getFontScale(fontScaleKey) * 100}%`;
    return () => { html.style.fontSize = prev; };
  }, [fontScaleKey]);

  // Captura UTMs da URL para atribuição de tráfego pago.
  // Persiste em landing_visits quando o visitante clica no CTA do WhatsApp.
  const utmParams = useMemo(() => {
    const params: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const val = searchParams.get(key);
      if (val) params[key] = val;
    }
    return params;
  }, [searchParams]);
  const gclid = searchParams.get("gclid") ?? undefined;

  const handleCtaClick = useCallback(() => {
    if (!professional?.id) return;
    if (!Object.keys(utmParams).length && !gclid) return;
    // Fire-and-forget: registra a visita com atribuição UTM
    supabase
      .from("landing_visits")
      .insert({ professional_id: professional.id, utm: utmParams, gclid: gclid ?? null })
      .then(({ error }) => { if (error) console.warn("[landing_visits]", error.message); });
  }, [professional?.id, utmParams, gclid]);

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
      {/* Carrega as fontes que não vêm no index.html (mesmo set do preview do editor) */}
      <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
      <LandingHeader
        professionalName={name}
        whatsapp={professional.whatsapp ?? undefined}
        logoUrl={professional.logo_url ?? undefined}
        slug={professional.slug}
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
        title={(professional as any).about_title ?? undefined}
        name={name}
        bio={professional.bio ?? undefined}
        crp={professional.crp ?? undefined}
        photoUrl={professional.photo_url ?? undefined}
        aboutImageUrl={professional.about_image_url ?? undefined}
        aboutVideoUrl={(professional as any).about_video_url ?? undefined}
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
        linkedin={(professional as any).linkedin ?? undefined}
        tiktok={(professional as any).tiktok ?? undefined}
        facebook={(professional as any).facebook ?? undefined}
        onWhatsAppClick={handleCtaClick}
      />
      <LandingFooter professionalName={name} whatsapp={professional.whatsapp ?? undefined} />
    </div>
  );
}
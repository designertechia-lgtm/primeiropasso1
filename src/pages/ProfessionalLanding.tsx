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
import ProductsSection from "@/components/landing/ProductsSection";
import VillainSection from "@/components/landing/VillainSection";
import OfferSection from "@/components/landing/OfferSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import AudienceSection from "@/components/landing/AudienceSection";
import FaqSection from "@/components/landing/FaqSection";
import ContactSection from "@/components/landing/ContactSection";
import LandingFooter from "@/components/landing/LandingFooter";
import { buildLandingVars, getFontScale, GOOGLE_FONTS_URL } from "@/lib/landing/buildLandingVars";
import Section from "@/components/landing/Section";
import { zebraTone, orderContentSections } from "@/lib/landing/sections";

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

  // Produtos vendáveis (ebook/PDF, físico, serviço avulso) e serviços agendáveis — vitrine pública.
  // Tabela professional_products ainda não está no types.ts gerado → cast (padrão do projeto).
  const { data: products = [] } = useQuery({
    queryKey: ["products", professional?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("professional_products")
        .select("id, kind, title, description, description_full, price_brl, cover_image_url, external_url, active, sort_order")
        .eq("professional_id", professional!.id)
        .eq("active", true)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("professional_services")
        .select("id, name, description, price_brl:price, duration_minutes, cover_image_url, checkout_mode, active")
        .eq("professional_id", professional!.id)
        .eq("active", true);
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  // Depoimentos APROVADOS para a seção de prova social (tabela testimonials, ainda não no types.ts → cast).
  const { data: testimonials = [] } = useQuery({
    queryKey: ["testimonials", professional?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("testimonials")
        .select("id, author_name, author_context, text, rating")
        .eq("professional_id", professional!.id)
        .eq("status", "approved")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  // Dark mode da landing pública: DESATIVADO. O estado/toggle abaixo e o helper de cores
  // escuras ficam preservados; enquanto esta flag for false a landing renderiza SEMPRE em
  // modo Claro e o botão de tema não aparece no header. Para reativar, basta voltar a true.
  const DARK_MODE_ENABLED = false;

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

  // Tema efetivo da landing pública: enquanto o dark mode está desativado, fica sempre claro.
  const effectiveDark = DARK_MODE_ENABLED && dark;

  const customStyles = useMemo(() => {
    if (!professional) return undefined;
    return buildLandingVars(professional as any, effectiveDark ? "dark" : "light");
  }, [professional, effectiveDark]);

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

  // Código curto que liga este clique (com utm/gclid) ao lead que chega no WhatsApp.
  // O botão anexa "(ref: <code>)" na mensagem; o webhook lê e atribui a campanha ao lead.
  const campaignRef = useMemo(
    () => (Object.keys(utmParams).length || gclid ? Math.random().toString(36).slice(2, 8) : undefined),
    [utmParams, gclid],
  );

  const handleCtaClick = useCallback(() => {
    if (!professional?.id) return;
    if (!Object.keys(utmParams).length && !gclid) return;
    // Fire-and-forget: registra a visita com atribuição UTM + ref_code p/ casar no fluxo
    supabase
      .from("landing_visits")
      .insert({ professional_id: professional.id, utm: utmParams, gclid: gclid ?? null, ref_code: campaignRef ?? null })
      .then(({ error }) => { if (error) console.warn("[landing_visits]", error.message); });
  }, [professional?.id, utmParams, gclid, campaignRef]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground font-heading text-lg">Carregando...</div>
      </div>
    );
  }

  if (error || !professional) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="font-heading text-3xl font-bold text-foreground">Profissional não encontrado</h1>
          <p className="text-muted-foreground">Verifique o endereço e tente novamente.</p>
        </div>
      </div>
    );
  }

  const name = (professional as any).full_name || "Profissional";

  // ContentSection se esconde quando não há artigos/vídeos; guardamos a inclusão aqui também
  // para a zebra não criar uma faixa vazia e a alternância de fundo seguir certa.
  const hasContent = articles.length > 0 || videos.length > 0;
  // Mesma lógica para Produtos e Serviços: a seção só entra quando há algo para mostrar.
  const hasProducts = products.length > 0 || services.length > 0;

  // Seções novas (modelo Daiane): só entram quando o profissional preencheu / ativou —
  // assim ninguém em produção vê seção nova com texto padrão sem ter editado.
  const p = professional as any;
  const hasVillain = !!(p.villain_body || p.villain_title);
  const hasOffer = !!(p.offer_description || p.offer_title || (Array.isArray(p.offer_steps) && p.offer_steps.length > 0));
  const hasAudience = Array.isArray(p.audience_for) && p.audience_for.length > 0;
  const hasFaq = Array.isArray(p.faq_items) && p.faq_items.length > 0;
  const showTestimonials = !!p.testimonials_enabled; // liga/desliga explícito na aba Depoimentos

  // Seções de conteúdo entre o Hero e o Contato, como DADOS (mapa key → nó). O profissional pode
  // reordenar e ocultar (tier Grátis, Fase 1): section_order define a ordem, section_hidden remove.
  // A zebra alterna o fundo pela POSIÇÃO na lista já ordenada/filtrada (sem faixa vazia).
  // Hero e Contato têm tom próprio, fora da alternância. Ver _docs/PLANO_LANDING_PAGES.md.
  const sectionMeta: Record<string, { id?: string; clip?: boolean }> = {
    about: { id: "about", clip: false },
    content: { id: "content" },
    products: { id: "produtos" },
    villain: { id: "villain" },
    offer: { id: "oferta" },
    testimonials: { id: "depoimentos" },
    audience: { id: "para-quem" },
    faq: { id: "faq" },
  };
  const sectionNodes: Record<string, React.ReactNode> = {
    hero: (
      <HeroSection
        title={professional.hero_title ?? undefined}
        subtitle={professional.hero_subtitle ?? undefined}
        whatsapp={professional.whatsapp ?? undefined}
        ctaMessage={p.contact_cta_message ?? undefined}
        campaignRef={campaignRef}
        onWhatsAppClick={handleCtaClick}
        photoUrl={professional.photo_url ?? undefined}
        heroImageUrl={professional.hero_image_url ?? undefined}
        heroBgUrl={p.hero_bg_url ?? undefined}
        heroBgOpacity={p.hero_bg_opacity ?? 70}
        heroBgOverlay={p.hero_bg_overlay ?? "dark"}
        slug={professional.slug}
        professionalName={name}
        crp={professional.crp ?? undefined}
        photoStyle={p.photo_style ?? "portrait"}
        photoFit={p.photo_fit ?? "contain"}
      />
    ),
    pain: (
      <PainSection
        title={(professional as any).pain_title ?? undefined}
        subtitle={(professional as any).pain_subtitle ?? undefined}
        items={(professional as any).pain_items ?? undefined}
      />
    ),
    solution: (
      <SolutionSection
        title={(professional as any).solution_title ?? undefined}
        subtitle={(professional as any).solution_subtitle ?? undefined}
        items={(professional as any).solution_items ?? undefined}
      />
    ),
    about: (
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
    ),
    ...(hasVillain
      ? {
          villain: (
            <VillainSection
              title={p.villain_title ?? undefined}
              body={p.villain_body ?? undefined}
              imageUrl={p.villain_image_url ?? undefined}
            />
          ),
        }
      : {}),
    ...(hasOffer
      ? {
          offer: (
            <OfferSection
              title={p.offer_title ?? undefined}
              description={p.offer_description ?? undefined}
              steps={p.offer_steps ?? undefined}
              priceNote={p.offer_price_note ?? undefined}
              whatsapp={professional.whatsapp ?? undefined}
              ctaMessage={p.contact_cta_message ?? undefined}
              campaignRef={campaignRef}
              onWhatsAppClick={handleCtaClick}
            />
          ),
        }
      : {}),
    ...(showTestimonials
      ? {
          testimonials: (
            <TestimonialsSection
              title={p.testimonials_title ?? undefined}
              subtitle={p.testimonials_subtitle ?? undefined}
              testimonials={testimonials as any}
              professionalId={professional.id}
              professionalName={name}
            />
          ),
        }
      : {}),
    ...(hasAudience
      ? {
          audience: (
            <AudienceSection
              title={p.audience_title ?? undefined}
              forItems={p.audience_for ?? undefined}
              notForItems={p.audience_not_for ?? undefined}
            />
          ),
        }
      : {}),
    ...(hasFaq
      ? {
          faq: (
            <FaqSection
              title={p.faq_title ?? undefined}
              items={p.faq_items ?? undefined}
            />
          ),
        }
      : {}),
    ...(hasContent
      ? {
          content: (
            <ContentSection articles={articles} videos={videos} slug={professional.slug} whatsapp={professional.whatsapp} />
          ),
        }
      : {}),
    ...(hasProducts
      ? {
          products: (
            <ProductsSection
              products={products as any}
              services={services as any}
              slug={professional.slug}
              whatsapp={professional.whatsapp}
              professionalName={name}
              title={(professional as any).products_title ?? undefined}
              subtitle={(professional as any).products_subtitle ?? undefined}
            />
          ),
        }
      : {}),
  };
  const orderedKeys = orderContentSections(
    Object.keys(sectionNodes),
    (professional as any).section_order ?? undefined,
    (professional as any).section_hidden ?? undefined,
  );

  return (
    <div className={`min-h-screen bg-background ${effectiveDark ? 'dark' : ''}`} style={customStyles as React.CSSProperties}>
      {/* Carrega as fontes que não vêm no index.html (mesmo set do preview do editor) */}
      <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
      <LandingHeader
        professionalName={name}
        whatsapp={professional.whatsapp ?? undefined}
        ctaMessage={(professional as any).contact_cta_message ?? undefined}
        campaignRef={campaignRef}
        onWhatsAppClick={handleCtaClick}
        logoUrl={professional.logo_url ?? undefined}
        slug={professional.slug}
        dark={effectiveDark}
        onToggleDark={DARK_MODE_ENABLED ? toggleDark : undefined}
      />
      {(() => {
        let z = 0;
        return orderedKeys.map((key) => {
          // Hero renderiza "puro" (tem seu próprio <section> full-bleed) e fica fora da zebra.
          if (key === "hero") return <div key="hero">{sectionNodes.hero}</div>;
          const tone = zebraTone(z++);
          return (
            <Section key={key} id={sectionMeta[key]?.id} tone={tone} clip={sectionMeta[key]?.clip}>
              {sectionNodes[key]}
            </Section>
          );
        });
      })()}
      <Section id="contact" tone="accent">
        <ContactSection
          title={(professional as any).contact_title ?? undefined}
          subtitle={(professional as any).contact_subtitle ?? undefined}
          whatsapp={professional.whatsapp ?? undefined}
          ctaMessage={(professional as any).contact_cta_message ?? undefined}
          campaignRef={campaignRef}
          phone={(professional as any).phone ?? undefined}
          email={(professional as any).email ?? undefined}
          instagram={(professional as any).instagram ?? undefined}
          linkedin={(professional as any).linkedin ?? undefined}
          tiktok={(professional as any).tiktok ?? undefined}
          facebook={(professional as any).facebook ?? undefined}
          onWhatsAppClick={handleCtaClick}
        />
      </Section>
      <LandingFooter
        professionalName={name}
        whatsapp={professional.whatsapp ?? undefined}
        ctaMessage={(professional as any).contact_cta_message ?? undefined}
        campaignRef={campaignRef}
        onWhatsAppClick={handleCtaClick}
      />
    </div>
  );
}
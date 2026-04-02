import { useParams } from "react-router-dom";
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

  const { data: profile } = useQuery({
    queryKey: ["professional-profile", professional?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("user_id", professional!.user_id)
        .single();
      return data;
    },
    enabled: !!professional?.user_id,
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

  const name = profile?.full_name || "Profissional";

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader
        professionalName={name}
        whatsapp={professional.whatsapp ?? undefined}
        logoUrl={professional.logo_url ?? undefined}
        slug={professional.slug}
      />
      <HeroSection
        title={professional.hero_title ?? undefined}
        subtitle={professional.hero_subtitle ?? undefined}
        whatsapp={professional.whatsapp ?? undefined}
        photoUrl={professional.photo_url ?? undefined}
        heroImageUrl={(professional as any).hero_image_url ?? undefined}
        slug={professional.slug}
        professionalName={name}
        crp={professional.crp ?? undefined}
      />
      <PainSection />
      <SolutionSection />
      <AboutSection
        name={name}
        bio={professional.bio ?? undefined}
        crp={professional.crp ?? undefined}
        photoUrl={professional.photo_url ?? undefined}
        approaches={professional.approaches ?? undefined}
      />
      <ContentSection articles={articles} videos={videos} slug={professional.slug} />
      <LeadCaptureSection professionalId={professional.id} />
      <LandingFooter professionalName={name} whatsapp={professional.whatsapp ?? undefined} />
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HeroContent {
  badge_text: string;
  headline_before: string;
  headline_highlight: string;
  headline_after: string;
  subheadline: string;
  cta_primary_label: string;
  cta_primary_href: string;
  cta_secondary_label: string;
  cta_secondary_anchor: string;
  trust_badge_1: string;
  trust_badge_2: string;
  preview_quote: string;
  preview_tags: string[];
}

export const HERO_DEFAULTS: HeroContent = {
  badge_text: "Em conformidade com CFP e LGPD",
  headline_before: "Seu consultório com",
  headline_highlight: "presença digital e IA",
  headline_after: "que atende sozinha.",
  subheadline:
    "Vídeos com seu avatar, carrosséis, posts e artigos a partir de uma só ideia. Um agente no WhatsApp que conversa, negocia e agenda por você. Tudo personalizado para sua especialidade.",
  cta_primary_label: "Começar grátis",
  cta_primary_href: "/cadastro",
  cta_secondary_label: "Ver como funciona",
  cta_secondary_anchor: "#como-funciona",
  trust_badge_1: "Multi-IA: HeyGen, Kling, Veo",
  trust_badge_2: "Sem cartão de crédito",
  preview_quote: "Como reconhecer pensamentos automáticos em 30 segundos",
  preview_tags: ["TCC", "Ansiedade", "9:16"],
};

export function usePlatformHeroContent() {
  return useQuery({
    queryKey: ["platform-landing", "hero"],
    queryFn: async (): Promise<HeroContent> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("platform_landing_content")
        .select("data")
        .eq("section", "hero")
        .maybeSingle();
      if (error) throw error;
      return (data?.data ?? HERO_DEFAULTS) as HeroContent;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdatePlatformLandingSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ section, data }: { section: string; data: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("platform_landing_content")
        .upsert({
          section,
          data,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
    },
    onSuccess: (_v: unknown, { section }: { section: string; data: unknown }) => {
      qc.invalidateQueries({ queryKey: ["platform-landing", section] });
    },
  });
}

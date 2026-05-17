import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionPlan {
  id: string;
  name: string;
  monthly_price_brl: number;
  description: string;
  features: string[];
  cta_label: string;
  featured: boolean;
  badge: string | null;
  active: boolean;
  sort_order: number;
}

export const SUBSCRIPTION_PLANS_DEFAULTS: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Starter",
    monthly_price_brl: 97,
    description: "Landing, agenda e atendimento via agente WhatsApp.",
    features: [
      "Landing per-tenant + agenda",
      "Agente WhatsApp · 200 msgs/mês",
      "Artigos no blog (ilimitado)",
      "Templates da sua especialidade",
      "Biblioteca de ideias (50/mês)",
      "Pagamento via Pix",
    ],
    cta_label: "Começar Starter",
    featured: false,
    badge: null,
    active: true,
    sort_order: 1,
  },
  {
    id: "pro",
    name: "Pro",
    monthly_price_brl: 197,
    description: "Pipeline completo de vídeo, multi-formato e CRM.",
    features: [
      "Tudo do Starter +",
      "10 créditos de vídeo premium",
      "Multi-formato: vídeo + carrossel + post + blog",
      "Avatar real + voz clonada",
      "CRM Kanban completo",
      "Publica em YouTube, TikTok, Instagram, LinkedIn",
      "Biblioteca completa de ideias",
    ],
    cta_label: "Começar Pro",
    featured: true,
    badge: "Mais escolhido",
    active: true,
    sort_order: 2,
  },
  {
    id: "scale",
    name: "Scale",
    monthly_price_brl: 397,
    description: "Para quem quer escala, IAs premium e inteligência completa.",
    features: [
      "Tudo do Pro +",
      "30 créditos de vídeo premium",
      "Acesso a múltiplas IAs premium de vídeo",
      "Avatares fotorrealistas extras",
      "Analytics + sugestão de tópicos",
      "Resposta automática DMs/comentários",
      "Calendário editorial inteligente",
      "Suporte prioritário",
    ],
    cta_label: "Começar Scale",
    featured: false,
    badge: null,
    active: true,
    sort_order: 3,
  },
];

export function useSubscriptionPlans(includeInactive = false) {
  return useQuery({
    queryKey: ["subscription-plans", includeInactive],
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from("subscription_plans")
        .select("*")
        .order("sort_order", { ascending: true });
      if (!includeInactive) query = query.eq("active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row: SubscriptionPlan & { monthly_price_brl: number | string }) => ({
        ...row,
        monthly_price_brl: Number(row.monthly_price_brl),
      })) as SubscriptionPlan[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: Partial<SubscriptionPlan> & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("subscription_plans")
        .upsert({
          ...plan,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription-plans"] }),
  });
}

export function useDeleteSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("subscription_plans")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription-plans"] }),
  });
}

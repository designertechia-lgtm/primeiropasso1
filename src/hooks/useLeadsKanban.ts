import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useEffect, useMemo } from "react";

export type PipelineStage =
  | "novo"
  | "em_conversa"
  | "proposta_feita"
  | "agendado"
  | "cliente_ativo"
  | "inativo";

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  interest: string | null;
  pipeline_stage: PipelineStage;
  last_message_at: string | null;
  agent_enabled: boolean;
  origin_platform: string;
  created_at: string;
  professional_id: string;
  /** Informações coletadas pelo agente WhatsApp durante a conversa (chave→valor). */
  collected_info?: Record<string, string> | null;
  /** URL cacheada da foto de perfil do WhatsApp (obtida via Evolution API). */
  avatar_url?: string | null;
}

export const PIPELINE_COLUMNS: {
  id: PipelineStage;
  title: string;
  color: string;
  bgColor: string;
}[] = [
  { id: "novo", title: "Lead Novo", color: "bg-yellow-500", bgColor: "bg-yellow-50" },
  { id: "em_conversa", title: "Em Conversa", color: "bg-blue-500", bgColor: "bg-blue-50" },
  { id: "proposta_feita", title: "Proposta Feita", color: "bg-purple-500", bgColor: "bg-purple-50" },
  { id: "agendado", title: "Agendado", color: "bg-green-500", bgColor: "bg-green-50" },
  { id: "cliente_ativo", title: "Cliente Ativo", color: "bg-emerald-700", bgColor: "bg-emerald-50" },
  { id: "inativo", title: "Inativo", color: "bg-gray-400", bgColor: "bg-gray-50" },
];

interface Filters {
  period: "7d" | "30d" | "all";
  platform: "whatsapp" | "website" | "all";
}

export function useLeadsKanban(filters: Filters = { period: "all", platform: "all" }) {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["kanban-leads", professional?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (filters.platform !== "all") {
        query = query.eq("origin_platform", filters.platform);
      }

      if (filters.period !== "all") {
        const days = filters.period === "7d" ? 7 : 30;
        const since = new Date();
        since.setDate(since.getDate() - days);
        query = query.gte("created_at", since.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    enabled: !!professional?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  // Supabase Realtime subscription
  useEffect(() => {
    if (!professional?.id) return;

    const channel = supabase
      .channel("kanban-leads-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          filter: `professional_id=eq.${professional.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["kanban-leads"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [professional?.id, queryClient]);

  const grouped = useMemo(() => {
    const map: Record<PipelineStage, Lead[]> = {
      novo: [],
      em_conversa: [],
      proposta_feita: [],
      agendado: [],
      cliente_ativo: [],
      inativo: [],
    };
    for (const lead of leads) {
      const stage = (lead.pipeline_stage || "novo") as PipelineStage;
      if (map[stage]) map[stage].push(lead);
      else map.novo.push(lead);
    }
    return map;
  }, [leads]);

  return { leads, grouped, isLoading };
}

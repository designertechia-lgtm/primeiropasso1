import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Lead, PipelineStage } from "./useLeadsKanban";

export function useUpdateLeadStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      newStage,
    }: {
      leadId: string;
      newStage: PipelineStage;
    }) => {
      const { error } = await supabase
        .from("leads")
        .update({ pipeline_stage: newStage })
        .eq("id", leadId);
      if (error) throw error;
    },
    onMutate: async ({ leadId, newStage }) => {
      await queryClient.cancelQueries({ queryKey: ["kanban-leads"] });
      const prev = queryClient.getQueryData<Lead[]>(["kanban-leads"]);

      queryClient.setQueriesData<Lead[]>(
        { queryKey: ["kanban-leads"] },
        (old) =>
          old?.map((l) =>
            l.id === leadId ? { ...l, pipeline_stage: newStage } : l
          )
      );

      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueriesData({ queryKey: ["kanban-leads"] }, ctx.prev);
      }
      toast.error("Erro ao mover lead");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-leads"] });
    },
  });
}

export function useToggleAgentEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      enabled,
    }: {
      leadId: string;
      enabled: boolean;
    }) => {
      const { error } = await supabase
        .from("leads")
        .update({ agent_enabled: enabled })
        .eq("id", leadId);
      if (error) throw error;
    },
    onMutate: async ({ leadId, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ["kanban-leads"] });
      queryClient.setQueriesData<Lead[]>(
        { queryKey: ["kanban-leads"] },
        (old) =>
          old?.map((l) =>
            l.id === leadId ? { ...l, agent_enabled: enabled } : l
          )
      );
    },
    onError: () => {
      toast.error("Erro ao alterar agente");
      queryClient.invalidateQueries({ queryKey: ["kanban-leads"] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-leads"] });
    },
  });
}

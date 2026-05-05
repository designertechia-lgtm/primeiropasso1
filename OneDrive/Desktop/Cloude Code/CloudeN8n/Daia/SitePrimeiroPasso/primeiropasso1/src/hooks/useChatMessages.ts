import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface ChatMessage {
  id: string;
  lead_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export function useChatMessages(leadId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["chat-messages", leadId],
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
    enabled: !!leadId,
  });

  // Realtime: escutar novas mensagens
  useEffect(() => {
    if (!leadId) return;

    const channel = supabase
      .channel(`chat-messages-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["chat-messages", leadId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, queryClient]);

  return query;
}

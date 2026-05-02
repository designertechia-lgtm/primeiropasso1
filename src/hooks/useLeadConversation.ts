import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ChatMessage {
  type: "human" | "ai";
  content: string;
}

export function useLeadConversation(whatsapp: string | null) {
  const sessionId = whatsapp?.replace(/\D/g, "") ?? "";

  return useQuery({
    queryKey: ["lead-conversation", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("n8n_chat_histories")
        .select("*")
        .eq("session_id", sessionId)
        .order("id", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((row) => {
        const msg = row.message as { type?: string; data?: { content?: string } };
        return {
          type: (msg?.type === "ai" ? "ai" : "human") as "human" | "ai",
          content: msg?.data?.content ?? "",
        };
      });
    },
    enabled: !!sessionId,
  });
}

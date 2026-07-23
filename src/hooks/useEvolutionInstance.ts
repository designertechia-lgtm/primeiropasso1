import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EvolutionStatus = "open" | "close" | "connecting" | "not_created" | "unknown";

interface EvolutionResponse {
  status?: EvolutionStatus;
  instance_name?: string;
  number?: string;
  profile_name?: string;
  qrcode?: string;
  base64?: string;
  error?: string;
}

// opts.enabled: false desliga TODO o polling (status + QR) — usado quando o profissional
// está no canal cloud (a Cloud API não tem instância/QR; a action 'status' já responde
// 'open' pra esse canal, o que também pararia o refetch sozinho, mas nem chamar é melhor).
export function useEvolutionInstance(opts?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const enabled = opts?.enabled !== false;

  const statusQuery = useQuery({
    queryKey: ["evolution-status"],
    enabled,
    queryFn: async (): Promise<EvolutionResponse> => {
      const { data, error } = await supabase.functions.invoke("evolution-proxy", {
        body: { action: "status" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as EvolutionResponse;
    },
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      if (st === "connecting" || st === "close") return 5000;
      return false;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("evolution-proxy", {
        body: { action: "create" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as EvolutionResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evolution-status"] });
    },
  });

  const connectQuery = useQuery({
    queryKey: ["evolution-connect-qr"],
    queryFn: async (): Promise<EvolutionResponse> => {
      const { data, error } = await supabase.functions.invoke("evolution-proxy", {
        body: { action: "connect" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as EvolutionResponse;
    },
    enabled: enabled && (statusQuery.data?.status === "close" || statusQuery.data?.status === "connecting"),
    refetchInterval: 10000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("evolution-proxy", {
        body: { action: "logout" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evolution-status"] });
    },
  });

  return {
    status: statusQuery,
    connectQr: connectQuery,
    createInstance: createMutation,
    logoutInstance: logoutMutation,
  };
}
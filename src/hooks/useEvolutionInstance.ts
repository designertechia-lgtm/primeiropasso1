import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EvolutionStatus = "open" | "close" | "connecting" | "not_created" | "unknown";

interface EvolutionResponse {
  status?: EvolutionStatus;
  qrcode?: string;
  base64?: string;
  error?: string;
}

export function useEvolutionInstance() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["evolution-status"],
    queryFn: async (): Promise<EvolutionResponse> => {
      const { data, error } = await supabase.functions.invoke("evolution-proxy", {
        body: { action: "status" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as EvolutionResponse;
    },
    refetchInterval: (query) => {
      // Se não estiver criado, não precisa ficar chamando repetidamente,
      // se estiver connecting ou close (aguardando qrcode), chama a cada 5s
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
    // Só buscar o QR code se o status for de não conectado
    enabled: statusQuery.data?.status === "close" || statusQuery.data?.status === "connecting",
    refetchInterval: 10000, // Atualiza QR Code a cada 10s caso expire
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

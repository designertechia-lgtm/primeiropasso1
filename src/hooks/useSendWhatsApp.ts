import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SendWhatsAppParams {
  to: string;
  message: string;
}

interface SendWhatsAppResult {
  status: "sent";
  data?: unknown;
}

interface EvolutionStatusResponse {
  status?: "open" | "close" | "connecting" | "not_created" | "unknown";
  error?: string;
}

/**
 * Hook utilitário para enviar mensagens de WhatsApp via Evolution API.
 * Usa a Edge Function `evolution-proxy` com `action: "send"`.
 *
 * Regras (validadas no caller):
 * - Lead precisa ter WhatsApp preenchido
 * - Instância Evolution precisa estar `open`
 * - Agente IA precisa estar desligado (caller decide)
 */
export function useSendWhatsApp() {
  return useMutation({
    mutationFn: async ({ to, message }: SendWhatsAppParams): Promise<SendWhatsAppResult> => {
      const { data, error } = await supabase.functions.invoke("evolution-proxy", {
        body: { action: "send", to, message },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as SendWhatsAppResult;
    },
  });
}

/**
 * Hook para checar o status da instância Evolution.
 * Usado para evitar enviar mensagem se a instância não estiver conectada.
 *
 * @param professionalId - ID do profissional logado. Usado para queryKey único e enabled condicional.
 * @param enabled - Se deve buscar o status (default: true). Desative se não houver profissional.
 */
export function useEvolutionStatus(professionalId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["evolution-send-status", professionalId],
    enabled: enabled && !!professionalId,
    queryFn: async (): Promise<EvolutionStatusResponse> => {
      const { data, error } = await supabase.functions.invoke("evolution-proxy", {
        body: { action: "status" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as EvolutionStatusResponse;
    },
    staleTime: 30_000,
    retry: false,
    throwOnError: false,
  });
}
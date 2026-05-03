import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useProfessional() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["my-professional", user?.id],
    queryFn: async () => {
      // 1. Tentar buscar o profissional normalmente
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;

      // 2. Se já existe, retorna
      if (data) return data;

      // 3. Se não existe, chama a Edge Function para auto-criar (admin ou profissional sem perfil)
      const { data: ensureData, error: ensureError } = await supabase.functions.invoke(
        "ensure-professional",
        { body: {} }
      );

      if (ensureError) throw ensureError;
      if (ensureData?.error) throw new Error(ensureData.error);

      // 4. Se criou, buscar o registro atualizado
      if (ensureData?.professional) {
        const { data: freshData, error: freshError } = await supabase
          .from("professionals")
          .select("*")
          .eq("user_id", user!.id)
          .maybeSingle();
        if (freshError) throw freshError;
        return freshData;
      }

      return null;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutos de cache
  });
}

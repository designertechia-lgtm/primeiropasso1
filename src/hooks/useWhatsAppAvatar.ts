import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AvatarResult {
  pictureUrl: string | null;
  name: string | null;
}

/**
 * Hook para buscar e cachear a foto de perfil do WhatsApp de um lead.
 * Chama a Edge Function evolution-proxy com action "profile-picture".
 * O resultado é cacheado localmente no React Query por 24h e tenta salvar no banco.
 */
export function useWhatsAppAvatar(
  leadId?: string | null,
  whatsappNumber?: string | null,
  existingAvatarUrl?: string | null
) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["whatsapp-avatar", leadId, whatsappNumber],
    queryFn: async (): Promise<AvatarResult> => {
      // Se já tem URL cacheada no banco, retorna direto
      if (existingAvatarUrl && existingAvatarUrl.length > 5) {
        console.log("[WhatsAppAvatar] Usando URL cacheada do banco:", existingAvatarUrl);
        return { pictureUrl: existingAvatarUrl, name: null };
      }

      if (!whatsappNumber || !leadId) {
        console.log("[WhatsAppAvatar] Sem número ou leadId, pulando busca");
        return { pictureUrl: null, name: null };
      }

      // Verifica se já tem cache no React Query (evita chamada duplicada imediata)
      const cached = queryClient.getQueryData<AvatarResult>(["whatsapp-avatar", leadId, whatsappNumber]);
      if (cached?.pictureUrl) {
        console.log("[WhatsAppAvatar] Cache React Query hit:", cached.pictureUrl);
        return cached;
      }

      console.log("[WhatsAppAvatar] Buscando foto para:", whatsappNumber);

      try {
        const { data, error } = await supabase.functions.invoke("evolution-proxy", {
          body: { action: "profile-picture", number: whatsappNumber },
        });

        console.log("[WhatsAppAvatar] Resposta completa da edge:", data);

        if (error) {
          console.warn("[WhatsAppAvatar] Erro ao buscar foto:", error);
          return { pictureUrl: null, name: null };
        }

        // Exibe o objeto raw (retornado pela Evolution API) para diagnóstico
        const response = data as Record<string, any>;
        if (response?.raw) {
          console.log("[WhatsAppAvatar] 🔍 RAW da Evolution API:", JSON.stringify(response.raw, null, 2));
        }

        const pictureUrl = response?.pictureUrl || null;
        const name = response?.name || null;

        console.log("[WhatsAppAvatar] 📸 URL:", pictureUrl, "| 👤 Nome:", name);

        // Tenta cachear a URL no banco (ignora erro se a coluna não existir ainda)
        if (pictureUrl && leadId) {
          supabase
            .from("leads")
            .update({ avatar_url: pictureUrl } as any)
            .eq("id", leadId)
            .then(({ error: updateError }) => {
              if (updateError) {
                console.warn("[WhatsAppAvatar] Erro ao cachear avatar (coluna pode não existir ainda):", updateError.message);
              } else {
                console.log("[WhatsAppAvatar] URL cacheada no banco com sucesso");
              }
            });
        }

        return { pictureUrl, name };
      } catch (err) {
        console.warn("[WhatsAppAvatar] Falha ao buscar perfil:", err);
        return { pictureUrl: null, name: null };
      }
    },
    enabled: !!leadId && !!whatsappNumber,
    staleTime: 1000 * 60 * 60 * 24, // Cache por 24h no React Query
    retry: 1,
    retryDelay: 5000,
  });
}
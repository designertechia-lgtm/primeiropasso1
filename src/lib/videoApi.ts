import { supabase } from "@/integrations/supabase/client";

/**
 * Header Authorization com o JWT da sessão do Supabase, exigido pelas rotas do video-api
 * que debitam crédito / geram conteúdo pago (gerar-video, estudio-viral, criar/editar
 * institucional, gerar-imagens-ad). O worker valida o token e confirma que o slug pedido
 * pertence ao usuário logado — sem isso responde 401. Fecha o débito por slug público.
 */
export async function videoApiAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Sessão expirada — entre novamente para gerar.");
  return { Authorization: `Bearer ${token}` };
}

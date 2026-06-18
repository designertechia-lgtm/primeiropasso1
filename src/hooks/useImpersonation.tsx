// Impersonation por SESSÃO REAL: o super-admin (designertech) troca a própria
// sessão pela de um profissional para entrar no painel/Axel como ele.
//
// "Entrar": guarda a sessão atual (dev), pede os tokens do alvo à edge
// `impersonate-user` (guard de super-admin), aplica com setSession, LIMPA o cache
// e navega via router — SEM reload de página (o reload derrubava a sessão).
// "Voltar": restaura a sessão dev guardada (setSession); se falhar, faz logout.
//
// Sem banner: a presença do modo é sinalizada só por um botão discreto de voltar
// (ver ImpersonationExitButton), montado globalmente.
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ORIGIN_KEY = "pp-imp-origin"; // sessão do dev a restaurar
const ACTIVE_KEY = "pp-imp-active"; // { targetName, targetEmail }

interface ImpersonationState {
  targetName: string;
  targetEmail: string;
}

interface ImpersonationContextType {
  isImpersonating: boolean;
  target: ImpersonationState | null;
  isBusy: boolean;
  enterImpersonation: (targetUserId: string, fallbackName: string) => Promise<void>;
  exitImpersonation: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

function readActive(): ImpersonationState | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as ImpersonationState) : null;
  } catch {
    return null;
  }
}

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ImpersonationState | null>(() => readActive());
  const [isBusy, setIsBusy] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Mantém o estado sincronizado se outra aba mexer (sessionStorage é por aba,
  // mas isso cobre reidratação pós-reload).
  useEffect(() => {
    setTarget(readActive());
  }, []);

  const enterImpersonation = useCallback(async (targetUserId: string, fallbackName: string) => {
    setIsBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sessão não encontrada. Faça login novamente.");
        return;
      }
      // Guarda a sessão do dev ANTES de trocar.
      sessionStorage.setItem(
        ORIGIN_KEY,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          email: session.user.email,
        }),
      );

      const { data, error } = await supabase.functions.invoke("impersonate-user", {
        body: { target_user_id: targetUserId },
      });
      if (error || (data as { error?: string })?.error) {
        sessionStorage.removeItem(ORIGIN_KEY);
        toast.error((data as { error?: string })?.error || error?.message || "Falha ao entrar no painel");
        return;
      }

      const { access_token, refresh_token, email, target_name } = data as {
        access_token: string;
        refresh_token: string;
        email: string;
        target_name: string | null;
      };

      // setSession é determinístico — assume a sessão real do alvo sem o verifyOtp
      // client-side (que é frágil quando já há uma sessão ativa).
      const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token });
      if (sErr) {
        sessionStorage.removeItem(ORIGIN_KEY);
        toast.error(`Falha ao assumir a sessão: ${sErr.message}`);
        return;
      }

      const activeState = { targetName: target_name || fallbackName, targetEmail: email };
      sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(activeState));
      setTarget(activeState);
      // Sem reload: a sessão já trocou na memória. Limpa o cache (dados do dev) e
      // navega via router — o useAuth/react-query refazem tudo sob a nova identidade.
      queryClient.clear();
      navigate("/admin");
    } catch (e) {
      sessionStorage.removeItem(ORIGIN_KEY);
      toast.error(e instanceof Error ? e.message : "Erro ao entrar no painel");
    } finally {
      setIsBusy(false);
    }
  }, [navigate, queryClient]);

  const exitImpersonation = useCallback(async () => {
    setIsBusy(true);
    try {
      let restored = false;
      try {
        const raw = sessionStorage.getItem(ORIGIN_KEY);
        if (raw) {
          const origin = JSON.parse(raw) as { access_token: string; refresh_token: string };
          const { error } = await supabase.auth.setSession({
            access_token: origin.access_token,
            refresh_token: origin.refresh_token,
          });
          restored = !error;
        }
      } catch {
        restored = false;
      }

      sessionStorage.removeItem(ACTIVE_KEY);
      sessionStorage.removeItem(ORIGIN_KEY);
      setTarget(null);
      queryClient.clear();

      if (restored) {
        navigate("/admin-gerente?tab=workspaces");
      } else {
        // Não deu pra restaurar (token expirado): volta pelo login.
        await supabase.auth.signOut().catch(() => {});
        toast.message("Sua sessão expirou — entre de novo na sua conta.");
        navigate("/login");
      }
    } finally {
      setIsBusy(false);
    }
  }, [navigate, queryClient]);

  return (
    <ImpersonationContext.Provider
      value={{
        isImpersonating: !!target,
        target,
        isBusy,
        enterImpersonation,
        exitImpersonation,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) throw new Error("useImpersonation must be used within ImpersonationProvider");
  return ctx;
}

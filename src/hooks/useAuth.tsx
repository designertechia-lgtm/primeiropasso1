import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

// Contas de desenvolvedor (dono técnico) que enxergam ferramentas de manutenção
// exclusivas, como a aba "Workspaces". Diferente de isOwner/super-admin: outros
// super-admins (ex.: a Daiane) NÃO entram aqui.
const DEVELOPER_EMAILS = ["designertech.ia@gmail.com"];

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { id: string; full_name: string | null; avatar_url: string | null; phone: string | null } | null;
  roles: AppRole[];
  isLoading: boolean;
  isProfessional: boolean;
  isPatient: boolean;
  isOwner: boolean;
  isDeveloper: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_INIT_TIMEOUT_MS = 10000;

function clearSupabaseStorage() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sb-"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // localStorage pode estar indisponível (modo privado estrito); ignorar
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    const [profileRes, rolesRes, ownerRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url, phone").eq("user_id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.rpc("is_super_admin"),
    ]);
    if (profileRes.data) setProfile(profileRes.data);
    if (rolesRes.data) setRoles(rolesRes.data.map((r) => r.role));
    setIsOwner(ownerRes.data === true);
  };

  useEffect(() => {
    let mounted = true;
    let lastUserId: string | null = null;
    let initResolved = false;

    const resolveInit = () => {
      if (initResolved || !mounted) return;
      initResolved = true;
      setIsLoading(false);
    };

    // Backstop NÃO-destrutivo: se a inicialização demora (máquina/rede lenta
    // carregando perfil+papéis+RPC), apenas libera a UI — NUNCA derruba uma
    // sessão válida nem limpa o storage. Init lento não pode deslogar o usuário
    // a cada refresh. Corrupção REAL é tratada no erro do getSession e no
    // TOKEN_REFRESHED nulo (refresh falhou de verdade).
    const safetyTimer = window.setTimeout(() => {
      if (initResolved || !mounted) return;
      console.warn("[Auth] init demorou — liberando a UI sem derrubar a sessão");
      resolveInit();
    }, AUTH_INIT_TIMEOUT_MS);

    const handleSession = async (session: Session | null) => {
      if (!mounted) return;
      const newUserId = session?.user?.id ?? null;
      const userChanged = newUserId !== lastUserId;

      setSession(session);
      setUser(session?.user ?? null);

      if (!userChanged) {
        resolveInit();
        return;
      }
      lastUserId = newUserId;

      if (session?.user) {
        // Marca loading enquanto buscamos roles/profile para que consumers
        // (Login redirect, ProtectedRoute, etc) esperem antes de decidir rota.
        setIsLoading(true);
        initResolved = false;
        try {
          await fetchUserData(session.user.id);
        } catch (err) {
          console.error("[Auth] fetchUserData failed", err);
        } finally {
          resolveInit();
        }
      } else {
        setProfile(null);
        setRoles([]);
        setIsOwner(false);
        resolveInit();
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refresh falhou → JWT corrompido/expirado sem refresh válido.
      // Limpa storage para que o próximo refresh seja limpo.
      if (event === "TOKEN_REFRESHED" && !session) {
        clearSupabaseStorage();
      }
      void handleSession(session);
    });

    // Inicialização explícita: não dependemos apenas do INITIAL_SESSION do listener.
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error("[Auth] getSession error", error);
          clearSupabaseStorage();
          void handleSession(null);
          return;
        }
        void handleSession(data.session);
      })
      .catch((err) => {
        console.error("[Auth] getSession threw", err);
        clearSupabaseStorage();
        void handleSession(null);
      });

    return () => {
      mounted = false;
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[Auth] signOut error", err);
    }
    clearSupabaseStorage();
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setIsOwner(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        roles,
        isLoading,
        isProfessional: roles.includes("professional"),
        isPatient: roles.includes("patient"),
        isOwner,
        isDeveloper: !!user?.email && DEVELOPER_EMAILS.includes(user.email.toLowerCase()),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

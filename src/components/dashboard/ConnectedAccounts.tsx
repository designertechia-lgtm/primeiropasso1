import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Instagram, Facebook, Linkedin, AtSign, Link2, Unlink, Loader2, RefreshCw,
} from "lucide-react";

type Platform = "instagram" | "facebook" | "threads" | "linkedin";

interface SocialAccount {
  id: string;
  platform: Platform | string;
  account_name: string | null;
  expires_at: string | null;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  facebook:  "Facebook",
  threads:   "Threads",
  linkedin:  "LinkedIn",
};

export function ConnectedAccounts() {
  const { data: professional } = useProfessional();
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data: socialAccounts = [], refetch: refetchAccounts } = useQuery<SocialAccount[]>({
    queryKey: ["social-accounts", professional?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("social_accounts")
        .select("id, platform, account_name, expires_at")
        .eq("professional_id", professional!.id);
      return (data ?? []) as SocialAccount[];
    },
    enabled: !!professional?.id,
  });

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_SUCCESS") {
        const plat = event.data.platform as Platform;
        toast.success(`${PLATFORM_LABEL[plat] ?? plat} conectado com sucesso!`);
        refetchAccounts();
        setConnectingPlatform(null);
      } else if (event.data?.type === "OAUTH_ERROR") {
        toast.error("Erro ao conectar", { description: event.data.error ?? "Tente novamente." });
        setConnectingPlatform(null);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [refetchAccounts]);

  const connectPlatform = async (platform: Platform) => {
    if (!professional) return;
    setConnectingPlatform(platform);
    try {
      // Mantém compat com nome antigo "meta" no backend pro Instagram
      const body = { platform: platform === "instagram" ? "meta" : platform };
      const { data, error } = await supabase.functions.invoke("oauth-connect", { body });
      if (error || !data?.url) {
        toast.error("Erro ao iniciar autenticação", { description: error?.message });
        setConnectingPlatform(null);
        return;
      }
      const popup = window.open(data.url, "oauth-popup", "width=620,height=720,scrollbars=yes,resizable=yes");
      const check = setInterval(() => {
        if (popup?.closed) {
          clearInterval(check);
          setConnectingPlatform(null);
        }
      }, 1000);
    } catch {
      toast.error("Erro ao iniciar autenticação");
      setConnectingPlatform(null);
    }
  };

  const disconnectPlatform = async (id: string, name: string | null) => {
    if (!confirm(`Desconectar ${name ?? "esta conta"}?`)) return;
    const { error } = await (supabase as any).from("social_accounts").delete().eq("id", id);
    if (error) toast.error("Erro ao desconectar");
    else {
      toast.success("Conta desconectada");
      refetchAccounts();
    }
  };

  const refreshAllTokens = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("oauth-meta-refresh");
      if (error) throw error;
      const { refreshed, failed } = (data ?? {}) as { refreshed?: number; failed?: number };
      if ((refreshed ?? 0) > 0) toast.success(`${refreshed} conta(s) renovada(s).`);
      else if ((failed ?? 0) > 0) toast.error(`${failed} conta(s) falharam ao renovar.`);
      else toast.info("Nenhuma conta precisava de renovação no momento.");
      refetchAccounts();
    } catch (e: any) {
      toast.error("Erro ao renovar tokens", { description: e?.message });
    } finally {
      setRefreshing(false);
    }
  };

  const platforms: {
    platform: Platform;
    label: string;
    Icon: typeof Instagram;
    color: string;
    hint: string;
  }[] = [
    {
      platform: "instagram",
      label:    "Instagram",
      Icon:     Instagram,
      color:    "text-pink-500",
      hint:     "Faça login com sua conta Instagram Business ou Creator. Não precisa de Facebook.",
    },
    {
      platform: "facebook",
      label:    "Facebook (Página)",
      Icon:     Facebook,
      color:    "text-blue-600",
      hint:     "Conecte uma Página do Facebook que você administra.",
    },
    {
      platform: "threads",
      label:    "Threads",
      Icon:     AtSign,
      color:    "text-neutral-900 dark:text-neutral-100",
      hint:     "Faça login com sua conta Threads (a mesma do Instagram).",
    },
    {
      platform: "linkedin",
      label:    "LinkedIn",
      Icon:     Linkedin,
      color:    "text-blue-700",
      hint:     "Conecte seu perfil profissional para publicar artigos e vídeos.",
    },
  ];

  function daysUntil(expiresAt: string | null): number | null {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.round(ms / 86_400_000);
  }

  const anyExpiring = socialAccounts.some(
    (a) => a.expires_at && new Date(a.expires_at).getTime() < Date.now() + 14 * 86_400_000
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Contas Conectadas</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Conecte suas redes sociais para publicar conteúdo automaticamente a partir do painel.
          </p>
        </div>
        {anyExpiring && (
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAllTokens}
            disabled={refreshing}
            className="shrink-0"
          >
            {refreshing
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            }
            Renovar tokens
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {platforms.map(({ platform, label, Icon, color, hint }) => {
          const account = socialAccounts.find((a) => a.platform === platform);
          const isConnecting = connectingPlatform === platform;
          const days = daysUntil(account?.expires_at ?? null);
          const nearExpiry = days !== null && days <= 14;
          const expired    = days !== null && days <= 0;

          return (
            <div
              key={platform}
              className="flex items-center justify-between gap-4 rounded-lg border p-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  {account ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-green-600 font-medium">
                        {account.account_name ?? "Conectado"}
                      </span>
                      {days !== null && (
                        <Badge
                          variant="outline"
                          className={`text-xs py-0 ${
                            expired
                              ? "text-red-600 border-red-300"
                              : nearExpiry
                              ? "text-orange-600 border-orange-300"
                              : "text-muted-foreground border-muted"
                          }`}
                        >
                          {expired ? "Expirado" : `${days}d restantes`}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  )}
                </div>
              </div>

              {account ? (
                <div className="flex gap-2 shrink-0">
                  {nearExpiry && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => connectPlatform(platform)}
                      disabled={isConnecting}
                      title="Reconectar para renovar token"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Reconectar
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => disconnectPlatform(account.id, account.account_name)}
                  >
                    <Unlink className="h-3.5 w-3.5 mr-1.5" />
                    Desconectar
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="shrink-0"
                  disabled={isConnecting}
                  onClick={() => connectPlatform(platform)}
                >
                  {isConnecting
                    ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    : <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  }
                  {isConnecting ? "Aguardando..." : "Conectar"}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

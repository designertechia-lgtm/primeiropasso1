import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Instagram, Linkedin, Link2, Unlink, Loader2 } from "lucide-react";

interface SocialAccount {
  id: string;
  platform: string;
  account_name: string | null;
  expires_at: string | null;
}

export function ConnectedAccounts() {
  const { data: professional } = useProfessional();
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

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
        const label = event.data.platform === "instagram" ? "Instagram" : "LinkedIn";
        toast.success(`${label} conectado com sucesso!`);
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

  const connectPlatform = async (platform: string) => {
    if (!professional) return;
    setConnectingPlatform(platform);
    try {
      const { data, error } = await supabase.functions.invoke("oauth-connect", {
        body: { platform: platform === "instagram" ? "meta" : platform },
      });
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

  const platforms = [
    {
      platform: "instagram" as const,
      label: "Instagram",
      Icon: Instagram,
      color: "text-pink-500",
      hint: "Requer conta Business/Creator vinculada a uma Página do Facebook.",
    },
    {
      platform: "linkedin" as const,
      label: "LinkedIn",
      Icon: Linkedin,
      color: "text-blue-600",
      hint: "Conecte seu perfil profissional para publicar artigos e vídeos.",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contas Conectadas</CardTitle>
        <p className="text-sm text-muted-foreground">
          Conecte suas redes sociais para publicar conteúdo automaticamente a partir do painel.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {platforms.map(({ platform, label, Icon, color, hint }) => {
          const account = socialAccounts.find((a) => a.platform === platform);
          const isConnecting = connectingPlatform === platform;
          const nearExpiry = account?.expires_at
            ? new Date(account.expires_at) < new Date(Date.now() + 7 * 86_400_000)
            : false;

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
                      {nearExpiry && (
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 py-0">
                          Token expirando
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground truncate">{hint}</p>
                  )}
                </div>
              </div>

              {account ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => disconnectPlatform(account.id, account.account_name)}
                >
                  <Unlink className="h-3.5 w-3.5 mr-1.5" />
                  Desconectar
                </Button>
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

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEvolutionInstance } from "@/hooks/useEvolutionInstance";
import { Smartphone, QrCode, LogOut, Loader2, CheckCircle2, Cloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneIntl } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Canal Cloud API oficial: quando o profissional está na API oficial da Meta
// (whatsapp_channel='cloud', configurado pelo suporte), o dialog mostra o status
// da conexão oficial — não há QR nem instância pra manter.
function useCloudChannelStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["wa-cloud-status", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<{ channel: string; cloud: any } | null> => {
      const { data: pro } = await supabase
        .from("professionals" as any)
        .select("whatsapp_channel")
        .eq("user_id", user!.id)
        .maybeSingle();
      const channel = (pro as any)?.whatsapp_channel || "evolution";
      if (channel !== "cloud") return { channel, cloud: null };
      const { data: cloud } = await supabase.rpc("owner_whatsapp_cloud_status" as any);
      return { channel, cloud };
    },
    staleTime: 30_000,
  });
}

interface EvolutionConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function EvolutionConnectDialog({
  open,
  onOpenChange,
  trigger,
}: EvolutionConnectDialogProps) {
  const { status, connectQr, createInstance, logoutInstance } = useEvolutionInstance();
  const { toast } = useToast();
  const cloudStatus = useCloudChannelStatus();
  const isCloudChannel = cloudStatus.data?.channel === "cloud";

  const handleCreate = () => {
    createInstance.mutate(undefined, {
      onError: (err: any) => {
        toast({
          title: "Erro ao criar instância",
          description: err.message || "Tente novamente mais tarde.",
          variant: "destructive",
        });
      },
    });
  };

  const handleLogout = () => {
    logoutInstance.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Instância removida",
          description: "Instância deletada do Evolution e banco de dados. Você pode criar uma nova.",
        });
      },
    });
  };

  const currentStatus = status.data?.status;
  const instanceName = status.data?.instance_name;
  const connectedNumber = status.data?.number;
  const profileName = status.data?.profile_name;
  const isCreating = createInstance.isPending;
  const isLoggingOut = logoutInstance.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            {isCloudChannel ? "Conexão WhatsApp (API Oficial)" : "Conexão WhatsApp (Evolution)"}
          </DialogTitle>
          <DialogDescription>
            Conecte o seu número de WhatsApp para que o Agente IA possa responder os leads.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center p-6 space-y-6">
          {isCloudChannel ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="bg-green-100 p-4 rounded-full text-green-600">
                <Cloud className="h-10 w-10" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">WhatsApp Oficial ativo</h4>
                <p className="text-sm text-muted-foreground mt-2">
                  Seu número está conectado pela API oficial da Meta — sem QR Code, sem celular
                  ligado, sem risco de desconexão. O Agente IA responde por ela.
                </p>
              </div>
              {cloudStatus.data?.cloud?.display_number && (
                <div className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
                  <div className="rounded-lg bg-green-500/15 p-2 text-green-600">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <p className="text-base font-semibold text-foreground leading-tight">
                    {cloudStatus.data.cloud.display_number}
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Pra alterar essa conexão, fale com o suporte.
              </p>
            </div>
          ) : status.isLoading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Verificando status...</p>
            </div>
          ) : currentStatus === "not_created" || !currentStatus ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="bg-primary/10 p-4 rounded-full text-primary">
                <QrCode className="h-8 w-8" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">Nenhuma instância configurada</h4>
                <p className="text-sm text-muted-foreground">
                  Crie uma instância para gerar o QR Code de conexão.
                </p>
              </div>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...
                  </>
                ) : (
                  "Criar Conexão WhatsApp"
                )}
              </Button>
            </div>
          ) : currentStatus === "close" || currentStatus === "connecting" ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <h4 className="font-medium text-foreground">Leia o QR Code</h4>
              <p className="text-sm text-muted-foreground">
                Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e aponte a câmera para o QR Code abaixo.
              </p>
              
              <div className="bg-white p-4 rounded-xl shadow-sm border min-h-[250px] min-w-[250px] flex items-center justify-center">
                {connectQr.isLoading ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="text-sm">Gerando QR Code...</span>
                  </div>
                ) : connectQr.data?.base64 ? (
                  <img
                    src={connectQr.data.base64}
                    alt="WhatsApp QR Code"
                    className="w-full h-full object-contain rounded"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">QR Code não disponível. Tentando novamente...</div>
                )}
              </div>
            </div>
          ) : currentStatus === "open" ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="bg-green-100 p-4 rounded-full text-green-600">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">WhatsApp Conectado!</h4>
                <p className="text-sm text-muted-foreground mt-2">
                  Sua instância está ativa e o Agente IA já pode responder mensagens.
                </p>
              </div>

              {connectedNumber ? (
                <div className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
                  <div className="rounded-lg bg-green-500/15 p-2 text-green-600">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-base font-semibold text-foreground leading-tight">
                      {formatPhoneIntl(connectedNumber)}
                    </p>
                    {profileName && (
                      <p className="text-xs text-muted-foreground">{profileName}</p>
                    )}
                  </div>
                </div>
              ) : instanceName ? (
                <p className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
                  Instância: {instanceName}
                </p>
              ) : null}

              <Button
                variant="destructive"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="mt-2"
              >
                {isLoggingOut ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="mr-2 h-4 w-4" />
                )}
                Desconectar
              </Button>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Status desconhecido: {currentStatus}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
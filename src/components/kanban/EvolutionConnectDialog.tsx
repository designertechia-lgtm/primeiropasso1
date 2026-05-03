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
import { Smartphone, QrCode, LogOut, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
          title: "Desconectado",
          description: "Instância do WhatsApp desconectada com sucesso.",
        });
      },
    });
  };

  const currentStatus = status.data?.status;
  const isCreating = createInstance.isPending;
  const isLoggingOut = logoutInstance.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Conexão WhatsApp (Evolution)
          </DialogTitle>
          <DialogDescription>
            Conecte o seu número de WhatsApp para que o Agente IA possa responder os leads.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center p-6 space-y-6">
          {status.isLoading ? (
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
                <p className="text-sm text-muted-foreground">
                  Sua instância está ativa e o Agente IA já pode responder mensagens.
                </p>
              </div>
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

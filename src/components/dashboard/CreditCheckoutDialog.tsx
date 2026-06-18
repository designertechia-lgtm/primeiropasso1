import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ExternalLink, CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useCreatePixPayment } from "@/hooks/useBilling";

type Pack = { id: string; name: string; price_brl: number; credits: number; bonus_credits?: number | null };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pack: Pack | null;
  onManualFallback: () => void;
};

export function CreditCheckoutDialog({ open, onOpenChange, pack, onManualFallback }: Props) {
  const createPayment = useCreatePixPayment();
  const [cpf, setCpf] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  const close = () => {
    onOpenChange(false);
    setTimeout(() => { setCpf(""); setInvoiceUrl(null); }, 200);
  };

  const handlePay = async () => {
    if (!pack) return;
    try {
      const res = await createPayment.mutateAsync({
        kind: "credit_pack",
        reference_id: pack.id,
        provider: "asaas",
        cpfCnpj: cpf || undefined,
      });
      if (res.provider === "asaas") {
        setInvoiceUrl(res.invoiceUrl);
        window.open(res.invoiceUrl, "_blank", "noopener");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao gerar a cobrança";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recarga de créditos</DialogTitle>
          <DialogDescription>
            {pack
              ? `${pack.name} — ${pack.price_brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · ${pack.credits} créditos`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {invoiceUrl ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <p className="text-sm text-muted-foreground">
              Abrimos a página de pagamento. Pague por PIX, cartão ou boleto — os créditos entram
              automaticamente assim que o pagamento for confirmado.
            </p>
            <Button variant="outline" className="gap-2" onClick={() => window.open(invoiceUrl, "_blank", "noopener")}>
              <ExternalLink className="h-4 w-4" /> Abrir página de pagamento
            </Button>
            <Button onClick={close}>Fechar</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
              <Wallet className="h-4 w-4 text-primary" />
              Pague por PIX, cartão ou boleto na página segura do Asaas.
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="credit_cpf">CPF/CNPJ</Label>
              <Input id="credit_cpf" inputMode="numeric" placeholder="000.000.000-00"
                value={cpf} onChange={(e) => setCpf(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Necessário só na primeira compra (para emitir a cobrança).
              </p>
            </div>

            <Button className="w-full" disabled={createPayment.isPending} onClick={handlePay}>
              {createPayment.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Gerando cobrança…</>
              ) : (
                "Pagar agora"
              )}
            </Button>

            <button
              type="button"
              onClick={() => { close(); onManualFallback(); }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Prefiro pagar via PIX manual (enviar comprovante)
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

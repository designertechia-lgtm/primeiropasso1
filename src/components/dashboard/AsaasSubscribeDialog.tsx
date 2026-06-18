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
import { CreditCard, QrCode, Barcode, Loader2, CheckCircle2, ShieldCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useSubscribeAsaas, type SubscribeParams } from "@/hooks/useBilling";
import { useProfessional } from "@/hooks/useProfessional";

type Method = "CREDIT_CARD" | "PIX" | "BOLETO";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

const METHODS: { value: Method; label: string; icon: typeof CreditCard; hint: string }[] = [
  { value: "CREDIT_CARD", label: "Cartão", icon: CreditCard, hint: "Débito automático todo mês" },
  { value: "PIX", label: "PIX", icon: QrCode, hint: "Cobrança mensal — você paga a cada mês" },
  { value: "BOLETO", label: "Boleto", icon: Barcode, hint: "Cobrança mensal — você paga a cada mês" },
];

export function AsaasSubscribeDialog({ open, onOpenChange }: Props) {
  const { data: professional } = useProfessional();
  const subscribe = useSubscribeAsaas();

  const [method, setMethod] = useState<Method>("CREDIT_CARD");
  const [cpf, setCpf] = useState("");
  const [done, setDone] = useState<{ method: Method; invoiceUrl: string | null; last4?: string | null } | null>(null);

  // Cartão
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState(""); // MM/AA
  const [cardCcv, setCardCcv] = useState("");
  // Endereço do titular (exigido pelo Asaas no cartão)
  const [cep, setCep] = useState("");
  const [addrNumber, setAddrNumber] = useState("");
  const [phone, setPhone] = useState("");

  const reset = () => {
    setMethod("CREDIT_CARD"); setCpf(""); setDone(null);
    setCardName(""); setCardNumber(""); setCardExpiry(""); setCardCcv("");
    setCep(""); setAddrNumber(""); setPhone("");
  };

  const close = () => { onOpenChange(false); setTimeout(reset, 200); };

  const handleSubmit = async () => {
    if (!cpf.trim()) { toast.error("Informe o CPF/CNPJ do titular"); return; }

    const params: SubscribeParams = {
      billing_type: method,
      cpfCnpj: cpf,
      phone: phone || undefined,
    };

    if (method === "CREDIT_CARD") {
      const [mm, aa] = cardExpiry.split("/").map((s) => s.trim());
      if (!cardName || !cardNumber || !mm || !aa || !cardCcv) {
        toast.error("Preencha todos os dados do cartão");
        return;
      }
      if (!cep || !addrNumber) {
        toast.error("Informe CEP e número do endereço do titular");
        return;
      }
      params.creditCard = {
        holderName: cardName,
        number: cardNumber,
        expiryMonth: mm,
        expiryYear: aa.length === 2 ? `20${aa}` : aa,
        ccv: cardCcv,
      };
      params.holderInfo = {
        name: cardName,
        cpfCnpj: cpf,
        postalCode: cep,
        addressNumber: addrNumber,
        phone: phone || undefined,
      };
    }

    try {
      const res = await subscribe.mutateAsync(params);
      if (res.already) {
        toast.info("Você já possui uma assinatura ativa.");
        close();
        return;
      }
      setDone({ method, invoiceUrl: res.invoiceUrl, last4: res.card?.last4 });
      if (method !== "CREDIT_CARD" && res.invoiceUrl) {
        window.open(res.invoiceUrl, "_blank", "noopener");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ativar a assinatura");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar forma de pagamento</DialogTitle>
          <DialogDescription>Assinatura PrimeiroPasso — R$ 349/mês</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <div>
              <p className="text-lg font-semibold">
                {done.method === "CREDIT_CARD" ? "Assinatura ativada!" : "Assinatura criada!"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {done.method === "CREDIT_CARD"
                  ? `Cobranças automáticas no cartão final ${done.last4 ?? "••••"} todo mês.`
                  : "Abrimos a página de pagamento da primeira cobrança. Pague para liberar a assinatura."}
              </p>
            </div>
            {done.method !== "CREDIT_CARD" && done.invoiceUrl && (
              <Button variant="outline" onClick={() => window.open(done.invoiceUrl!, "_blank", "noopener")} className="gap-2">
                <ExternalLink className="h-4 w-4" /> Abrir página de pagamento
              </Button>
            )}
            <Button onClick={close}>Fechar</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Método */}
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const active = method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-colors ${
                      active ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground -mt-2">
              {METHODS.find((m) => m.value === method)?.hint}
            </p>

            {/* CPF/CNPJ do titular */}
            <div className="space-y-1.5">
              <Label htmlFor="sub_cpf">CPF/CNPJ do titular</Label>
              <Input id="sub_cpf" inputMode="numeric" placeholder="000.000.000-00"
                value={cpf} onChange={(e) => setCpf(e.target.value)} />
            </div>

            {method === "CREDIT_CARD" && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="card_name">Nome no cartão</Label>
                  <Input id="card_name" value={cardName} onChange={(e) => setCardName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card_number">Número do cartão</Label>
                  <Input id="card_number" inputMode="numeric" placeholder="0000 0000 0000 0000"
                    value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="card_exp">Validade (MM/AA)</Label>
                    <Input id="card_exp" placeholder="12/28" value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="card_ccv">CVV</Label>
                    <Input id="card_ccv" inputMode="numeric" placeholder="123" maxLength={4}
                      value={cardCcv} onChange={(e) => setCardCcv(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="card_cep">CEP do titular</Label>
                    <Input id="card_cep" inputMode="numeric" placeholder="00000-000"
                      value={cep} onChange={(e) => setCep(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="card_num">Número</Label>
                    <Input id="card_num" value={addrNumber} onChange={(e) => setAddrNumber(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card_phone">Telefone</Label>
                  <Input id="card_phone" inputMode="numeric" placeholder="(00) 00000-0000"
                    value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Dados processados com segurança pelo Asaas. Não armazenamos o número do cartão.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={close}>Cancelar</Button>
              <Button className="flex-1" disabled={subscribe.isPending} onClick={handleSubmit}>
                {subscribe.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processando…</>
                ) : method === "CREDIT_CARD" ? "Assinar com cartão" : "Gerar cobrança"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

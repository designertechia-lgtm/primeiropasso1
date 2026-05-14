import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Copy, CheckCircle2, Upload, Loader2, Clock, AlertCircle, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useCreatePixPayment, useSubmitPaymentProof } from "@/hooks/useBilling";
import { generatePixBrCode } from "@/lib/pixBrCode";

type PaymentData = {
  payment_id: string;
  amount_brl: number;
  kind: string;
  expires_at: string;
  pix: {
    pix_key: string;
    pix_key_type: string;
    beneficiary_name: string;
    bank_name: string;
    instructions: string | null;
  } | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "subscription_renewal" | "credit_pack";
  referenceId?: string;
  label: string;
  amountLabel: string;
};

const KEY_TYPE_LABEL: Record<string, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  phone: "Telefone",
  email: "E-mail",
  random: "Chave Aleatória",
};

export function PixCheckoutModal({ open, onOpenChange, kind, referenceId, label, amountLabel }: Props) {
  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [copied, setCopied] = useState(false);
  const [brCopied, setBrCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const brCode = payment?.pix
    ? generatePixBrCode({
        pixKey: payment.pix.pix_key,
        beneficiaryName: payment.pix.beneficiary_name,
        amount: payment.amount_brl,
        txId: payment.payment_id?.replace(/-/g, "").slice(0, 25) || "***",
      })
    : "";

  const copyBrCode = async () => {
    if (!brCode) return;
    try {
      await navigator.clipboard.writeText(brCode);
      setBrCopied(true);
      toast.success("Pix Copia-e-Cola copiado!");
      setTimeout(() => setBrCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const createPayment = useCreatePixPayment();
  const submitProof = useSubmitPaymentProof();

  const handleOpen = useCallback(async (isOpen: boolean) => {
    if (!isOpen) {
      onOpenChange(false);
      return;
    }
    if (!payment) {
      try {
        const data = await createPayment.mutateAsync({ kind, reference_id: referenceId });
        setPayment(data);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Erro ao criar pagamento");
        onOpenChange(false);
      }
    }
  }, [payment, createPayment, kind, referenceId, onOpenChange]);

  const copyKey = async () => {
    if (!payment?.pix?.pix_key) return;
    await navigator.clipboard.writeText(payment.pix.pix_key);
    setCopied(true);
    toast.success("Chave PIX copiada!");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = async () => {
    if (!file || !payment) return;
    try {
      await submitProof.mutateAsync({ paymentId: payment.payment_id, file });
      setSubmitted(true);
      toast.success("Comprovante enviado! Aguarde a validação.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar comprovante");
    }
  };

  const handleClose = () => {
    if (submitted) {
      setPayment(null);
      setFile(null);
      setSubmitted(false);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagamento via PIX</DialogTitle>
          <DialogDescription>{label} — {amountLabel}</DialogDescription>
        </DialogHeader>

        {createPayment.isPending && (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Gerando cobrança…</span>
          </div>
        )}

        {payment && !submitted && (
          <div className="space-y-4">
            {/* Amount + expiry */}
            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <div>
                <p className="text-xs text-muted-foreground">Valor</p>
                <p className="text-xl font-bold">
                  {payment.amount_brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                  <Clock className="h-3 w-3" /> Válido até
                </p>
                <p className="text-sm font-medium">
                  {new Date(payment.expires_at).toLocaleString("pt-BR", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            {/* QR Code + Pix Copia-e-Cola (com valor já embutido) */}
            {payment.pix ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <QrCode className="h-4 w-4 text-primary" />
                    Pague pelo QR Code
                  </span>
                  <Badge variant="outline" className="text-xs">
                    Valor já incluído
                  </Badge>
                </div>

                <div className="flex flex-col items-center gap-3 rounded-lg border bg-background p-4">
                  <div className="bg-white p-3 rounded-md border">
                    <QRCodeSVG value={brCode} size={180} level="M" includeMargin={false} />
                  </div>
                  <p className="text-xs text-center text-muted-foreground max-w-xs">
                    Abra o app do seu banco e escaneie. O valor de{" "}
                    <strong className="text-foreground">
                      {payment.amount_brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </strong>{" "}
                    já vem preenchido.
                  </p>
                </div>

                {/* Pix Copia-e-Cola */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Ou cole no seu app (Pix Copia-e-Cola):
                  </span>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                    <span className="flex-1 font-mono text-[11px] break-all leading-relaxed">
                      {brCode}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={copyBrCode}
                    >
                      {brCopied ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Chave PIX manual (fallback) */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                    Pagar manualmente com a chave PIX
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Chave</span>
                      <Badge variant="outline" className="text-[10px]">
                        {KEY_TYPE_LABEL[payment.pix.pix_key_type] ?? payment.pix.pix_key_type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                      <span className="flex-1 font-mono text-xs break-all">
                        {payment.pix.pix_key}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={copyKey}
                      >
                        {copied ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <p>
                        <span className="font-medium">Favorecido:</span>{" "}
                        {payment.pix.beneficiary_name}
                      </p>
                      <p>
                        <span className="font-medium">Banco:</span> {payment.pix.bank_name}
                      </p>
                      {payment.pix.instructions && (
                        <p className="mt-1 italic">{payment.pix.instructions}</p>
                      )}
                    </div>
                  </div>
                </details>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Chave PIX não configurada. Entre em contato com o suporte.</span>
              </div>
            )}

            <Separator />

            {/* Proof upload */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Enviar comprovante</p>
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                {file ? (
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Clique ou arraste o arquivo aqui</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG, WEBP ou PDF — máx. 10 MB</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleClose}>
                Fechar
              </Button>
              <Button
                className="flex-1"
                disabled={!file || submitProof.isPending}
                onClick={handleSubmit}
              >
                {submitProof.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando…</>
                ) : (
                  "Enviar Comprovante"
                )}
              </Button>
            </div>
          </div>
        )}

        {submitted && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <div>
              <p className="text-lg font-semibold">Comprovante enviado!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Seu pagamento será validado em até 24 horas úteis.
              </p>
            </div>
            <Button onClick={handleClose}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

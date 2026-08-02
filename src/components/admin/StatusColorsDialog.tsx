import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { readableTextColor } from "@/lib/agendaValidation";
import { AGENDA_PALETTES, detectarPalette, type AgendaPalette } from "@/lib/agendaPalettes";

interface StatusColorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULTS = {
  pending: "#3B82F6",   // azul
  confirmed: "#22C55E", // verde
  completed: "#EAB308", // amarelo
  cancelled: "#EF4444", // vermelho — só para registros antigos: cancelar agora exclui
  paymentPending: "#F97316",
  paymentPaid: "#10B981",
};

export default function StatusColorsDialog({ open, onOpenChange }: StatusColorsDialogProps) {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const [pending, setPending] = useState(DEFAULTS.pending);
  const [confirmed, setConfirmed] = useState(DEFAULTS.confirmed);
  const [completed, setCompleted] = useState(DEFAULTS.completed);
  const [cancelled, setCancelled] = useState(DEFAULTS.cancelled);
  const [paymentPending, setPaymentPending] = useState(DEFAULTS.paymentPending);
  const [paymentPaid, setPaymentPaid] = useState(DEFAULTS.paymentPaid);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  // Baseline para detectar alteração não salva (recarrega toda vez que o painel abre).
  const baselineRef = useRef<string | null>(null);
  const snapshot = JSON.stringify({ pending, confirmed, completed, cancelled, paymentPending, paymentPaid });
  const isDirty = baselineRef.current !== null && snapshot !== baselineRef.current;

  useEffect(() => {
    if (!open || !professional) return;
    const p = professional as any;
    const loaded = {
      pending: p.color_status_pending || DEFAULTS.pending,
      confirmed: p.color_status_confirmed || DEFAULTS.confirmed,
      completed: p.color_status_completed || DEFAULTS.completed,
      cancelled: p.color_status_cancelled || DEFAULTS.cancelled,
      paymentPending: p.color_payment_pending || DEFAULTS.paymentPending,
      paymentPaid: p.color_payment_paid || DEFAULTS.paymentPaid,
    };
    setPending(loaded.pending);
    setConfirmed(loaded.confirmed);
    setCompleted(loaded.completed);
    setCancelled(loaded.cancelled);
    setPaymentPending(loaded.paymentPending);
    setPaymentPaid(loaded.paymentPaid);
    baselineRef.current = JSON.stringify(loaded);
  }, [open, professional]);

  const handleSave = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase
      .from("professionals")
      .update({
        color_status_pending: pending,
        color_status_confirmed: confirmed,
        color_status_completed: completed,
        color_status_cancelled: cancelled,
        color_payment_pending: paymentPending,
        color_payment_paid: paymentPaid,
      } as any)
      .eq("id", professional.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success("Cores salvas!");
    baselineRef.current = snapshot;
    queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    onOpenChange(false);
  };

  // Ao tentar fechar com alteração pendente, pede confirmação em vez de descartar direto.
  const handleOpenChange = (next: boolean) => {
    if (!next && isDirty) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(next);
  };

  const STATUS_FIELDS = [
    { label: "Pendente", value: pending, set: setPending },
    { label: "Confirmado", value: confirmed, set: setConfirmed },
    { label: "Concluído", value: completed, set: setCompleted },
    { label: "Cancelado", value: cancelled, set: setCancelled },
  ];
  const PAYMENT_FIELDS = [
    { label: "Pgto Pendente", value: paymentPending, set: setPaymentPending },
    { label: "Pago", value: paymentPaid, set: setPaymentPaid },
  ];
  const PREVIEW = [
    { label: "Pendente", color: pending },
    { label: "Confirmado", color: confirmed },
    { label: "Concluído", color: completed },
    { label: "Cancelado", color: cancelled },
    { label: "Pgto Pendente", color: paymentPending },
    { label: "Pago", color: paymentPaid },
  ];

  const coresAtuais = { pending, confirmed, completed, cancelled, paymentPending, paymentPaid };
  const paletteAtual = detectarPalette(coresAtuais);

  const aplicarPalette = (p: AgendaPalette) => {
    setPending(p.cores.pending);
    setConfirmed(p.cores.confirmed);
    setCompleted(p.cores.completed);
    setCancelled(p.cores.cancelled);
    setPaymentPending(p.cores.paymentPending);
    setPaymentPaid(p.cores.paymentPaid);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cores dos Status</DialogTitle>
            <DialogDescription>
              Personalize as cores dos status de agendamento e pagamento na agenda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Paletas prontas. A escolha livre continua logo abaixo — isto é um
                atalho para quem só quer "mais forte" sem escolher seis cores. */}
            <div>
              <Label className="text-xs text-muted-foreground">Paletas prontas</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {AGENDA_PALETTES.map((p) => {
                  const ativa = paletteAtual === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => aplicarPalette(p)}
                      className={cn(
                        "rounded-lg border-2 p-2 text-left transition-all",
                        ativa ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {Object.values(p.cores).slice(0, 4).map((c) => (
                          <span key={c} className="h-4 w-4 rounded-full border border-black/10"
                            style={{ backgroundColor: c }} />
                        ))}
                        <span className="text-xs font-semibold ml-0.5">{p.nome}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{p.descricao}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {STATUS_FIELDS.map(({ label, value, set }) => (
                <div key={label} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={value} onChange={(e) => set(e.target.value)} className="h-8 w-8 rounded cursor-pointer border-0" />
                    <Input value={value} onChange={(e) => set(e.target.value)} className="flex-1 h-8 text-xs" />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-3">
              <Label className="text-xs text-muted-foreground">Pagamento</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                {PAYMENT_FIELDS.map(({ label, value, set }) => (
                  <div key={label} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={value} onChange={(e) => set(e.target.value)} className="h-8 w-8 rounded cursor-pointer border-0" />
                      <Input value={value} onChange={(e) => set(e.target.value)} className="flex-1 h-8 text-xs" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-3">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              {/* O texto do preview segue a MESMA regra de contraste da agenda
                  (readableTextColor). Antes era branco fixo, então o preview
                  mentia: mostrava branco onde o calendário desenharia escuro. */}
              <div className="flex gap-2 flex-wrap mt-2">
                {PREVIEW.map(({ label, color }) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: color, color: readableTextColor(color) }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? "Salvando..." : "Salvar cores"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription>
              Você mudou as cores e ainda não salvou. Se fechar agora, as alterações serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setConfirmClose(false)}>
              Continuar editando
            </Button>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => { setConfirmClose(false); onOpenChange(false); }}
            >
              Descartar e fechar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

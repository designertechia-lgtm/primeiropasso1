// ANCORA-DOC: feature "agenda" — confirmação de cancelamento com motivo.
//
// Um componente só para os dois lugares que cancelam (o calendário e a lista de
// agendamentos): eram dois AlertDialogs com o mesmo texto duplicado, e sem o
// motivo o profissional perdia justamente a informação que ele quer analisar
// depois. O motivo é OPCIONAL — quem está com pressa cancela e classifica na
// aba Cancelados, que é para onde este diálogo aponta.

import { useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CANCELLATION_REASONS } from "@/lib/cancellationReasons";

export interface CancellationReason {
  category: string | null;
  notes: string;
}

export function CancelAppointmentDialog({
  trigger,
  resumo,
  onConfirm,
}: {
  trigger: ReactNode;
  /** Data, horário e cliente — para a pessoa conferir o que está cancelando. */
  resumo?: ReactNode;
  onConfirm: (motivo: CancellationReason) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const confirmar = () => {
    onConfirm({ category, notes: notes.trim() });
    setCategory(null);
    setNotes("");
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) { setCategory(null); setNotes(""); }
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar este agendamento?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {resumo && <div className="text-foreground font-medium">{resumo}</div>}
              <p>
                O agendamento será <strong>removido da agenda</strong> e o horário volta a
                ficar livre. O registro fica guardado na aba <strong>Cancelados</strong>.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs text-muted-foreground">
              Motivo (opcional — dá para classificar depois)
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-1.5">
              {CANCELLATION_REASONS.map((r) => {
                const ativo = category === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    title={r.hint}
                    // Clicar de novo no motivo escolhido desmarca.
                    onClick={() => setCategory(ativo ? null : r.value)}
                    className={cn(
                      "rounded-lg border-2 px-2 py-1.5 text-xs transition-all text-left",
                      ativo ? "border-primary bg-primary/5 font-semibold" : "border-border hover:border-primary/40",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="truncate">{r.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Observação</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="O que aconteceu? (ajuda a lembrar depois)"
              rows={2}
              className="mt-1.5"
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={confirmar}
          >
            Cancelar agendamento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

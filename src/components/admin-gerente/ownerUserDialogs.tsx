// Diálogos de manutenção de conta reutilizados pelo super-admin/desenvolvedor.
// Usados na aba "Assinaturas" e na aba "Workspaces". Mantidos aqui para evitar
// duplicação — qualquer ajuste de comportamento vale para os dois lugares.
import { useState } from "react";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import {
  useOwnerGrantManualSubscription,
  useOwnerGrantCredits,
  useOwnerDeleteProfessional,
  type OwnerUserRow,
} from "@/hooks/useOwnerStats";
import { useCreditBalance } from "@/hooks/useBilling";
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
import { toast } from "sonner";

export function GrantSubscriptionDialog({
  user,
  open,
  onClose,
}: {
  user: OwnerUserRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const grant = useOwnerGrantManualSubscription();
  const [days, setDays] = useState(30);
  const [price, setPrice] = useState<string>("");

  const handleSubmit = async () => {
    if (!user) return;
    if (!days || days <= 0) {
      toast.error("Informe um número de dias positivo");
      return;
    }
    try {
      await grant.mutateAsync({
        professional_id: user.professional_id,
        days,
        monthly_price: price ? Number(price) : null,
      });
      toast.success(`${days} dias liberados para ${user.full_name ?? user.email}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao liberar acesso");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Liberar acesso manual</DialogTitle>
          <DialogDescription>
            {user ? (
              <>
                Concede ou estende a assinatura de <strong>{user.full_name ?? user.email}</strong>.
                Se já houver assinatura, os dias são somados ao período atual.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="grant_days">Dias de acesso</Label>
            <Input
              id="grant_days"
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
            <p className="text-[11px] text-muted-foreground">
              Sugestões: 7 (trial), 30 (mensal), 90 (trimestral), 365 (anual).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="grant_price">Preço mensal de referência (R$, opcional)</Label>
            <Input
              id="grant_price"
              type="number"
              step="0.01"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={user?.monthly_price_brl ? String(user.monthly_price_brl) : "0"}
            />
            <p className="text-[11px] text-muted-foreground">
              Aparece na contabilidade de MRR. Deixe vazio para manter o atual ou usar 0 (cortesia).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={grant.isPending}>
            {grant.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Liberar {days} dias
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GrantCreditsDialog({
  user,
  open,
  onClose,
}: {
  user: OwnerUserRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const grant = useOwnerGrantCredits();
  const { data: balance, isLoading: balanceLoading } = useCreditBalance(
    user?.professional_id ?? null,
  );
  const [amount, setAmount] = useState<number>(10);
  const [reason, setReason] = useState<string>("");

  const current = Number(balance?.balance ?? 0);
  const after = current + (Number.isFinite(amount) ? amount : 0);

  const handleSubmit = async () => {
    if (!user) return;
    if (!amount || amount <= 0) {
      toast.error("Informe um valor positivo");
      return;
    }
    try {
      await grant.mutateAsync({
        professional_id: user.professional_id,
        amount,
        reason: reason.trim() || null,
      });
      toast.success(`+${amount} créditos para ${user.full_name ?? user.email}`);
      setAmount(10);
      setReason("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar créditos");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar créditos de vídeo</DialogTitle>
          <DialogDescription>
            {user ? (
              <>
                Concede créditos para <strong>{user.full_name ?? user.email}</strong>{" "}
                consumir em gerações Premium ou PRO. 1 crédito = R$ 1 de saldo na plataforma.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Saldo atual</span>
              <span className="font-medium tabular-nums">
                {balanceLoading ? "…" : current.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-muted-foreground">Após a operação</span>
              <span className="font-medium tabular-nums text-emerald-600">
                {after.toLocaleString("pt-BR")}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="grant_credits">Quantidade de créditos</Label>
            <Input
              id="grant_credits"
              type="number"
              min={1}
              step="1"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-1.5">
              {[10, 30, 50, 100].map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setAmount(v)}
                >
                  {v}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sugestões: 10 (cortesia), 30 (tester), 50 (compensação), 100 (parceria).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="grant_reason">Motivo (opcional)</Label>
            <Input
              id="grant_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: tester beta, compensação por falha na geração…"
            />
            <p className="text-[11px] text-muted-foreground">
              Fica registrado no extrato (credit_ledger.description).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={grant.isPending}>
            {grant.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Adicionar {amount > 0 ? amount : ""} créditos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProfessionalDialog({
  user,
  open,
  onClose,
}: {
  user: OwnerUserRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const del = useOwnerDeleteProfessional();
  const [confirmText, setConfirmText] = useState("");

  // Reseta o campo ao trocar de usuário/fechar.
  const target = user?.email ?? "";
  const canDelete = confirmText.trim().toLowerCase() === target.toLowerCase() && target !== "";

  const handleClose = () => {
    setConfirmText("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!user || !canDelete) return;
    try {
      const res = await del.mutateAsync(user.professional_id);
      const pix = res?.deleted_pix_payments ?? 0;
      toast.success(
        `Conta de ${user.full_name ?? user.email} apagada definitivamente` +
          (pix > 0 ? ` (${pix} pagamento${pix !== 1 ? "s" : ""} PIX removido${pix !== 1 ? "s" : ""})` : ""),
      );
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao apagar profissional";
      const friendly =
        msg.includes("cannot_delete_self")
          ? "Você não pode apagar a própria conta."
          : msg.includes("cannot_delete_super_admin")
          ? "Este usuário tem acesso super-admin ativo. Revogue o acesso na aba Acesso antes de apagar."
          : msg.includes("professional_not_found")
          ? "Profissional não encontrado (talvez já tenha sido removido)."
          : msg;
      toast.error(friendly);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Apagar profissional definitivamente
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1">
              <p>
                Esta ação é <strong>irreversível</strong>. A conta de{" "}
                <strong>{user?.full_name ?? user?.email}</strong> e <strong>todos</strong> os dados
                vinculados serão apagados para sempre:
              </p>
              <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                <li>login (auth) e perfil profissional</li>
                <li>assinatura, créditos e histórico de pagamentos PIX</li>
                <li>leads, conversas, agendamentos e disponibilidade</li>
                <li>posts sociais, vídeos, artigos e memória do Axel</li>
              </ul>
              <p className="text-xs">
                Se a intenção é só suspender o acesso, use <strong>Cancelar assinatura</strong> (❌)
                em vez disto.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <Label htmlFor="confirm_delete">
            Para confirmar, digite o e-mail{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{target}</code>
          </Label>
          <Input
            id="confirm_delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={target}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!canDelete || del.isPending}>
            {del.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Apagar definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

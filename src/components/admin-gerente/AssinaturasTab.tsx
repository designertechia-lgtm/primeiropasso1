import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Users,
  Gift,
  XCircle,
  Search,
  RefreshCw,
  Coins,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  useOwnerListAllUsers,
  useOwnerGrantManualSubscription,
  useOwnerCancelSubscription,
  useOwnerGrantCredits,
  useOwnerDeleteProfessional,
  useOwnerSetBillingExempt,
  type OwnerUserRow,
} from "@/hooks/useOwnerStats";
import { useCreditBalance } from "@/hooks/useBilling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

const PAYMENT_METHOD_SHORT: Record<string, string> = {
  credit_card: "Cartão",
  pix: "PIX",
  boleto: "Boleto",
};
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

function statusBadge(row: OwnerUserRow) {
  if (row.cancelled_at) {
    return <Badge variant="outline" className="text-muted-foreground">Cancelada</Badge>;
  }
  if (!row.current_period_end) {
    return <Badge variant="outline" className="text-muted-foreground">Sem assinatura</Badge>;
  }
  const days = row.days_until_expiry ?? 0;
  if (days < 0) return <Badge variant="destructive">Vencida há {Math.abs(days)}d</Badge>;
  if (days === 0) return <Badge className="bg-amber-500 hover:bg-amber-500">Vence hoje</Badge>;
  if (days <= 5) return <Badge className="bg-amber-500 hover:bg-amber-500">{days}d restantes</Badge>;
  return <Badge className="bg-emerald-500 hover:bg-emerald-500">{days}d ativos</Badge>;
}

function GrantSubscriptionDialog({
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

function GrantCreditsDialog({
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

function DeleteProfessionalDialog({
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

export default function AssinaturasTab() {
  const { data, isLoading } = useOwnerListAllUsers();
  const cancel = useOwnerCancelSubscription();
  const setExempt = useOwnerSetBillingExempt();
  const [search, setSearch] = useState("");
  const [grantUser, setGrantUser] = useState<OwnerUserRow | null>(null);
  const [creditUser, setCreditUser] = useState<OwnerUserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<OwnerUserRow | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q) ||
        (u.slug ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const handleCancel = async (u: OwnerUserRow) => {
    if (!confirm(`Cancelar assinatura de ${u.full_name ?? u.email}?`)) return;
    try {
      const affected = await cancel.mutateAsync(u.professional_id);
      if (affected > 0) toast.success("Assinatura cancelada");
      else toast.info("Nenhuma assinatura ativa para cancelar");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar");
    }
  };

  const handleToggleExempt = async (u: OwnerUserRow, next: boolean) => {
    try {
      await setExempt.mutateAsync({ professional_id: u.professional_id, exempt: next });
      toast.success(
        next
          ? `${u.full_name ?? u.email} agora está em cortesia (isento de cobrança)`
          : `Cobrança reativada para ${u.full_name ?? u.email}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar cobrança");
    }
  };

  const totalAuto = (data ?? []).filter((u) => u.auto_renew).length;
  const totalActive = (data ?? []).filter(
    (u) => !u.cancelled_at && u.current_period_end && (u.days_until_expiry ?? -1) >= 0,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl text-foreground">Assinaturas & Acessos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Libere acesso manual com prazo definido (cortesia, parceria, trial estendido) ou cancele
          assinaturas. {totalActive > 0 && (
            <span>
              <strong>{totalActive}</strong> ativa{totalActive !== 1 && "s"}
              {totalAuto > 0 && (
                <>, <strong>{totalAuto}</strong> com auto-renovação</>
              )}
              .
            </span>
          )}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Profissionais cadastrados
            </CardTitle>
            <CardDescription>
              Coluna <strong>Cobrança</strong>: ligue para isentar (cortesia) — desligado, a mensalidade é cobrada.
              🎁 libera X dias de assinatura sem PIX. 💰 adiciona créditos de vídeo. ❌ cancela. 🗑️ apaga a conta.
            </CardDescription>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por email, nome ou slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {search ? "Nenhum usuário encontrado." : "Nenhum profissional cadastrado ainda."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cobrança</TableHead>
                    <TableHead className="text-right">R$/mês</TableHead>
                    <TableHead>Vence em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{u.full_name ?? "—"}</span>
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.slug ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {statusBadge(u)}
                          {u.auto_renew && (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 text-[10px] px-1.5 py-0 gap-1"
                              title="Renovação automática ativa"
                            >
                              <RefreshCw className="h-2.5 w-2.5" /> Auto
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={u.billing_exempt}
                            disabled={setExempt.isPending}
                            onCheckedChange={(v) => handleToggleExempt(u, v)}
                            title="Cortesia: isenta este profissional da cobrança"
                          />
                          {u.billing_exempt ? (
                            <span className="text-xs text-blue-600 dark:text-blue-400">Cortesia</span>
                          ) : u.payment_method ? (
                            <Badge variant="outline" className="text-[10px]">
                              {PAYMENT_METHOD_SHORT[u.payment_method] ?? u.payment_method}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Cobrando</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {u.monthly_price_brl != null
                          ? Number(u.monthly_price_brl).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.current_period_end
                          ? new Date(u.current_period_end).toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setGrantUser(u)}
                          title="Liberar dias de assinatura (sem PIX)"
                        >
                          <Gift className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCreditUser(u)}
                          title="Adicionar créditos de vídeo"
                        >
                          <Coins className="h-4 w-4 text-amber-600" />
                        </Button>
                        {!u.cancelled_at && u.current_period_end && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(u)}
                            title="Cancelar assinatura"
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteUser(u)}
                          title="Apagar profissional definitivamente"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <GrantSubscriptionDialog
        user={grantUser}
        open={!!grantUser}
        onClose={() => setGrantUser(null)}
      />

      <GrantCreditsDialog
        user={creditUser}
        open={!!creditUser}
        onClose={() => setCreditUser(null)}
      />

      <DeleteProfessionalDialog
        user={deleteUser}
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
      />
    </div>
  );
}

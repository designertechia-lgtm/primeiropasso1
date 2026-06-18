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
} from "lucide-react";
import {
  useOwnerListAllUsers,
  useOwnerCancelSubscription,
  useOwnerSetBillingExempt,
  type OwnerUserRow,
} from "@/hooks/useOwnerStats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  GrantSubscriptionDialog,
  GrantCreditsDialog,
  DeleteProfessionalDialog,
} from "./ownerUserDialogs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const PAYMENT_METHOD_SHORT: Record<string, string> = {
  credit_card: "Cartão",
  pix: "PIX",
  boleto: "Boleto",
};

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

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Loader2,
  Users,
  UserCheck,
  UserX,
  Crown,
  Download,
  Gift,
  XCircle,
  Search,
} from "lucide-react";
import {
  useOwnerUserGrowth,
  useOwnerActivationFunnel,
  useOwnerUserSegments,
  useOwnerListAllUsers,
  useOwnerGrantManualSubscription,
  useOwnerCancelSubscription,
  type OwnerUserRow,
} from "@/hooks/useOwnerStats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { exportToCsv } from "@/lib/exportUtils";

const SEGMENT_LABELS: Record<string, string> = {
  heavy:    "Ativos (7d)",
  medio:    "Médio (30d)",
  dormente: "Dormente",
};

const SEGMENT_COLORS: Record<string, string> = {
  heavy:    "hsl(142 70% 45%)",
  medio:    "hsl(38 92% 50%)",
  dormente: "hsl(220 9% 46%)",
};

const weekLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "short", day: "2-digit" });
};

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <Icon className={`h-8 w-8 ${color ?? "text-primary"}`} />
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-52 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function UsuariosTab() {
  const growth   = useOwnerUserGrowth(12);
  const funnel   = useOwnerActivationFunnel();
  const segments = useOwnerUserSegments();

  const segmentData = useMemo(
    () =>
      (segments.data ?? []).map((s) => ({
        ...s,
        label: SEGMENT_LABELS[s.segment] ?? s.segment,
        color: SEGMENT_COLORS[s.segment] ?? "hsl(280 70% 60%)",
      })),
    [segments.data],
  );

  const totalUsers    = segmentData.reduce((acc, s) => acc + Number(s.user_count), 0);
  const heavyCount    = Number(segmentData.find((s) => s.segment === "heavy")?.user_count    ?? 0);
  const medioCount    = Number(segmentData.find((s) => s.segment === "medio")?.user_count    ?? 0);
  const dormenteCount = Number(segmentData.find((s) => s.segment === "dormente")?.user_count ?? 0);

  const funnelMax  = Number(funnel.data?.[0]?.user_count ?? 1) || 1;
  const funnelData = useMemo(
    () =>
      (funnel.data ?? []).map((f) => ({
        ...f,
        pct: Math.round((Number(f.user_count) / funnelMax) * 100),
      })),
    [funnel.data, funnelMax],
  );

  const growthData = useMemo(
    () => (growth.data ?? []).map((g) => ({ ...g, week: weekLabel(g.week_start) })),
    [growth.data],
  );

  const tooltipStyle = {
    contentStyle: {
      background: "hsl(var(--card))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 8,
    },
    labelStyle: { color: "hsl(var(--foreground))" },
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2"
          onClick={() => {
            const dataToExport = growth.data?.map(g => ({
              Data: g.week_start,
              Novos: g.new_total,
              Acumulado: g.cumulative_total
            })) || [];
            exportToCsv(dataToExport, "crescimento_usuarios");
          }}
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total cadastrados"  value={totalUsers}    icon={Users}      />
        <KpiCard title="Ativos (7 dias)"    value={heavyCount}    icon={UserCheck}  color="text-green-500" />
        <KpiCard title="Médio (30 dias)"    value={medioCount}    icon={Crown}      color="text-amber-500" />
        <KpiCard title="Dormentes (>30d)"   value={dormenteCount} icon={UserX}      color="text-muted-foreground" />
      </div>

      {/* Crescimento + Segmentação */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crescimento semanal</CardTitle>
          </CardHeader>
          <CardContent>
            {growth.isLoading ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={growthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="new_total"
                    name="Novos"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative_total"
                    name="Acumulado"
                    stroke="hsl(142 70% 45%)"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 2"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Segmentação de uso</CardTitle>
          </CardHeader>
          <CardContent>
            {segments.isLoading ? (
              <ChartSkeleton />
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={segmentData}
                      dataKey="user_count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                    >
                      {segmentData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle.contentStyle}
                      formatter={(value: number, name: string) => [value, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3">
                  {segmentData.map((s) => (
                    <div key={s.segment} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                        <span className="text-muted-foreground">{s.label}</span>
                      </div>
                      <span className="font-semibold">{Number(s.user_count).toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                  {segmentData.length === 0 && (
                    <p className="text-sm text-muted-foreground">Sem dados de login ainda.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gerenciamento manual de usuários */}
      <GerenciarUsuariosCard />

      {/* Funil de ativação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funil de ativação</CardTitle>
        </CardHeader>
        <CardContent>
          {funnel.isLoading ? (
            <ChartSkeleton />
          ) : (
            <div className="space-y-4">
              {funnelData.map((f) => (
                <div key={f.step} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{f.step}</span>
                    <span className="font-semibold">
                      {Number(f.user_count).toLocaleString("pt-BR")}
                      <span className="ml-1 text-xs text-muted-foreground">({f.pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${f.pct}%` }}
                    />
                  </div>
                </div>
              ))}
              {funnelData.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem dados disponíveis.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Gerenciamento manual de usuários ───────────────────────────────────────

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

function GerenciarUsuariosCard() {
  const { data, isLoading } = useOwnerListAllUsers();
  const cancel = useOwnerCancelSubscription();
  const [search, setSearch] = useState("");
  const [grantUser, setGrantUser] = useState<OwnerUserRow | null>(null);

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

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Gerenciar usuários
            </CardTitle>
            <CardDescription>
              Lista todos os profissionais. Libere acesso manual com prazo definido (sem PIX) ou
              cancele assinaturas ativas.
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
                      <TableCell>{statusBadge(u)}</TableCell>
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
                          title="Liberar acesso manual"
                        >
                          <Gift className="h-4 w-4 text-emerald-600" />
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
    </>
  );
}

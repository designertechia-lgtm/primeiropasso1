import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Users, AlertTriangle, MessageCircle, Loader2 } from "lucide-react";
import {
  useOwnerMrr,
  useOwnerOverdueSubscribers,
  useOwnerSubscriptionStatus,
  type OverdueSubscriber,
} from "@/hooks/useOwnerStats";

const PERIODS = [
  { label: "Últimos 3 meses", value: 3 },
  { label: "Últimos 6 meses", value: 6 },
  { label: "Últimos 12 meses", value: 12 },
];

const STATUS_LABEL: Record<string, string> = {
  on_time: "Em dia",
  late: "Atrasados (até 5 dias)",
  overdue: "Vencidos",
  cancelled: "Cancelados",
  trial: "Em trial",
  no_period: "Sem período definido",
};

const STATUS_COLOR: Record<string, string> = {
  on_time: "hsl(142 70% 45%)",
  late: "hsl(38 92% 50%)",
  overdue: "hsl(0 84% 60%)",
  cancelled: "hsl(220 9% 46%)",
  trial: "hsl(199 89% 48%)",
  no_period: "hsl(280 70% 60%)",
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const monthLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
};

function buildWhatsappLink(sub: OverdueSubscriber): string | null {
  const raw = (sub.whatsapp ?? sub.phone ?? "").replace(/\D/g, "");
  if (!raw) return null;
  const number = raw.length <= 11 ? `55${raw}` : raw;
  const name = sub.full_name?.split(" ")[0] ?? "";
  const msg = `Olá ${name}, notamos que sua assinatura do PrimeiroPasso está em atraso há ${sub.days_overdue} dia(s). Posso te ajudar a regularizar?`;
  return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
}

export default function ReceitaTab() {
  const [months, setMonths] = useState(12);

  const mrrQuery = useOwnerMrr(months);
  const statusQuery = useOwnerSubscriptionStatus(5);
  const overdueQuery = useOwnerOverdueSubscribers(0);

  const mrrData = useMemo(
    () =>
      (mrrQuery.data ?? []).map((p) => ({
        month: monthLabel(p.month_start),
        mrr: Number(p.mrr_brl),
        active: p.active_count,
      })),
    [mrrQuery.data],
  );

  const statusData = useMemo(
    () =>
      (statusQuery.data ?? []).map((b) => ({
        bucket: b.status,
        label: STATUS_LABEL[b.status] ?? b.status,
        count: b.count,
        total: Number(b.total_brl),
      })),
    [statusQuery.data],
  );

  const currentMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;
  const previousMrr = mrrData.length > 1 ? mrrData[mrrData.length - 2].mrr : 0;
  const mrrDelta = previousMrr > 0 ? ((currentMrr - previousMrr) / previousMrr) * 100 : 0;
  const activeCount = mrrData.length > 0 ? mrrData[mrrData.length - 1].active : 0;
  const overdueCount = (overdueQuery.data ?? []).length;
  const overdueTotal = (overdueQuery.data ?? []).reduce((s, x) => s + Number(x.monthly_price_brl), 0);

  const isLoading = mrrQuery.isLoading || statusQuery.isLoading || overdueQuery.isLoading;
  const error = mrrQuery.error || statusQuery.error || overdueQuery.error;

  if (error) {
    const msg = error instanceof Error ? error.message : "Erro ao carregar dados";
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-6 text-sm text-destructive">
          Não foi possível carregar dados de receita: {msg}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-foreground">Receita</h2>
          <p className="text-sm text-muted-foreground">
            MRR, status das assinaturas e inadimplência em tempo real.
          </p>
        </div>
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={String(p.value)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MRR atual</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{brl(currentMrr)}</div>
            {mrrData.length > 1 && (
              <p className={`text-xs ${mrrDelta >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {mrrDelta >= 0 ? "+" : ""}
                {mrrDelta.toFixed(1)}% vs mês anterior
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assinantes ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{activeCount}</div>
            <p className="text-xs text-muted-foreground">no mês atual</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inadimplentes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{overdueCount}</div>
            <p className="text-xs text-muted-foreground">{brl(overdueTotal)} em risco</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">MRR mensal</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-[260px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={mrrData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => brl(Number(v))} width={80} />
                <Tooltip
                  formatter={(v: number) => brl(Number(v))}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Line type="monotone" dataKey="mrr" stroke="hsl(142 70% 45%)" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status das assinaturas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-[220px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : statusData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma assinatura registrada ainda.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: number, _n, item) => {
                    const total = (item.payload as { total: number }).total;
                    return [`${v} (${brl(total)})`, "Assinaturas"];
                  }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {statusData.map((entry) => (
                    <Bar
                      key={entry.bucket}
                      dataKey="count"
                      fill={STATUS_COLOR[entry.bucket] ?? "hsl(var(--primary))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assinantes em atraso</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-[160px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : overdueCount === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum assinante em atraso. 🎉
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead className="text-right">Mensalidade</TableHead>
                  <TableHead className="text-right">Dias em atraso</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(overdueQuery.data ?? []).map((s) => {
                  const wa = buildWhatsappLink(s);
                  return (
                    <TableRow key={s.professional_id}>
                      <TableCell>
                        <div className="font-medium">{s.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{s.email ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.whatsapp ?? s.phone ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">{brl(Number(s.monthly_price_brl))}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            s.days_overdue > 5
                              ? "font-semibold text-destructive"
                              : "font-medium text-amber-600"
                          }
                        >
                          {s.days_overdue}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {wa ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={wa} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">sem contato</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

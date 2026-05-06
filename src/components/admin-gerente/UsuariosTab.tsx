import { useMemo } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, UserCheck, UserX, Crown } from "lucide-react";
import {
  useOwnerUserGrowth,
  useOwnerActivationFunnel,
  useOwnerUserSegments,
} from "@/hooks/useOwnerStats";

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

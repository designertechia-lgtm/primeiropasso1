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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, UserCheck, UserX, Crown, Download } from "lucide-react";
import {
  useOwnerUserGrowth,
  useOwnerActivationFunnel,
  useOwnerUserSegments,
  useOwnerLlmUsage,
  USD_BRL,
} from "@/hooks/useOwnerStats";
import { Button } from "@/components/ui/button";
import { exportToCsv } from "@/lib/exportUtils";

const SEGMENT_LABELS: Record<string, string> = {
  heavy:    "Ativos (7d)",
  medio:    "Médio (30d)",
  dormente: "Dormente",
};

const SEGMENT_COLORS: Record<string, string> = {
  heavy:    "hsl(var(--primary))",   // verde do tema (ativo = positivo)
  medio:    "hsl(38 92% 50%)",       // ambar (atencao)
  dormente: "hsl(220 9% 46%)",       // cinza (neutro/inativo)
};

const weekLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "short", day: "2-digit" });
};

// Tokens em formato compacto (12,3 mil) — o número exato fica no title da célula.
const fmtTokens = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const fmtBrl = (v: number) =>
  v > 0 && v < 0.01 ? "< R$ 0,01" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtUso = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—";

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

// Consumo de IA por usuário (llm_usage): tokens por origem, custo em R$ e % da
// mensalidade — pra acompanhar quanto cada assinatura consome de LLM.
function LlmUsageCard() {
  const [daysBack, setDaysBack] = useState(30);
  const usage = useOwnerLlmUsage(daysBack);

  const rows = usage.data ?? [];
  const totalBrl = rows.reduce((acc, r) => acc + Number(r.total_cost_usd) * USD_BRL, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Consumo de IA por usuário</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{fmtBrl(totalBrl)}</span>
            </span>
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                variant={daysBack === d ? "default" : "outline"}
                size="sm"
                onClick={() => setDaysBack(d)}
              >
                {d}d
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                exportToCsv(
                  rows.map((r) => ({
                    Nome: r.full_name ?? "",
                    Email: r.email ?? "",
                    "Tokens Axel Web": Number(r.web_input_tokens) + Number(r.web_output_tokens),
                    "Tokens Axel WhatsApp": Number(r.wpp_input_tokens) + Number(r.wpp_output_tokens),
                    "Tokens Geradores": Number(r.gen_input_tokens) + Number(r.gen_output_tokens),
                    Chamadas: Number(r.web_calls) + Number(r.wpp_calls) + Number(r.gen_calls),
                    "Custo USD": Number(r.total_cost_usd),
                    "Custo BRL": Number(r.total_cost_usd) * USD_BRL,
                    "Mensalidade BRL": r.monthly_price_brl ?? "",
                    "Último uso": r.last_used_at ?? "",
                  })),
                  `consumo_ia_${daysBack}d`,
                )
              }
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {usage.isLoading ? (
          <ChartSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Axel Web</TableHead>
                  <TableHead className="text-right">Axel WhatsApp</TableHead>
                  <TableHead className="text-right">Geradores</TableHead>
                  <TableHead className="text-right">Chamadas</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">% da mensalidade</TableHead>
                  <TableHead className="text-right">Último uso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const webTok = Number(r.web_input_tokens) + Number(r.web_output_tokens);
                  const wppTok = Number(r.wpp_input_tokens) + Number(r.wpp_output_tokens);
                  const genTok = Number(r.gen_input_tokens) + Number(r.gen_output_tokens);
                  const calls = Number(r.web_calls) + Number(r.wpp_calls) + Number(r.gen_calls);
                  const custoBrl = Number(r.total_cost_usd) * USD_BRL;
                  const mensalidade = Number(r.monthly_price_brl ?? 0);
                  const pct = mensalidade > 0 ? (custoBrl / mensalidade) * 100 : null;
                  return (
                    <TableRow key={r.professional_id}>
                      <TableCell className="font-medium">{r.full_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums" title={`${webTok.toLocaleString("pt-BR")} tokens`}>
                        {webTok > 0 ? fmtTokens.format(webTok) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums" title={`${wppTok.toLocaleString("pt-BR")} tokens`}>
                        {wppTok > 0 ? fmtTokens.format(wppTok) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums" title={`${genTok.toLocaleString("pt-BR")} tokens`}>
                        {genTok > 0 ? fmtTokens.format(genTok) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{calls.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right tabular-nums" title={`US$ ${Number(r.total_cost_usd).toFixed(4)}`}>
                        {fmtBrl(custoBrl)}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : pct >= 20 ? (
                          <Badge className="bg-amber-500 text-white hover:bg-amber-500">{pct.toFixed(1)}%</Badge>
                        ) : (
                          <span className="tabular-nums">{pct < 0.1 ? "< 0,1%" : `${pct.toFixed(1)}%`}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtUso(r.last_used_at)}</TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      Sem consumo registrado no período. A medição começou em 11/07/2026 — interações
                      anteriores não têm como ser contabilizadas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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
        <KpiCard title="Total cadastrados"  value={totalUsers}    icon={Users}      color="text-primary" />
        <KpiCard title="Ativos (7 dias)"    value={heavyCount}    icon={UserCheck}  color="text-primary" />
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
                    stroke="hsl(var(--secondary))"
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

      {/* Consumo de IA por usuário (tokens + custo vs mensalidade) */}
      <LlmUsageCard />
    </div>
  );
}


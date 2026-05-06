import { useMemo } from "react";
import {
  Bar,
  BarChart,
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
import { Loader2 } from "lucide-react";
import {
  useOwnerPostsPerWeek,
  useOwnerPostTypeBreakdown,
  useOwnerTopActiveUsers,
  useOwnerCreditsByService,
} from "@/hooks/useOwnerStats";

const TYPE_LABELS: Record<string, string> = {
  reels:    "Reels",
  feed:     "Feed",
  carousel: "Carrossel",
  outros:   "Outros",
};

const TYPE_COLORS: Record<string, string> = {
  reels:    "hsl(199 89% 48%)",
  feed:     "hsl(280 70% 60%)",
  carousel: "hsl(142 70% 45%)",
  outros:   "hsl(220 9% 46%)",
};

const SERVICE_LABELS: Record<string, string> = {
  video_generation: "Vídeo IA",
  video_trim:       "Trim vídeo",
  image_generation: "Imagem IA",
  outros:           "Outros",
};

const weekLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "short", day: "2-digit" });
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

function ChartSkeleton() {
  return (
    <div className="flex h-52 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
  },
  labelStyle: { color: "hsl(var(--foreground))" },
};

export default function EngajamentoTab() {
  const postsWeek       = useOwnerPostsPerWeek(8);
  const postTypes       = useOwnerPostTypeBreakdown();
  const topUsers        = useOwnerTopActiveUsers(10);
  const creditsByService = useOwnerCreditsByService();

  const postsData = useMemo(
    () => (postsWeek.data ?? []).map((p) => ({ ...p, week: weekLabel(p.week_start) })),
    [postsWeek.data],
  );

  const typeData = useMemo(
    () =>
      (postTypes.data ?? []).map((t) => ({
        ...t,
        label: TYPE_LABELS[t.post_type] ?? t.post_type,
        color: TYPE_COLORS[t.post_type] ?? "hsl(220 9% 46%)",
      })),
    [postTypes.data],
  );

  const creditsData = useMemo(
    () =>
      (creditsByService.data ?? []).slice(0, 6).map((c) => ({
        ...c,
        label: SERVICE_LABELS[c.service_key] ?? c.service_key,
      })),
    [creditsByService.data],
  );

  return (
    <div className="space-y-6">
      {/* Posts por semana */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posts publicados por semana</CardTitle>
        </CardHeader>
        <CardContent>
          {postsWeek.isLoading ? (
            <ChartSkeleton />
          ) : postsData.length === 0 ? (
            <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
              Nenhum post publicado ainda.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={postsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="total_count"
                  name="Total"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="reels_count"
                  name="Reels"
                  stroke="hsl(199 89% 48%)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="carousel_count"
                  name="Carrossel"
                  stroke="hsl(142 70% 45%)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tipo de post + Créditos por serviço */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            {postTypes.isLoading ? (
              <ChartSkeleton />
            ) : typeData.length === 0 ? (
              <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                Sem posts publicados.
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={typeData}
                      dataKey="post_count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                    >
                      {typeData.map((entry, i) => (
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
                  {typeData.map((t) => (
                    <div key={t.post_type} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                        <span className="text-muted-foreground">{t.label}</span>
                      </div>
                      <span className="font-semibold">{Number(t.post_count).toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Créditos consumidos por serviço</CardTitle>
          </CardHeader>
          <CardContent>
            {creditsByService.isLoading ? (
              <ChartSkeleton />
            ) : creditsData.length === 0 ? (
              <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                Nenhum consumo registrado.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={creditsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip {...tooltipStyle} />
                  <Bar
                    dataKey="total_consumed"
                    name="Créditos"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top 10 usuários */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 usuários mais ativos</CardTitle>
        </CardHeader>
        <CardContent>
          {topUsers.isLoading ? (
            <ChartSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Posts</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Última ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topUsers.data ?? []).map((u, i) => (
                    <TableRow key={u.professional_id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(u.post_count).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{Number(u.lead_count).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {fmtDate(u.last_active_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(topUsers.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Nenhum dado encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

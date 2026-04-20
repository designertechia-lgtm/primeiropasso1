import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Video, Users, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import { format, subMonths, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo } from "react";

const leadsChartConfig: ChartConfig = {
  leads: { label: "Leads", color: "hsl(var(--primary))" },
};

const appointmentsChartConfig: ChartConfig = {
  confirmed: { label: "Confirmado", color: "hsl(142 76% 36%)" },
  pending: { label: "Pendente", color: "hsl(48 96% 53%)" },
  cancelled: { label: "Cancelado", color: "hsl(0 84% 60%)" },
};

function getMonthLabels() {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = subMonths(new Date(), i);
    months.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM", { locale: ptBR }),
    });
  }
  return months;
}

export default function AdminDashboard() {
  const { data: professional, isLoading } = useProfessional();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", professional?.id],
    queryFn: async () => {
      const [articles, videos, leads] = await Promise.all([
        supabase.from("articles").select("id", { count: "exact", head: true }).eq("professional_id", professional!.id),
        supabase.from("videos").select("id", { count: "exact", head: true }).eq("professional_id", professional!.id),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("professional_id", professional!.id),
      ]);
      return {
        articles: articles.count ?? 0,
        videos: videos.count ?? 0,
        leads: leads.count ?? 0,
      };
    },
    enabled: !!professional?.id,
  });

  const sixMonthsAgo = format(startOfMonth(subMonths(new Date(), 5)), "yyyy-MM-dd");

  const { data: leadsRaw } = useQuery({
    queryKey: ["dashboard-leads-chart", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("created_at")
        .eq("professional_id", professional!.id)
        .gte("created_at", sixMonthsAgo);
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const { data: appointmentsRaw } = useQuery({
    queryKey: ["dashboard-appointments-chart", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("appointment_date, status")
        .eq("professional_id", professional!.id)
        .gte("appointment_date", sixMonthsAgo);
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const months = useMemo(() => getMonthLabels(), []);

  const leadsChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    (leadsRaw ?? []).forEach((l) => {
      const key = format(new Date(l.created_at), "yyyy-MM");
      counts[key] = (counts[key] || 0) + 1;
    });
    return months.map((m) => ({ name: m.label, leads: counts[m.key] || 0 }));
  }, [leadsRaw, months]);

  const appointmentsChartData = useMemo(() => {
    const data: Record<string, { confirmed: number; pending: number; cancelled: number }> = {};
    (appointmentsRaw ?? []).forEach((a) => {
      const key = format(new Date(a.appointment_date), "yyyy-MM");
      if (!data[key]) data[key] = { confirmed: 0, pending: 0, cancelled: 0 };
      if (a.status === "confirmed" || a.status === "completed") data[key].confirmed++;
      else if (a.status === "cancelled") data[key].cancelled++;
      else data[key].pending++;
    });
    return months.map((m) => ({
      name: m.label,
      ...(data[m.key] || { confirmed: 0, pending: 0, cancelled: 0 }),
    }));
  }, [appointmentsRaw, months]);

  const conversionRate = useMemo(() => {
    const totalLeads = (leadsRaw ?? []).length;
    const totalAppointments = (appointmentsRaw ?? []).length;
    if (totalLeads === 0) return 0;
    return Math.round((totalAppointments / totalLeads) * 100);
  }, [leadsRaw, appointmentsRaw]);

  if (isLoading) {
    return <div className="animate-pulse text-muted-foreground">Carregando...</div>;
  }

  if (!professional) {
    return (
      <div className="text-center py-12 space-y-4">
        <h1 className="font-serif text-2xl font-bold text-foreground">Perfil não encontrado</h1>
        <p className="text-muted-foreground">Seu perfil profissional ainda não foi criado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Painel</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/admin/artigos">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Artigos</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.articles ?? 0}</div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/admin/videos">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Vídeos</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.videos ?? 0}</div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/admin/leads">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Novos Pacientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.leads ?? 0}</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads por mês</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={leadsChartConfig} className="h-[250px] w-full">
              <BarChart data={leadsChartData}>
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="leads" fill="var(--color-leads)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atendimentos por mês</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={appointmentsChartConfig} className="h-[250px] w-full">
              <BarChart data={appointmentsChartData}>
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="confirmed" stackId="a" fill="var(--color-confirmed)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" stackId="a" fill="var(--color-pending)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="cancelled" stackId="a" fill="var(--color-cancelled)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Rate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Taxa de Conversão</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{conversionRate}%</div>
          <p className="text-sm text-muted-foreground mt-1">
            dos leads converteram em atendimentos nos últimos 6 meses
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

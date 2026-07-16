import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Video, Users, TrendingUp, AlertCircle, RefreshCw, CheckCircle2, Circle, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import { format, subMonths, startOfMonth, parseISO, addMonths } from "date-fns";
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

// Leads que já converteram em agendamento (chegaram a estes estágios do funil do CRM).
// Base da Taxa de Conversão — ver useLeadsKanban (PipelineStage).
const CONVERTED_STAGES = new Set(["agendado", "cliente_ativo"]);

// Recebe o início da janela (string "yyyy-MM-dd" = mesmo valor da queryKey) e devolve os 6 meses
// a partir dele. Derivar do mesmo sixMonthsAgo mantém a dep do useMemo alinhada ao que é consumido.
function getMonthLabels(windowStart: string) {
  const start = parseISO(windowStart);
  const months = [];
  for (let k = 0; k < 6; k++) {
    const d = addMonths(start, k);
    months.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM", { locale: ptBR }),
    });
  }
  return months;
}

export default function AdminDashboard() {
  const { data: professional, isLoading, isError: professionalError, refetch: refetchProfessional } = useProfessional();

  const { data: stats, isError: statsError, refetch: refetchStats } = useQuery({
    queryKey: ["dashboard-stats", professional?.id],
    queryFn: async () => {
      const [articles, videos, availability] = await Promise.all([
        supabase.from("articles").select("id", { count: "exact", head: true }).eq("professional_id", professional!.id),
        supabase.from("videos").select("id", { count: "exact", head: true }).eq("professional_id", professional!.id),
        // Horários de atendimento definidos = agenda configurada (passo do checklist de onboarding).
        supabase.from("availability").select("id", { count: "exact", head: true }).eq("professional_id", professional!.id),
      ]);
      // Propaga erro para o react-query (senão o card zera em silêncio — auditoria A6).
      if (articles.error) throw articles.error;
      if (videos.error) throw videos.error;
      if (availability.error) throw availability.error;
      return {
        articles: articles.count ?? 0,
        videos: videos.count ?? 0,
        availabilityCount: availability.count ?? 0,
      };
    },
    enabled: !!professional?.id,
  });

  // Janela de 6 meses (início do mês -5 até hoje). String recalculada a cada render, mas ESTÁVEL
  // dentro do mês → segura na queryKey (sem refetch em loop) e mantém a janela viva na virada do mês (A5).
  const sixMonthsAgo = format(startOfMonth(subMonths(new Date(), 5)), "yyyy-MM-dd");
  // Buckets do gráfico recalculados quando a janela muda (não congelados no mount — A5);
  // derivados do MESMO sixMonthsAgo que alimenta as queryKeys.
  const months = useMemo(() => getMonthLabels(sixMonthsAgo), [sixMonthsAgo]);

  // Leads da janela: usados no card, no gráfico e na conversão (mesma base, mesma janela).
  const { data: leadsRaw, isError: leadsError, refetch: refetchLeads } = useQuery({
    queryKey: ["dashboard-leads-chart", professional?.id, sixMonthsAgo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("created_at, pipeline_stage")
        .eq("professional_id", professional!.id)
        .gte("created_at", sixMonthsAgo);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  // Agendamentos REAIS da janela (exclui bloqueios de agenda — auditoria A2). Só alimenta o gráfico.
  const { data: appointmentsRaw, isError: appointmentsError, refetch: refetchAppointments } = useQuery({
    queryKey: ["dashboard-appointments-chart", professional?.id, sixMonthsAgo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("appointment_date, status")
        .eq("professional_id", professional!.id)
        .eq("appointment_type", "booking")
        .gte("appointment_date", sixMonthsAgo);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const leadsChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    (leadsRaw ?? []).forEach((l) => {
      // parseISO respeita o fuso do timestamptz; format usa o fuso local (consistente com os buckets).
      const key = format(parseISO(l.created_at), "yyyy-MM");
      counts[key] = (counts[key] || 0) + 1;
    });
    return months.map((m) => ({ name: m.label, leads: counts[m.key] || 0 }));
  }, [leadsRaw, months]);

  const appointmentsChartData = useMemo(() => {
    const data: Record<string, { confirmed: number; pending: number; cancelled: number }> = {};
    (appointmentsRaw ?? []).forEach((a) => {
      // appointment_date é DATE puro: parseISO o interpreta como LOCAL (não meia-noite UTC),
      // então um agendamento do dia 1º não cai no mês anterior em SP (auditoria A3).
      const key = format(parseISO(a.appointment_date), "yyyy-MM");
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

  const leadsInWindow = (leadsRaw ?? []).length;

  // Conversão = % de leads da janela que chegaram ao estágio "agendado"/"cliente_ativo" (distinto por
  // lead, já que cada lead é uma linha com um estágio). Substitui o antigo agendamentos/leads, que
  // contava bloqueios, cancelados, recorrências e futuros e passava de 100% (auditoria A1). null = sem leads.
  const conversionRate = useMemo(() => {
    if (leadsInWindow === 0) return null;
    const converted = (leadsRaw ?? []).filter((l) => CONVERTED_STAGES.has(l.pipeline_stage)).length;
    return Math.round((converted / leadsInWindow) * 100);
  }, [leadsRaw, leadsInWindow]);

  if (isLoading) {
    return <div className="animate-pulse text-muted-foreground">Carregando...</div>;
  }

  // Erro de rede/servidor ao buscar o perfil: NÃO afirmar que o perfil não existe (auditoria A4).
  if (professionalError) {
    return (
      <div className="text-center py-12 space-y-4">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="font-heading text-2xl font-bold text-foreground">Não foi possível carregar o painel</h1>
        <p className="text-muted-foreground">Verifique sua conexão e tente novamente.</p>
        <Button onClick={() => refetchProfessional()} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    );
  }

  // Só aqui é seguro afirmar que o perfil ainda não foi criado (query teve sucesso e retornou vazio).
  if (!professional) {
    return (
      <div className="text-center py-12 space-y-4">
        <h1 className="font-heading text-2xl font-bold text-foreground">Perfil não encontrado</h1>
        <p className="text-muted-foreground">Seu perfil profissional ainda não foi criado.</p>
      </div>
    );
  }

  const metricsError = statsError || leadsError || appointmentsError;

  // Checklist de onboarding: 6 passos derivados do próprio perfil + contagens já buscadas
  // (sem tabela nova). Some sozinho quando 6/6. Ver auditoria §5 e o plano (Fase 3).
  const pro = professional as any;
  const onboardingSteps = [
    { done: !!(pro.photo_url && pro.full_name && (pro.approaches?.length ?? 0) > 0), label: "Complete seu perfil", to: "/admin/perfil" },
    { done: !!pro.whatsapp, label: "Informe seu WhatsApp", to: "/admin/perfil" },
    { done: !!(pro.price_max || pro.price_first_session), label: "Defina seus valores", to: "/admin/perfil" },
    { done: !!(pro.slug && (pro.hero_title || pro.bio)), label: "Publique sua página", to: "/admin/landing" },
    { done: (stats?.availabilityCount ?? 0) > 0, label: "Configure sua agenda", to: "/admin/agenda" },
    { done: (stats?.articles ?? 0) > 0 || (stats?.videos ?? 0) > 0, label: "Crie seu primeiro conteúdo", to: "/admin/artigos" },
  ];
  const doneCount = onboardingSteps.filter((s) => s.done).length;
  const onboardingComplete = doneCount >= onboardingSteps.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Painel</h1>
      </div>

      {!onboardingComplete && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Primeiros passos</CardTitle>
              <span className="text-sm font-medium tabular-nums text-primary">{doneCount}/{onboardingSteps.length}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary/15">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(doneCount / onboardingSteps.length) * 100}%` }}
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border/60">
              {onboardingSteps.map((step) => (
                <li key={step.label}>
                  <Link
                    to={step.to}
                    className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                  >
                    {step.done
                      ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-primary" />
                      : <Circle className="h-5 w-5 flex-shrink-0 text-muted-foreground/40" />}
                    <span className={step.done ? "flex-1 text-muted-foreground line-through" : "flex-1 font-medium text-foreground"}>
                      {step.label}
                    </span>
                    {!step.done && <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                  </Link>
                </li>
              ))}
            </ul>
            {/* Atalho para quem pulou o onboarding no cadastro: reabre o formulário guiado, que
                preenche de uma vez os campos que os passos acima verificam + o DNA. */}
            <Link
              to="/bem-vindo"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-background py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Sparkles className="h-4 w-4" /> Preencher tudo de uma vez (formulário guiado)
            </Link>
          </CardContent>
        </Card>
      )}

      {metricsError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
          <p className="flex-1 text-sm text-muted-foreground">Não conseguimos carregar algumas métricas.</p>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => { refetchStats(); refetchLeads(); refetchAppointments(); }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Recarregar
          </Button>
        </div>
      )}

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
              <CardTitle className="text-sm font-medium text-muted-foreground">Leads (6 meses)</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{leadsInWindow}</div>
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
          <div className="text-3xl font-bold">{conversionRate === null ? "—" : `${conversionRate}%`}</div>
          <p className="text-sm text-muted-foreground mt-1">
            {conversionRate === null
              ? "Sem leads nos últimos 6 meses para calcular."
              : "dos leads dos últimos 6 meses agendaram uma sessão"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

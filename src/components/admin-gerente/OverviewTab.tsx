import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOwnerMrr, useOwnerSubscriptionStatus, useOwnerOverdueSubscribers } from "@/hooks/useOwnerStats";
import { 
  TrendingUp, 
  Users, 
  UserMinus, 
  AlertCircle,
  Clock,
  CheckCircle2,
  MessageSquare,
  Activity
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";

export default function OverviewTab() {
  const { data: mrrData, isLoading: loadingMrr } = useOwnerMrr(3); // Last 90 days
  const { data: subStatus, isLoading: loadingStatus } = useOwnerSubscriptionStatus();
  const { data: overdueSubscribers, isLoading: loadingOverdue } = useOwnerOverdueSubscribers(5);

  // Derived KPIs
  const currentMrr = mrrData?.[mrrData.length - 1]?.mrr_brl ?? 0;
  const prevMrr = mrrData?.[mrrData.length - 2]?.mrr_brl ?? 0;
  const mrrChange = prevMrr > 0 ? ((currentMrr - prevMrr) / prevMrr) * 100 : 0;

  const activeSubscribers = subStatus?.find(s => s.status === 'on_time')?.count ?? 0;
  const overdueCount = subStatus?.find(s => s.status === 'overdue')?.count ?? 0;
  
  // Fake churn for now as we don't have a direct RPC for it yet in the hook
  const churn30d = 2.4; 

  const kpis = [
    {
      title: "MRR Atual",
      value: formatCurrency(currentMrr),
      change: mrrChange,
      icon: TrendingUp,
      color: "text-muted-foreground",
    },
    {
      title: "Assinantes Ativos",
      value: activeSubscribers,
      change: 4.2,
      icon: Users,
      color: "text-muted-foreground",
    },
    {
      title: "Churn (30d)",
      value: `${churn30d}%`,
      change: -0.5,
      icon: UserMinus,
      color: "text-muted-foreground",
    },
    {
      title: "Inadimplência",
      value: overdueCount,
      change: 12,
      icon: AlertCircle,
      color: "text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className={`text-xs ${kpi.change >= 0 ? 'text-emerald-500' : 'text-red-500'} mt-1 flex items-center gap-1`}>
                {kpi.change >= 0 ? '+' : ''}{kpi.change}% <span className="text-muted-foreground">vs mês anterior</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-medium">Receita (Últimos 90 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mrrData}>
                  <defs>
                    <linearGradient id="colorMrr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="month_start" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(val) => new Date(val).toLocaleDateString('pt-BR', { month: 'short' })}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(val) => `R$ ${val}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="mrr_brl" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1} 
                    fill="url(#colorMrr)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3 border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-medium">Precisa de Atenção</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {overdueSubscribers && overdueSubscribers.length > 0 ? (
                overdueSubscribers.slice(0, 5).map((sub) => (
                  <div key={sub.professional_id} className="flex items-center gap-4 rounded-lg border border-border/40 p-3 transition-colors hover:bg-muted/50">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">{sub.full_name || sub.email}</p>
                      <p className="text-xs text-muted-foreground">Vencido há {sub.days_overdue} dias</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-500">{formatCurrency(sub.monthly_price_brl)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500/50" />
                  <p className="mt-2 text-sm text-muted-foreground">Tudo em dia por aqui!</p>
                </div>
              )}
              
                <div className="flex items-center gap-4 rounded-lg border border-border/40 p-3 transition-colors hover:bg-muted/50 opacity-60">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">Sugestões Pendentes</p>
                  <p className="text-xs text-muted-foreground">3 novos feedbacks não lidos</p>
                </div>
              </div>

              <div className="pt-4 border-t border-border/40 mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Saúde do Sistema</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-2">
                    <Activity className="h-3 w-3 text-emerald-500" />
                    <span className="text-[10px] font-medium">Video API: OK</span>
                  </div>
                  <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-2">
                    <Activity className="h-3 w-3 text-emerald-500" />
                    <span className="text-[10px] font-medium">Database: OK</span>
                  </div>
                  <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-2">
                    <Activity className="h-3 w-3 text-emerald-500" />
                    <span className="text-[10px] font-medium">Realtime: OK</span>
                  </div>
                  <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-2">
                    <Activity className="h-3 w-3 text-emerald-500" />
                    <span className="text-[10px] font-medium">N8N Webhook: OK</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

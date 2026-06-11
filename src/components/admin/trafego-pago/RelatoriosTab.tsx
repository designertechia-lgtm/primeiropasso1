import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  BarChart2,
  Eye,
  MousePointerClick,
  Globe,
  Users,
  MessageCircle,
  CalendarCheck,
  Coins,
  Zap,
} from "lucide-react";
import { STATUS_CONFIG, type CampaignStatus } from "./types";

interface FunnelRow {
  campaign_id: string;
  campaign_name: string;
  campaign_status: CampaignStatus;
  daily_budget_brl: number;
  start_date: string | null;
  end_date: string | null;
  impressions: number;
  clicks: number;
  cost_brl: number;
  visitas: number;
  leads: number;
  conversas: number;
  agendamentos: number;
}

function useAdsFunnel() {
  return useQuery({
    queryKey: ["ads-funnel"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ads_funnel" as any);
      if (error) throw error;
      return (data ?? []) as FunnelRow[];
    },
  });
}

const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function RelatoriosTab() {
  const { data: rows = [], isLoading } = useAdsFunnel();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <BarChart2 className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold">Sem campanhas pra reportar ainda</h3>
        <p className="text-muted-foreground text-sm max-w-sm">
          Crie sua primeira campanha na aba Google Ads. Assim que ela existir, o funil completo aparece aqui — do anúncio até o agendamento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
        <Zap className="h-3 w-3 text-yellow-500 shrink-0" />
        O Google só mostra até o clique. Aqui você vê até o agendamento — visitas, leads e conversas vêm da sua landing e do seu WhatsApp.
      </div>

      {rows.map((row) => (
        <FunnelCard key={row.campaign_id} row={row} />
      ))}
    </div>
  );
}

function FunnelCard({ row }: { row: FunnelRow }) {
  const statusCfg = STATUS_CONFIG[row.campaign_status] ?? STATUS_CONFIG.draft;
  const StatusIcon = statusCfg.icon;
  const hasGoogleData = row.impressions > 0 || row.clicks > 0;
  const custoPorAgendamento =
    row.cost_brl > 0 && row.agendamentos > 0 ? row.cost_brl / row.agendamentos : null;

  const stages = [
    { label: "Impressões",  value: row.impressions,  icon: Eye,               google: true },
    { label: "Cliques",     value: row.clicks,       icon: MousePointerClick, google: true },
    { label: "Visitas",     value: row.visitas,      icon: Globe,             google: false },
    { label: "Leads",       value: row.leads,        icon: Users,             google: false },
    { label: "Conversas",   value: row.conversas,    icon: MessageCircle,     google: false },
    { label: "Agendamentos", value: row.agendamentos, icon: CalendarCheck,    google: false },
  ];
  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-sm truncate">{row.campaign_name}</h3>
            <Badge variant={statusCfg.variant} className="gap-1 text-xs shrink-0">
              <StatusIcon className="h-3 w-3" />
              {statusCfg.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {row.cost_brl > 0 && (
              <span className="flex items-center gap-1">
                <Coins className="h-3 w-3" />
                Investido: <span className="font-medium text-foreground">{BRL(Number(row.cost_brl))}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              Custo/agendamento:{" "}
              <span className="font-semibold text-foreground">
                {custoPorAgendamento ? BRL(custoPorAgendamento) : "—"}
              </span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4 space-y-1.5">
        {stages.map((stage) => {
          const Icon = stage.icon;
          const dimmed = stage.google && !hasGoogleData;
          const width = Math.max((stage.value / maxValue) * 100, stage.value > 0 ? 4 : 0);
          return (
            <div key={stage.label} className={`flex items-center gap-2 ${dimmed ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-1.5 w-32 shrink-0 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {stage.label}
              </div>
              <div className="flex-1 h-5 bg-muted/40 rounded overflow-hidden">
                <div
                  className="h-full rounded bg-primary/70 transition-all"
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="w-14 text-right text-xs font-medium tabular-nums">
                {dimmed ? "—" : stage.value.toLocaleString("pt-BR")}
              </span>
            </div>
          );
        })}

        {!hasGoogleData && (
          <p className="text-[11px] text-muted-foreground pt-1">
            Impressões e cliques chegam automaticamente quando a campanha estiver veiculando no Google (sincronização diária).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

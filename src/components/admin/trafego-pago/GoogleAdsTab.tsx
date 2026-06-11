import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  Sparkles,
  CheckCircle2,
  Target,
  DollarSign,
  ChevronDown,
  Loader2,
  AlertTriangle,
  Plus,
  List,
  CalendarDays,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  type Campaign,
  STATUS_CONFIG,
  OBJECTIVE_LABEL,
  CAMPAIGN_COST,
} from "./types";
import CampaignEditor from "./CampaignEditor";
import CampaignCalendar from "./CampaignCalendar";
import CreateCampaignDialog from "./CreateCampaignDialog";
import GoogleAdsAccountCard from "./GoogleAdsAccountCard";

// ── Hook: campanhas do profissional ────────────────────────
function useCampaigns(professionalId: string | undefined) {
  return useQuery({
    queryKey: ["ads_campaigns", professionalId],
    enabled: !!professionalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ads_campaigns" as any)
        .select("*")
        .eq("professional_id", professionalId!)
        .eq("platform", "google_ads")
        .neq("status", "archived")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
  });
}

// ── Componente principal ───────────────────────────────────
interface GoogleAdsTabProps {
  creditBalance: number;
}

type ViewMode = "list" | "calendar";

export default function GoogleAdsTab({ creditBalance }: GoogleAdsTabProps) {
  const { data: professional } = useProfessional();
  const qc = useQueryClient();
  const { data: campaigns = [], isLoading } = useCampaigns(professional?.id);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [createOpen, setCreateOpen] = useState(false);

  function handleCreated(campaignId: string) {
    setCreateOpen(false);
    qc.invalidateQueries({ queryKey: ["ads_campaigns"] });
    qc.invalidateQueries({ queryKey: ["credit-balance"] });
    setView("list");
    setExpandedCampaign(campaignId);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <GoogleAdsAccountCard />

      {campaigns.length === 0 ? (
        <EmptyState creditBalance={creditBalance} onCreate={() => setCreateOpen(true)} />
      ) : (
        <>
          {/* Toolbar: contagem + toggle de visão + criar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition ${
                    view === "list" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={view === "list"}
                >
                  <List className="h-3.5 w-3.5" />
                  Lista
                </button>
                <button
                  type="button"
                  onClick={() => setView("calendar")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition ${
                    view === "calendar" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={view === "calendar"}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Calendário
                </button>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Criar campanha
              </Button>
            </div>
          </div>

          {view === "calendar" ? (
            <CampaignCalendar
              campaigns={campaigns}
              onSelect={(c) => {
                setView("list");
                setExpandedCampaign(c.id);
              }}
            />
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  expanded={expandedCampaign === campaign.id}
                  onToggle={() => setExpandedCampaign(
                    expandedCampaign === campaign.id ? null : campaign.id
                  )}
                />
              ))}
            </div>
          )}
        </>
      )}

      <CreateCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        creditBalance={creditBalance}
        onCreated={handleCreated}
      />
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────
function EmptyState({ creditBalance, onCreate }: { creditBalance: number; onCreate: () => void }) {
  const navigate = useNavigate();
  const canAfford = creditBalance >= CAMPAIGN_COST;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-6 max-w-md mx-auto">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
        <TrendingUp className="h-10 w-10 text-primary" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">Nenhuma campanha ainda</h3>
        <p className="text-muted-foreground text-sm">
          A IA cria uma campanha Google Ads completa para você — grupos de anúncios, textos RSA e keywords otimizados para o seu nicho de saúde.
        </p>
      </div>

      {/* Custo visível antes de gerar */}
      <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm border w-full justify-center ${
        canAfford
          ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300"
          : "bg-destructive/10 border-destructive/20 text-destructive"
      }`}>
        {canAfford ? (
          <>
            <span className="font-medium">{CAMPAIGN_COST} créditos</span>
            <span className="text-muted-foreground">
              por campanha gerada · você tem {creditBalance} crédito{creditBalance !== 1 ? "s" : ""}
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4" />
            <span>
              Saldo insuficiente ({creditBalance}/{CAMPAIGN_COST} créditos).{" "}
              <a href="/admin/assinatura" className="underline">Recarregar</a>
            </span>
          </>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <Button className="gap-2 flex-1" onClick={onCreate} disabled={!canAfford}>
          <Plus className="h-4 w-4" />
          Criar campanha
        </Button>
        <Button variant="outline" className="gap-2 flex-1" onClick={() => navigate("/admin/chat")}>
          <Sparkles className="h-4 w-4" />
          Criar com o Axel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Prefere conversar? Diga ao Axel: <em>"quero criar uma campanha no Google Ads"</em> e ele guiará o processo.
      </p>
    </div>
  );
}

// ── Card de campanha ───────────────────────────────────────
function CampaignCard({
  campaign,
  expanded,
  onToggle,
}: {
  campaign: Campaign;
  expanded: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const statusCfg = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = statusCfg.icon;

  const approveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ads_campaigns" as any)
        .update({ status: "approved" })
        .eq("id", campaign.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ads_campaigns"] });
      toast.success("Campanha aprovada! Agora você pode publicá-la no Google Ads.");
    },
    onError: (e: any) => toast.error(`Erro ao aprovar: ${e.message}`),
  });

  const periodLabel = campaign.start_date
    ? `${format(parseISO(campaign.start_date), "dd/MM", { locale: ptBR })}${
        campaign.end_date ? ` → ${format(parseISO(campaign.end_date), "dd/MM", { locale: ptBR })}` : " → contínua"
      }`
    : null;

  return (
    <Card className="overflow-hidden">
      {/* ── Header do card ── */}
      <CardHeader
        className="cursor-pointer select-none py-4"
        onClick={onToggle}
      >
        <div className="flex items-start gap-3 justify-between">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm truncate">{campaign.name}</h3>
              <Badge variant={statusCfg.variant} className="gap-1 text-xs shrink-0">
                <StatusIcon className="h-3 w-3" />
                {statusCfg.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                {OBJECTIVE_LABEL[campaign.objective] ?? campaign.objective}
              </span>
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                R$ {campaign.daily_budget_brl.toFixed(2)}/dia
              </span>
              {periodLabel && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {periodLabel}
                </span>
              )}
              <span>
                {format(parseISO(campaign.created_at), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {campaign.status === "draft" && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); approveMutation.mutate(); }}
                disabled={approveMutation.isPending}
                className="gap-1"
              >
                {approveMutation.isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <CheckCircle2 className="h-3 w-3" />
                }
                Aprovar
              </Button>
            )}
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </div>
      </CardHeader>

      {/* ── Editor acordeão ── */}
      {expanded && (
        <CardContent className="pt-0 pb-4">
          <Separator className="mb-4" />
          <CampaignEditor campaign={campaign} />
        </CardContent>
      )}
    </Card>
  );
}

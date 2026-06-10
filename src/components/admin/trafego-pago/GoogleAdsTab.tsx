import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  Sparkles,
  CheckCircle2,
  Clock,
  PauseCircle,
  Archive,
  Globe,
  Target,
  DollarSign,
  ChevronDown,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Limites do Google Ads ──────────────────────────────────
const HEADLINE_MAX = 30;
const DESC_MAX = 90;
const PATH_MAX = 15;

// ── Tipos ──────────────────────────────────────────────────
type CampaignStatus = "draft" | "approved" | "published" | "active" | "paused" | "archived";

interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  daily_budget_brl: number;
  max_daily_budget_brl: number;
  landing_url: string | null;
  brief: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface Asset {
  id: string;
  asset_type: string;
  parent_id: string | null;
  payload: Record<string, any>;
  position: number;
}

// ── Helpers ────────────────────────────────────────────────
const STATUS_CONFIG: Record<CampaignStatus, { label: string; icon: React.FC<any>; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft:     { label: "Rascunho",   icon: Clock,        variant: "secondary" },
  approved:  { label: "Aprovada",   icon: CheckCircle2, variant: "default"   },
  published: { label: "Publicada",  icon: Globe,        variant: "default"   },
  active:    { label: "Ativa",      icon: TrendingUp,   variant: "default"   },
  paused:    { label: "Pausada",    icon: PauseCircle,  variant: "outline"   },
  archived:  { label: "Arquivada",  icon: Archive,      variant: "destructive" },
};

const OBJECTIVE_LABEL: Record<string, string> = {
  leads:           "Captação de leads",
  agendamentos:    "Agendamentos",
  whatsapp:        "Mensagens WhatsApp",
  trafego_landing: "Tráfego para landing",
};

function charCounter(value: string, max: number) {
  const len = value.length;
  const over = len > max;
  return (
    <span className={`text-xs tabular-nums ${over ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
      {len}/{max}
    </span>
  );
}

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

// Hook: assets de uma campanha específica
function useCampaignAssets(campaignId: string | null) {
  return useQuery({
    queryKey: ["ads_campaign_assets", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ads_campaign_assets" as any)
        .select("*")
        .eq("campaign_id", campaignId!)
        .order("position");
      if (error) throw error;
      return (data ?? []) as Asset[];
    },
  });
}

// ── Componente principal ───────────────────────────────────
interface GoogleAdsTabProps {
  creditBalance: number;
}

export default function GoogleAdsTab({ creditBalance }: GoogleAdsTabProps) {
  const { data: professional } = useProfessional();
  const navigate = useNavigate();
  const { data: campaigns = [], isLoading } = useCampaigns(professional?.id);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return <EmptyState creditBalance={creditBalance} />;
  }

  return (
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
  );
}

// ── Empty State ────────────────────────────────────────────
function EmptyState({ creditBalance }: { creditBalance: number }) {
  const navigate = useNavigate();
  const COST = 10;
  const canAfford = creditBalance >= COST;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-6 max-w-md mx-auto">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
        <TrendingUp className="h-10 w-10 text-primary" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">Nenhuma campanha ainda</h3>
        <p className="text-muted-foreground text-sm">
          O Axel cria uma campanha Google Ads completa para você — grupos de anúncios, textos RSA e keywords otimizados para o seu nicho de saúde.
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
            <span className="font-medium">{COST} créditos</span>
            <span className="text-muted-foreground">
              por campanha gerada · você tem {creditBalance} crédito{creditBalance !== 1 ? "s" : ""}
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4" />
            <span>
              Saldo insuficiente ({creditBalance}/{COST} créditos).{" "}
              <a href="/admin/assinatura" className="underline">Recarregar</a>
            </span>
          </>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <Button
          className="gap-2 flex-1"
          onClick={() => navigate("/admin/chat")}
          disabled={!canAfford}
        >
          <Sparkles className="h-4 w-4" />
          Criar com o Axel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Diga ao Axel: <em>"quero criar uma campanha no Google Ads"</em> e ele guiará o processo.
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

// ── Editor da campanha ─────────────────────────────────────
function CampaignEditor({ campaign }: { campaign: Campaign }) {
  const { data: assets = [], isLoading } = useCampaignAssets(campaign.id);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando estrutura da campanha...
      </div>
    );
  }

  const adGroups = assets.filter((a) => a.asset_type === "ad_group").sort((a, b) => a.position - b.position);
  const sitelinks = assets.filter((a) => a.asset_type === "sitelink");
  const callouts  = assets.filter((a) => a.asset_type === "callout");
  const globalNegs = assets.filter((a) => a.asset_type === "negative_keyword" && !a.parent_id);

  return (
    <div className="space-y-4">
      {/* Informações gerais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">URL de destino</Label>
          <p className="text-xs text-muted-foreground break-all font-mono bg-muted/30 rounded px-2 py-1">
            {campaign.landing_url ?? "—"}
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Orçamento máximo/dia</Label>
          <p className="text-xs text-muted-foreground">
            R$ {campaign.max_daily_budget_brl.toFixed(2)}
            <span className="ml-2 text-yellow-600 dark:text-yellow-400 font-medium">(Google pode gastar até 2× o diário)</span>
          </p>
        </div>
      </div>

      {/* Grupos de anúncios */}
      {adGroups.length > 0 && (
        <Accordion type="multiple" className="space-y-2">
          {adGroups.map((group) => {
            const rsa = assets.find((a) => a.asset_type === "rsa" && a.parent_id === group.id);
            const keywords = assets
              .filter((a) => a.asset_type === "keyword" && a.parent_id === group.id)
              .sort((a, b) => a.position - b.position);
            const negKws = assets
              .filter((a) => a.asset_type === "negative_keyword" && a.parent_id === group.id);

            return (
              <AccordionItem
                key={group.id}
                value={group.id}
                className="border rounded-md px-3"
              >
                <AccordionTrigger className="py-3 hover:no-underline">
                  <span className="font-medium text-sm text-left">{group.payload.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-normal">{group.payload.theme}</span>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-4">

                  {/* RSA */}
                  {rsa && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anúncio Responsivo (RSA)</p>

                      <div className="space-y-2">
                        <Label className="text-xs">Títulos ({(rsa.payload.headlines ?? []).length}/15)</Label>
                        {(rsa.payload.headlines ?? []).map((h: string, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              value={h}
                              readOnly
                              className="text-xs h-7"
                              maxLength={HEADLINE_MAX}
                            />
                            {charCounter(h, HEADLINE_MAX)}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Descrições ({(rsa.payload.descriptions ?? []).length}/4)</Label>
                        {(rsa.payload.descriptions ?? []).map((d: string, i: number) => (
                          <div key={i} className="flex items-start gap-2">
                            <Textarea
                              value={d}
                              readOnly
                              className="text-xs min-h-[3rem] resize-none"
                              maxLength={DESC_MAX}
                            />
                            {charCounter(d, DESC_MAX)}
                          </div>
                        ))}
                      </div>

                      {(rsa.payload.path1 || rsa.payload.path2) && (
                        <div className="flex gap-2">
                          {rsa.payload.path1 && (
                            <div className="space-y-1 flex-1">
                              <Label className="text-xs">Path 1</Label>
                              <div className="flex items-center gap-2">
                                <Input value={rsa.payload.path1} readOnly className="text-xs h-7" />
                                {charCounter(rsa.payload.path1, PATH_MAX)}
                              </div>
                            </div>
                          )}
                          {rsa.payload.path2 && (
                            <div className="space-y-1 flex-1">
                              <Label className="text-xs">Path 2</Label>
                              <div className="flex items-center gap-2">
                                <Input value={rsa.payload.path2} readOnly className="text-xs h-7" />
                                {charCounter(rsa.payload.path2, PATH_MAX)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Keywords */}
                  {keywords.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Palavras-chave ({keywords.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {keywords.map((kw) => (
                          <Badge
                            key={kw.id}
                            variant="outline"
                            className="text-xs font-normal gap-1"
                          >
                            <span className="text-muted-foreground">
                              {kw.payload.match_type === "exact"  ? "[" : kw.payload.match_type === "phrase" ? '"' : ""}
                            </span>
                            {kw.payload.text}
                            <span className="text-muted-foreground">
                              {kw.payload.match_type === "exact"  ? "]" : kw.payload.match_type === "phrase" ? '"' : ""}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Negativos do grupo */}
                  {negKws.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Negativos do grupo
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {negKws.map((kw) => (
                          <Badge key={kw.id} variant="secondary" className="text-xs font-normal line-through opacity-60">
                            {kw.payload.text}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* Sitelinks */}
      {sitelinks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sitelinks ({sitelinks.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sitelinks.map((sl) => (
              <div key={sl.id} className="bg-muted/30 rounded px-3 py-2 text-xs space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{sl.payload.text}</span>
                  {charCounter(sl.payload.text ?? "", 25)}
                </div>
                {sl.payload.description && (
                  <p className="text-muted-foreground">{sl.payload.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Callouts */}
      {callouts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Callouts ({callouts.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {callouts.map((co) => (
              <Badge key={co.id} variant="outline" className="text-xs font-normal">
                {co.payload.text}
                <span className="ml-1 text-muted-foreground/60">
                  ({(co.payload.text ?? "").length}/25)
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Negativos globais */}
      {globalNegs.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Negativos de campanha ({globalNegs.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {globalNegs.map((kw) => (
              <Badge key={kw.id} variant="secondary" className="text-xs font-normal opacity-60 line-through">
                {kw.payload.text}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Aviso sobre publicação */}
      {(campaign.status === "approved") && (
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2.5 text-xs text-blue-800 dark:text-blue-200 mt-2">
          <Globe className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Campanha aprovada — pronta para publicar</p>
            <p className="mt-0.5 text-blue-700 dark:text-blue-300">
              Pergunte ao Axel <em>"como publicar minha campanha no Google Ads"</em> e ele vai guiar o passo a passo. A publicação manual (por enquanto) é feita direto na sua conta Google Ads.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

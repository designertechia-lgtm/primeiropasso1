import { ArrowLeft, Brain, Layers, ListChecks, TrendingUp, Clock, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackAudit, AuditCluster, AuditRecommendation } from "@/hooks/useOwnerStats";

interface AuditPanelProps {
  audit: FeedbackAudit;
  onBack: () => void;
}

const RELEVANCIA_COLOR: Record<AuditCluster["relevancia"], string> = {
  alta: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  media: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  baixa: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

const ACTION_LABEL: Record<AuditRecommendation["action"], string> = {
  approve: "Aprovar",
  discard: "Descartar",
  investigate: "Investigar",
};

const ACTION_COLOR: Record<AuditRecommendation["action"], string> = {
  approve: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  discard: "bg-muted text-muted-foreground border-border",
  investigate: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function AuditPanel({ audit, onBack }: AuditPanelProps) {
  const nps = audit.nps_snapshot;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <div>
            <h2 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Auditoria #{audit.id}
            </h2>
            <p className="text-xs text-muted-foreground">
              {formatDate(audit.created_at)} · {audit.feedback_count} feedbacks · {audit.model}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {audit.duration_ms != null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {(audit.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
          {audit.cost_usd != null && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" /> ${audit.cost_usd.toFixed(4)}
            </span>
          )}
        </div>
      </div>

      {/* NPS snapshot */}
      {nps && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> NPS no momento da auditoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <div className="text-2xl font-bold text-foreground">{nps.avg.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">Média</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-600">{nps.promoters}</div>
                <div className="text-xs text-muted-foreground">Promotores</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-500">{nps.neutrals}</div>
                <div className="text-xs text-muted-foreground">Neutros</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-rose-500">{nps.detractors}</div>
                <div className="text-xs text-muted-foreground">Detratores</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{nps.total_with_nps}</div>
                <div className="text-xs text-muted-foreground">Com nota</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resumo (markdown como texto pre-formatado) */}
      {audit.summary_md && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Resumo</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed">
              {audit.summary_md}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Clusters */}
      {audit.clusters?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Agrupamentos ({audit.clusters.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {audit.clusters.map((c, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground">{c.label}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={RELEVANCIA_COLOR[c.relevancia]}>
                      {c.relevancia}
                    </Badge>
                    <Badge variant="secondary">{c.qty}×</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">{c.type_pred}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5">severidade: {c.severity_pred}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5">pilar {c.pilar}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5">fase {c.fase}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recomendações */}
      {audit.recommendations?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" /> Recomendações ({audit.recommendations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {audit.recommendations
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((r, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{r.cluster_label}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={ACTION_COLOR[r.action]}>
                        {ACTION_LABEL[r.action]}
                      </Badge>
                      <Badge variant="secondary">prioridade {r.priority}</Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.rationale}</p>
                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">fase alvo: {r.target_phase}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5">esforço: {r.effort}</span>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

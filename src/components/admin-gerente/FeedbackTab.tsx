import { useState } from "react";
import { 
  useOwnerFeedbacks, 
  useUpdateFeedbackStatus, 
  Feedback 
} from "@/hooks/useOwnerStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  MessageSquare, 
  Clock, 
  CheckCircle2, 
  Archive, 
  MoreHorizontal,
  ExternalLink,
  Smartphone,
  Mail,
  AlertTriangle,
  Download
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportToCsv } from "@/lib/exportUtils";

const STATUS_LABELS: Record<Feedback["status"], { label: string, color: string }> = {
  novo: { label: "Novo", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  em_analise: { label: "Em Análise", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  resolvido: { label: "Resolvido", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  arquivado: { label: "Arquivado", color: "bg-muted text-muted-foreground border-border" },
};

const TYPE_LABELS: Record<Feedback["type"], string> = {
  bug: "Bug 🐞",
  sugestao: "Sugestão 💡",
  duvida: "Dúvida ❓",
  elogio: "Elogio ❤️",
  outro: "Outro 💬",
};

const SEVERITY_COLORS: Record<Feedback["severity"], string> = {
  baixa: "text-blue-400",
  media: "text-amber-400",
  alta: "text-orange-500",
  critica: "text-red-500 font-bold",
};

export default function FeedbackTab() {
  const { data: feedbacks, isLoading } = useOwnerFeedbacks();
  const updateStatus = useUpdateFeedbackStatus();
  const [activeTab, setActiveTab] = useState<Feedback["status"] | "todos">("todos");

  const filteredFeedbacks = feedbacks?.filter(f => activeTab === "todos" || f.status === activeTab);

  const npsAvg = feedbacks?.filter(f => f.nps_score !== null)
    .reduce((acc, f, _, arr) => acc + (f.nps_score || 0) / arr.length, 0).toFixed(1) || "0.0";

  const getNpsColor = (score: number | null) => {
    if (score === null) return "bg-muted text-muted-foreground";
    if (score >= 8) return "bg-emerald-500/20 text-emerald-500";
    if (score >= 5) return "bg-amber-500/20 text-amber-500";
    return "bg-red-500/20 text-red-500";
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Feedbacks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{feedbacks?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Acumulado desde o início</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Novos Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {feedbacks?.filter(f => new Date(f.created_at).toDateString() === new Date().toDateString()).length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Aguardando primeira leitura</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">NPS Estimado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{npsAvg}</div>
            <p className="text-xs text-muted-foreground mt-1">Média das avaliações diretas</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full sm:w-auto">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="novo" className="gap-2">
              Novo
              {feedbacks?.some(f => f.status === 'novo') && (
                <span className="flex h-2 w-2 rounded-full bg-blue-500" />
              )}
            </TabsTrigger>
            <TabsTrigger value="em_analise">Em Análise</TabsTrigger>
            <TabsTrigger value="resolvido">Resolvido</TabsTrigger>
            <TabsTrigger value="arquivado">Arquivado</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2"
          onClick={() => {
            const dataToExport = feedbacks?.map(f => ({
              Data: new Date(f.created_at).toLocaleDateString(),
              Autor: f.author?.full_name || "Anônimo",
              Email: f.author?.email || "",
              Tipo: f.type,
              Status: f.status,
              Mensagem: f.message,
              NPS: f.nps_score || ""
            })) || [];
            exportToCsv(dataToExport, "feedbacks");
          }}
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      <div className="mt-2 space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="h-8 w-8 animate-spin mb-4" />
            <p>Carregando feedbacks...</p>
          </div>
        ) : filteredFeedbacks?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-xl bg-muted/20">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="font-heading text-lg">Nenhum feedback encontrado</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
              Parece que não há mensagens nesta categoria no momento.
            </p>
          </div>
        ) : (
          filteredFeedbacks?.map((feedback) => (
            <Card key={feedback.id} className="overflow-hidden bg-card/50 backdrop-blur-sm border-border/40 hover:border-border/80 transition-all">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                  <div className="flex-1 p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={STATUS_LABELS[feedback.status].color}>
                            {STATUS_LABELS[feedback.status].label}
                          </Badge>
                          <Badge variant="secondary" className="bg-muted/50">
                            {TYPE_LABELS[feedback.type]}
                          </Badge>
                          {feedback.severity !== 'baixa' && (
                            <span className={`text-[10px] uppercase tracking-wider ${SEVERITY_COLORS[feedback.severity]} flex items-center gap-1`}>
                              <AlertTriangle className="h-3 w-3" />
                              {feedback.severity}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Enviado em {new Date(feedback.created_at).toLocaleString('pt-BR')}
                        </p>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => updateStatus.mutate({ id: feedback.id, status: 'novo' })}>
                            <MessageSquare className="mr-2 h-4 w-4" /> Marcar como Novo
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus.mutate({ id: feedback.id, status: 'em_analise' })}>
                            <Clock className="mr-2 h-4 w-4" /> Em Análise
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus.mutate({ id: feedback.id, status: 'resolvido' })}>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Resolvido
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus.mutate({ id: feedback.id, status: 'arquivado' })}>
                            <Archive className="mr-2 h-4 w-4" /> Arquivar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                      {feedback.message}
                    </div>

                    {feedback.screenshot_url && (
                      <a 
                        href={feedback.screenshot_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-xs text-blue-500 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver anexo / screenshot
                      </a>
                    )}
                  </div>

                  <div className="w-full md:w-64 bg-muted/30 p-6 border-t md:border-t-0 md:border-l border-border/40">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Autor</p>
                        <p className="text-sm font-medium">{feedback.author?.full_name || "Anônimo"}</p>
                        <p className="text-xs text-muted-foreground break-all">{feedback.author?.email || "Email não informado"}</p>
                      </div>

                      <div className="flex flex-col gap-2 pt-2">
                        {feedback.author?.whatsapp && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full gap-2 text-xs" 
                            onClick={() => {
                              const phone = feedback.author?.whatsapp?.replace(/\D/g, '') || '';
                              window.open(`https://wa.me/${phone}`, '_blank');
                            }}
                          >
                            <Smartphone className="h-3 w-3" />
                            WhatsApp
                          </Button>
                        )}
                        {feedback.author?.email && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full gap-2 text-xs" 
                            onClick={() => window.open(`mailto:${feedback.author?.email}`, '_blank')}
                          >
                            <Mail className="h-3 w-3" />
                            Email
                          </Button>
                        )}
                      </div>

                      {feedback.nps_score !== null && (
                        <div className="pt-2 border-t border-border/40">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">NPS</p>
                          <div className="flex items-center gap-2">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${getNpsColor(feedback.nps_score)}`}>
                              {feedback.nps_score}
                            </div>
                            <span className="text-xs text-muted-foreground">Satisfação</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

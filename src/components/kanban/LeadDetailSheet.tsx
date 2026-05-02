import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, Mail, Bot, MessageSquare, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLeadConversation } from "@/hooks/useLeadConversation";
import { useToggleAgentEnabled } from "@/hooks/useUpdateLeadStage";
import type { Lead } from "@/hooks/useLeadsKanban";
import { PIPELINE_COLUMNS } from "@/hooks/useLeadsKanban";

interface LeadDetailSheetProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadDetailSheet({
  lead,
  open,
  onOpenChange,
}: LeadDetailSheetProps) {
  const { data: messages = [], isLoading } = useLeadConversation(
    lead?.whatsapp ?? null
  );
  const toggleAgent = useToggleAgentEnabled();

  if (!lead) return null;

  const col = PIPELINE_COLUMNS.find((c) => c.id === lead.pipeline_stage);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {lead.name}
            {col && (
              <Badge variant="outline" className="text-xs">
                <span className={`w-2 h-2 rounded-full ${col.color} mr-1`} />
                {col.title}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Lead info */}
          <div className="space-y-2 text-sm">
            {lead.whatsapp && (
              <a
                href={`https://wa.me/55${lead.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Phone className="h-4 w-4" /> {lead.whatsapp}
              </a>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Mail className="h-4 w-4" /> {lead.email}
              </a>
            )}
            <p className="text-xs text-muted-foreground">
              Criado em{" "}
              {format(new Date(lead.created_at), "dd/MM/yyyy 'as' HH:mm", {
                locale: ptBR,
              })}
            </p>
          </div>

          {/* Agent toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Bot className="h-4 w-4" /> Agente IA
            </span>
            <Switch
              checked={lead.agent_enabled}
              onCheckedChange={(checked) =>
                toggleAgent.mutate({ leadId: lead.id, enabled: checked })
              }
            />
          </div>

          {/* Conversation history */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
              <MessageSquare className="h-4 w-4" /> Historico de Conversa
            </h3>
            {isLoading ? (
              <p className="text-xs text-muted-foreground animate-pulse">
                Carregando...
              </p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhuma mensagem encontrada
              </p>
            ) : (
              <ScrollArea className="h-[400px] pr-3">
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-2 ${
                        msg.type === "ai" ? "justify-start" : "justify-end"
                      }`}
                    >
                      {msg.type === "ai" && (
                        <Bot className="h-5 w-5 text-primary shrink-0 mt-1" />
                      )}
                      <div
                        className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                          msg.type === "ai"
                            ? "bg-muted"
                            : "bg-primary text-primary-foreground"
                        }`}
                      >
                        {msg.content}
                      </div>
                      {msg.type === "human" && (
                        <User className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

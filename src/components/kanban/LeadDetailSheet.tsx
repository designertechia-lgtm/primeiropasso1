import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, Mail, Bot, MessageSquare, User, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useToggleAgentEnabled } from "@/hooks/useUpdateLeadStage";
import type { Lead } from "@/hooks/useLeadsKanban";
import { PIPELINE_COLUMNS } from "@/hooks/useLeadsKanban";
import { useEffect, useRef } from "react";

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
  const { data: messages = [], isLoading } = useChatMessages(
    lead?.id ?? null
  );
  const toggleAgent = useToggleAgentEnabled();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
                href={`https://wa.me/${lead.whatsapp}`}
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
              {format(new Date(lead.created_at), "dd/MM/yyyy 'às' HH:mm", {
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

          {/* Informações coletadas pelo agente */}
          {lead.collected_info && Object.keys(lead.collected_info).length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4 text-primary" />
                Informações coletadas
              </h3>
              <ul className="space-y-1.5 text-sm">
                {Object.entries(lead.collected_info).map(([key, value]) => (
                  <li key={key} className="flex gap-2">
                    <span className="text-muted-foreground capitalize shrink-0">
                      {key.replace(/_/g, " ")}:
                    </span>
                    <span className="font-medium">{String(value)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-muted-foreground italic pt-1">
                Coletado automaticamente pelo agente durante a conversa.
              </p>
            </div>
          )}

          {/* Conversation history */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
              <MessageSquare className="h-4 w-4" /> Histórico de Conversa
            </h3>
            {isLoading ? (
              <p className="text-xs text-muted-foreground animate-pulse">
                Carregando...
              </p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhuma mensagem ainda. Quando o lead enviar uma mensagem via WhatsApp, a conversa aparecerá aqui em tempo real.
              </p>
            ) : (
              <ScrollArea className="h-[400px] pr-3" ref={scrollRef}>
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-2 ${
                        msg.role === "assistant" ? "justify-start" : "justify-end"
                      }`}
                    >
                      {msg.role === "assistant" && (
                        <Bot className="h-5 w-5 text-primary shrink-0 mt-1" />
                      )}
                      <div
                        className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                          msg.role === "assistant"
                            ? "bg-muted"
                            : "bg-primary text-primary-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <p className="text-[10px] opacity-60 mt-1">
                          {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      {msg.role === "user" && (
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

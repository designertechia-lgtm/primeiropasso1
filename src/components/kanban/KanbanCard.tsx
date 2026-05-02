import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Phone, Mail, Clock, Bot } from "lucide-react";
import { useToggleAgentEnabled } from "@/hooks/useUpdateLeadStage";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Lead } from "@/hooks/useLeadsKanban";

interface KanbanCardProps {
  lead: Lead;
  onClick: () => void;
  isDragging?: boolean;
}

export function KanbanCard({ lead, onClick, isDragging }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: lead.id,
  });
  const toggleAgent = useToggleAgentEnabled();

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const timeAgo = lead.last_message_at
    ? formatDistanceToNow(new Date(lead.last_message_at), {
        addSuffix: true,
        locale: ptBR,
      })
    : null;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md ${
        isDragging ? "opacity-50 shadow-lg rotate-2" : ""
      }`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-agent-toggle]")) return;
        onClick();
      }}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between">
          <span className="font-medium text-sm truncate flex-1">
            {lead.name}
          </span>
        </div>

        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {lead.whatsapp && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> {lead.whatsapp}
            </span>
          )}
          {lead.email && (
            <span className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3" /> {lead.email}
            </span>
          )}
          {timeAgo && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {timeAgo}
            </span>
          )}
        </div>

        <div
          className="flex items-center justify-between pt-1 border-t"
          data-agent-toggle
        >
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Bot className="h-3 w-3" /> Agente IA
          </span>
          <Switch
            checked={lead.agent_enabled}
            onCheckedChange={(checked) =>
              toggleAgent.mutate({ leadId: lead.id, enabled: checked })
            }
            className="scale-75"
          />
        </div>
      </CardContent>
    </Card>
  );
}

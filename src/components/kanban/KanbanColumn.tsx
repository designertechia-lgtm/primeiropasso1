import { useDroppable } from "@dnd-kit/core";
import { KanbanCard } from "./KanbanCard";
import type { Lead, PipelineStage } from "@/hooks/useLeadsKanban";

interface KanbanColumnProps {
  id: PipelineStage;
  title: string;
  color: string;
  bgColor: string;
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
}

export function KanbanColumn({
  id,
  title,
  color,
  bgColor,
  leads,
  onCardClick,
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[260px] w-[260px] rounded-lg border text-gray-900 ${bgColor} ${
        isOver ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-black/10">
        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <span className="text-sm font-semibold truncate text-gray-900">{title}</span>
        <span className="ml-auto text-xs text-gray-600 bg-white rounded-full px-2 py-0.5 font-medium">
          {leads.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
        {leads.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-4">
            Nenhum lead
          </p>
        )}
        {leads.map((lead) => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            onClick={() => onCardClick(lead)}
          />
        ))}
      </div>
    </div>
  );
}

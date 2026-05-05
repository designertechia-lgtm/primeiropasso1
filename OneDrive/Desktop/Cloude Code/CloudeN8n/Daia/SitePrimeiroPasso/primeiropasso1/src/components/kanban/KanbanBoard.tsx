import { useState } from "react";
import {
  DndContext,
  closestCorners,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";
import { useUpdateLeadStage } from "@/hooks/useUpdateLeadStage";
import type { Lead, PipelineStage } from "@/hooks/useLeadsKanban";
import { PIPELINE_COLUMNS } from "@/hooks/useLeadsKanban";

interface KanbanBoardProps {
  grouped: Record<PipelineStage, Lead[]>;
  onCardClick: (lead: Lead) => void;
}

export function KanbanBoard({ grouped, onCardClick }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const updateStage = useUpdateLeadStage();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeLead = activeId
    ? Object.values(grouped).flat().find((l) => l.id === activeId)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    const newStage = over.id as PipelineStage;

    const lead = Object.values(grouped).flat().find((l) => l.id === leadId);
    if (!lead || lead.pipeline_stage === newStage) return;

    updateStage.mutate({ leadId, newStage });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[60vh]">
        {PIPELINE_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            color={col.color}
            bgColor={col.bgColor}
            leads={grouped[col.id] || []}
            onCardClick={onCardClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeLead ? (
          <KanbanCard lead={activeLead} onClick={() => {}} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

import { useState } from "react";
import { useLeadsKanban } from "@/hooks/useLeadsKanban";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KanbanFilters } from "@/components/kanban/KanbanFilters";
import { LeadDetailSheet } from "@/components/kanban/LeadDetailSheet";
import { EvolutionConnectDialog } from "@/components/kanban/EvolutionConnectDialog";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";
import type { Lead } from "@/hooks/useLeadsKanban";

export default function AdminClientesKanban() {
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("all");
  const [platform, setPlatform] = useState<"whatsapp" | "website" | "all">("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [evolutionOpen, setEvolutionOpen] = useState(false);

  const { grouped, isLoading } = useLeadsKanban({ period, platform });

  const handleCardClick = (lead: Lead) => {
    setSelectedLead(lead);
    setSheetOpen(true);
  };

  if (isLoading) {
    return (
      <div className="animate-pulse text-muted-foreground">Carregando...</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">
          CRM — Pipeline de Clientes
        </h1>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <KanbanFilters
            period={period}
            platform={platform}
            onPeriodChange={setPeriod}
            onPlatformChange={setPlatform}
          />
          <EvolutionConnectDialog
            open={evolutionOpen}
            onOpenChange={setEvolutionOpen}
            trigger={
              <Button variant="outline" className="gap-2 shrink-0">
                <Smartphone className="h-4 w-4" />
                WhatsApp
              </Button>
            }
          />
        </div>
      </div>

      <KanbanBoard grouped={grouped} onCardClick={handleCardClick} />

      <LeadDetailSheet
        lead={selectedLead}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}

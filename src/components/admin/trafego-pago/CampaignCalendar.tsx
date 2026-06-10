import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { type Campaign, type CampaignStatus, STATUS_CONFIG } from "./types";

// Soma dias a uma data YYYY-MM-DD (FullCalendar usa end EXCLUSIVO)
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface CampaignCalendarProps {
  campaigns: Campaign[];
  onSelect: (campaign: Campaign) => void;
}

const FILTERABLE: CampaignStatus[] = ["draft", "approved", "published", "active", "paused"];

export default function CampaignCalendar({ campaigns, onSelect }: CampaignCalendarProps) {
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState<Set<CampaignStatus>>(new Set());

  const events = useMemo(() => {
    return campaigns
      .filter((c) => !hidden.has(c.status))
      .map((c) => {
        const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft;
        // Sem start_date, ancora no dia da criação; sem end_date = contínua (marcador de 1 dia)
        const start = c.start_date ?? c.created_at.slice(0, 10);
        const end = c.end_date ? addDays(c.end_date, 1) : undefined;
        return {
          id: c.id,
          title: c.name,
          start,
          end,
          allDay: true,
          backgroundColor: "#ffffff",
          borderColor: cfg.color,
          textColor: cfg.color,
          extendedProps: { campaign: c, continuous: !c.end_date },
          classNames: ["fc-event-card"],
        };
      });
  }, [campaigns, hidden]);

  function renderEventContent(arg: any) {
    const campaign: Campaign = arg.event.extendedProps.campaign;
    const continuous: boolean = arg.event.extendedProps.continuous;
    const cfg = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG.draft;
    return (
      <div className="flex gap-1.5 items-center w-full overflow-hidden px-1 py-0.5">
        <div
          className="w-5 h-5 rounded flex items-center justify-center shrink-0"
          style={{ background: `${cfg.color}22` }}
        >
          {continuous
            ? <Play className="h-3 w-3" style={{ color: cfg.color }} />
            : <cfg.icon className="h-3 w-3" style={{ color: cfg.color }} />}
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: cfg.color }}>
            <span>{cfg.label}</span>
            {continuous && (
              <>
                <span className="opacity-60">·</span>
                <span>contínua</span>
              </>
            )}
          </div>
          <div className="text-[11px] text-foreground truncate font-medium">
            R$ {Number(campaign.daily_budget_brl).toFixed(0)}/dia · {campaign.name}
          </div>
        </div>
      </div>
    );
  }

  async function persistPeriod(campaignId: string, updates: { start_date?: string | null; end_date?: string | null }) {
    const { error } = await supabase
      .from("ads_campaigns" as any)
      .update(updates)
      .eq("id", campaignId);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["ads_campaigns"] });
  }

  // Arrastar a barra inteira: move o período mantendo a duração
  async function handleEventDrop(arg: any) {
    const campaign: Campaign = arg.event.extendedProps.campaign;
    const newStart: Date | null = arg.event.start;
    if (!newStart) { arg.revert(); return; }
    const newStartIso = toIsoDate(newStart);
    try {
      if (campaign.end_date) {
        // FullCalendar end é exclusivo → -1 dia pro nosso end_date inclusivo
        const newEndIso = arg.event.end ? addDays(toIsoDate(arg.event.end), -1) : newStartIso;
        await persistPeriod(campaign.id, { start_date: newStartIso, end_date: newEndIso });
      } else {
        await persistPeriod(campaign.id, { start_date: newStartIso });
      }
      toast.success("Período da campanha atualizado.");
    } catch (e: any) {
      toast.error("Erro ao mover campanha", { description: e?.message });
      arg.revert();
    }
  }

  // Redimensionar: muda só a data de fim
  async function handleEventResize(arg: any) {
    const campaign: Campaign = arg.event.extendedProps.campaign;
    if (!arg.event.end) { arg.revert(); return; }
    const newEndIso = addDays(toIsoDate(arg.event.end), -1);
    try {
      await persistPeriod(campaign.id, { end_date: newEndIso });
      toast.success("Data de fim atualizada.");
    } catch (e: any) {
      toast.error("Erro ao redimensionar", { description: e?.message });
      arg.revert();
    }
  }

  function toggleStatus(s: CampaignStatus) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {/* Filtros por status — mesmo padrão de chips do calendário de publicações */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground mr-1">Mostrar:</span>
        {FILTERABLE.map((s) => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          const isOff = hidden.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition ${
                isOff
                  ? "bg-muted text-muted-foreground border-transparent"
                  : "border-current bg-background"
              }`}
              style={!isOff ? { color: cfg.color } : undefined}
              aria-pressed={!isOff}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
            </button>
          );
        })}
      </div>

      <Card className="p-3 fc-host">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={ptBrLocale}
          headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
          buttonText={{ today: "Hoje" }}
          height="auto"
          events={events}
          eventClick={(arg) => {
            const campaign = arg.event.extendedProps?.campaign as Campaign | undefined;
            if (campaign) onSelect(campaign);
          }}
          editable
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventDisplay="block"
          eventContent={renderEventContent}
          dayMaxEvents={3}
          nowIndicator
          firstDay={1}
        />
      </Card>

      <p className="text-xs text-muted-foreground">
        Arraste uma campanha pra mudar o período, ou estique a borda pra ajustar a data de fim. Clique pra abrir os detalhes.
      </p>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";

import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Instagram, Facebook, Linkedin, AtSign, Loader2 } from "lucide-react";
import { TikTokIcon } from "@/components/icons/TikTokIcon";
import SchedulePostDialog, { type CalendarPost, type Platform, PLATFORM_META } from "./SchedulePostDialog";

const PLATFORM_ICONS = {
  instagram: Instagram,
  facebook:  Facebook,
  threads:   AtSign,
  linkedin:  Linkedin,
  tiktok:    TikTokIcon,
} as const;

export default function PublicationCalendarTab() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [editing,      setEditing]      = useState<CalendarPost | null>(null);
  const [defaultDate,  setDefaultDate]  = useState<string | null>(null);
  const [hidden,       setHidden]       = useState<Set<Platform>>(new Set());

  const { data: posts = [], isLoading } = useQuery<CalendarPost[]>({
    queryKey: ["calendar-posts", professional?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("social_posts")
        .select("id, platform, scheduled_at, description, status, post_type, video_id, article_id, image_url, carousel_image_urls, error_message")
        .eq("professional_id", professional!.id)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CalendarPost[];
    },
    enabled: !!professional?.id,
  });

  const events = useMemo(() => {
    return posts
      .filter((p) => !hidden.has(p.platform))
      .map((p) => {
        const meta   = PLATFORM_META[p.platform];
        const isDone = p.status === "published";
        const isFail = p.status === "failed";
        const isCanc = p.status === "cancelled";
        return {
          id:    p.id,
          title: (p.description?.trim() || "(sem legenda)").slice(0, 80),
          start: p.scheduled_at,
          backgroundColor: isCanc ? "#9CA3AF" : meta.color,
          borderColor:     isFail ? "#DC2626" : (isCanc ? "#6B7280" : meta.color),
          textColor:       "#ffffff",
          extendedProps:   { post: p },
          classNames: [
            isDone ? "fc-event-published" : "",
            isCanc ? "fc-event-cancelled" : "",
            isFail ? "fc-event-failed"    : "",
          ].filter(Boolean),
        };
      });
  }, [posts, hidden]);

  function handleSelect(arg: { startStr: string }) {
    setEditing(null);
    setDefaultDate(arg.startStr);
    setDialogOpen(true);
  }

  function handleEventClick(arg: any) {
    const post = arg.event.extendedProps?.post as CalendarPost | undefined;
    if (!post) return;
    setEditing(post);
    setDefaultDate(null);
    setDialogOpen(true);
  }

  async function handleEventDrop(arg: any) {
    const post: CalendarPost | undefined = arg.event.extendedProps?.post;
    const newDate: Date | null = arg.event.start;
    if (!post || !newDate) return;
    if (post.status !== "pending") {
      toast.error("Só dá pra reagendar publicações pendentes.");
      arg.revert();
      return;
    }
    const { error } = await (supabase as any)
      .from("social_posts")
      .update({ scheduled_at: newDate.toISOString() })
      .eq("id", post.id);
    if (error) {
      toast.error("Erro ao reagendar", { description: error.message });
      arg.revert();
    } else {
      toast.success("Reagendado!");
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
    }
  }

  function togglePlatform(p: Platform) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">
            Calendário de Publicações
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Planeje seus posts. Clique numa data vazia pra agendar, ou arraste pra remarcar.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDefaultDate(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Nova publicação
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground mr-1">Mostrar:</span>
        {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
          const meta = PLATFORM_META[p];
          const Icon = PLATFORM_ICONS[p];
          const isOff = hidden.has(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition ${
                isOff
                  ? "bg-muted text-muted-foreground border-transparent"
                  : "border-current bg-background"
              }`}
              style={!isOff ? { color: meta.color } : undefined}
              aria-pressed={!isOff}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </button>
          );
        })}
      </div>

      <Card className="p-3 fc-host">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando publicações…
          </div>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={ptBrLocale}
            headerToolbar={{
              left:   "prev,next today",
              center: "title",
              right:  "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            buttonText={{ today: "Hoje", month: "Mês", week: "Semana", day: "Dia" }}
            height="auto"
            events={events}
            selectable
            select={handleSelect}
            eventClick={handleEventClick}
            editable
            eventDrop={handleEventDrop}
            eventDisplay="block"
            dayMaxEvents={3}
            nowIndicator
            firstDay={1}
          />
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-primary" /> Agendado
        </span>
        <span className="flex items-center gap-1.5 opacity-70">
          <span className="w-3 h-3 rounded bg-primary" /> Publicado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-primary border-2 border-red-600" /> Falhou
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-400" /> Cancelado
        </span>
      </div>

      <SchedulePostDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultDate={defaultDate}
        professionalId={professional?.id ?? null}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
          setDialogOpen(false);
        }}
      />
    </div>
  );
}

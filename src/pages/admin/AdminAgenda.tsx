import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, X, User, Ban, Clock } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { EventInput, EventClickArg, DateSelectArg } from "@fullcalendar/core";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(45, 80%, 50%)",
  confirmed: "hsl(var(--primary))",
  completed: "hsl(var(--accent))",
  cancelled: "hsl(var(--destructive))",
};

export default function AdminAgenda() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  // Fetch professional services for default duration
  const { data: services = [] } = useQuery({
    queryKey: ["agenda-services", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("professional_services")
        .select("id, name, duration_minutes")
        .eq("professional_id", professional!.id)
        .eq("active", true)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });
  const calendarRef = useRef<FullCalendar>(null);
  const isMobile = useIsMobile();

  // Block dialog state
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockTitle, setBlockTitle] = useState("Compromisso pessoal");
  const [blockDate, setBlockDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [blockStartTime, setBlockStartTime] = useState("09:00");
  const [blockEndTime, setBlockEndTime] = useState("10:00");
  const [blockType, setBlockType] = useState("personal");

  // Event detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // Fetch all availability
  const { data: availability = [] } = useQuery({
    queryKey: ["agenda-availability", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("availability")
        .select("*")
        .eq("professional_id", professional!.id)
        .eq("active", true);
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  // Fetch appointments (wide range)
  const { data: appointments = [], refetch: refetchAppointments } = useQuery({
    queryKey: ["agenda-appointments-all", professional?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, professional_services(name)")
        .eq("professional_id", professional!.id)
        .in("status", ["pending", "confirmed", "completed"]);
      if (error) throw error;

      // Filter only bookings for the appointment events
      const bookings = data.filter((a) => !a.appointment_type || a.appointment_type === 'booking');
      const patientIds = [...new Set(bookings.map((a) => a.patient_id).filter(Boolean))];
      if (patientIds.length === 0) return bookings.map((a) => ({ ...a, patientName: "Paciente" }));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", patientIds);
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);

      return bookings.map((a) => ({
        ...a,
        patientName: profileMap.get(a.patient_id) || "Paciente",
      }));
    },
    enabled: !!professional?.id,
  });

  // Fetch all blocks (from appointments table with appointment_type = 'block')
  const { data: blocks = [], refetch: refetchBlocks } = useQuery({
    queryKey: ["agenda-blocks-all", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .eq("professional_id", professional!.id)
        .eq("appointment_type", "block");
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  // Realtime subscriptions
  useEffect(() => {
    if (!professional?.id) return;

    const channel = supabase
      .channel("agenda-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `professional_id=eq.${professional.id}` },
        () => refetchAppointments()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `professional_id=eq.${professional.id}` },
        () => { refetchAppointments(); refetchBlocks(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [professional?.id, refetchAppointments, refetchBlocks]);

  // Add block mutation (now inserts into appointments table)
  const addBlock = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("appointments").insert({
        professional_id: professional!.id,
        appointment_date: blockDate,
        start_time: blockStartTime,
        end_time: blockEndTime,
        notes: blockTitle,
        block_type: blockType,
        appointment_type: "block",
        status: "confirmed" as const,
        patient_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      toast.success("Bloqueio adicionado!");
      setBlockDialogOpen(false);
      resetBlockForm();
    },
    onError: () => toast.error("Erro ao adicionar bloqueio"),
  });

  // Remove block mutation (now deletes from appointments table)
  const removeBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      toast.success("Bloqueio removido!");
      setDetailDialogOpen(false);
    },
    onError: () => toast.error("Erro ao remover bloqueio"),
  });

  const resetBlockForm = () => {
    setBlockTitle("Compromisso pessoal");
    setBlockStartTime("09:00");
    setBlockEndTime("10:00");
    setBlockType("personal");
  };

  // Build FullCalendar events
  const buildEvents = useCallback((): EventInput[] => {
    const events: EventInput[] = [];

    // Appointments
    appointments.forEach((appt: any) => {
      events.push({
        id: `appt-${appt.id}`,
        title: `${appt.patientName} — ${appt.professional_services?.name || "Consulta"}`,
        start: `${appt.appointment_date}T${appt.start_time}`,
        end: `${appt.appointment_date}T${appt.end_time}`,
        backgroundColor: STATUS_COLORS[appt.status] || "hsl(var(--primary))",
        borderColor: STATUS_COLORS[appt.status] || "hsl(var(--primary))",
        textColor: "#fff",
        extendedProps: {
          type: "appointment",
          ...appt,
        },
      });
    });

    // Blocks (now from appointments table)
    blocks.forEach((block: any) => {
      events.push({
        id: `block-${block.id}`,
        title: block.notes || "Bloqueado",
        start: `${block.appointment_date}T${block.start_time}`,
        end: `${block.appointment_date}T${block.end_time}`,
        backgroundColor: "hsl(var(--destructive))",
        borderColor: "hsl(var(--destructive))",
        textColor: "#fff",
        extendedProps: {
          type: "block",
          ...block,
        },
      });
    });

    // Availability as background events (recurring weekly)
    availability.forEach((avail) => {
      events.push({
        id: `avail-${avail.id}`,
        title: "",
        daysOfWeek: [avail.day_of_week],
        startTime: avail.start_time,
        endTime: avail.end_time,
        display: "background",
        backgroundColor: "hsl(var(--primary) / 0.12)",
        extendedProps: {
          type: "availability",
        },
      });
    });

    return events;
  }, [appointments, blocks, availability]);

  // Handle event click
  const handleEventClick = (info: EventClickArg) => {
    const props = info.event.extendedProps;
    if (props.type === "availability") return;
    setSelectedEvent(props);
    setDetailDialogOpen(true);
  };

  // Handle date select (create block)
  const handleDateSelect = (info: DateSelectArg) => {
    const start = info.start;
    const defaultDuration = services.length > 0 ? services[0].duration_minutes : 60;
    const calculatedEnd = new Date(start.getTime() + defaultDuration * 60000);
    setBlockDate(format(start, "yyyy-MM-dd"));
    setBlockStartTime(format(start, "HH:mm"));
    setBlockEndTime(format(calculatedEnd, "HH:mm"));
    setBlockDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <Button
          size="sm"
          onClick={() => {
            setBlockDate(format(new Date(), "yyyy-MM-dd"));
            resetBlockForm();
            setBlockDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Bloquear horário
        </Button>
      </div>

      <div className="fc-wrapper bg-card rounded-lg border p-2 sm:p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,timeGridDay",
          }}
          locale="pt-br"
          firstDay={0}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          snapDuration="00:15:00"
          slotDuration="00:30:00"
          slotLabelInterval="01:00:00"
          slotLabelFormat={{
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }}
          allDaySlot={false}
          nowIndicator={true}
          selectable={true}
          selectMirror={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          events={buildEvents()}
          height="auto"
          expandRows={true}
          dayHeaderFormat={{ weekday: "short", day: "numeric", month: "numeric" }}
          buttonText={{
            today: "Hoje",
            week: "Semana",
            day: "Dia",
          }}
          eventTimeFormat={{
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }}
        />
      </div>

      {/* Block Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear horário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={blockTitle} onChange={(e) => setBlockTitle(e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Início</Label>
                <Input type="time" value={blockStartTime} onChange={(e) => setBlockStartTime(e.target.value)} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="time" value={blockEndTime} onChange={(e) => setBlockEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={blockType} onValueChange={setBlockType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Pessoal</SelectItem>
                  <SelectItem value="vacation">Férias / Folga</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => addBlock.mutate()} disabled={addBlock.isPending} className="w-full">
              {addBlock.isPending ? "Salvando..." : "Confirmar bloqueio"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Event Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedEvent?.type === "appointment" ? "Consulta" : "Bloqueio"}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-3">
              {selectedEvent.type === "appointment" && (
                <>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <span className="font-medium">{selectedEvent.patientName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {selectedEvent.start_time?.slice(0, 5)} – {selectedEvent.end_time?.slice(0, 5)}
                    </span>
                  </div>
                  {selectedEvent.professional_services?.name && (
                    <div className="text-sm text-muted-foreground">
                      Serviço: {selectedEvent.professional_services.name}
                    </div>
                  )}
                  <Badge variant="outline">
                    {STATUS_LABELS[selectedEvent.status] || selectedEvent.status}
                  </Badge>
                  {selectedEvent.notes && (
                    <p className="text-sm text-muted-foreground border-t pt-2">{selectedEvent.notes}</p>
                  )}
                </>
              )}
              {selectedEvent.type === "block" && (
                <>
                  <div className="flex items-center gap-2">
                    <Ban className="h-4 w-4 text-destructive" />
                    <span className="font-medium">{selectedEvent.notes || "Bloqueado"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {selectedEvent.start_time?.slice(0, 5)} – {selectedEvent.end_time?.slice(0, 5)}
                    </span>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => selectedEvent.id && removeBlock.mutate(selectedEvent.id)}
                    disabled={removeBlock.isPending}
                  >
                    <X className="h-4 w-4 mr-1" />
                    {removeBlock.isPending ? "Removendo..." : "Remover bloqueio"}
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

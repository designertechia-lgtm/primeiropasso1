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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, User, Ban, Clock, CalendarIcon, Settings2, Pencil } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { generateRecurrenceDates, type RecurrenceType } from "@/lib/recurrence";
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

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  unico: "Único",
  diario: "Diário",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  selecionavel: "Datas específicas",
};

interface AvailSlot {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

export default function AdminAgenda() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

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
  const [blockDate, setBlockDate] = useState<Date>(new Date());
  const [blockStartTime, setBlockStartTime] = useState("09:00");
  const [blockEndTime, setBlockEndTime] = useState("10:00");
  const [blockType, setBlockType] = useState("personal");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("unico");
  const [recEndDate, setRecEndDate] = useState<Date>(new Date());
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);

  // Event detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);

  // Edit block fields
  const [editBlockTitle, setEditBlockTitle] = useState("");
  const [editBlockStartTime, setEditBlockStartTime] = useState("");
  const [editBlockEndTime, setEditBlockEndTime] = useState("");
  const [editBlockType, setEditBlockType] = useState("personal");
  const [editBlockDate, setEditBlockDate] = useState<Date>(new Date());

  // Edit appointment fields
  const [editApptStatus, setEditApptStatus] = useState("pending");
  const [editApptNotes, setEditApptNotes] = useState("");
  const [editApptStartTime, setEditApptStartTime] = useState("");
  const [editApptEndTime, setEditApptEndTime] = useState("");
  const [editApptDate, setEditApptDate] = useState<Date>(new Date());

  // Availability dialog
  const [availDialogOpen, setAvailDialogOpen] = useState(false);
  const [savingAvail, setSavingAvail] = useState(false);

  // Fetch availability
  const { data: availability = [] } = useQuery({
    queryKey: ["agenda-availability", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("availability")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("day_of_week")
        .order("start_time");
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const [localSlots, setLocalSlots] = useState<AvailSlot[]>([]);
  useEffect(() => {
    if (availability.length > 0) {
      setLocalSlots(availability.map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        active: s.active,
      })));
    }
  }, [availability]);

  // Fetch appointments
  const { data: appointments = [], refetch: refetchAppointments } = useQuery({
    queryKey: ["agenda-appointments-all", professional?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, professional_services(name)")
        .eq("professional_id", professional!.id)
        .in("status", ["pending", "confirmed", "completed"]);
      if (error) throw error;

      const bookings = data.filter((a) => !a.appointment_type || a.appointment_type === "booking");
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

  // Fetch blocks
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

  // Realtime
  useEffect(() => {
    if (!professional?.id) return;
    const channel = supabase
      .channel("agenda-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `professional_id=eq.${professional.id}` }, () => {
        refetchAppointments();
        refetchBlocks();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [professional?.id, refetchAppointments, refetchBlocks]);

  // Add block mutation with recurrence
  const addBlock = useMutation({
    mutationFn: async () => {
      if (!professional) throw new Error("No professional");

      let dates: string[];
      if (recurrence === "selecionavel") {
        dates = selectedDates.map((d) => format(d, "yyyy-MM-dd"));
      } else if (recurrence === "unico") {
        dates = [format(blockDate, "yyyy-MM-dd")];
      } else {
        dates = generateRecurrenceDates(blockDate, recEndDate, recurrence);
      }

      if (dates.length === 0) throw new Error("Nenhuma data");

      const recurrenceGroup = dates.length > 1 ? crypto.randomUUID() : null;

      const records = dates.map((date) => ({
        professional_id: professional.id,
        appointment_date: date,
        start_time: blockStartTime,
        end_time: blockEndTime,
        notes: blockTitle,
        block_type: blockType,
        appointment_type: "block" as const,
        status: "confirmed" as const,
        patient_id: null,
        recurrence_group: recurrenceGroup,
      }));

      const { error } = await supabase.from("appointments").insert(records);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] });
      toast.success("Bloqueio adicionado!");
      setBlockDialogOpen(false);
      resetBlockForm();
    },
    onError: () => toast.error("Erro ao adicionar bloqueio"),
  });

  // Remove single block
  const removeBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] });
      toast.success("Bloqueio removido!");
      setDetailDialogOpen(false);
    },
    onError: () => toast.error("Erro ao remover bloqueio"),
  });

  // Remove entire series
  const removeBlockSeries = useMutation({
    mutationFn: async (recurrenceGroup: string) => {
      const { error } = await supabase.from("appointments").delete().eq("recurrence_group", recurrenceGroup);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] });
      toast.success("Série de bloqueios removida!");
      setDetailDialogOpen(false);
    },
    onError: () => toast.error("Erro ao remover série"),
  });

  // Update block mutation
  const updateBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("appointments")
        .update({
          notes: editBlockTitle,
          start_time: editBlockStartTime,
          end_time: editBlockEndTime,
          block_type: editBlockType,
          appointment_date: format(editBlockDate, "yyyy-MM-dd"),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      toast.success("Bloqueio atualizado!");
      setDetailDialogOpen(false);
      setEditMode(false);
    },
    onError: () => toast.error("Erro ao atualizar bloqueio"),
  });

  // Update appointment mutation
  const updateAppointment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("appointments")
        .update({
          status: editApptStatus as any,
          notes: editApptNotes || null,
          start_time: editApptStartTime,
          end_time: editApptEndTime,
          appointment_date: format(editApptDate, "yyyy-MM-dd"),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      toast.success("Agendamento atualizado!");
      setDetailDialogOpen(false);
      setEditMode(false);
    },
    onError: () => toast.error("Erro ao atualizar agendamento"),
  });

  const enterEditMode = () => {
    if (!selectedEvent) return;
    if (selectedEvent.type === "block") {
      setEditBlockTitle(selectedEvent.notes || "");
      setEditBlockStartTime(selectedEvent.start_time?.slice(0, 5) || "09:00");
      setEditBlockEndTime(selectedEvent.end_time?.slice(0, 5) || "10:00");
      setEditBlockType(selectedEvent.block_type || "personal");
      setEditBlockDate(new Date(selectedEvent.appointment_date + "T12:00:00"));
    } else {
      setEditApptStatus(selectedEvent.status || "pending");
      setEditApptNotes(selectedEvent.notes || "");
      setEditApptStartTime(selectedEvent.start_time?.slice(0, 5) || "09:00");
      setEditApptEndTime(selectedEvent.end_time?.slice(0, 5) || "10:00");
      setEditApptDate(new Date(selectedEvent.appointment_date + "T12:00:00"));
    }
    setEditMode(true);
  };


  const handleSaveAvailability = async () => {
    if (!professional) return;
    setSavingAvail(true);
    await supabase.from("availability").delete().eq("professional_id", professional.id);
    if (localSlots.length > 0) {
      const { error } = await supabase.from("availability").insert(
        localSlots.map((s) => ({
          professional_id: professional.id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          active: s.active,
        }))
      );
      if (error) {
        toast.error("Erro ao salvar", { description: error.message });
        setSavingAvail(false);
        return;
      }
    }
    toast.success("Disponibilidade salva!");
    queryClient.invalidateQueries({ queryKey: ["agenda-availability"] });
    setSavingAvail(false);
    setAvailDialogOpen(false);
  };

  const resetBlockForm = () => {
    setBlockTitle("Compromisso pessoal");
    setBlockStartTime("09:00");
    setBlockEndTime("10:00");
    setBlockType("personal");
    setRecurrence("unico");
    setSelectedDates([]);
  };

  // Build events
  const buildEvents = useCallback((): EventInput[] => {
    const events: EventInput[] = [];

    appointments.forEach((appt: any) => {
      events.push({
        id: `appt-${appt.id}`,
        title: `${appt.patientName} — ${appt.professional_services?.name || "Consulta"}`,
        start: `${appt.appointment_date}T${appt.start_time}`,
        end: `${appt.appointment_date}T${appt.end_time}`,
        backgroundColor: STATUS_COLORS[appt.status] || "hsl(var(--primary))",
        borderColor: STATUS_COLORS[appt.status] || "hsl(var(--primary))",
        textColor: "#fff",
        extendedProps: { type: "appointment", ...appt },
      });
    });

    blocks.forEach((block: any) => {
      events.push({
        id: `block-${block.id}`,
        title: block.notes || "Bloqueado",
        start: `${block.appointment_date}T${block.start_time}`,
        end: `${block.appointment_date}T${block.end_time}`,
        backgroundColor: "hsl(var(--destructive))",
        borderColor: "hsl(var(--destructive))",
        textColor: "#fff",
        extendedProps: { type: "block", ...block },
      });
    });

    availability.filter((a) => a.active).forEach((avail) => {
      events.push({
        id: `avail-${avail.id}`,
        title: "",
        daysOfWeek: [avail.day_of_week],
        startTime: avail.start_time,
        endTime: avail.end_time,
        display: "background",
        backgroundColor: "hsl(var(--primary) / 0.12)",
        extendedProps: { type: "availability" },
      });
    });

    return events;
  }, [appointments, blocks, availability]);

  const handleEventClick = (info: EventClickArg) => {
    const props = info.event.extendedProps;
    if (props.type === "availability") return;
    setSelectedEvent(props);
    setDetailDialogOpen(true);
  };

  const handleDateSelect = (info: DateSelectArg) => {
    const start = info.start;
    const defaultDuration = services.length > 0 ? services[0].duration_minutes : 60;
    const calculatedEnd = new Date(start.getTime() + defaultDuration * 60000);
    setBlockDate(start);
    setBlockStartTime(format(start, "HH:mm"));
    setBlockEndTime(format(calculatedEnd, "HH:mm"));
    setRecurrence("unico");
    setBlockDialogOpen(true);
  };

  const addAvailSlot = (day: number) => {
    setLocalSlots([...localSlots, { day_of_week: day, start_time: "08:00", end_time: "17:00", active: true }]);
  };

  const removeAvailSlot = (index: number) => {
    setLocalSlots(localSlots.filter((_, i) => i !== index));
  };

  const updateAvailSlot = (index: number, field: keyof AvailSlot, value: string | boolean) => {
    setLocalSlots(localSlots.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAvailDialogOpen(true)}>
            <Settings2 className="h-4 w-4 mr-1" /> Horários de Atendimento
          </Button>
          <Button size="sm" onClick={() => { setBlockDate(new Date()); resetBlockForm(); setBlockDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Bloquear horário
          </Button>
        </div>
      </div>

      <div className="fc-wrapper bg-card rounded-lg border p-2 sm:p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridWeek,timeGridDay" }}
          locale="pt-br"
          firstDay={0}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          snapDuration="00:15:00"
          slotDuration="00:30:00"
          slotLabelInterval="01:00:00"
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
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
          buttonText={{ today: "Hoje", week: "Semana", day: "Dia" }}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        />
      </div>

      {/* Block Dialog with Recurrence */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bloquear horário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={blockTitle} onChange={(e) => setBlockTitle(e.target.value)} />
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Pessoal</SelectItem>
                  <SelectItem value="vacation">Férias / Folga</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Recorrência</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as RecurrenceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {recurrence === "unico" && (
              <div>
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(blockDate, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={blockDate} onSelect={(d) => d && setBlockDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {(recurrence === "diario" || recurrence === "semanal" || recurrence === "quinzenal") && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data início</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(blockDate, "dd/MM/yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={blockDate} onSelect={(d) => d && setBlockDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Data fim</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(recEndDate, "dd/MM/yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={recEndDate} onSelect={(d) => d && setRecEndDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {recurrence === "selecionavel" && (
              <div>
                <Label>Selecione as datas</Label>
                <div className="border rounded-md p-2 mt-1">
                  <Calendar
                    mode="multiple"
                    selected={selectedDates}
                    onSelect={(dates) => setSelectedDates(dates || [])}
                    locale={ptBR}
                    className="p-3 pointer-events-auto mx-auto"
                  />
                  {selectedDates.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">{selectedDates.length} data(s)</p>
                  )}
                </div>
              </div>
            )}

            <Button onClick={() => addBlock.mutate()} disabled={addBlock.isPending} className="w-full">
              {addBlock.isPending ? "Salvando..." : "Confirmar bloqueio"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Event Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => { setDetailDialogOpen(open); if (!open) setEditMode(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedEvent?.type === "appointment" ? "Consulta" : "Bloqueio"}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && !editMode && (
            <div className="space-y-3">
              {selectedEvent.type === "appointment" && (
                <>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <span className="font-medium">{selectedEvent.patientName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(selectedEvent.appointment_date + "T12:00:00"), "dd/MM/yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedEvent.start_time?.slice(0, 5)} – {selectedEvent.end_time?.slice(0, 5)}</span>
                  </div>
                  {selectedEvent.professional_services?.name && (
                    <div className="text-sm text-muted-foreground">Serviço: {selectedEvent.professional_services.name}</div>
                  )}
                  <Badge variant="outline">{STATUS_LABELS[selectedEvent.status] || selectedEvent.status}</Badge>
                  {selectedEvent.notes && <p className="text-sm text-muted-foreground border-t pt-2">{selectedEvent.notes}</p>}
                  <Button variant="outline" size="sm" onClick={enterEditMode} className="w-full">
                    <Pencil className="h-4 w-4 mr-1" /> Editar agendamento
                  </Button>
                </>
              )}
              {selectedEvent.type === "block" && (
                <>
                  <div className="flex items-center gap-2">
                    <Ban className="h-4 w-4 text-destructive" />
                    <span className="font-medium">{selectedEvent.notes || "Bloqueado"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(selectedEvent.appointment_date + "T12:00:00"), "dd/MM/yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedEvent.start_time?.slice(0, 5)} – {selectedEvent.end_time?.slice(0, 5)}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" size="sm" onClick={enterEditMode} className="w-full">
                      <Pencil className="h-4 w-4 mr-1" /> Editar bloqueio
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => selectedEvent.id && removeBlock.mutate(selectedEvent.id)}
                      disabled={removeBlock.isPending}
                    >
                      <X className="h-4 w-4 mr-1" />
                      {removeBlock.isPending ? "Removendo..." : "Remover este bloqueio"}
                    </Button>
                    {selectedEvent.recurrence_group && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeBlockSeries.mutate(selectedEvent.recurrence_group)}
                        disabled={removeBlockSeries.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        {removeBlockSeries.isPending ? "Removendo..." : "Remover toda a série"}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Edit Mode - Block */}
          {selectedEvent && editMode && selectedEvent.type === "block" && (
            <div className="space-y-4">
              <div>
                <Label>Título</Label>
                <Input value={editBlockTitle} onChange={(e) => setEditBlockTitle(e.target.value)} />
              </div>
              <div>
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(editBlockDate, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editBlockDate} onSelect={(d) => d && setEditBlockDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Início</Label>
                  <Input type="time" value={editBlockStartTime} onChange={(e) => setEditBlockStartTime(e.target.value)} />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input type="time" value={editBlockEndTime} onChange={(e) => setEditBlockEndTime(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={editBlockType} onValueChange={setEditBlockType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Pessoal</SelectItem>
                    <SelectItem value="vacation">Férias / Folga</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditMode(false)} className="flex-1">Cancelar</Button>
                <Button onClick={() => updateBlock.mutate(selectedEvent.id)} disabled={updateBlock.isPending} className="flex-1">
                  {updateBlock.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}

          {/* Edit Mode - Appointment */}
          {selectedEvent && editMode && selectedEvent.type === "appointment" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>{selectedEvent.patientName}</span>
              </div>
              <div>
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(editApptDate, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editApptDate} onSelect={(d) => d && setEditApptDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Início</Label>
                  <Input type="time" value={editApptStartTime} onChange={(e) => setEditApptStartTime(e.target.value)} />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input type="time" value={editApptEndTime} onChange={(e) => setEditApptEndTime(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editApptStatus} onValueChange={setEditApptStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="confirmed">Confirmado</SelectItem>
                    <SelectItem value="completed">Concluído</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={editApptNotes} onChange={(e) => setEditApptNotes(e.target.value)} placeholder="Notas sobre a consulta..." rows={3} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditMode(false)} className="flex-1">Cancelar</Button>
                <Button onClick={() => updateAppointment.mutate(selectedEvent.id)} disabled={updateAppointment.isPending} className="flex-1">
                  {updateAppointment.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Availability Dialog */}
      <Dialog open={availDialogOpen} onOpenChange={setAvailDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Horários de Atendimento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Defina os horários em que você atende em cada dia da semana.</p>
          <div className="space-y-4 mt-2">
            {DAYS.map((name, day) => {
              const daySlots = localSlots
                .map((s, idx) => ({ ...s, _index: idx }))
                .filter((s) => s.day_of_week === day);
              return (
                <div key={day} className="border rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{name}</span>
                    <Button variant="ghost" size="sm" onClick={() => addAvailSlot(day)}>
                      <Plus className="h-3 w-3 mr-1" /> Horário
                    </Button>
                  </div>
                  {daySlots.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem horários</p>
                  ) : (
                    daySlots.map((slot) => (
                      <div key={slot._index} className="flex items-center gap-2 mb-1 flex-wrap">
                        <Input type="time" value={slot.start_time} onChange={(e) => updateAvailSlot(slot._index, "start_time", e.target.value)} className="w-24 h-8 text-xs" />
                        <span className="text-xs">–</span>
                        <Input type="time" value={slot.end_time} onChange={(e) => updateAvailSlot(slot._index, "end_time", e.target.value)} className="w-24 h-8 text-xs" />
                        <Switch checked={slot.active} onCheckedChange={(v) => updateAvailSlot(slot._index, "active", v)} />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAvailSlot(slot._index)}>
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
          <Button onClick={handleSaveAvailability} disabled={savingAvail} className="w-full mt-2">
            {savingAvail ? "Salvando..." : "Salvar Disponibilidade"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StatusColorsDialog from "@/components/admin/StatusColorsDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, User, Clock, CalendarIcon, Settings2, Pencil, CheckCircle, DollarSign, XCircle, CalendarDays, HelpCircle, ZoomIn, Settings, Globe, Link2, Copy, Palette, Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { fetchIcal } from "@/lib/ical";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { generateRecurrenceDates, type RecurrenceType } from "@/lib/recurrence";
import type { EventInput, EventClickArg, DateSelectArg, EventApi } from "@fullcalendar/core";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const DEFAULT_STATUS_COLORS: Record<string, string> = {
  pending: "#EAB308",
  confirmed: "#22C55E",
  completed: "#3B82F6",
  cancelled: "#EF4444",
};

const DEFAULT_PAYMENT_COLORS: Record<string, string> = {
  pending: "#F97316",
  paid: "#10B981",
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: "Pgto Pendente",
  paid: "Pago",
};

// F19 — paleta de cor por evento (estilo Google Agenda). "Auto" = sem cor → usa a cor do status.
const EVENT_COLORS = ["#3B82F6", "#22C55E", "#EF4444", "#EAB308", "#A855F7", "#EC4899", "#14B8A6", "#F97316", "#64748B"];

function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "h-7 px-2 rounded-full border-2 text-[10px] font-medium text-muted-foreground",
          !value ? "border-foreground" : "border-muted",
        )}
        title="Automática (usa a cor do status)"
      >
        Auto
      </button>
      {EVENT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn("h-7 w-7 rounded-full border-2", value === c ? "border-foreground" : "border-transparent")}
          style={{ backgroundColor: c }}
          aria-label={`Cor ${c}`}
        />
      ))}
    </div>
  );
}

// Título do agendamento: escolhe um cliente (tabela leads) com busca, ou "Compromisso
// pessoal", ou qualquer texto livre digitado. Filtragem manual (shouldFilter={false}).
function TituloCombobox({
  value,
  onChange,
  leads,
  pastTitles = [],
}: {
  value: string;
  onChange: (v: string, leadId: string | null) => void;
  leads: Array<{ id: string; name: string }>;
  pastTitles?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filtered = q ? leads.filter((l) => l.name.toLowerCase().includes(q)) : leads;
  const leadNames = new Set(leads.map((l) => l.name.toLowerCase()));
  const past = (q ? pastTitles.filter((t) => t.toLowerCase().includes(q)) : pastTitles)
    .filter((t) => !leadNames.has(t.toLowerCase()))
    .slice(0, 30);
  const showPessoal = !q || "compromisso pessoal".includes(q);
  const hasExact =
    q === "compromisso pessoal"
    || leads.some((l) => l.name.toLowerCase() === q)
    || pastTitles.some((t) => t.toLowerCase() === q);
  const pick = (v: string, leadId: string | null) => { onChange(v, leadId); setOpen(false); setSearch(""); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="truncate">{value || "Selecione um cliente ou digite…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar cliente…" value={search} onValueChange={setSearch} />
          <CommandList>
            {showPessoal && (
              <CommandGroup>
                <CommandItem value="__pessoal" onSelect={() => pick("Compromisso pessoal", null)}>
                  <Check className={cn("mr-2 h-4 w-4", value === "Compromisso pessoal" ? "opacity-100" : "opacity-0")} />
                  Compromisso pessoal
                </CommandItem>
              </CommandGroup>
            )}
            {filtered.length > 0 && (
              <CommandGroup heading="Clientes">
                {filtered.map((l) => (
                  <CommandItem key={l.id} value={l.id} onSelect={() => pick(l.name, l.id)}>
                    <Check className={cn("mr-2 h-4 w-4", value === l.name ? "opacity-100" : "opacity-0")} />
                    {l.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {past.length > 0 && (
              <CommandGroup heading="Já usados">
                {past.map((t) => (
                  <CommandItem key={`past-${t}`} value={`past-${t}`} onSelect={() => pick(t, null)}>
                    <Check className={cn("mr-2 h-4 w-4", value === t ? "opacity-100" : "opacity-0")} />
                    {t}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {search.trim() && !hasExact && (
              <CommandGroup heading="Outro">
                <CommandItem value="__livre" onSelect={() => pick(search.trim(), null)}>
                  <Plus className="mr-2 h-4 w-4" /> Usar “{search.trim()}”
                </CommandItem>
              </CommandGroup>
            )}
            {!showPessoal && filtered.length === 0 && past.length === 0 && !search.trim() && (
              <CommandEmpty>Nenhum cliente.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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

export default function AdminAgendaCalendario() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const getStatusColor = useCallback((status: string) => {
    if (!professional) return DEFAULT_STATUS_COLORS[status] || DEFAULT_STATUS_COLORS.pending;
    const map: Record<string, string | null | undefined> = {
      pending: (professional as any).color_status_pending,
      confirmed: (professional as any).color_status_confirmed,
      completed: (professional as any).color_status_completed,
      cancelled: (professional as any).color_status_cancelled,
    };
    return map[status] || DEFAULT_STATUS_COLORS[status] || DEFAULT_STATUS_COLORS.pending;
  }, [professional]);

  const getPaymentColor = useCallback((status: string) => {
    if (!professional) return DEFAULT_PAYMENT_COLORS[status] || DEFAULT_PAYMENT_COLORS.pending;
    const map: Record<string, string | null | undefined> = {
      pending: (professional as any).color_payment_pending,
      paid: (professional as any).color_payment_paid,
    };
    return map[status] || DEFAULT_PAYMENT_COLORS[status] || DEFAULT_PAYMENT_COLORS.pending;
  }, [professional]);

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

  // Clientes (tabela leads) para o combobox do título do agendamento.
  const { data: leads = [] } = useQuery({
    queryKey: ["agenda-leads", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, name")
        .eq("professional_id", professional!.id)
        .order("name");
      return (data ?? []).filter((l) => l.name && l.name.trim()) as Array<{ id: string; name: string }>;
    },
    enabled: !!professional?.id,
  });

  // Títulos já usados em agendamentos anteriores (campo notes) — para reaproveitar
  // nomes que não estão cadastrados como leads. Dedup, curtos, mais recentes primeiro.
  const { data: pastTitles = [] } = useQuery({
    queryKey: ["agenda-past-titles", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("notes")
        .eq("professional_id", professional!.id)
        .not("notes", "is", null)
        .order("created_at", { ascending: false })
        .limit(400);
      const seen = new Set<string>();
      const out: string[] = [];
      for (const r of (data ?? []) as Array<{ notes: string | null }>) {
        const t = (r.notes || "").trim();
        if (!t || t.length > 40 || t.toLowerCase() === "compromisso pessoal") continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
      }
      return out;
    },
    enabled: !!professional?.id,
  });

  const calendarRef = useRef<FullCalendar>(null);
  const isMobile = useIsMobile();

  // Mini calendário permanente (sidebar) — mês sincroniza com a view do FullCalendar
  // e clicar num dia navega o calendário grande (gotoDate) sem trocar de tela.
  const [miniCalMonth, setMiniCalMonth] = useState<Date>(new Date());
  const goToDate = useCallback((date: Date) => {
    calendarRef.current?.getApi().gotoDate(date);
    setMiniCalMonth(date);
  }, []);

  // Block dialog state
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockTitle, setBlockTitle] = useState("Compromisso pessoal");
  const [blockDate, setBlockDate] = useState<Date>(new Date());
  const [blockStartTime, setBlockStartTime] = useState("09:00");
  const [blockEndTime, setBlockEndTime] = useState("10:00");
  const [blockType, setBlockType] = useState("personal");
  const [blockColor, setBlockColor] = useState<string | null>(null);
  const [blockLeadId, setBlockLeadId] = useState<string | null>(null);
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
  const [editBlockColor, setEditBlockColor] = useState<string | null>(null);
  const [editBlockDescription, setEditBlockDescription] = useState("");
  const [editBlockDate, setEditBlockDate] = useState<Date>(new Date());

  // Edit appointment fields
  const [editApptStatus, setEditApptStatus] = useState("pending");
  const [editApptNotes, setEditApptNotes] = useState("");
  const [editApptStartTime, setEditApptStartTime] = useState("");
  const [editApptEndTime, setEditApptEndTime] = useState("");
  const [editApptDate, setEditApptDate] = useState<Date>(new Date());
  const [editApptPaymentStatus, setEditApptPaymentStatus] = useState("pending");
  const [editApptColor, setEditApptColor] = useState<string | null>(null);

  // Availability dialog
  const [availDialogOpen, setAvailDialogOpen] = useState(false);
  const [savingAvail, setSavingAvail] = useState(false);

  // F20 — buffer (global) + almoço POR DIA da semana (jsonb lunch_breaks).
  const [bufferMin, setBufferMin] = useState(0);
  const [lunchByDay, setLunchByDay] = useState<Record<number, { start: string; end: string }>>({});
  useEffect(() => {
    if (!professional) return;
    const p = professional as any;
    setBufferMin(Number(p.slot_buffer_minutes) || 0);
    const lb = (p.lunch_breaks && typeof p.lunch_breaks === "object") ? p.lunch_breaks : {};
    const norm: Record<number, { start: string; end: string }> = {};
    for (let d = 0; d <= 6; d++) {
      const e = lb[String(d)];
      if (e && e.start && e.end) norm[d] = { start: String(e.start).slice(0, 5), end: String(e.end).slice(0, 5) };
    }
    setLunchByDay(norm);
  }, [professional]);

  const toggleLunch = (day: number, on: boolean) =>
    setLunchByDay((prev) => {
      const next = { ...prev };
      if (on) next[day] = prev[day] || { start: "12:00", end: "13:00" };
      else delete next[day];
      return next;
    });
  const updateLunch = (day: number, field: "start" | "end", value: string) =>
    setLunchByDay((prev) => ({ ...prev, [day]: { ...(prev[day] || { start: "12:00", end: "13:00" }), [field]: value } }));

  // Status colors dialog (acionado pela engrenagem de ajustes)
  const [colorsDialogOpen, setColorsDialogOpen] = useState(false);

  // Google Calendar import
  const [icalDialogOpen, setIcalDialogOpen] = useState(false);
  const [icalUrl, setIcalUrl] = useState(() => localStorage.getItem("ical-url") || "");
  const [showTutorialAgenda, setShowTutorialAgenda] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [expandedImgAgenda, setExpandedImgAgenda] = useState<string | null>(null);

  const TUTORIAL_STEPS_AGENDA = [
    { step: 1, icon: Settings,     title: "Abra as Configurações",        desc: "No Google Agenda, clique no ícone de engrenagem (⚙️) no canto superior direito e selecione \"Configurações\".", tip: "Você precisa estar logado na sua conta Google.", color: "bg-blue-50 border-blue-200",     iconColor: "text-blue-500",    img: "/tutorial/step-1.png", imgPos: "object-top",    dot: { x: 71, y: 8 } },
    { step: 2, icon: CalendarDays, title: "Selecione seu calendário",      desc: "No menu lateral, em \"Configurações das minhas agendas\", clique no nome do seu calendário.", tip: "Geralmente é o calendário com seu nome ou e-mail.", color: "bg-purple-50 border-purple-200", iconColor: "text-purple-500",  img: "/tutorial/step-2.png", imgPos: "object-bottom", dot: { x: 13, y: 72 } },
    { step: 3, icon: Globe,        title: "Disponibilize ao público",      desc: "Clique em \"Autorizações de acesso a eventos\" e marque \"Disponibilizar ao público\".", tip: "Isso é necessário para que o sistema consiga ler os eventos.", color: "bg-amber-50 border-amber-200",   iconColor: "text-amber-500",   img: "/tutorial/step-3.png", imgPos: "object-top",    dot: { x: 38, y: 22 } },
    { step: 4, icon: Link2,        title: "Acesse \"Integrar agenda\"",    desc: "No menu lateral, clique em \"Integrar agenda\" para ver os endereços do calendário.", tip: "Esta opção fica logo abaixo de \"Outras notificações\" no menu lateral.", color: "bg-green-50 border-green-200",   iconColor: "text-green-500",   img: "/tutorial/step-4.png", imgPos: "object-bottom", dot: { x: 10, y: 68 } },
    { step: 5, icon: Copy,         title: "Copie o endereço iCal",         desc: "Copie o link do campo \"Endereço público no formato iCal\" e cole no campo abaixo.", tip: "O link começa com https://calendar.google.com/calendar/ical/...", color: "bg-emerald-50 border-emerald-200", iconColor: "text-emerald-600", img: "/tutorial/step-5.png", imgPos: "object-center", dot: { x: 62, y: 50 } },
  ];
  const [syncing, setSyncing] = useState(false);

  const handleIcalSync = async () => {
    if (!professional || !icalUrl.trim()) return;
    setSyncing(true);
    try {
      localStorage.setItem("ical-url", icalUrl);
      const events = await fetchIcal(icalUrl);
      if (events.length === 0) { toast.info("Nenhum evento encontrado."); return; }
      // Sync idempotente: cada clique substitui o lote anterior em vez de empilhar
      // duplicatas (block_type "other" é usado só por esta importação, nunca por
      // bloqueio manual — ver TituloCombobox/blockType, que só grava "personal").
      const { error: deleteError } = await supabase
        .from("appointments")
        .delete()
        .eq("professional_id", professional.id)
        .eq("appointment_type", "block")
        .eq("block_type", "other");
      if (deleteError) throw deleteError;
      const recurrenceGroup = crypto.randomUUID();
      const records = events.map((ev) => ({
        professional_id: professional.id,
        appointment_date: format(ev.dtstart, "yyyy-MM-dd"),
        start_time: ev.allDay ? "00:00" : format(ev.dtstart, "HH:mm"),
        end_time: ev.allDay ? "23:59" : format(ev.dtend, "HH:mm"),
        notes: ev.summary,
        description: ev.description || null,
        block_type: "other",
        appointment_type: "block" as const,
        status: "confirmed" as const,
        patient_id: null,
        recurrence_group: recurrenceGroup,
      }));
      const { error } = await supabase.from("appointments").insert(records as any);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      toast.success(`${events.length} evento(s) importado(s) do Google Agenda!`);
      setIcalDialogOpen(false);
    } catch (e: any) {
      toast.error("Erro ao importar", { description: e.message });
    } finally {
      setSyncing(false);
    }
  };

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
        .in("status", ["pending", "confirmed", "completed", "cancelled"]);
      if (error) throw error;

      const bookings = data.filter((a) => !a.appointment_type || a.appointment_type === "booking");
      const patientIds = [...new Set(bookings.map((a) => a.patient_id).filter(Boolean))];
      if (patientIds.length === 0) return bookings.map((a) => ({ ...a, patientName: a.notes || "Paciente" }));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", patientIds);
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);

      return bookings.map((a) => ({
        ...a,
        patientName: profileMap.get(a.patient_id) || a.notes || "Paciente",
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

      // Cliente selecionado (lead) → atendimento real (booking) com lembrete.
      // "Compromisso pessoal" / texto livre → bloqueio (block).
      const isBooking = !!blockLeadId;

      // ── VALIDAÇÃO ANTI-DOUBLE-BOOKING ──────────────────────────────────
      // Todo compromisso criado ocupa o horário: recusa se houver consulta real
      // (não-bloqueio) se sobrepondo no mesmo dia. Usa overlap de intervalo
      // (.lt/.gt), não start_time exato. NÃO usa .is('appointment_type', null):
      // o default da coluna virou 'booking', então bookings reais não são null.
      for (const date of dates) {
        let q = supabase
          .from("appointments")
          .select("id")
          .eq("professional_id", professional.id)
          .eq("appointment_date", date)
          .in("status", ["pending", "confirmed"])
          .lt("start_time", blockEndTime)
          .gt("end_time", blockStartTime);
        // booking de cliente conflita com TUDO ocupado; bloqueio só com consultas reais.
        if (!isBooking) q = q.or("appointment_type.eq.booking,appointment_type.is.null");
        const { data: conflitos } = await q;

        if (conflitos && conflitos.length > 0) {
          throw new Error(
            `Conflito de horário: já existe um agendamento em ${date} nesse intervalo. Escolha outro horário.`
          );
        }
      }
      // ──────────────────────────────────────────────────────────────────

      const recurrenceGroup = dates.length > 1 ? crypto.randomUUID() : null;

      const records = dates.map((date) => ({
        professional_id: professional.id,
        appointment_date: date,
        start_time: blockStartTime,
        end_time: blockEndTime,
        notes: blockTitle,
        color: blockColor,
        patient_id: null,
        recurrence_group: recurrenceGroup,
        ...(isBooking
          ? { appointment_type: "booking", lead_id: blockLeadId, status: "pending", block_type: null }
          : { appointment_type: "block", lead_id: null, status: "confirmed", block_type: blockType }),
      }));

      const { error } = await supabase.from("appointments").insert(records as any);
      if (error) {
        // Constraint do banco captura race conditions
        if ((error as any).code === "23505") {
          throw new Error("Conflito de horário: esse horário acabou de ser reservado. Escolha outro.");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] });
      toast.success("Agendamento adicionado!");
      setBlockDialogOpen(false);
      resetBlockForm();
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao adicionar bloqueio"),
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
          description: editBlockDescription || null,
          start_time: editBlockStartTime,
          end_time: editBlockEndTime,
          color: editBlockColor,
          appointment_date: format(editBlockDate, "yyyy-MM-dd"),
        } as any)
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
          payment_status: editApptPaymentStatus as any,
          notes: editApptNotes || null,
          start_time: editApptStartTime,
          end_time: editApptEndTime,
          color: editApptColor,
          appointment_date: format(editApptDate, "yyyy-MM-dd"),
        } as any)
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

  // Quick status change mutation
  const quickStatusChange = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("appointments")
        .update({ status: status as any })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      toast.success("Status atualizado!");
      setDetailDialogOpen(false);
    },
    onError: () => toast.error("Erro ao atualizar status"),
  });

  // Quick payment toggle mutation
  const quickPaymentChange = useMutation({
    mutationFn: async ({ id, payment_status }: { id: string; payment_status: string }) => {
      const { error } = await supabase
        .from("appointments")
        .update({ payment_status: payment_status as any })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      toast.success("Pagamento atualizado!");
      setDetailDialogOpen(false);
    },
    onError: () => toast.error("Erro ao atualizar pagamento"),
  });

  // Troca rápida de cor a partir do modal de detalhe (não fecha o modal).
  const quickColorChange = useMutation({
    mutationFn: async ({ id, color }: { id: string; color: string | null }) => {
      const { error } = await supabase
        .from("appointments")
        .update({ color } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      toast.success("Cor atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar cor"),
  });

  // F16 — arrastar (mover dia/hora) e esticar (mudar duração) persistem direto.
  // Mesma função pros dois gestos; reverte no grid se o banco recusar.
  const persistEventTimes = async (
    info: { event: EventApi; revert: () => void },
    isResize: boolean,
  ) => {
    const ev = info.event;
    const props = ev.extendedProps as Record<string, unknown>;

    // Faixas de fundo (disponibilidade) e eventos sem início não movem.
    if (props.type === "availability" || !ev.start) { info.revert(); return; }

    // Fim exclusivo: se cair em 00:00 cravada, pertence ao dia anterior — recua 1ms só p/ datar.
    const end = ev.end ?? new Date(ev.start.getTime() + 60 * 60000);
    const endRef = format(end, "HH:mm:ss") === "00:00:00" ? new Date(end.getTime() - 1) : end;

    const startDate = format(ev.start, "yyyy-MM-dd");
    const endDate = format(endRef, "yyyy-MM-dd");
    // Arrastar/esticar entre dias vira barra confusa: recusa (recorrência é no editor).
    if (startDate !== endDate) {
      toast.info("Para repetir em vários dias, edite o agendamento e use a recorrência.");
      info.revert();
      return;
    }

    // Item 3 — valida almoço + conflito (com a folga/buffer) antes de gravar o arraste.
    const hhmmToMin = (t: string) => { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + m; };
    const sMin = hhmmToMin(format(ev.start, "HH:mm"));
    const eMin = hhmmToMin(format(end, "HH:mm"));

    const lunchDrag = lunchByDay[new Date(startDate + "T00:00:00").getDay()];
    if (lunchDrag) {
      const ls = hhmmToMin(lunchDrag.start);
      const le = hhmmToMin(lunchDrag.end);
      if (sMin < le && eMin > ls) {
        toast.info(`Esse horário cai no intervalo de almoço (${lunchDrag.start}–${lunchDrag.end}). Desfazendo.`);
        info.revert();
        return;
      }
    }

    const buffer = bufferMin || 0;
    const conflita = [...appointments, ...blocks]
      .filter((x: any) => x.id !== props.id && x.appointment_date === startDate)
      .some((x: any) => {
        const os = hhmmToMin(x.start_time);
        const oe = hhmmToMin(x.end_time);
        return sMin < oe + buffer && eMin > os - buffer;
      });
    if (conflita) {
      toast.info("Esse horário conflita com outro agendamento (ou a folga entre eles). Desfazendo.");
      info.revert();
      return;
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        appointment_date: startDate,
        start_time: format(ev.start, "HH:mm:ss"),
        end_time: format(end, "HH:mm:ss"),
      })
      .eq("id", props.id as string);

    if (error) {
      toast.error("Não foi possível salvar. Desfazendo.");
      info.revert();
      return;
    }

    toast.success(isResize ? "Duração atualizada!" : "Agendamento movido!");
    queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
    queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
  };

  const enterEditMode = () => {
    if (!selectedEvent) return;
    if (selectedEvent.type === "block") {
      setEditBlockTitle(selectedEvent.notes || "");
      setEditBlockStartTime(selectedEvent.start_time?.slice(0, 5) || "09:00");
      setEditBlockEndTime(selectedEvent.end_time?.slice(0, 5) || "10:00");
      setEditBlockColor(selectedEvent.color ?? null);
      setEditBlockDescription(selectedEvent.description || "");
      setEditBlockDate(new Date(selectedEvent.appointment_date + "T12:00:00"));
    } else {
      setEditApptStatus(selectedEvent.status || "pending");
      setEditApptNotes(selectedEvent.notes || "");
      setEditApptStartTime(selectedEvent.start_time?.slice(0, 5) || "09:00");
      setEditApptEndTime(selectedEvent.end_time?.slice(0, 5) || "10:00");
      setEditApptDate(new Date(selectedEvent.appointment_date + "T12:00:00"));
      setEditApptPaymentStatus(selectedEvent.payment_status || "pending");
      setEditApptColor(selectedEvent.color ?? null);
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
    // F20 — salva buffer + almoço no profissional.
    const { error: cfgError } = await supabase
      .from("professionals")
      .update({
        slot_buffer_minutes: bufferMin,
        lunch_breaks: lunchByDay,
      } as any)
      .eq("id", professional.id);
    if (cfgError) {
      toast.error("Erro ao salvar intervalo/almoço", { description: cfgError.message });
      setSavingAvail(false);
      return;
    }
    toast.success("Disponibilidade salva!");
    queryClient.invalidateQueries({ queryKey: ["agenda-availability"] });
    queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    setSavingAvail(false);
    setAvailDialogOpen(false);
  };

  const resetBlockForm = () => {
    setBlockTitle("Compromisso pessoal");
    setBlockStartTime("09:00");
    setBlockEndTime("10:00");
    setBlockType("personal");
    setBlockColor(null);
    setBlockLeadId(null);
    setRecurrence("unico");
    setSelectedDates([]);
  };

  // Dias com algum compromisso (agendamento ou bloqueio) — vira um pontinho no mini calendário.
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach((a: any) => set.add(a.appointment_date));
    blocks.forEach((b: any) => set.add(b.appointment_date));
    return set;
  }, [appointments, blocks]);

  // Build events
  const buildEvents = useCallback((): EventInput[] => {
    const events: EventInput[] = [];

    appointments.forEach((appt: any) => {
      const displayName = appt.block_type === "personal"
        ? "Pessoal"
        : (appt.patientName || "Paciente");
      const serviceName = appt.professional_services?.name || "Consulta";
      events.push({
        id: `appt-${appt.id}`,
        title: `${displayName} — ${serviceName}`,
        start: `${appt.appointment_date}T${appt.start_time}`,
        end: `${appt.appointment_date}T${appt.end_time}`,
        backgroundColor: appt.color || getStatusColor(appt.status),
        borderColor: getStatusColor(appt.status),
        textColor: "#fff",
        classNames: appt.color ? ["fc-event-tinted"] : undefined,
        extendedProps: { type: "appointment", ...appt },
      });
    });

    blocks.forEach((block: any) => {
      // F17 — sem "tipo": o título é o que a pessoa digitou (cor diferencia o evento).
      const blockTitle = block.notes || "Compromisso";
      events.push({
        id: `block-${block.id}`,
        title: blockTitle,
        start: `${block.appointment_date}T${block.start_time}`,
        end: `${block.appointment_date}T${block.end_time}`,
        backgroundColor: block.color || getStatusColor(block.status || "pending"),
        borderColor: getStatusColor(block.status || "pending"),
        textColor: "#fff",
        classNames: block.color ? ["fc-event-tinted"] : undefined,
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
  }, [appointments, blocks, availability, getStatusColor]);

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
        <div className="flex gap-2 flex-wrap items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" title="Ajustes da agenda" aria-label="Ajustes da agenda">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Ajustes da agenda</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setColorsDialogOpen(true)}>
                <Palette className="h-4 w-4 mr-2" /> Cores dos status
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIcalDialogOpen(true)}>
                <CalendarDays className="h-4 w-4 mr-2" /> Google Agenda
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAvailDialogOpen(true)}>
                <Settings2 className="h-4 w-4 mr-2" /> Horários de atendimento
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => { setBlockDate(new Date()); resetBlockForm(); setBlockDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Novo Agendamento
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Mini calendário permanente — sempre visível, sem precisar abrir popover */}
        <div className="w-full lg:w-64 shrink-0 lg:sticky lg:top-4">
          <div className="bg-card rounded-lg border p-2">
            <Calendar
              mode="single"
              month={miniCalMonth}
              onMonthChange={setMiniCalMonth}
              onSelect={(d) => d && goToDate(d)}
              modifiers={{ hasEvents: (date) => eventDates.has(format(date, "yyyy-MM-dd")) }}
              modifiersClassNames={{ hasEvents: "underline decoration-2 decoration-primary underline-offset-4" }}
              locale={ptBR}
              className="mx-auto"
            />
          </div>
        </div>

        <div className="fc-wrapper bg-card rounded-lg border p-2 sm:p-4 flex-1 min-w-0 w-full">
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
            initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
            locale="pt-br"
            firstDay={0}
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
            snapDuration="00:15:00"
            slotDuration="00:30:00"
            slotLabelInterval="01:00:00"
            slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            allDaySlot={false}
            nowIndicator={true}
            selectable={true}
            selectMirror={true}
            editable={true}
            eventStartEditable={true}
            eventDurationEditable={true}
            select={handleDateSelect}
            eventClick={handleEventClick}
            eventDrop={(info) => persistEventTimes(info, false)}
            eventResize={(info) => persistEventTimes(info, true)}
            datesSet={(arg) => setMiniCalMonth(arg.view.currentStart)}
            events={buildEvents()}
            height="auto"
            expandRows={true}
            dayHeaderFormat={{ weekday: "short", day: "numeric", month: "numeric" }}
            buttonText={{ today: "Hoje", month: "Mês", week: "Semana", day: "Dia" }}
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          />
        </div>
      </div>

      {/* Block Dialog with Recurrence */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <TituloCombobox
                value={blockTitle}
                onChange={(v, leadId) => { setBlockTitle(v); setBlockLeadId(leadId); }}
                leads={leads}
                pastTitles={pastTitles}
              />
              {blockLeadId && (
                <p className="text-xs text-muted-foreground mt-1">
                  Atendimento vinculado a este cliente — recebe lembrete no WhatsApp.
                </p>
              )}
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
              <Label>Cor</Label>
              <div className="mt-1.5">
                <ColorPicker value={blockColor} onChange={setBlockColor} />
              </div>
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
              {addBlock.isPending ? "Salvando..." : "Confirmar agendamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Event Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => { setDetailDialogOpen(open); if (!open) setEditMode(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle>
                {selectedEvent?.type === "appointment" ? "Consulta" : "Agendamento"}
              </DialogTitle>
              {selectedEvent && !editMode && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Cor do evento" aria-label="Cor do evento">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Cor do evento</p>
                      <ColorPicker
                        value={selectedEvent.color ?? null}
                        onChange={(c) => {
                          quickColorChange.mutate({ id: selectedEvent.id, color: c });
                          setSelectedEvent({ ...selectedEvent, color: c });
                        }}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge style={{ backgroundColor: getStatusColor(selectedEvent.status), color: "#fff", borderColor: getStatusColor(selectedEvent.status) }}>
                      {STATUS_LABELS[selectedEvent.status] || selectedEvent.status}
                    </Badge>
                    <Badge style={{ backgroundColor: getPaymentColor(selectedEvent.payment_status || "pending"), color: "#fff", borderColor: getPaymentColor(selectedEvent.payment_status || "pending") }}>
                      <DollarSign className="h-3 w-3 mr-1" />
                      {PAYMENT_LABELS[selectedEvent.payment_status || "pending"]}
                    </Badge>
                  </div>
                  {selectedEvent.notes && <p className="text-sm text-muted-foreground border-t pt-2">{selectedEvent.notes}</p>}

                  {/* Quick status buttons */}
                  <div className="border-t pt-3 space-y-2">
                    <Label className="text-xs text-muted-foreground">Alterar status:</Label>
                    <div className="flex gap-1 flex-wrap">
                      {selectedEvent.status !== "confirmed" && (
                        <Button size="sm" variant="outline" onClick={() => quickStatusChange.mutate({ id: selectedEvent.id, status: "confirmed" })} disabled={quickStatusChange.isPending}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Confirmar
                        </Button>
                      )}
                      {selectedEvent.status !== "completed" && (
                        <Button size="sm" variant="outline" onClick={() => quickStatusChange.mutate({ id: selectedEvent.id, status: "completed" })} disabled={quickStatusChange.isPending}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Concluir
                        </Button>
                      )}
                      {selectedEvent.status !== "cancelled" && (
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => quickStatusChange.mutate({ id: selectedEvent.id, status: "cancelled" })} disabled={quickStatusChange.isPending}>
                          <XCircle className="h-3 w-3 mr-1" /> Cancelar
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => quickPaymentChange.mutate({
                          id: selectedEvent.id,
                          payment_status: selectedEvent.payment_status === "paid" ? "pending" : "paid",
                        })}
                        disabled={quickPaymentChange.isPending}
                      >
                        <DollarSign className="h-3 w-3 mr-1" />
                        {selectedEvent.payment_status === "paid" ? "Marcar Pendente" : "Marcar Pago"}
                      </Button>
                    </div>
                  </div>

                  <Button variant="outline" size="sm" onClick={enterEditMode} className="w-full">
                    <Pencil className="h-4 w-4 mr-1" /> Editar agendamento
                  </Button>
                </>
              )}
              {selectedEvent.type === "block" && (
                <>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-primary" />
                    <span className="font-medium">{selectedEvent.notes || "Agendamento"}</span>
                  </div>
                   <div className="flex items-center gap-2 flex-wrap">
                    <Badge style={{ backgroundColor: getStatusColor(selectedEvent.status || "pending"), color: "#fff", borderColor: getStatusColor(selectedEvent.status || "pending") }}>
                      {STATUS_LABELS[selectedEvent.status] || selectedEvent.status || "Pendente"}
                    </Badge>
                    {selectedEvent.block_type === "atendimento" && (
                      <Badge style={{ backgroundColor: getPaymentColor(selectedEvent.payment_status || "pending"), color: "#fff", borderColor: getPaymentColor(selectedEvent.payment_status || "pending") }}>
                        <DollarSign className="h-3 w-3 mr-1" />
                        {PAYMENT_LABELS[selectedEvent.payment_status || "pending"]}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(selectedEvent.appointment_date + "T12:00:00"), "dd/MM/yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedEvent.start_time?.slice(0, 5)} – {selectedEvent.end_time?.slice(0, 5)}</span>
                  </div>
                  {selectedEvent.description && (
                    <p className="text-sm text-muted-foreground border-t pt-2 whitespace-pre-line">{selectedEvent.description}</p>
                  )}

                  {/* Quick status buttons */}
                  <div className="border-t pt-3 space-y-2">
                    <Label className="text-xs text-muted-foreground">Alterar status:</Label>
                    <div className="flex gap-1 flex-wrap">
                      {selectedEvent.status !== "pending" && (
                        <Button size="sm" variant="outline" onClick={() => quickStatusChange.mutate({ id: selectedEvent.id, status: "pending" })} disabled={quickStatusChange.isPending}>
                          <Clock className="h-3 w-3 mr-1" /> Pendente
                        </Button>
                      )}
                      {selectedEvent.status !== "confirmed" && (
                        <Button size="sm" variant="outline" onClick={() => quickStatusChange.mutate({ id: selectedEvent.id, status: "confirmed" })} disabled={quickStatusChange.isPending}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Confirmar
                        </Button>
                      )}
                      {selectedEvent.status !== "completed" && (
                        <Button size="sm" variant="outline" onClick={() => quickStatusChange.mutate({ id: selectedEvent.id, status: "completed" })} disabled={quickStatusChange.isPending}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Concluir
                        </Button>
                      )}
                      {selectedEvent.status !== "cancelled" && (
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => quickStatusChange.mutate({ id: selectedEvent.id, status: "cancelled" })} disabled={quickStatusChange.isPending}>
                          <XCircle className="h-3 w-3 mr-1" /> Cancelar
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => quickPaymentChange.mutate({
                          id: selectedEvent.id,
                          payment_status: selectedEvent.payment_status === "paid" ? "pending" : "paid",
                        })}
                        disabled={quickPaymentChange.isPending}
                      >
                        <DollarSign className="h-3 w-3 mr-1" />
                        {selectedEvent.payment_status === "paid" ? "Marcar Pendente" : "Marcar Pago"}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button variant="outline" size="sm" onClick={enterEditMode} className="w-full">
                      <Pencil className="h-4 w-4 mr-1" /> Editar agendamento
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => selectedEvent.id && removeBlock.mutate(selectedEvent.id)}
                      disabled={removeBlock.isPending}
                    >
                      <X className="h-4 w-4 mr-1" />
                      {removeBlock.isPending ? "Removendo..." : "Remover este agendamento"}
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
                <TituloCombobox value={editBlockTitle} onChange={(v) => setEditBlockTitle(v)} leads={leads} pastTitles={pastTitles} />
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
                <Label>Cor</Label>
                <div className="mt-1.5">
                  <ColorPicker value={editBlockColor} onChange={setEditBlockColor} />
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={editBlockDescription} onChange={(e) => setEditBlockDescription(e.target.value)} placeholder="Detalhes do compromisso..." rows={3} />
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
                <Label>Pagamento</Label>
                <Select value={editApptPaymentStatus} onValueChange={setEditApptPaymentStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cor</Label>
                <div className="mt-1.5">
                  <ColorPicker value={editApptColor} onChange={setEditApptColor} />
                </div>
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

      {/* Google Calendar Import Dialog */}
      <Dialog open={icalDialogOpen} onOpenChange={(v) => { setIcalDialogOpen(v); if (!v) setShowTutorialAgenda(false); }}>
        <DialogContent className="max-w-lg overflow-x-hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" /> Importar Google Agenda
              </DialogTitle>
              <button
                type="button"
                onClick={() => setShowTutorialAgenda((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium mr-6"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                {showTutorialAgenda ? "Ocultar tutorial" : "Como fazer?"}
              </button>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {/* Tutorial slider manual */}
            {showTutorialAgenda && (() => {
              const s = TUTORIAL_STEPS_AGENDA[tutorialStep];
              const Icon = s.icon;
              const total = TUTORIAL_STEPS_AGENDA.length;
              return (
                <div className="rounded-xl border overflow-hidden bg-white shadow-sm">
                  {/* Imagem como background — nunca vaza */}
                  <div
                    className="relative h-44 cursor-zoom-in group"
                    style={{
                      backgroundImage: `url(${s.img})`,
                      backgroundSize: "cover",
                      backgroundPosition: s.imgPos === "object-top" ? "top" : s.imgPos === "object-bottom" ? "bottom" : "center",
                    }}
                    onClick={() => setExpandedImgAgenda(s.img)}
                  >
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    <div className="absolute bottom-2 right-2 bg-black/50 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ZoomIn className="h-3.5 w-3.5" />
                    </div>
                    <span className="absolute flex h-5 w-5 pointer-events-none" style={{ left: `${s.dot.x}%`, top: `${s.dot.y}%`, transform: "translate(-50%,-50%)" }}>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-5 w-5 bg-red-500 border-2 border-white shadow-lg" />
                    </span>
                  </div>
                  {/* Info */}
                  <div className="px-3 py-2.5 space-y-1 border-t">
                    <div className="flex items-center gap-2">
                      <div className={cn("h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0", s.color)}>
                        <Icon className={cn("h-3 w-3", s.iconColor)} />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">Passo {s.step}/{total}</span>
                      <span className="font-semibold text-xs text-foreground">{s.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed pl-7">{s.desc}</p>
                    <p className="text-xs text-muted-foreground/70 pl-7">💡 {s.tip}</p>
                  </div>
                  {/* Navegação */}
                  <div className="flex items-center justify-between px-3 pb-2.5">
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={tutorialStep === 0} onClick={() => setTutorialStep(tutorialStep - 1)}>← Anterior</Button>
                    <span className="text-xs text-muted-foreground">{tutorialStep + 1} / {total}</span>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={tutorialStep === total - 1} onClick={() => setTutorialStep(tutorialStep + 1)}>Próximo →</Button>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-2">
              <label className="text-sm font-medium">Link iCal</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/..."
              />
            </div>
            <p className="text-xs text-muted-foreground">Os eventos serão importados como bloqueios de horário na sua agenda.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIcalDialogOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleIcalSync} disabled={syncing || !icalUrl.trim()} className="flex-1">
                {syncing ? "Importando..." : "Importar eventos"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox agenda */}
      {expandedImgAgenda && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={(e) => { e.stopPropagation(); setExpandedImgAgenda(null); }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/25 rounded-full p-2 transition-colors" onClick={(e) => { e.stopPropagation(); setExpandedImgAgenda(null); }}>
            <X className="h-5 w-5" />
          </button>
          <img src={expandedImgAgenda} alt="Imagem ampliada" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} />
        </div>
      )}

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
                  <div className="flex items-center gap-2 mt-2 flex-wrap text-xs border-t pt-2">
                    <Switch checked={!!lunchByDay[day]} onCheckedChange={(v) => toggleLunch(day, v)} />
                    <span className="text-muted-foreground">Almoço</span>
                    {lunchByDay[day] && (
                      <>
                        <Input type="time" value={lunchByDay[day].start} onChange={(e) => updateLunch(day, "start", e.target.value)} className="w-24 h-8 text-xs" />
                        <span>até</span>
                        <Input type="time" value={lunchByDay[day].end} onChange={(e) => updateLunch(day, "end", e.target.value)} className="w-24 h-8 text-xs" />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t pt-4 mt-4">
            <Label className="text-sm">Intervalo entre atendimentos</Label>
            <p className="text-xs text-muted-foreground mb-1.5">Folga automática entre um atendimento e o próximo (vale para todos os dias).</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={5}
                value={bufferMin}
                onChange={(e) => setBufferMin(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 h-9"
              />
              <span className="text-sm text-muted-foreground">minutos</span>
            </div>
            <p className="text-xs text-muted-foreground mt-3">💡 O intervalo de almoço é configurado por dia, na grade acima.</p>
          </div>
          <Button onClick={handleSaveAvailability} disabled={savingAvail} className="w-full mt-2">
            {savingAvail ? "Salvando..." : "Salvar Disponibilidade"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Status colors dialog */}
      <StatusColorsDialog open={colorsDialogOpen} onOpenChange={setColorsDialogOpen} />
    </div>
  );
}

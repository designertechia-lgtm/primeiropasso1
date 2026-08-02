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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import StatusColorsDialog from "@/components/admin/StatusColorsDialog";
import { useAutoCompleteAppointments } from "@/hooks/useAutoCompleteAppointments";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, X, User, Clock, CalendarIcon, Settings2, Pencil, CheckCircle, DollarSign, XCircle, CalendarDays, HelpCircle, ZoomIn, Settings, Globe, Link2, Copy, Palette, Check, ChevronsUpDown, Lock } from "lucide-react";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { fetchIcal } from "@/lib/ical";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { generateRecurrenceDates, type RecurrenceType } from "@/lib/recurrence";
import { validateAgendaSlot, readableTextColor, type AgendaEntry } from "@/lib/agendaValidation";
import { toMin } from "@/lib/slots";
import { CancelAppointmentDialog, type CancellationReason } from "@/components/admin/CancelAppointmentDialog";
import { saveCancellationReason } from "@/lib/cancellations";
import QuandoNaoAtendoEditor from "@/components/admin/QuandoNaoAtendoEditor";
import { useProfessionalHolidays } from "@/hooks/useProfessionalHolidays";
import { fetchAllPages } from "@/lib/fetchAllPages";
import type { EventInput, EventClickArg, DateSelectArg, EventApi } from "@fullcalendar/core";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const DEFAULT_STATUS_COLORS: Record<string, string> = {
  pending: "#3B82F6",   // azul
  confirmed: "#22C55E", // verde
  completed: "#EAB308", // amarelo
  cancelled: "#EF4444", // vermelho — só para registros antigos: cancelar agora exclui
};

const DEFAULT_PAYMENT_COLORS: Record<string, string> = {
  pending: "#F97316",
  paid: "#10B981",
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: "Pgto Pendente",
  paid: "Pago",
};

// Categoria do bloqueio, para dizer no card o que aquilo é quando não há
// descrição escrita. "ical" não é categoria de verdade — é origem, e vale mais
// que a categoria na hora de explicar o evento.
const BLOCK_TYPE_LABELS: Record<string, string> = {
  personal: "Compromisso pessoal",
  vacation: "Férias / Folga",
  other: "Outro",
  appointment: "Atendimento",
  ical: "Google Agenda",
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

// Badge de status/pagamento com texto legível: a cor de fundo é escolhida pelo
// profissional e pode ser clara (o amarelo de "Concluído", por exemplo), então o
// texto não pode ser branco fixo — `readableTextColor` decide por contraste.
function StatusBadge({ label, color, icon }: { label: string; color: string; icon?: React.ReactNode }) {
  return (
    <Badge style={{ backgroundColor: color, color: readableTextColor(color), borderColor: color }}>
      {icon}
      {label}
    </Badge>
  );
}

// Cancelar remove o registro da agenda (o horário precisa voltar a ficar livre),
// mas o cancelamento em si fica guardado em `appointment_cancellations` — por
// isso o diálogo já pergunta o motivo. Ver components/admin/CancelAppointmentDialog.
function CancelAppointmentButton({
  onConfirm,
  disabled,
  resumo,
}: {
  onConfirm: (motivo: CancellationReason) => void;
  disabled?: boolean;
  resumo?: React.ReactNode;
}) {
  return (
    <CancelAppointmentDialog
      resumo={resumo}
      onConfirm={onConfirm}
      trigger={
        <Button size="sm" variant="outline" className="text-destructive" disabled={disabled}>
          <XCircle className="h-3 w-3 mr-1" /> Cancelar
        </Button>
      }
    />
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

  // ── Carga por PERÍODO VISÍVEL ──────────────────────────────────────────────
  // As duas queries abaixo traziam a agenda INTEIRA, sem .range(). O PostgREST
  // corta em 1000 linhas e não devolve erro nenhum: numa agenda com séries
  // longas (uma recorrência diária "para sempre" já grava 730 registros), os
  // eventos passavam a sumir do grid sem explicação.
  // O padding de 31 dias dos dois lados cobre a navegação entre meses e os
  // marcadores do mini calendário sem precisar recarregar a cada clique.
  const RANGE_PADDING = 31;
  const [range, setRange] = useState(() => ({
    start: format(addDays(new Date(), -RANGE_PADDING), "yyyy-MM-dd"),
    end: format(addDays(new Date(), RANGE_PADDING), "yyyy-MM-dd"),
  }));

  // Mini calendário de navegação — mês sincroniza com a view do FullCalendar;
  // clicar num dia navega o calendário grande (gotoDate) e fecha o popover.
  // Mesmo padrão de Popover+Calendar já usado nos campos "Data" desta tela.
  const [miniCalMonth, setMiniCalMonth] = useState<Date>(new Date());
  const [miniCalDay, setMiniCalDay] = useState<Date>(new Date());
  const [miniCalOpen, setMiniCalOpen] = useState(false);
  const goToDate = useCallback((date: Date) => {
    calendarRef.current?.getApi().gotoDate(date);
    setMiniCalMonth(date);
    setMiniCalDay(date);
    setMiniCalOpen(false);
  }, []);

  const handleDatesSet = useCallback((arg: { start: Date; end: Date; view: { currentStart: Date } }) => {
    setMiniCalMonth(arg.view.currentStart);
    const start = format(addDays(arg.start, -RANGE_PADDING), "yyyy-MM-dd");
    const end = format(addDays(arg.end, RANGE_PADDING), "yyyy-MM-dd");
    // Só troca o objeto quando as datas mudam de verdade, senão a queryKey muda
    // a cada render do calendário e a busca entra em laço.
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
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
  const [blockServiceId, setBlockServiceId] = useState<string | null>(null);
  // Atendimento x bloqueio é ESCOLHA EXPLÍCITA — antes era inferido do título
  // (nome fora da lista de clientes virava bloqueio e poluía a aba Bloqueios).
  const [entryKind, setEntryKind] = useState<"booking" | "block">("booking");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("unico");
  const [recEndDate, setRecEndDate] = useState<Date>(() => addDays(new Date(), 30));
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

  // Buffer + almoço por dia, aqui apenas para VALIDAR o que é criado, editado ou
  // arrastado. Quem edita esses valores é o QuandoNaoAtendoEditor.
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
      // duplicatas.
      //
      // O filtro é `source = 'ical'`, NUNCA `block_type = 'other'`. Até 02/08/2026
      // era por block_type — e como a aba Bloqueios oferece "Outro" como
      // CATEGORIA, sincronizar apagava os bloqueios manuais dessa categoria
      // (um "Férias de janeiro" sumia inteiro). Origem e categoria são coisas
      // diferentes: ver migration 20260802_appointments_source.
      // O `as any` isola a coluna nova (migration 20260802) do types.ts gerado,
      // que ainda não foi regerado — mesmo padrão já usado em `color`/`lead_id`.
      // O cast é no builder inteiro: aplicá-lo só no nome da coluna faz o
      // TypeScript expandir a união de colunas e estourar a profundidade.
      const delQuery = supabase
        .from("appointments")
        .delete()
        .eq("professional_id", professional.id);
      const { error: deleteError } = await (delQuery as any).eq("source", "ical");
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
        source: "ical",
        appointment_type: "block" as const,
        status: "confirmed" as const,
        patient_id: null,
        recurrence_group: recurrenceGroup,
      }));
      const { error } = await supabase.from("appointments").insert(records as any);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] });
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

  // Fetch appointments — só o período visível (ver comentário do `range`).
  const { data: appointments = [], isLoading: loadingAppointments, refetch: refetchAppointments } = useQuery({
    queryKey: ["agenda-appointments-all", professional?.id, range.start, range.end],
    queryFn: async () => {
      const data = await fetchAllPages<any>((from, to) =>
        supabase
          .from("appointments")
          .select("*, professional_services(name)")
          .eq("professional_id", professional!.id)
          .in("status", ["pending", "confirmed", "completed", "cancelled"])
          .gte("appointment_date", range.start)
          .lte("appointment_date", range.end)
          .order("appointment_date")
          .range(from, to));

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
    // Mantém o mês anterior desenhado enquanto o novo carrega, em vez de piscar
    // um calendário vazio a cada clique em "próximo".
    placeholderData: (anterior) => anterior,
  });

  // Reforço do cron `auto_complete_appointments` (migration 20260802b): fecha na
  // hora o que o profissional está vendo, sem esperar o próximo tick de 15 min.
  useAutoCompleteAppointments(appointments as any);

  // Fetch blocks — mesmo recorte de período dos agendamentos.
  const { data: blocks = [], isLoading: loadingBlocks, refetch: refetchBlocks } = useQuery({
    queryKey: ["agenda-blocks-all", professional?.id, range.start, range.end],
    queryFn: async () =>
      fetchAllPages<any>((from, to) =>
        supabase
          .from("appointments")
          .select("*")
          .eq("professional_id", professional!.id)
          .eq("appointment_type", "block")
          .gte("appointment_date", range.start)
          .lte("appointment_date", range.end)
          .order("appointment_date")
          .range(from, to)),
    enabled: !!professional?.id,
    placeholderData: (anterior) => anterior,
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
      dates = [...new Set(dates)].sort();

      if (dates.length === 0) {
        // Acontecia calado quando a data de término ficava antes da de início:
        // generateRecurrenceDates devolve lista vazia e o erro era só "Nenhuma data".
        throw new Error(
          recurrence === "selecionavel"
            ? "Selecione ao menos uma data no calendário."
            : "Nenhuma data foi gerada — verifique se a data de término é posterior à de início.",
        );
      }

      // O tipo vem do seletor da tela, não do título: nome livre de cliente ainda
      // não cadastrado continua sendo ATENDIMENTO (só não dispara lembrete, por
      // não ter WhatsApp vinculado).
      const isBooking = entryKind === "booking";

      // ── VALIDAÇÃO ──────────────────────────────────────────────────────
      // Mesma função usada ao arrastar e ao editar (lib/agendaValidation):
      // intervalo coerente + almoço do dia + conflito considerando a folga.
      // Antes daqui, só a sobreposição crua era checada — dava para criar pelo
      // formulário exatamente o que o arraste recusava.
      //
      // Os vizinhos vêm do BANCO, não da memória: a recorrência costuma cair
      // fora do período carregado no grid, e outra aba pode ter gravado agora.
      const vizinhos = await fetchAllPages<AgendaEntry>((from, to) =>
        supabase
          .from("appointments")
          .select("id, appointment_date, start_time, end_time, status, appointment_type")
          .eq("professional_id", professional.id)
          .gte("appointment_date", dates[0])
          .lte("appointment_date", dates[dates.length - 1])
          .in("status", ["pending", "confirmed"])
          .order("appointment_date")
          .range(from, to));

      for (const date of dates) {
        const check = validateAgendaSlot({
          date,
          startTime: blockStartTime,
          endTime: blockEndTime,
          kind: isBooking ? "booking" : "block",
          entries: vizinhos,
          lunchByDay,
          bufferMinutes: bufferMin,
        });
        if (!check.ok) throw new Error(check.reason);
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
          ? {
              appointment_type: "booking",
              lead_id: blockLeadId,
              status: "pending",
              block_type: null,
              // Sem isto o atendimento nascia sem serviço e a aba Agendamentos
              // mostrava "—" na coluna Serviço.
              service_id: blockServiceId,
            }
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
      toast.success(entryKind === "booking" ? "Atendimento adicionado!" : "Bloqueio adicionado!");
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

  // Vizinhos de UM dia, direto do banco — usado pelas edições, que podem mover o
  // compromisso para uma data fora do período carregado no grid.
  const fetchDayEntries = useCallback(async (date: string): Promise<AgendaEntry[]> => {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, appointment_date, start_time, end_time, status, appointment_type")
      .eq("professional_id", professional!.id)
      .eq("appointment_date", date)
      .in("status", ["pending", "confirmed"]);
    if (error) throw error;
    return (data ?? []) as AgendaEntry[];
  }, [professional]);

  // Update block mutation
  const updateBlock = useMutation({
    mutationFn: async (id: string) => {
      const date = format(editBlockDate, "yyyy-MM-dd");
      // Editar pelo modal não passava por validação NENHUMA: dava para salvar
      // fim antes do início, ou empurrar o bloqueio para cima de uma consulta.
      const check = validateAgendaSlot({
        date,
        startTime: editBlockStartTime,
        endTime: editBlockEndTime,
        kind: "block",
        ignoreId: id,
        entries: await fetchDayEntries(date),
        lunchByDay,
        bufferMinutes: bufferMin,
      });
      if (!check.ok) throw new Error(check.reason);

      const { error } = await supabase
        .from("appointments")
        .update({
          notes: editBlockTitle,
          description: editBlockDescription || null,
          start_time: editBlockStartTime,
          end_time: editBlockEndTime,
          color: editBlockColor,
          appointment_date: date,
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
    onError: (e: Error) => toast.error(e.message || "Erro ao atualizar bloqueio"),
  });

  // Update appointment mutation
  const updateAppointment = useMutation({
    mutationFn: async (id: string) => {
      const date = format(editApptDate, "yyyy-MM-dd");
      const check = validateAgendaSlot({
        date,
        startTime: editApptStartTime,
        endTime: editApptEndTime,
        kind: "booking",
        ignoreId: id,
        entries: await fetchDayEntries(date),
        lunchByDay,
        bufferMinutes: bufferMin,
      });
      if (!check.ok) throw new Error(check.reason);

      const { error } = await supabase
        .from("appointments")
        .update({
          status: editApptStatus as any,
          payment_status: editApptPaymentStatus as any,
          notes: editApptNotes || null,
          start_time: editApptStartTime,
          end_time: editApptEndTime,
          color: editApptColor,
          appointment_date: date,
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
    onError: (e: Error) => toast.error(e.message || "Erro ao atualizar agendamento"),
  });

  // Cancelar É excluir: o registro sai do banco e o horário volta a ficar livre.
  // O histórico não se perde — um trigger copia o agendamento para
  // `appointment_cancellations` antes do DELETE (migration 20260802c).
  const cancelAndDelete = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: CancellationReason }) => {
      // .select() detecta exclusão barrada pela RLS, que voltaria como sucesso
      // com zero linhas (ver migration 20260728_appointments_delete_policies).
      const { data, error } = await supabase
        .from("appointments").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Nada foi removido — o banco recusou a exclusão.");
      // Só depois do delete a linha de cancelamento existe para receber o motivo.
      await saveCancellationReason(id, motivo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      queryClient.invalidateQueries({ queryKey: ["professional-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] });
      queryClient.invalidateQueries({ queryKey: ["appointment-cancellations"] });
      toast.success("Cancelado e removido da agenda.", {
        description: "O registro ficou guardado na aba Cancelados.",
      });
      setDetailDialogOpen(false);
    },
    onError: (e: any) => toast.error("Erro ao cancelar", { description: e.message }),
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
    // Arrastar/esticar entre dias vira barra confusa: recusa (recorrência é no
    // editor). O evento de dia inteiro é exceção: ele ocupa o dia por definição.
    if (startDate !== endDate && !ev.allDay) {
      toast.info("Para repetir em vários dias, edite o agendamento e use a recorrência.");
      info.revert();
      return;
    }

    // Mesma validação de criar e editar (lib/agendaValidation). O conflito agora
    // ignora cancelados e concluídos: eles continuam desenhados no grid, e antes
    // faziam a agenda recusar um horário que na prática estava livre.
    const check = validateAgendaSlot({
      date: startDate,
      startTime: format(ev.start, "HH:mm"),
      endTime: format(end, "HH:mm"),
      kind: props.type === "block" ? "block" : "booking",
      ignoreId: props.id as string,
      entries: [...appointments, ...blocks] as AgendaEntry[],
      lunchByDay,
      bufferMinutes: bufferMin,
      allDay: ev.allDay,
    });
    if (!check.ok) {
      toast.info(`${check.reason ?? "Horário indisponível."} Desfazendo.`);
      info.revert();
      return;
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        appointment_date: startDate,
        // Evento de dia inteiro (importado do Google) volta com a marcação
        // original de 24h em vez do horário que o grid inventaria.
        start_time: ev.allDay ? "00:00:00" : format(ev.start, "HH:mm:ss"),
        end_time: ev.allDay ? "23:59:00" : format(end, "HH:mm:ss"),
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



  const resetBlockForm = () => {
    setBlockTitle("Compromisso pessoal");
    setBlockStartTime("09:00");
    setBlockEndTime("10:00");
    setBlockType("personal");
    setBlockColor(null);
    setBlockLeadId(null);
    setBlockServiceId(null);
    setEntryKind("booking");
    setRecurrence("unico");
    setSelectedDates([]);
    // Ficava com a data da última recorrência criada — e, começando em "hoje",
    // qualquer início futuro gerava zero datas com um erro que não explicava nada.
    setRecEndDate(addDays(new Date(), 30));
  };

  // Dias com algum compromisso (agendamento ou bloqueio) — vira um pontinho no mini calendário.
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach((a: any) => set.add(a.appointment_date));
    blocks.forEach((b: any) => set.add(b.appointment_date));
    return set;
  }, [appointments, blocks]);

  // Evento que cobre o dia inteiro. Sem isto ele vira uma barra de 24 horas que
  // engole a coluna e esconde o resto.
  //
  // A tolerância NÃO é decorativa: em produção existem 131 compromissos gravados
  // como 00:01–23:59 (o "Compromisso pessoal" de dia inteiro criado à mão), além
  // dos 00:00–23:59 que vêm do Google. Uma comparação exata deixaria os 131 de
  // fora e ainda esticaria o grid de 00:00 às 24:00 todo dia.
  const isAllDay = (r: { start_time?: string; end_time?: string }) => {
    if (!r.start_time || !r.end_time) return false;
    return toMin(r.start_time) <= 5 && toMin(r.end_time) >= 23 * 60 + 55;
  };

  // Build events
  const events = useMemo((): EventInput[] => {
    const out: EventInput[] = [];

    appointments.forEach((appt: any) => {
      const displayName = appt.block_type === "personal"
        ? "Pessoal"
        : (appt.patientName || "Paciente");
      const serviceName = appt.professional_services?.name || "Consulta";
      const fundo = appt.color || getStatusColor(appt.status);
      out.push({
        id: `appt-${appt.id}`,
        title: `${displayName} — ${serviceName}`,
        start: `${appt.appointment_date}T${appt.start_time}`,
        end: `${appt.appointment_date}T${appt.end_time}`,
        allDay: isAllDay(appt),
        backgroundColor: fundo,
        borderColor: getStatusColor(appt.status),
        // Era "#fff" fixo: branco sobre o amarelo de "Concluído" dá 1.7:1 de
        // contraste, metade do mínimo legível.
        textColor: readableTextColor(fundo),
        classNames: appt.color ? ["fc-event-tinted"] : undefined,
        extendedProps: { type: "appointment", displayName, subtitulo: serviceName, ...appt },
      });
    });

    blocks.forEach((block: any) => {
      // F17 — sem "tipo": o título é o que a pessoa digitou (cor diferencia o evento).
      const blockTitle = block.notes || "Compromisso";
      const fundo = block.color || getStatusColor(block.status || "pending");
      out.push({
        id: `block-${block.id}`,
        title: blockTitle,
        start: `${block.appointment_date}T${block.start_time}`,
        end: `${block.appointment_date}T${block.end_time}`,
        allDay: isAllDay(block),
        backgroundColor: fundo,
        borderColor: getStatusColor(block.status || "pending"),
        textColor: readableTextColor(fundo),
        classNames: block.color ? ["fc-event-tinted"] : undefined,
        extendedProps: {
          type: "block",
          displayName: blockTitle,
          // Segunda linha do card. A descrição é o que a pessoa escreveu sobre o
          // compromisso; sem ela, ao menos a categoria explica o que é aquilo —
          // antes o card mostrava só um título solto como "BLOQUEIO".
          subtitulo: block.description || BLOCK_TYPE_LABELS[block.source === "ical" ? "ical" : block.block_type] || null,
          ...block,
        },
      });
    });

    availability.filter((a) => a.active).forEach((avail) => {
      out.push({
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

    return out;
  }, [appointments, blocks, availability, getStatusColor]);

  // Feriados: no admin eles NÃO impedem de marcar — o dono da agenda pode
  // atender num feriado se quiser. Aparecem pintados no grid, e é a agenda
  // pública (paciente e Axel) que fecha o dia de verdade.
  const { isHoliday, holidayName } = useProfessionalHolidays(
    professional?.id,
    (professional as any)?.skip_national_holidays,
    { inicio: range.start, fim: range.end },
  );

  const temAllDay = useMemo(
    () => [...appointments, ...blocks].some((r: any) => isAllDay(r)),
    [appointments, blocks],
  );

  // Janela de horas do grid, derivada do que existe de verdade. Era fixa em
  // 07:00–22:00: quem atendia às 6h30 ou marcava algo às 22h30 simplesmente não
  // via o compromisso no calendário.
  const { slotMinTime, slotMaxTime } = useMemo(() => {
    const horas: number[] = [];
    availability.filter((a) => a.active).forEach((a) => {
      horas.push(Math.floor(toMin(a.start_time) / 60), Math.ceil(toMin(a.end_time) / 60));
    });
    [...appointments, ...blocks].forEach((r: any) => {
      if (isAllDay(r)) return;
      horas.push(Math.floor(toMin(r.start_time) / 60), Math.ceil(toMin(r.end_time) / 60));
    });
    const min = horas.length ? Math.min(7, ...horas) : 7;
    const max = horas.length ? Math.max(22, ...horas) : 22;
    return {
      slotMinTime: `${String(Math.max(0, min)).padStart(2, "0")}:00:00`,
      slotMaxTime: `${String(Math.min(24, max)).padStart(2, "0")}:00:00`,
    };
  }, [availability, appointments, blocks]);

  // O esqueleto é só da PRIMEIRA carga. Trocar de mês muda a queryKey (o período
  // faz parte dela), então sem esta trava o calendário desmontaria e remontaria
  // a cada navegação — perdendo inclusive a view escolhida pela pessoa.
  const carregando = loadingAppointments || loadingBlocks;
  const [jaCarregou, setJaCarregou] = useState(false);
  useEffect(() => {
    if (!carregando) setJaCarregou(true);
  }, [carregando]);
  const mostrarEsqueleto = carregando && !jaCarregou;

  // Meia-noite de hoje — referência para esmaecer os dias já vividos.
  const hojeZero = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // A view inicial é lida UMA vez, no construtor do FullCalendar. Como
  // `useIsMobile` devolve false no primeiro render (só mede depois do efeito), a
  // agenda abria em "Semana" no celular — sete colunas num tela de 6 cm — e
  // ficava assim para sempre. Aqui a correção vai pela API.
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    const alvo = isMobile ? "timeGridDay" : "timeGridWeek";
    const atual = api.view.type;
    // Respeita quem escolheu "Mês": só alterna entre dia e semana.
    if (atual !== alvo && (atual === "timeGridDay" || atual === "timeGridWeek")) {
      api.changeView(alvo);
    }
  }, [isMobile, carregando]);

  // Passado esmaecido: dá relevo ao que ainda vai acontecer, que é o que importa
  // na tela. O corte é por FIM do evento, não por dia.
  const eventClassNames = useCallback((arg: { event: EventApi }) => {
    const fim = arg.event.end ?? arg.event.start;
    return fim && fim.getTime() < Date.now() ? ["fc-event-passado"] : [];
  }, []);

  // Conteúdo do evento. O padrão era a string "Nome — Serviço" inteira, que
  // sumia em reticências no primeiro corte. Aqui o nome tem prioridade, o
  // serviço aparece se couber, e os sinais (bloqueio, pago) viram ícone.
  const renderEventContent = useCallback((arg: { event: EventApi; timeText: string; view: { type: string } }) => {
    const p = arg.event.extendedProps as any;
    if (p.type === "availability") return null;

    const bloqueio = p.type === "block";
    const pago = p.payment_status === "paid";
    const compacto = arg.view.type === "dayGridMonth" || arg.event.allDay;

    // O card corta com reticências; o texto inteiro fica no hover.
    const completo = [
      arg.timeText,
      p.displayName || arg.event.title,
      p.subtitulo,
      p.description && p.description !== p.subtitulo ? p.description : null,
    ].filter(Boolean).join(" · ");

    return (
      <div className="fc-pp-event" title={completo}>
        <div className="fc-pp-linha">
          {bloqueio && <Lock className="fc-pp-icone" aria-hidden />}
          {arg.timeText && <span className="fc-pp-hora">{arg.timeText}</span>}
          <span className="fc-pp-nome">{p.displayName || arg.event.title}</span>
          {pago && <span className="fc-pp-pago" title="Pago" aria-label="Pago">•</span>}
        </div>
        {!compacto && p.subtitulo && (
          <div className="fc-pp-servico">{p.subtitulo}</div>
        )}
      </div>
    );
  }, []);

  const handleEventClick = (info: EventClickArg) => {
    const props = info.event.extendedProps;
    if (props.type === "availability") return;
    setSelectedEvent(props);
    setDetailDialogOpen(true);
  };

  // Duração de um slot do grid — a seleção de um clique simples tem esse tamanho.
  const SLOT_MS = 30 * 60000;

  const handleDateSelect = (info: DateSelectArg) => {
    // Sem o reset, o formulário abria com o título, o tipo e a cor do
    // agendamento anterior, e a pessoa salvava sem perceber.
    resetBlockForm();

    const servicoPadrao = (services.length > 0 ? services[0].duration_minutes : 60) * 60000;
    let start = info.start;
    let duracao: number;

    if (info.allDay) {
      // Visão de mês: a seleção é o dia inteiro. Abre às 9h com a duração do serviço.
      start = new Date(info.start);
      start.setHours(9, 0, 0, 0);
      duracao = servicoPadrao;
    } else {
      // A duração ARRASTADA manda. Antes ela era descartada: arrastar das 14h às
      // 16h abria o formulário 14h–15h. Um clique só (um slot) continua usando a
      // duração do serviço, que é o que se espera de um clique.
      const selecionado = info.end.getTime() - info.start.getTime();
      duracao = selecionado > SLOT_MS ? selecionado : servicoPadrao;
    }

    setBlockDate(start);
    setBlockStartTime(format(start, "HH:mm"));
    setBlockEndTime(format(new Date(start.getTime() + duracao), "HH:mm"));
    setRecurrence("unico");
    setBlockDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <Popover open={miniCalOpen} onOpenChange={setMiniCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" title="Ir para uma data" aria-label="Ir para uma data">
                <CalendarIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                month={miniCalMonth}
                onMonthChange={setMiniCalMonth}
                // Sem `selected` o dia em que a agenda está não ficava marcado,
                // e o mini calendário abria sempre "sem lugar nenhum".
                selected={miniCalDay}
                onSelect={(d) => d && goToDate(d)}
                modifiers={{ hasEvents: (date) => eventDates.has(format(date, "yyyy-MM-dd")) }}
                modifiersClassNames={{ hasEvents: "fc-mini-com-evento" }}
                locale={ptBR}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
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

      {/* Legenda — o único lugar onde as cores eram explicadas ficava dentro do
          diálogo de configuração, então ninguém sabia o que cada cor queria dizer. */}
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-xs text-muted-foreground">
        {(["pending", "confirmed", "completed"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getStatusColor(s) }} />
            {STATUS_LABELS[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> Bloqueio
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getPaymentColor("paid") }} /> Pago
        </span>
      </div>

      <div className="fc-wrapper bg-card rounded-lg border p-2 sm:p-4">
        {mostrarEsqueleto ? (
          <div className="space-y-2" aria-busy="true" aria-label="Carregando a agenda">
            <Skeleton className="h-9 w-full" />
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-6" />)}
            </div>
            <Skeleton className="h-[420px] w-full" />
          </div>
        ) : (
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
          locale="pt-br"
          firstDay={0}
          // Derivados do que existe na agenda: a janela fixa 07:00–22:00 tornava
          // invisível qualquer compromisso fora dela (ver useMemo acima).
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
          snapDuration="00:15:00"
          slotDuration="00:30:00"
          slotLabelInterval="01:00:00"
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          // Ligado por causa dos eventos de dia inteiro do Google, que como
          // 00:00–23:59 viravam uma barra gigante em cima da coluna do dia.
          // Só aparece quando existe algum: senão é uma faixa vazia roubando
          // altura do grid todo santo dia.
          allDaySlot={temAllDay}
          allDayText="Dia todo"
          // Abaixo desta altura o evento usa layout de UMA linha (hora + título
          // lado a lado). Com slot de 2rem, um evento de 30 min tem ~32px: sem
          // subir este limite ele empilharia em 2 linhas e o texto seria cortado.
          eventShortHeight={44}
          // snapDuration de 15 min permite eventos de ~16px, curtos demais para
          // caber uma linha de texto: garante um piso de altura na renderização.
          eventMinHeight={22}
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
          datesSet={handleDatesSet}
          eventContent={renderEventContent}
          eventClassNames={eventClassNames}
          dayCellClassNames={(arg) => {
            const classes: string[] = [];
            if (arg.date < hojeZero) classes.push("fc-dia-passado");
            if (isHoliday(format(arg.date, "yyyy-MM-dd"))) classes.push("fc-dia-feriado");
            return classes;
          }}
          // O nome do feriado vai no cabeçalho do dia — "por que ninguém marca
          // nada aqui?" tem que ter resposta visível.
          dayHeaderContent={(arg) => {
            const nome = holidayName(format(arg.date, "yyyy-MM-dd"));
            const rotulo = arg.text;
            return nome ? (
              <span className="flex flex-col leading-tight" title={nome}>
                <span>{rotulo}</span>
                <span className="text-[10px] font-normal text-primary truncate max-w-[9rem]">{nome}</span>
              </span>
            ) : rotulo;
          }}
          events={events}
          height="auto"
          expandRows={true}
          dayHeaderFormat={{ weekday: "short", day: "numeric", month: "numeric" }}
          buttonText={{ today: "Hoje", month: "Mês", week: "Semana", day: "Dia" }}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        />
        )}
      </div>

      {/* Block Dialog with Recurrence */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <Button
                  type="button"
                  variant={entryKind === "booking" ? "default" : "outline"}
                  onClick={() => setEntryKind("booking")}
                >
                  <User className="h-4 w-4 mr-1.5" /> Atendimento
                </Button>
                <Button
                  type="button"
                  variant={entryKind === "block" ? "default" : "outline"}
                  onClick={() => setEntryKind("block")}
                >
                  <Lock className="h-4 w-4 mr-1.5" /> Bloqueio
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {entryKind === "booking"
                  ? "Consulta com um cliente. Aparece na aba Agendamentos."
                  : "Horário indisponível (almoço, folga, compromisso pessoal). Aparece na aba Bloqueios."}
              </p>
            </div>
            <div>
              <Label>Título</Label>
              <TituloCombobox
                value={blockTitle}
                onChange={(v, leadId) => {
                  setBlockTitle(v);
                  setBlockLeadId(leadId);
                  // Escolher um cliente da lista implica atendimento; "Compromisso
                  // pessoal" implica bloqueio. Segue ajustável pelo seletor acima.
                  if (leadId) setEntryKind("booking");
                  else if (v === "Compromisso pessoal") setEntryKind("block");
                }}
                leads={leads}
                pastTitles={pastTitles}
              />
              {entryKind === "booking" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {blockLeadId
                    ? "Vinculado a este cliente — recebe lembrete no WhatsApp."
                    : "Cliente não cadastrado: o agendamento é criado, mas sem lembrete no WhatsApp."}
                </p>
              )}
            </div>

            {/* Serviço só existe para atendimento. Sem este campo o agendamento
                nascia sem service_id e a aba Agendamentos mostrava "—". */}
            {entryKind === "booking" && services.length > 0 && (
              <div>
                <Label>Serviço</Label>
                <Select
                  value={blockServiceId ?? "__none"}
                  onValueChange={(v) => {
                    const id = v === "__none" ? null : v;
                    setBlockServiceId(id);
                    // Escolher o serviço ajusta o fim pela duração cadastrada —
                    // é o dado que a pessoa já configurou, não faz sentido
                    // pedir de novo.
                    const s = services.find((x) => x.id === id);
                    if (s?.duration_minutes) {
                      const [h, m] = blockStartTime.split(":").map(Number);
                      const fim = new Date(2000, 0, 1, h, m + s.duration_minutes);
                      setBlockEndTime(format(fim, "HH:mm"));
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Sem serviço" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem serviço</SelectItem>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.duration_minutes} min)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
              <Select
                value={recurrence}
                onValueChange={(v) => {
                  setRecurrence(v as RecurrenceType);
                  // Uma data de término anterior ao início gera zero ocorrências.
                  // Ao ligar a recorrência, o término salta 30 dias à frente do
                  // início em vez de ficar preso no valor antigo.
                  if (v === "diario" || v === "semanal" || v === "quinzenal") {
                    setRecEndDate((prev) => (prev > blockDate ? prev : addDays(blockDate, 30)));
                  }
                }}
              >
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
                {selectedEvent?.type === "appointment" ? "Consulta" : "Bloqueio"}
              </DialogTitle>
              {selectedEvent && !editMode && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Cor do evento" aria-label="Cor do evento">
                      <Palette className="h-4 w-4" />
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
                    <StatusBadge
                      label={STATUS_LABELS[selectedEvent.status] || selectedEvent.status}
                      color={getStatusColor(selectedEvent.status)}
                    />
                    <StatusBadge
                      label={PAYMENT_LABELS[selectedEvent.payment_status || "pending"]}
                      color={getPaymentColor(selectedEvent.payment_status || "pending")}
                      icon={<DollarSign className="h-3 w-3 mr-1" />}
                    />
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
                      <CancelAppointmentButton
                        onConfirm={(motivo) => cancelAndDelete.mutate({ id: selectedEvent.id, motivo })}
                        disabled={cancelAndDelete.isPending}
                        resumo={
                          <>
                            {selectedEvent.patientName}
                            {" · "}
                            {format(new Date(selectedEvent.appointment_date + "T12:00:00"), "dd/MM/yyyy")}
                            {" · "}
                            {selectedEvent.start_time?.slice(0, 5)}–{selectedEvent.end_time?.slice(0, 5)}
                          </>
                        }
                      />
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
                  {/* Bloqueio não tem pagamento. O badge daqui dependia de
                      block_type === "atendimento", valor que nunca é gravado em
                      lugar nenhum (as categorias são personal/vacation/other) —
                      era código morto sustentando um controle sem sentido. */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge
                      label={STATUS_LABELS[selectedEvent.status] || selectedEvent.status || "Pendente"}
                      color={getStatusColor(selectedEvent.status || "pending")}
                    />
                    {selectedEvent.source === "ical" && (
                      <Badge variant="outline" className="gap-1">
                        <CalendarDays className="h-3 w-3" /> Google Agenda
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
                      {/* Sem "Cancelar" aqui: bloqueio não é cancelamento (o
                          histórico da aba Cancelados é só de atendimentos), e a
                          remoção já está no botão destrutivo logo abaixo. */}
                    </div>
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
                <div className="rounded-xl border overflow-hidden bg-card shadow-sm">
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

      {/* Quando eu não atendo — mesmo editor da aba Bloqueios, para a regra não
          ter dois donos que divergem. */}
      <Dialog open={availDialogOpen} onOpenChange={setAvailDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Horários de atendimento</DialogTitle>
          </DialogHeader>
          <QuandoNaoAtendoEditor
            professional={professional}
            onSaved={() => setAvailDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
      {/* Status colors dialog */}
      <StatusColorsDialog open={colorsDialogOpen} onOpenChange={setColorsDialogOpen} />
    </div>
  );
}

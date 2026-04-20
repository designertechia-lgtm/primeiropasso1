import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Trash2, CalendarIcon, Lock, Repeat,
  Infinity, CalendarDays, Clock, AlignLeft,
} from "lucide-react";
import { format, parseISO, addYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { generateRecurrenceDates, type RecurrenceType } from "@/lib/recurrence";
import { FieldHint } from "@/components/ui/FieldHint";
import { fetchIcal } from "@/lib/ical";

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string; desc: string }[] = [
  { value: "unico",       label: "Único",            desc: "Um dia só"         },
  { value: "diario",      label: "Diário",            desc: "Todo dia"          },
  { value: "semanal",     label: "Semanal",           desc: "A cada 7 dias"     },
  { value: "quinzenal",   label: "Quinzenal",         desc: "A cada 14 dias"    },
  { value: "selecionavel",label: "Datas específicas", desc: "Você escolhe"      },
];

const BLOCK_TYPE_OPTIONS = [
  { value: "personal", label: "Pessoal"       },
  { value: "vacation", label: "Férias / Folga" },
  { value: "other",    label: "Outro"          },
];

const BLOCK_TYPE_LABELS: Record<string, string> = {
  personal: "Pessoal",
  vacation: "Férias / Folga",
  other: "Outro",
};

export default function AdminDisponibilidade() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const [icalUrl, setIcalUrl]   = useState(() => localStorage.getItem("ical-url") || "");
  const [syncing, setSyncing]   = useState(false);

  const handleIcalSync = async () => {
    if (!professional || !icalUrl.trim()) return;
    setSyncing(true);
    try {
      localStorage.setItem("ical-url", icalUrl);
      const events = await fetchIcal(icalUrl);
      if (events.length === 0) { toast.info("Nenhum evento encontrado no calendário."); return; }
      const recurrenceGroup = crypto.randomUUID();
      const records = events.map((ev) => ({
        professional_id: professional.id,
        appointment_date: format(ev.dtstart, "yyyy-MM-dd"),
        start_time: ev.allDay ? "00:00" : format(ev.dtstart, "HH:mm"),
        end_time:   ev.allDay ? "23:59" : format(ev.dtend,   "HH:mm"),
        notes: ev.summary,
        block_type: "other",
        appointment_type: "block" as const,
        status: "confirmed" as const,
        patient_id: null,
        recurrence_group: recurrenceGroup,
      }));
      const { error } = await supabase.from("appointments").insert(records);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      toast.success(`${events.length} evento(s) importado(s) do Google Agenda!`);
    } catch (e: any) {
      toast.error("Erro ao importar", { description: e.message });
    } finally {
      setSyncing(false);
    }
  };

  // Form state
  const [blockTitle,     setBlockTitle]     = useState("Compromisso pessoal");
  const [blockStartTime, setBlockStartTime] = useState("08:00");
  const [blockEndTime,   setBlockEndTime]   = useState("17:00");
  const [blockType,      setBlockType]      = useState("personal");
  const [recurrence,     setRecurrence]     = useState<RecurrenceType>("unico");
  const [startDate,      setStartDate]      = useState<Date>(new Date());
  const [endDate,        setEndDate]        = useState<Date>(new Date());
  const [noEndDate,      setNoEndDate]      = useState(false);
  const [selectedDates,  setSelectedDates]  = useState<Date[]>([]);

  // Resumo calculado dinamicamente
  const summary = useMemo(() => {
    let count = 0;
    if (recurrence === "unico") {
      count = 1;
    } else if (recurrence === "selecionavel") {
      count = selectedDates.length;
    } else {
      const effectiveEnd = noEndDate ? addYears(startDate, 2) : endDate;
      count = generateRecurrenceDates(startDate, effectiveEnd, recurrence).length;
    }

    const recLabel = RECURRENCE_OPTIONS.find((r) => r.value === recurrence)?.label ?? "";
    const typeLabel = BLOCK_TYPE_LABELS[blockType] ?? blockType;

    if (count === 0) return null;

    if (recurrence === "unico") {
      return `1 bloqueio em ${format(startDate, "dd/MM/yyyy")} das ${blockStartTime} às ${blockEndTime}.`;
    }
    if (recurrence === "selecionavel") {
      return count === 0
        ? "Selecione ao menos uma data."
        : `${count} bloqueio(s) nas datas selecionadas, das ${blockStartTime} às ${blockEndTime}.`;
    }
    const endLabel = noEndDate
      ? `por 2 anos (até ${format(addYears(startDate, 2), "dd/MM/yyyy")})`
      : `até ${format(endDate, "dd/MM/yyyy")}`;
    return `${count} bloqueio(s) · ${recLabel} · das ${blockStartTime} às ${blockEndTime} · ${endLabel}.`;
  }, [recurrence, startDate, endDate, noEndDate, selectedDates, blockStartTime, blockEndTime, blockType]);

  // Fetch block groups
  const { data: blockGroups = [], isLoading } = useQuery({
    queryKey: ["admin-block-groups", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .eq("professional_id", professional!.id)
        .eq("appointment_type", "block")
        .order("appointment_date", { ascending: true });

      const groups = new Map<string, typeof data>();
      (data ?? []).forEach((block) => {
        const key = block.recurrence_group || block.id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(block);
      });

      return Array.from(groups.entries()).map(([groupId, blocks]) => ({
        groupId,
        blocks: blocks!,
        title:     blocks![0].notes || "Bloqueado",
        blockType: blocks![0].block_type || "other",
        startTime: blocks![0].start_time,
        endTime:   blocks![0].end_time,
        firstDate: blocks![0].appointment_date,
        lastDate:  blocks![blocks!.length - 1].appointment_date,
        count:     blocks!.length,
        isRecurring: blocks!.length > 1 || !!blocks![0].recurrence_group,
      }));
    },
    enabled: !!professional?.id,
  });

  const createBlocks = useMutation({
    mutationFn: async () => {
      if (!professional) throw new Error("No professional");
      let dates: string[];
      if (recurrence === "selecionavel") {
        dates = selectedDates.map((d) => format(d, "yyyy-MM-dd"));
      } else if (recurrence === "unico") {
        dates = [format(startDate, "yyyy-MM-dd")];
      } else {
        const effectiveEnd = noEndDate ? addYears(startDate, 2) : endDate;
        dates = generateRecurrenceDates(startDate, effectiveEnd, recurrence);
      }
      if (dates.length === 0) throw new Error("Nenhuma data selecionada");
      const recurrenceGroup = dates.length > 1 ? crypto.randomUUID() : null;
      const records = dates.map((date) => ({
        professional_id: professional.id,
        appointment_date: date,
        start_time: blockStartTime,
        end_time:   blockEndTime,
        notes:      blockTitle,
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
      queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      toast.success("Bloqueios criados com sucesso!");
      resetForm();
    },
    onError: (e: any) => toast.error("Erro ao criar bloqueios", { description: e.message }),
  });

  const deleteGroup = useMutation({
    mutationFn: async ({ groupId, blockIds }: { groupId: string; blockIds: string[] }) => {
      if (blockIds.length === 1) {
        const { error } = await supabase.from("appointments").delete().eq("id", blockIds[0]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("appointments").delete().eq("recurrence_group", groupId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      toast.success("Bloqueios removidos!");
    },
    onError: () => toast.error("Erro ao remover bloqueios"),
  });

  const resetForm = () => {
    setBlockTitle("Compromisso pessoal");
    setBlockStartTime("08:00");
    setBlockEndTime("17:00");
    setBlockType("personal");
    setRecurrence("unico");
    setNoEndDate(false);
    setSelectedDates([]);
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Bloqueios de Horário</h1>
        <p className="text-muted-foreground mt-1">Impeça agendamentos em períodos específicos.</p>
      </div>

      {/* Google Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Importar do Google Agenda
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>
              Link iCal
              <FieldHint text="No Google Agenda: Configurações → selecione o calendário → 'Endereço secreto no formato iCal'. Torne o calendário público antes." />
            </Label>
            <Input
              value={icalUrl}
              onChange={(e) => setIcalUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/..."
              className="mt-1 font-mono text-xs"
            />
          </div>
          <Button onClick={handleIcalSync} disabled={syncing || !icalUrl.trim()} variant="outline" className="w-full">
            {syncing ? "Importando..." : "Importar eventos como bloqueios"}
          </Button>
        </CardContent>
      </Card>

      {/* Novo Bloqueio */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" /> Novo Bloqueio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* ── Seção 1: O quê ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <AlignLeft className="h-3.5 w-3.5" /> Descrição
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Título</Label>
                <Input
                  value={blockTitle}
                  onChange={(e) => setBlockTitle(e.target.value)}
                  placeholder="Ex: Férias de janeiro"
                />
                <p className="text-xs text-muted-foreground">Não é exibido para pacientes.</p>
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <div className="grid grid-cols-3 gap-2">
                  {BLOCK_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBlockType(opt.value)}
                      className={cn(
                        "text-xs rounded-lg border-2 px-2 py-2 transition-all text-center",
                        blockType === opt.value
                          ? "border-primary bg-primary/5 font-semibold"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Seção 2: Horário ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Horário
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Início</Label>
                <Input type="time" value={blockStartTime} onChange={(e) => setBlockStartTime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Fim</Label>
                <Input type="time" value={blockEndTime} onChange={(e) => setBlockEndTime(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Seção 3: Recorrência ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5" /> Repetição
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {RECURRENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setRecurrence(opt.value); setNoEndDate(false); }}
                  className={cn(
                    "rounded-lg border-2 px-2 py-2.5 text-center transition-all space-y-0.5",
                    recurrence === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  <p className="text-xs font-semibold">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* Único */}
            {recurrence === "unico" && (
              <div className="space-y-1">
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(startDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Recorrente */}
            {(recurrence === "diario" || recurrence === "semanal" || recurrence === "quinzenal") && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Data de início</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(startDate, "dd/MM/yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <Label>Data de término</Label>
                    {noEndDate ? (
                      <Button variant="outline" className="w-full justify-start text-left font-normal text-muted-foreground cursor-default" disabled>
                        <Infinity className="mr-2 h-4 w-4" /> Sem data de término
                      </Button>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {format(endDate, "dd/MM/yyyy")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="no-end" checked={noEndDate} onCheckedChange={(v) => setNoEndDate(!!v)} />
                  <label htmlFor="no-end" className="text-sm cursor-pointer select-none flex items-center gap-1.5">
                    <Infinity className="h-3.5 w-3.5 text-muted-foreground" />
                    Repetir para sempre (sem data de término)
                  </label>
                </div>
                {noEndDate && (
                  <p className="text-xs text-muted-foreground">
                    Bloqueios serão criados por 2 anos a partir da data de início.
                  </p>
                )}
              </div>
            )}

            {/* Datas específicas */}
            {recurrence === "selecionavel" && (
              <div className="space-y-2">
                <Label>Selecione as datas</Label>
                <div className="border rounded-lg p-3">
                  <Calendar
                    mode="multiple"
                    selected={selectedDates}
                    onSelect={(dates) => setSelectedDates(dates || [])}
                    locale={ptBR}
                    className="p-3 pointer-events-auto mx-auto"
                  />
                  {selectedDates.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-2 text-center">
                      {selectedDates.length} data(s) selecionada(s)
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Resumo ── */}
          {summary && (
            <div className="rounded-lg bg-muted/60 border px-4 py-3 text-sm text-muted-foreground flex items-start gap-2">
              <CalendarIcon className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <span>{summary}</span>
            </div>
          )}

          <Button
            onClick={() => createBlocks.mutate()}
            disabled={createBlocks.isPending}
            className="w-full"
            size="lg"
          >
            {createBlocks.isPending ? "Criando..." : "Confirmar Bloqueio"}
          </Button>
        </CardContent>
      </Card>

      {/* Bloqueios existentes */}
      <div className="space-y-3">
        <h2 className="font-serif text-xl font-semibold">Bloqueios Existentes</h2>

        {blockGroups.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum bloqueio cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {blockGroups.map((group) => (
              <Card key={group.groupId}>
                <CardContent className="flex items-center justify-between py-4 px-5 gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{group.title}</p>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {BLOCK_TYPE_LABELS[group.blockType] || group.blockType}
                        </Badge>
                        {group.isRecurring && (
                          <Badge variant="outline" className="text-xs gap-1 shrink-0">
                            <Repeat className="h-3 w-3" /> {group.count}x
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {group.startTime?.slice(0, 5)} – {group.endTime?.slice(0, 5)}
                        {" · "}
                        {group.count === 1
                          ? format(parseISO(group.firstDate), "dd/MM/yyyy")
                          : `${format(parseISO(group.firstDate), "dd/MM/yyyy")} → ${format(parseISO(group.lastDate), "dd/MM/yyyy")}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteGroup.mutate({ groupId: group.groupId, blockIds: group.blocks.map((b) => b.id) })}
                    disabled={deleteGroup.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

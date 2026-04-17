import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Plus, Trash2, CalendarIcon, Lock, Repeat } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { generateRecurrenceDates, type RecurrenceType } from "@/lib/recurrence";
import { FieldHint } from "@/components/ui/FieldHint";

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  unico: "Único",
  diario: "Diário",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  selecionavel: "Datas específicas",
};

const BLOCK_TYPE_LABELS: Record<string, string> = {
  personal: "Pessoal",
  vacation: "Férias / Folga",
  other: "Outro",
};

export default function AdminDisponibilidade() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  // Form state
  const [blockTitle, setBlockTitle] = useState("Compromisso pessoal");
  const [blockStartTime, setBlockStartTime] = useState("08:00");
  const [blockEndTime, setBlockEndTime] = useState("17:00");
  const [blockType, setBlockType] = useState("personal");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("unico");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);

  // Fetch existing block groups
  const { data: blockGroups = [], isLoading } = useQuery({
    queryKey: ["admin-block-groups", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .eq("professional_id", professional!.id)
        .eq("appointment_type", "block")
        .order("appointment_date", { ascending: true });
      
      // Group by recurrence_group
      const groups = new Map<string, typeof data>();
      (data ?? []).forEach((block) => {
        const key = block.recurrence_group || block.id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(block);
      });

      return Array.from(groups.entries()).map(([groupId, blocks]) => ({
        groupId,
        blocks: blocks!,
        title: blocks![0].notes || "Bloqueado",
        blockType: blocks![0].block_type || "other",
        startTime: blocks![0].start_time,
        endTime: blocks![0].end_time,
        firstDate: blocks![0].appointment_date,
        lastDate: blocks![blocks!.length - 1].appointment_date,
        count: blocks!.length,
        isRecurring: blocks!.length > 1 || !!blocks![0].recurrence_group,
      }));
    },
    enabled: !!professional?.id,
  });

  // Create block mutation
  const createBlocks = useMutation({
    mutationFn: async () => {
      if (!professional) throw new Error("No professional");

      let dates: string[];
      if (recurrence === "selecionavel") {
        dates = selectedDates.map((d) => format(d, "yyyy-MM-dd"));
      } else if (recurrence === "unico") {
        dates = [format(startDate, "yyyy-MM-dd")];
      } else {
        dates = generateRecurrenceDates(startDate, endDate, recurrence);
      }

      if (dates.length === 0) throw new Error("Nenhuma data selecionada");

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
      queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      toast.success("Bloqueios criados com sucesso!");
      resetForm();
    },
    onError: (e: any) => toast.error("Erro ao criar bloqueios", { description: e.message }),
  });

  // Delete group mutation
  const deleteGroup = useMutation({
    mutationFn: async ({ groupId, blockIds }: { groupId: string; blockIds: string[] }) => {
      // If it's a recurrence group, delete by group; otherwise delete single
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
    setSelectedDates([]);
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Bloqueios de Horário</h1>
      <p className="text-muted-foreground">Crie bloqueios recorrentes ou pontuais para impedir agendamentos.</p>

      {/* Create Block Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" /> Novo Bloqueio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Título <FieldHint text="Descrição interna do bloqueio. Ex: 'Férias de janeiro', 'Reunião semanal'. Não é exibido para pacientes." /></Label>
              <Input value={blockTitle} onChange={(e) => setBlockTitle(e.target.value)} />
            </div>
            <div>
              <Label>Tipo <FieldHint text="Categoria do bloqueio para sua organização interna." /></Label>
              <Select value={blockType} onValueChange={setBlockType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Pessoal</SelectItem>
                  <SelectItem value="vacation">Férias / Folga</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Hora início <FieldHint text="Horário de início do bloqueio. Agendamentos neste período serão impedidos." /></Label>
              <Input type="time" value={blockStartTime} onChange={(e) => setBlockStartTime(e.target.value)} />
            </div>
            <div>
              <Label>Hora fim <FieldHint text="Horário de fim do bloqueio." /></Label>
              <Input type="time" value={blockEndTime} onChange={(e) => setBlockEndTime(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Recorrência <FieldHint text="Único: bloqueia só uma data. Semanal/Quinzenal: repete no período definido. Datas específicas: você escolhe cada data manualmente." /></Label>
            <Select value={recurrence} onValueChange={(v) => setRecurrence(v as RecurrenceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date pickers based on recurrence type */}
          {recurrence === "unico" && (
            <div>
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {(recurrence === "diario" || recurrence === "semanal" || recurrence === "quinzenal") && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Data início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(startDate, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Data fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(endDate, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {recurrence === "selecionavel" && (
            <div>
              <Label>Selecione as datas</Label>
              <div className="border rounded-md p-3 mt-1">
                <Calendar
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={(dates) => setSelectedDates(dates || [])}
                  locale={ptBR}
                  className="p-3 pointer-events-auto mx-auto"
                />
                {selectedDates.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {selectedDates.length} data(s) selecionada(s)
                  </p>
                )}
              </div>
            </div>
          )}

          <Button onClick={() => createBlocks.mutate()} disabled={createBlocks.isPending} className="w-full" size="lg">
            {createBlocks.isPending ? "Criando..." : "Criar Bloqueio"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Block Groups */}
      <h2 className="font-serif text-xl font-semibold text-foreground">Bloqueios Existentes</h2>

      {blockGroups.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum bloqueio cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {blockGroups.map((group) => (
            <Card key={group.groupId}>
              <CardContent className="flex items-center justify-between py-4 px-5 gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{group.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {group.startTime?.slice(0, 5)} – {group.endTime?.slice(0, 5)}
                      {" · "}
                      {BLOCK_TYPE_LABELS[group.blockType] || group.blockType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {group.count === 1
                        ? format(parseISO(group.firstDate), "dd/MM/yyyy")
                        : `${format(parseISO(group.firstDate), "dd/MM/yyyy")} → ${format(parseISO(group.lastDate), "dd/MM/yyyy")} (${group.count} dias)`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {group.isRecurring && <Repeat className="h-4 w-4 text-muted-foreground" />}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteGroup.mutate({ groupId: group.groupId, blockIds: group.blocks.map((b) => b.id) })}
                    disabled={deleteGroup.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

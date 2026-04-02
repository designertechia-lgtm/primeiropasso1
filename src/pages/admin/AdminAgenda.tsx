import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Plus, X, Clock, User, Ban } from "lucide-react";

type TimeSlot = {
  time: string;
  endTime: string;
  type: "free" | "appointment" | "block";
  label?: string;
  id?: string;
  status?: string;
  patientName?: string;
};

export default function AdminAgenda() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [blockTitle, setBlockTitle] = useState("Compromisso pessoal");
  const [blockStartTime, setBlockStartTime] = useState("09:00");
  const [blockEndTime, setBlockEndTime] = useState("10:00");
  const [blockType, setBlockType] = useState("personal");

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Fetch availability for selected day of week
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

  // Fetch appointments for selected date
  const { data: appointments = [] } = useQuery({
    queryKey: ["agenda-appointments", professional?.id, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, professional_services(name)")
        .eq("professional_id", professional!.id)
        .eq("appointment_date", dateStr)
        .in("status", ["pending", "confirmed", "completed"]);
      if (error) throw error;

      // Fetch patient names
      const patientIds = [...new Set(data.map((a) => a.patient_id))];
      if (patientIds.length === 0) return data.map((a) => ({ ...a, patientName: "Paciente" }));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", patientIds);
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);

      return data.map((a) => ({
        ...a,
        patientName: profileMap.get(a.patient_id) || "Paciente",
      }));
    },
    enabled: !!professional?.id,
  });

  // Fetch blocks for selected date
  const { data: blocks = [] } = useQuery({
    queryKey: ["agenda-blocks", professional?.id, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("schedule_blocks")
        .select("*")
        .eq("professional_id", professional!.id)
        .eq("block_date", dateStr);
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  // Add block mutation
  const addBlock = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("schedule_blocks").insert({
        professional_id: professional!.id,
        block_date: dateStr,
        start_time: blockStartTime,
        end_time: blockEndTime,
        title: blockTitle,
        block_type: blockType,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks"] });
      toast.success("Bloqueio adicionado!");
      setDialogOpen(false);
      setBlockTitle("Compromisso pessoal");
      setBlockStartTime("09:00");
      setBlockEndTime("10:00");
    },
    onError: () => toast.error("Erro ao adicionar bloqueio"),
  });

  // Remove block mutation
  const removeBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedule_blocks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks"] });
      toast.success("Bloqueio removido!");
    },
    onError: () => toast.error("Erro ao remover bloqueio"),
  });

  // Build timeline for the day
  const buildTimeline = (): TimeSlot[] => {
    const dayOfWeek = selectedDate.getDay();
    const dayAvail = availability.filter((a) => a.day_of_week === dayOfWeek);
    if (dayAvail.length === 0) return [];

    const slots: TimeSlot[] = [];

    for (const avail of dayAvail) {
      const [startH, startM] = avail.start_time.split(":").map(Number);
      const [endH, endM] = avail.end_time.split(":").map(Number);
      const startMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;

      for (let t = startMin; t + 30 <= endMin; t += 30) {
        const time = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
        const end = `${String(Math.floor((t + 30) / 60)).padStart(2, "0")}:${String((t + 30) % 60).padStart(2, "0")}`;

        // Check if this slot overlaps with an appointment
        const appt = appointments.find((a) => {
          const aStart = a.start_time.slice(0, 5);
          const aEnd = a.end_time.slice(0, 5);
          return time >= aStart && time < aEnd;
        });

        if (appt) {
          // Only add appointment entry once (at its start time)
          const aStart = appt.start_time.slice(0, 5);
          if (time === aStart) {
            slots.push({
              time: aStart,
              endTime: appt.end_time.slice(0, 5),
              type: "appointment",
              label: (appt as any).professional_services?.name || "Consulta",
              id: appt.id,
              status: appt.status,
              patientName: (appt as any).patientName,
            });
          }
          continue;
        }

        // Check if this slot overlaps with a block
        const block = blocks.find((b) => {
          const bStart = b.start_time.slice(0, 5);
          const bEnd = b.end_time.slice(0, 5);
          return time >= bStart && time < bEnd;
        });

        if (block) {
          const bStart = block.start_time.slice(0, 5);
          if (time === bStart) {
            slots.push({
              time: bStart,
              endTime: block.end_time.slice(0, 5),
              type: "block",
              label: block.title || "Bloqueado",
              id: block.id,
            });
          }
          continue;
        }

        slots.push({ time, endTime: end, type: "free" });
      }
    }

    return slots;
  };

  const timeline = buildTimeline();
  const dayOfWeek = selectedDate.getDay();
  const hasAvailability = availability.some((a) => a.day_of_week === dayOfWeek);

  const statusLabel: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmado",
    completed: "Concluído",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Bloquear horário
            </Button>
          </DialogTrigger>
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
                <Input value={format(selectedDate, "dd/MM/yyyy")} disabled />
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
        {/* Calendar sidebar */}
        <Card className="h-fit">
          <CardContent className="pt-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              locale={ptBR}
              className="rounded-md"
            />
          </CardContent>
        </Card>

        {/* Day timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!hasAvailability ? (
              <p className="text-sm text-muted-foreground">
                Sem horários configurados para este dia da semana. Configure em Disponibilidade.
              </p>
            ) : timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum horário nesta data.</p>
            ) : (
              <div className="space-y-1">
                {timeline.map((slot, i) => (
                  <div
                    key={`${slot.time}-${i}`}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                      slot.type === "free" && "bg-accent/30 text-muted-foreground",
                      slot.type === "appointment" && "bg-primary/10 border border-primary/20",
                      slot.type === "block" && "bg-destructive/10 border border-destructive/20"
                    )}
                  >
                    <span className="font-mono text-xs w-24 shrink-0">
                      {slot.time} – {slot.endTime}
                    </span>

                    {slot.type === "free" && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" /> Livre
                      </span>
                    )}

                    {slot.type === "appointment" && (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <User className="h-3 w-3 text-primary shrink-0" />
                        <span className="font-medium truncate">{slot.patientName}</span>
                        <span className="text-muted-foreground truncate">— {slot.label}</span>
                        {slot.status && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {statusLabel[slot.status] || slot.status}
                          </Badge>
                        )}
                      </div>
                    )}

                    {slot.type === "block" && (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Ban className="h-3 w-3 text-destructive shrink-0" />
                        <span className="truncate">{slot.label}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 ml-auto shrink-0"
                          onClick={() => slot.id && removeBlock.mutate(slot.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

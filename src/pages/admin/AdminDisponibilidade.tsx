import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface Slot {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

export default function AdminDisponibilidade() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["admin-availability", professional?.id],
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

  const [localSlots, setLocalSlots] = useState<Slot[]>([]);

  useEffect(() => {
    if (slots.length > 0) {
      setLocalSlots(slots.map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        active: s.active,
      })));
    }
  }, [slots]);

  const addSlot = (day: number) => {
    setLocalSlots([...localSlots, { day_of_week: day, start_time: "08:00", end_time: "17:00", active: true }]);
  };

  const removeSlot = (index: number) => {
    setLocalSlots(localSlots.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: keyof Slot, value: string | boolean) => {
    setLocalSlots(localSlots.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const handleSave = async () => {
    if (!professional) return;
    setSaving(true);

    // Delete existing slots
    await supabase.from("availability").delete().eq("professional_id", professional.id);

    // Insert all current slots
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
        setSaving(false);
        return;
      }
    }

    toast.success("Disponibilidade salva!");
    queryClient.invalidateQueries({ queryKey: ["admin-availability"] });
    setSaving(false);
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  const slotsByDay = DAYS.map((name, i) => ({
    name,
    day: i,
    slots: localSlots
      .map((s, idx) => ({ ...s, _index: idx }))
      .filter((s) => s.day_of_week === i),
  }));

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Disponibilidade</h1>
      <p className="text-muted-foreground">Defina os horários em que você atende em cada dia da semana.</p>

      {slotsByDay.map(({ name, day, slots: daySlots }) => (
        <Card key={day}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{name}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => addSlot(day)}>
              <Plus className="h-4 w-4 mr-1" /> Horário
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {daySlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem horários definidos</p>
            ) : (
              daySlots.map((slot) => (
                <div key={slot._index} className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs w-8">De</Label>
                    <Input
                      type="time"
                      value={slot.start_time}
                      onChange={(e) => updateSlot(slot._index, "start_time", e.target.value)}
                      className="w-28"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs w-8">Até</Label>
                    <Input
                      type="time"
                      value={slot.end_time}
                      onChange={(e) => updateSlot(slot._index, "end_time", e.target.value)}
                      className="w-28"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={slot.active}
                      onCheckedChange={(v) => updateSlot(slot._index, "active", v)}
                    />
                    <span className="text-xs text-muted-foreground">{slot.active ? "Ativo" : "Inativo"}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeSlot(slot._index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}

      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? "Salvando..." : "Salvar Disponibilidade"}
      </Button>
    </div>
  );
}

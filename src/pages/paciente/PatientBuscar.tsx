import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, addMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { User, CalendarX } from "lucide-react";

export default function PatientBuscar() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [notes, setNotes] = useState("");
  const [booking, setBooking] = useState(false);

  // Fetch linked professional
  const { data: link, isLoading: loadingLink } = useQuery({
    queryKey: ["patient-professional-link", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_professionals")
        .select("professional_id")
        .eq("patient_id", user!.id)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: professional, isLoading: loadingProf } = useQuery({
    queryKey: ["linked-professional", link?.professional_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("professionals")
        .select("*")
        .eq("id", link!.professional_id)
        .single();
      return data;
    },
    enabled: !!link?.professional_id,
  });


  const { data: services = [] } = useQuery({
    queryKey: ["linked-services", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("professional_services")
        .select("*")
        .eq("professional_id", professional!.id)
        .eq("active", true);
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const { data: availability = [] } = useQuery({
    queryKey: ["linked-availability", professional?.id],
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

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";

  const { data: existingAppointments = [] } = useQuery({
    queryKey: ["linked-existing", professional?.id, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("professional_id", professional!.id)
        .eq("appointment_date", dateStr)
        .in("status", ["pending", "confirmed"]);
      return data ?? [];
    },
    enabled: !!professional?.id && !!dateStr,
  });

  const { data: scheduleBlocks = [] } = useQuery({
    queryKey: ["linked-blocks", professional?.id, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("schedule_blocks")
        .select("start_time, end_time")
        .eq("professional_id", professional!.id)
        .eq("block_date", dateStr);
      return data ?? [];
    },
    enabled: !!professional?.id && !!dateStr,
  });

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const durationMinutes = selectedService?.duration_minutes ?? 50;

  const getTimeSlots = () => {
    if (!selectedDate) return [];
    const dayOfWeek = selectedDate.getDay();
    const dayAvailability = availability.filter((a) => a.day_of_week === dayOfWeek);

    const ranges = dayAvailability.length > 0
      ? dayAvailability.map((a) => {
          const [startH, startM] = a.start_time.split(":").map(Number);
          const [endH, endM] = a.end_time.split(":").map(Number);
          return { startMinutes: startH * 60 + startM, endMinutes: endH * 60 + endM };
        })
      : [{ startMinutes: 7 * 60, endMinutes: 20 * 60 }];

    const slots: string[] = [];
    for (const { startMinutes, endMinutes } of ranges) {
      for (let t = startMinutes; t + durationMinutes <= endMinutes; t += 60) {
        const timeStr = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
        const endTimeStr = `${String(Math.floor((t + durationMinutes) / 60)).padStart(2, "0")}:${String((t + durationMinutes) % 60).padStart(2, "0")}`;

        const hasConflict = existingAppointments.some((appt) => {
          const apptStart = appt.start_time.slice(0, 5);
          const apptEnd = appt.end_time.slice(0, 5);
          return timeStr < apptEnd && endTimeStr > apptStart;
        });

        const hasBlockConflict = scheduleBlocks.some((block) => {
          const bStart = block.start_time.slice(0, 5);
          const bEnd = block.end_time.slice(0, 5);
          return timeStr < bEnd && endTimeStr > bStart;
        });

        if (!hasConflict && !hasBlockConflict) {
          slots.push(timeStr);
        }
      }
    }
    return slots;
  };

  const timeSlots = getTimeSlots();

  const disableDate = (date: Date) => {
    return date < new Date(new Date().setHours(0, 0, 0, 0));
  };

  const handleBook = async () => {
    if (!professional || !user || !selectedDate || !selectedTime) return;
    setBooking(true);

    const endTime = format(
      addMinutes(new Date(`2000-01-01T${selectedTime}`), durationMinutes),
      "HH:mm"
    );

    const { error } = await supabase.from("appointments").insert({
      professional_id: professional.id,
      patient_id: user.id,
      appointment_date: format(selectedDate, "yyyy-MM-dd"),
      start_time: selectedTime,
      end_time: endTime,
      service_id: selectedServiceId || null,
      notes: notes || null,
    });

    setBooking(false);
    if (error) {
      console.error("Booking error:", error);
      toast.error("Erro ao agendar", { description: error.message });
    } else {
      toast.success("Consulta agendada!", { description: "O profissional confirmará em breve." });
      navigate("/minha-conta/agendamentos");
    }
  };

  const isLoading = loadingLink || loadingProf;

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  if (!link) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <CalendarX className="h-16 w-16 text-muted-foreground" />
        <h1 className="font-serif text-2xl font-bold text-foreground">Nenhum profissional vinculado</h1>
        <p className="text-muted-foreground max-w-md">
          Para agendar uma consulta, acesse a página do seu profissional e cadastre-se a partir de lá.
        </p>
      </div>
    );
  }

  if (!professional) return <p className="text-muted-foreground">Profissional não encontrado.</p>;

  const name = professional.full_name || "Profissional";

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">
        Agendar Consulta
      </h1>

      {/* Professional info */}
      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          {professional.photo_url ? (
            <img src={professional.photo_url} alt={name} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-8 w-8 text-primary" />
            </div>
          )}
          <div>
            <h2 className="font-serif text-xl font-bold">{name}</h2>
            {professional.crp && <p className="text-sm text-muted-foreground">{professional.crp}</p>}
            {professional.approaches && professional.approaches.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {professional.approaches.map((a) => (
                  <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Service selection */}
      {services.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Serviço</CardTitle></CardHeader>
          <CardContent>
            <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o serviço" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.duration_minutes}min)
                    {s.price && ` — R$ ${Number(s.price).toFixed(2)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Date picker */}
      <Card>
        <CardHeader><CardTitle className="text-base">Data</CardTitle></CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => { setSelectedDate(d); setSelectedTime(""); }}
            disabled={disableDate}
            locale={ptBR}
            className={cn("rounded-md border pointer-events-auto")}
          />
        </CardContent>
      </Card>

      {/* Time slots */}
      {selectedDate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Horários — {format(selectedDate, "dd/MM/yyyy (EEEE)", { locale: ptBR })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {timeSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem horários disponíveis nesta data.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {timeSlots.map((t) => (
                  <Button
                    key={t}
                    variant={selectedTime === t ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTime(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {selectedTime && (
        <Card>
          <CardHeader><CardTitle className="text-base">Observações (opcional)</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Alguma informação relevante para o profissional..."
            />
          </CardContent>
        </Card>
      )}

      {/* Confirm */}
      {selectedTime && (
        <Button onClick={handleBook} disabled={booking} size="lg" className="w-full sm:w-auto">
          {booking ? "Agendando..." : "Confirmar Agendamento"}
        </Button>
      )}
    </div>
  );
}

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { getFreeSlots } from "@/lib/slots";
import { User, ArrowLeft } from "lucide-react";

export default function PatientAgendar() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [notes, setNotes] = useState("");
  const [booking, setBooking] = useState(false);

  // Fetch professional
  const { data: professional, isLoading } = useQuery({
    queryKey: ["book-professional", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });


  // Fetch services
  const { data: services = [] } = useQuery({
    queryKey: ["book-services", professional?.id],
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

  // Fetch availability
  const { data: availability = [] } = useQuery({
    queryKey: ["book-availability", professional?.id],
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

  // Fetch existing appointments for the selected date
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const { data: existingAppointments = [] } = useQuery({
    queryKey: ["book-existing", professional?.id, dateStr],
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

  // Fetch schedule blocks for the selected date (from appointments table)
  const { data: scheduleBlocks = [] } = useQuery({
    queryKey: ["book-blocks", professional?.id, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("professional_id", professional!.id)
        .eq("appointment_date", dateStr)
        .eq("appointment_type", "block");
      return data ?? [];
    },
    enabled: !!professional?.id && !!dateStr,
  });

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const durationMinutes = selectedService?.duration_minutes ?? 50;

  // Horários livres — helper único (respeita buffer + almoço do profissional).
  const timeSlots = selectedDate
    ? getFreeSlots({
        date: selectedDate,
        durationMinutes,
        availability,
        appointments: existingAppointments,
        blocks: scheduleBlocks,
        bufferMinutes: (professional as any)?.slot_buffer_minutes ?? 0,
        lunch: (professional as any)?.lunch_break_enabled
          ? {
              enabled: true,
              start: (professional as any).lunch_break_start,
              end: (professional as any).lunch_break_end,
            }
          : null,
      })
    : [];

  // Disable only past dates
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
      toast.error("Erro ao agendar", { description: error.message });
    } else {
      toast.success("Consulta agendada!", { description: "O profissional confirmará em breve." });
      navigate("/minha-conta/agendamentos");
    }
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;
  if (!professional) return <p className="text-muted-foreground">Profissional não encontrado.</p>;

  const name = professional.full_name || "Profissional";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/minha-conta")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">
          Agendar com {name}
        </h1>
      </div>

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
            <h2 className="font-heading text-xl font-bold">{name}</h2>
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

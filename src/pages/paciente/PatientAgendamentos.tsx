import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "outline" },
  confirmed: { label: "Confirmado", variant: "default" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  completed: { label: "Concluído", variant: "secondary" },
};

export default function PatientAgendamentos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["patient-appointments", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select(`
          *,
          professionals!appointments_professional_id_fkey (slug, user_id, photo_url),
          professional_services!appointments_service_id_fkey (name)
        `)
        .eq("patient_id", user!.id)
        .order("appointment_date", { ascending: false });

      if (!data) return [];

      // Fetch professional names
      const userIds = [...new Set(data.map((a) => a.professionals?.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds as string[]);

      const nameMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);

      return data.map((a) => ({
        ...a,
        professional_name: nameMap.get(a.professionals?.user_id ?? "") || "Profissional",
      }));
    },
    enabled: !!user?.id,
  });

  const handleCancel = async (id: string) => {
    if (!confirm("Cancelar este agendamento?")) return;
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" as const })
      .eq("id", id);

    if (error) toast.error("Erro ao cancelar");
    else {
      toast.success("Agendamento cancelado");
      queryClient.invalidateQueries({ queryKey: ["patient-appointments"] });
    }
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Meus Agendamentos</h1>

      {appointments.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Você ainda não tem agendamentos.</p>
      ) : (
        <div className="grid gap-4">
          {appointments.map((a) => {
            const st = statusLabels[a.status] || statusLabels.pending;
            return (
              <Card key={a.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg">{a.professional_name}</CardTitle>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span>
                      📅 {format(new Date(a.appointment_date + "T00:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                    </span>
                    <span>🕐 {a.start_time.slice(0, 5)} - {a.end_time.slice(0, 5)}</span>
                    {a.professional_services?.name && (
                      <span>📋 {a.professional_services.name}</span>
                    )}
                  </div>
                  {a.notes && <p className="text-sm text-muted-foreground italic">"{a.notes}"</p>}
                  {a.status === "pending" && (
                    <Button variant="outline" size="sm" onClick={() => handleCancel(a.id)}>
                      Cancelar
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

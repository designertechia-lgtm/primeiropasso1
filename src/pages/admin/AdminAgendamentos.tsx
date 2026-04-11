import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle, Clock, XCircle, DollarSign, Calendar } from "lucide-react";
import { useState, useCallback } from "react";

type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed";
type PaymentStatus = "pending" | "paid";

const statusLabels: Record<AppointmentStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
};

const DEFAULT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: "#EAB308",
  confirmed: "#22C55E",
  cancelled: "#EF4444",
  completed: "#3B82F6",
};

const DEFAULT_PAYMENT_COLORS: Record<PaymentStatus, string> = {
  pending: "#F97316",
  paid: "#10B981",
};

const paymentLabels: Record<PaymentStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
};

const paymentLabels: Record<PaymentStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
};

export default function AdminAgendamentos() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["professional-appointments", professional?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          *,
          professional_services(name, duration_minutes, price)
        `)
        .eq("professional_id", professional!.id)
        .order("appointment_date", { ascending: false });
      if (error) throw error;

      const patientIds = [...new Set(data.map((a) => a.patient_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", patientIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);
      return data.map((a) => ({ ...a, patient: profileMap.get(a.patient_id) }));
    },
    enabled: !!professional?.id,
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: { status?: AppointmentStatus; payment_status?: PaymentStatus };
    }) => {
      const { error } = await supabase
        .from("appointments")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["professional-appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["patient-appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["linked-existing"] }),
        queryClient.invalidateQueries({ queryKey: ["book-existing"] }),
        queryClient.invalidateQueries({ queryKey: ["agenda-appointments"] }),
      ]);
      toast.success("Agendamento atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar agendamento"),
  });

  const filtered = appointments?.filter(
    (a) => statusFilter === "all" || a.status === statusFilter
  );

  const counts = appointments?.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Agendamentos</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["pending", "confirmed", "completed", "cancelled"] as const).map((s) => (
          <Card key={s} className="cursor-pointer" onClick={() => setStatusFilter(s)}>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              {s === "pending" && <Clock className="h-5 w-5 text-yellow-600" />}
              {s === "confirmed" && <Calendar className="h-5 w-5 text-blue-600" />}
              {s === "completed" && <CheckCircle className="h-5 w-5 text-green-600" />}
              {s === "cancelled" && <XCircle className="h-5 w-5 text-red-600" />}
              <div>
                <p className="text-2xl font-bold">{counts?.[s] || 0}</p>
                <p className="text-xs text-muted-foreground">{statusLabels[s]}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filtrar:</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="confirmed">Confirmados</SelectItem>
            <SelectItem value="completed">Concluídos</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Agendamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : !filtered?.length ? (
            <p className="text-muted-foreground">Nenhum agendamento encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((appt) => (
                    <TableRow key={appt.id}>
                      <TableCell>
                        {format(new Date(appt.appointment_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {appt.start_time.slice(0, 5)} – {appt.end_time.slice(0, 5)}
                      </TableCell>
                      <TableCell>
                        {(appt as any).patient?.full_name || "Paciente"}
                      </TableCell>
                      <TableCell>
                        {(appt as any).professional_services?.name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[appt.status as AppointmentStatus]}>
                          {statusLabels[appt.status as AppointmentStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={appt.payment_status === "paid" ? "default" : "outline"}>
                          {paymentLabels[appt.payment_status as PaymentStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {appt.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateMutation.mutate({ id: appt.id, updates: { status: "confirmed" } })
                                }
                              >
                                <CheckCircle className="h-3 w-3 mr-1" /> Confirmar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive"
                                onClick={() =>
                                  updateMutation.mutate({ id: appt.id, updates: { status: "cancelled" } })
                                }
                              >
                                <XCircle className="h-3 w-3 mr-1" /> Cancelar
                              </Button>
                            </>
                          )}
                          {appt.status === "confirmed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateMutation.mutate({ id: appt.id, updates: { status: "completed" } })
                              }
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Concluir
                            </Button>
                          )}
                          {appt.payment_status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateMutation.mutate({ id: appt.id, updates: { payment_status: "paid" } })
                              }
                            >
                              <DollarSign className="h-3 w-3 mr-1" /> Pago
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
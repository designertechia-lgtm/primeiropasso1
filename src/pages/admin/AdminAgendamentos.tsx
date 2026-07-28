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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { CheckCircle, Clock, XCircle, DollarSign, Calendar, Trash2 } from "lucide-react";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useAutoCompleteAppointments } from "@/hooks/useAutoCompleteAppointments";

const BLOCK_TYPE_LABELS: Record<string, string> = {
  personal: "Pessoal",
  appointment: "Atendimento",
  other: "Outro",
};

type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed";
type PaymentStatus = "pending" | "paid";

const statusLabels: Record<AppointmentStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
};

const DEFAULT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: "#3B82F6",   // azul
  confirmed: "#22C55E", // verde
  completed: "#EAB308", // amarelo
  cancelled: "#EF4444", // vermelho — só para registros antigos: cancelar agora exclui
};

const DEFAULT_PAYMENT_COLORS: Record<PaymentStatus, string> = {
  pending: "#F97316",
  paid: "#10B981",
};

const paymentLabels: Record<PaymentStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
};

// Degradê de cada card de status. As famílias seguem DEFAULT_STATUS_COLORS acima
// (concluído = azul, confirmado = verde), para o card não contradizer o badge da
// mesma linha. Funcionam em tema claro e escuro por serem cores sólidas com
// texto branco por cima.
const STATUS_CARD_STYLES: Record<AppointmentStatus, { gradient: string; glow: string; Icon: typeof Clock }> = {
  pending:   { gradient: "from-sky-400 to-blue-600",      glow: "shadow-blue-500/30",   Icon: Clock },
  confirmed: { gradient: "from-emerald-400 to-green-600", glow: "shadow-emerald-500/30", Icon: Calendar },
  completed: { gradient: "from-amber-400 to-yellow-500",  glow: "shadow-amber-500/30",  Icon: CheckCircle },
  cancelled: { gradient: "from-rose-400 to-red-600",      glow: "shadow-rose-500/30",   Icon: XCircle },
};


export default function AdminAgendamentos() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const getStatusColor = useCallback((status: string) => {
    if (!professional) return DEFAULT_STATUS_COLORS[status as AppointmentStatus] || DEFAULT_STATUS_COLORS.pending;
    const map: Record<string, string | null | undefined> = {
      pending: (professional as any).color_status_pending,
      confirmed: (professional as any).color_status_confirmed,
      completed: (professional as any).color_status_completed,
      cancelled: (professional as any).color_status_cancelled,
    };
    return map[status] || DEFAULT_STATUS_COLORS[status as AppointmentStatus] || DEFAULT_STATUS_COLORS.pending;
  }, [professional]);

  const getPaymentColor = useCallback((status: string) => {
    if (!professional) return DEFAULT_PAYMENT_COLORS[status as PaymentStatus] || DEFAULT_PAYMENT_COLORS.pending;
    const map: Record<string, string | null | undefined> = {
      pending: (professional as any).color_payment_pending,
      paid: (professional as any).color_payment_paid,
    };
    return map[status] || DEFAULT_PAYMENT_COLORS[status as PaymentStatus] || DEFAULT_PAYMENT_COLORS.pending;
  }, [professional]);

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["professional-appointments", professional?.id],
    queryFn: async () => {
      // Esta tela lista ATENDIMENTOS. Bloqueios de horário (almoço, folga,
      // eventos importados do Google) ficam na aba Bloqueios — exceto os
      // gravados com block_type='appointment', que são consulta e vêm para cá.
      // "appointment_type.is.null" cobre os registros antigos, anteriores ao
      // default 'booking' da coluna.
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("professional_id", professional!.id)
        .or("appointment_type.neq.block,appointment_type.is.null,block_type.eq.appointment")
        .order("appointment_date", { ascending: false });
      if (error) throw error;

      const patientIds = [...new Set(data.filter((a) => a.patient_id).map((a) => a.patient_id!))];
      const serviceIds = [...new Set(data.filter((a) => a.service_id).map((a) => a.service_id!))];

      const [profilesRes, servicesRes] = await Promise.all([
        patientIds.length > 0
          ? supabase.from("profiles").select("user_id, full_name, phone").in("user_id", patientIds)
          : Promise.resolve({ data: [] }),
        serviceIds.length > 0
          ? supabase.from("professional_services").select("id, name, description, duration_minutes, price").in("id", serviceIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p] as const));
      const serviceMap = new Map((servicesRes.data ?? []).map((s) => [s.id, s] as const));

      return data.map((a) => ({
        ...a,
        patient: profileMap.get(a.patient_id),
        service: serviceMap.get(a.service_id),
      }));
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

  // Confirmados cujo horário já passou viram "Concluído" sozinhos.
  useAutoCompleteAppointments(appointments);

  // Cancelar É excluir: a linha some do banco. Por ser irreversível, toda
  // chamada passa por confirmação.
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // .select() é obrigatório aqui: sem ele, uma exclusão barrada pela RLS
      // volta como sucesso com zero linhas e o usuário vê "removido" sem ter
      // removido nada (ver migration 20260728_appointments_delete_policies).
      const { data, error } = await supabase
        .from("appointments").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Nada foi removido — o banco recusou a exclusão.");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["professional-appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["patient-appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] }),
        queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] }),
      ]);
      toast.success("Agendamento cancelado e removido da agenda!");
    },
    onError: (e: any) => toast.error("Erro ao cancelar", { description: e.message }),
  });

  // Limpeza dos "Cancelado" antigos, de antes de cancelar passar a excluir.
  const clearCancelled = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .delete()
        .eq("professional_id", professional!.id)
        .eq("status", "cancelled")
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Nada foi removido — o banco recusou a exclusão.");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["professional-appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] }),
        queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] }),
      ]);
      toast.success("Cancelados removidos!");
    },
    onError: (e: any) => toast.error("Erro ao limpar", { description: e.message }),
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
        {(["pending", "confirmed", "completed", "cancelled"] as const).map((s) => {
          const { gradient, glow, Icon } = STATUS_CARD_STYLES[s];
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              // Clicar de novo no card ativo volta para "Todos" — antes não havia
              // como desfazer o filtro pelo próprio card.
              onClick={() => setStatusFilter(active ? "all" : s)}
              className={cn(
                "group relative overflow-hidden rounded-xl bg-gradient-to-br p-4 text-left text-white",
                "shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                gradient,
                glow,
                active
                  ? "ring-2 ring-foreground/60 ring-offset-2 ring-offset-background"
                  : "opacity-90 hover:opacity-100",
              )}
            >
              {/* Brilho decorativo — puramente visual, não recebe clique. */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/15 blur-xl"
              />
              <div className="relative flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/20 backdrop-blur-sm">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-none tabular-nums">{counts?.[s] || 0}</p>
                  <p className="mt-1 truncate text-xs font-medium text-white/90">{statusLabels[s]}</p>
                </div>
              </div>
            </button>
          );
        })}
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

        {/* Só aparece se ainda houver registros do tempo em que cancelar
            apenas mudava o status. */}
        {(counts?.cancelled ?? 0) > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={clearCancelled.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Limpar cancelados ({counts?.cancelled})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover os cancelados?</AlertDialogTitle>
                <AlertDialogDescription>
                  Os {counts?.cancelled} agendamentos com status “Cancelado” serão apagados
                  definitivamente. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => clearCancelled.mutate()}
                >
                  Remover todos
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
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
                    <TableHead>Tipo</TableHead>
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
                        {appt.appointment_type === "block"
                          ? BLOCK_TYPE_LABELS[appt.block_type || "other"] || appt.block_type || "Bloqueio"
                          /* Cliente não cadastrado não tem profile: o nome digitado
                             fica em notes (mesmo fallback usado no Calendário). */
                          : (appt as any).patient?.full_name || appt.notes || "Sem paciente"}
                      </TableCell>
                      <TableCell>
                        {(appt as any).service?.name || appt.notes || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: getStatusColor(appt.status), color: "#fff", borderColor: getStatusColor(appt.status) }}>
                          {statusLabels[appt.status as AppointmentStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: getPaymentColor(appt.payment_status), color: "#fff", borderColor: getPaymentColor(appt.payment_status) }}>
                          {paymentLabels[appt.payment_status as PaymentStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {appt.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateMutation.mutate({ id: appt.id, updates: { status: "confirmed" } })
                              }
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Confirmar
                            </Button>
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
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="Cancelar e remover da agenda"
                                disabled={deleteMutation.isPending}
                              >
                                <XCircle className="h-3 w-3 mr-1" /> Cancelar
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancelar este agendamento?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {format(new Date(appt.appointment_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                                  {" · "}
                                  {appt.start_time.slice(0, 5)} – {appt.end_time.slice(0, 5)}
                                  {" · "}
                                  {(appt as any).patient?.full_name || appt.notes || "Sem paciente"}
                                  <br />
                                  O agendamento será <strong>removido da agenda</strong> e o horário
                                  volta a ficar livre. Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Voltar</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteMutation.mutate(appt.id)}
                                >
                                  Cancelar agendamento
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
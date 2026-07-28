import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

type Candidate = {
  id: string;
  status?: string | null;
  appointment_type?: string | null;
  appointment_date: string;
  end_time?: string | null;
};

/**
 * Marca como "completed" os atendimentos CONFIRMADOS cujo horário já terminou.
 *
 * Só confirmados: um pendente que passou da hora continua pendente, para ficar
 * visível que o cliente nunca confirmou. Bloqueios nunca "concluem".
 *
 * ONDE RODA: no cliente, quando a agenda carrega — não há cron para isso hoje.
 * Consequência: o status no banco só avança quando alguém abre a tela; até lá,
 * consumidores externos (Axel no WhatsApp) ainda leem "confirmed".
 *
 * FUSO: appointment_date/end_time não guardam timezone — são a hora de parede do
 * profissional. Por isso a comparação usa a hora LOCAL do navegador. Comparar com
 * now() do banco (UTC) concluiria os agendamentos 3h cedo no horário de São Paulo.
 */
export function useAutoCompleteAppointments(appointments: Candidate[] | undefined) {
  const queryClient = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    if (!appointments?.length || running.current) return;

    const now = new Date();
    const hoje = format(now, "yyyy-MM-dd");
    const agora = format(now, "HH:mm");
    const hhmm = (t?: string | null) => (t ?? "").slice(0, 5);

    const vencidos = appointments.filter((a) => {
      if (a.status !== "confirmed") return false;
      if (a.appointment_type === "block") return false;
      if (a.appointment_date < hoje) return true;
      return a.appointment_date === hoje && !!a.end_time && hhmm(a.end_time) <= agora;
    });

    if (vencidos.length === 0) return;

    running.current = true;
    void (async () => {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "completed" })
        .in("id", vencidos.map((a) => a.id));

      // Sem invalidação em caso de erro: a query não recarrega, o efeito não
      // reexecuta e evitamos um laço de tentativas contra o mesmo erro.
      if (!error) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["professional-appointments"] }),
          queryClient.invalidateQueries({ queryKey: ["agenda-appointments-all"] }),
          queryClient.invalidateQueries({ queryKey: ["patient-appointments"] }),
        ]);
      }
      running.current = false;
    })();
  }, [appointments, queryClient]);
}

// ANCORA-DOC: feature "agenda" — anexar o motivo ao cancelamento recém-criado.
//
// A linha de `appointment_cancellations` nasce do TRIGGER no banco, disparado
// pelo DELETE do agendamento (migration 20260802c). Só depois disso existe algo
// para anotar — por isso esta função roda DEPOIS do delete, procurando pelo
// appointment_id.
//
// Falhar aqui é de propósito INOFENSIVO: o cancelamento já está registrado, só
// fica sem motivo, e o profissional classifica na aba Cancelados. Por isso o erro
// não é propagado — derrubar a mutação faria o usuário achar que o cancelamento
// não aconteceu, quando aconteceu.

import { supabase } from "@/integrations/supabase/client";

export interface CancellationReasonInput {
  category: string | null;
  notes: string;
}

export async function saveCancellationReason(
  appointmentId: string,
  motivo?: CancellationReasonInput | null,
): Promise<void> {
  if (!motivo || (!motivo.category && !motivo.notes)) return;

  try {
    await (supabase.from("appointment_cancellations" as any) as any)
      .update({
        reason_category: motivo.category,
        reason_notes: motivo.notes || null,
      })
      .eq("appointment_id", appointmentId);
  } catch {
    // Silencioso por decisão: ver o cabeçalho.
  }
}

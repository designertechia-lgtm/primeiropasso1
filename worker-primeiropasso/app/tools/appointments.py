from app.db import get_supabase
from app.pipeline import advance_stage


class HorarioIndisponivelError(Exception):
    """Raised when an appointment slot is already taken."""
    pass


def criar_agendamento(
    professional_id: str,
    patient_phone: str,
    appointment_date: str,
    start_time: str,
    end_time: str,
    notes: str = "",
) -> dict:
    """Create an appointment and advance lead pipeline to 'agendado'.

    Raises HorarioIndisponivelError if the slot is already booked.
    """
    sb = get_supabase()

    # ── VALIDAÇÃO ANTI-DOUBLE-BOOKING ─────────────────────────────────────
    # Verifica se já existe booking ativo no mesmo profissional + data + hora
    conflito = (
        sb.table("appointments")
        .select("id, start_time, end_time")
        .eq("professional_id", professional_id)
        .eq("appointment_date", appointment_date)
        .eq("start_time", start_time)
        .in_("status", ["pending", "confirmed"])
        .is_("appointment_type", "null")  # só bookings, não bloqueios
        .maybe_single()
        .execute()
    )

    if conflito.data:
        raise HorarioIndisponivelError(
            f"O horário das {start_time} no dia {appointment_date} já está reservado. "
            "Por favor, escolha outro horário disponível."
        )
    # ─────────────────────────────────────────────────────────────────────

    result = (
        sb.table("appointments")
        .insert({
            "professional_id": professional_id,
            "appointment_date": appointment_date,
            "start_time": start_time,
            "end_time": end_time,
            "notes": notes,
            "status": "pending",       # correto: era "scheduled" (inválido)
            "appointment_type": None,  # correto: bookings têm appointment_type=null
        })
        .execute()
    )

    advance_stage(patient_phone, "agendado")

    return result.data[0] if result.data else {}

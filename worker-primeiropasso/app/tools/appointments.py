from app.db import get_supabase
from app.pipeline import advance_stage


def criar_agendamento(
    professional_id: str,
    patient_phone: str,
    appointment_date: str,
    start_time: str,
    end_time: str,
    notes: str = "",
) -> dict:
    """Create an appointment and advance lead pipeline to 'agendado'."""
    sb = get_supabase()
    
    result = sb.table("appointments").insert({
        "professional_id": professional_id,
        "appointment_date": appointment_date,
        "start_time": start_time,
        "end_time": end_time,
        "notes": notes,
        "status": "scheduled",
        "appointment_type": "consultation",
    }).execute()
    
    advance_stage(patient_phone, "agendado")
    
    return result.data[0] if result.data else {}

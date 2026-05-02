from datetime import date
from app.db import get_supabase


def buscar_horarios_disponiveis(professional_id: str, data: str) -> list[dict]:
    """Search available time slots for a professional on a given date."""
    sb = get_supabase()
    
    day_of_week = date.fromisoformat(data).strftime("%A").lower()
    
    availability = (
        sb.table("availability")
        .select("*")
        .eq("professional_id", professional_id)
        .eq("day_of_week", day_of_week)
        .execute()
    )
    
    appointments = (
        sb.table("appointments")
        .select("start_time, end_time")
        .eq("professional_id", professional_id)
        .eq("appointment_date", data)
        .neq("status", "cancelled")
        .execute()
    )
    
    booked = {(a["start_time"], a["end_time"]) for a in (appointments.data or [])}
    
    slots = []
    for slot in (availability.data or []):
        key = (slot["start_time"], slot["end_time"])
        if key not in booked:
            slots.append({
                "start_time": slot["start_time"],
                "end_time": slot["end_time"],
            })
    
    return slots

from app.db import get_supabase


def get_professional_by_phone(phone: str) -> dict | None:
    """Find which professional this phone number belongs to (via leads table)."""
    result = (
        get_supabase()
        .table("leads")
        .select("professional_id, professionals(id, name, slug, specialty)")
        .eq("whatsapp", phone)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return None
    return rows[0].get("professionals")


def get_professional_config(professional_id: str) -> dict:
    """Get professional settings for the AI agent persona."""
    result = (
        get_supabase()
        .table("professionals")
        .select("*")
        .eq("id", professional_id)
        .single()
        .execute()
    )
    return result.data or {}

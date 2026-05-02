from app.db import get_supabase


def is_flow_disabled(phone: str) -> bool:
    """Check desliga_fluxo table — if phone is listed, skip AI processing."""
    result = (
        get_supabase()
        .table("desliga_fluxo")
        .select("id")
        .eq("telefone", phone)
        .limit(1)
        .execute()
    )
    return len(result.data or []) > 0


def is_agent_enabled(phone: str) -> bool:
    """Check if the lead has agent_enabled = true."""
    result = (
        get_supabase()
        .table("leads")
        .select("agent_enabled")
        .eq("whatsapp", phone)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return True  # no lead found = new lead, agent enabled by default
    return rows[0].get("agent_enabled", True)

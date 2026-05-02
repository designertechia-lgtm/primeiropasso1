"""Centralized pipeline state machine for lead stages."""
from app.db import get_supabase
from datetime import datetime, timezone

TRANSITIONS: dict[str, list[str]] = {
    "novo": ["em_conversa"],
    "em_conversa": ["proposta_feita", "inativo"],
    "proposta_feita": ["agendado", "em_conversa", "inativo"],
    "agendado": ["cliente_ativo", "inativo"],
    "cliente_ativo": ["inativo"],
    "inativo": ["em_conversa"],
}


def advance_stage(phone: str, new_stage: str) -> bool:
    sb = get_supabase()
    result = (
        sb.table("leads")
        .select("id, pipeline_stage")
        .eq("whatsapp", phone)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return False

    current = rows[0].get("pipeline_stage", "novo")
    allowed = TRANSITIONS.get(current, [])
    if new_stage not in allowed:
        return False

    sb.table("leads").update({
        "pipeline_stage": new_stage,
        "last_message_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", rows[0]["id"]).execute()
    return True


def touch_last_message(phone: str) -> None:
    get_supabase().table("leads").update({
        "last_message_at": datetime.now(timezone.utc).isoformat(),
    }).eq("whatsapp", phone).execute()


def mark_inactive_leads(days: int = 7) -> int:
    """Mark leads as inactive if no message for N days. Returns count."""
    sb = get_supabase()
    cutoff = datetime.now(timezone.utc)
    from datetime import timedelta
    cutoff = cutoff - timedelta(days=days)

    result = (
        sb.table("leads")
        .select("id")
        .neq("pipeline_stage", "inativo")
        .neq("pipeline_stage", "cliente_ativo")
        .lt("last_message_at", cutoff.isoformat())
        .execute()
    )
    ids = [r["id"] for r in (result.data or [])]
    for lead_id in ids:
        sb.table("leads").update({"pipeline_stage": "inativo"}).eq("id", lead_id).execute()
    return len(ids)

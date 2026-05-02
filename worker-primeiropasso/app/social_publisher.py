"""Publish scheduled social media posts and mark inactive leads."""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter
from app.db import get_supabase
from app.pipeline import mark_inactive_leads

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/cron/publish")
async def cron_publish():
    """Publish pending social posts where scheduled_at <= now."""
    sb = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    
    result = (
        sb.table("social_posts")
        .select("*, social_accounts(*)")
        .eq("status", "pending")
        .lte("scheduled_at", now)
        .execute()
    )
    
    posts = result.data or []
    published = 0
    
    for post in posts:
        try:
            account = post.get("social_accounts")
            if not account:
                continue
            
            platform = account.get("platform")
            access_token = account.get("access_token")
            
            if platform == "instagram":
                await _publish_instagram(post, account)
            elif platform == "linkedin":
                await _publish_linkedin(post, account)
            
            sb.table("social_posts").update({
                "status": "published",
                "published_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", post["id"]).execute()
            published += 1
            
        except Exception:
            logger.exception(f"Failed to publish post {post.get('id')}")
            sb.table("social_posts").update({
                "status": "failed",
            }).eq("id", post["id"]).execute()
    
    return {"published": published, "total": len(posts)}


@router.post("/cron/mark-inactive")
async def cron_mark_inactive():
    """Mark leads with no message for 7+ days as inactive."""
    count = mark_inactive_leads(days=7)
    return {"marked_inactive": count}


async def _publish_instagram(post: dict, account: dict) -> None:
    import httpx
    ig_user_id = account.get("account_id")
    token = account.get("access_token")
    
    async with httpx.AsyncClient(timeout=60) as client:
        media_resp = await client.post(
            f"https://graph.facebook.com/v21.0/{ig_user_id}/media",
            json={
                "caption": post.get("caption", ""),
                "image_url": post.get("media_url", ""),
                "access_token": token,
            },
        )
        media_resp.raise_for_status()
        creation_id = media_resp.json()["id"]
        
        publish_resp = await client.post(
            f"https://graph.facebook.com/v21.0/{ig_user_id}/media_publish",
            json={
                "creation_id": creation_id,
                "access_token": token,
            },
        )
        publish_resp.raise_for_status()


async def _publish_linkedin(post: dict, account: dict) -> None:
    import httpx
    person_id = account.get("account_id")
    token = account.get("access_token")
    
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.linkedin.com/v2/ugcPosts",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "author": f"urn:li:person:{person_id}",
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {"text": post.get("caption", "")},
                        "shareMediaCategory": "NONE",
                    }
                },
                "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
            },
        )
        resp.raise_for_status()

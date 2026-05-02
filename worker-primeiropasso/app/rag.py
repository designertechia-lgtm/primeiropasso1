"""RAG: query Supabase pgvector for professional's knowledge base."""
from openai import OpenAI
from app.config import get_settings
from app.db import get_supabase


def query_knowledge_base(professional_id: str, question: str, match_count: int = 5) -> list[str]:
    client = OpenAI(api_key=get_settings().OPENAI_API_KEY)
    embedding_response = client.embeddings.create(
        model="text-embedding-3-small",
        input=question,
    )
    embedding = embedding_response.data[0].embedding

    result = get_supabase().rpc(
        "match_documents_for_professional",
        {
            "p_professional_id": professional_id,
            "query_embedding": embedding,
            "match_count": match_count,
        },
    ).execute()

    return [row.get("content", "") for row in (result.data or [])]

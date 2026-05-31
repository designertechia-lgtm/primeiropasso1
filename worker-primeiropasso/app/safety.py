"""Filtros HARD de seguranca (#4).

Portado do `filtroHard` do fluxo n8n aprovado. Roda ANTES do LLM para barrar
spam, prompt injection, mensagens vazias/so-emoji e textos absurdamente longos.
Mensagens barradas nao chegam ao modelo nem entram no historico de conversa
(para nao envenenar o contexto).
"""
# feature: agente-conversa — ver _docs/features/agente-conversa.md
import re

_EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0000FE00-\U0000FE0F\U0001F1E6-\U0001F1FF‍⃣]",
    flags=re.UNICODE,
)

_SPAM = re.compile(
    r"(ganhe\s+dinheiro|cripto|crypto|bitcoin|forex|clique\s+aqui|bit\.ly|tinyurl|"
    r"renda\s+extra|investimento\s+garantido)",
    re.IGNORECASE,
)

_INJECTION = re.compile(
    r"(ignore\s+(your|previous|all|the)\s+instructions?|you\s+are\s+now|forget\s+everything|"
    r"disregard\s+(all|previous)|system\s+prompt|ignor\w*\b.{0,25}instru|"
    r"aja\s+como\s+se\s+voc[êe]\s+fosse)",
    re.IGNORECASE,
)


def filtro_hard(msg: str, from_me: bool = False) -> str | None:
    """Retorna o MOTIVO do bloqueio (str) ou None se a mensagem pode seguir.

    Motivos: msg_propria_bot, vazia, so_emoji_ou_curta, longa_demais, spam, injection.
    """
    if from_me:
        return "msg_propria_bot"
    if not msg or not msg.strip():
        return "vazia"
    sem_emoji = _EMOJI.sub("", msg).strip()
    if not sem_emoji or len(sem_emoji) < 2:
        return "so_emoji_ou_curta"
    if len(msg) > 2000:
        return "longa_demais"
    if _SPAM.search(msg):
        return "spam"
    if _INJECTION.search(msg):
        return "injection"
    return None

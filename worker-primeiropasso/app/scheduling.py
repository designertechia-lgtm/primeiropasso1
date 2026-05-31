"""Confirmacao de agendamento DETERMINISTICA (nao-LLM).

Principio do modelo n8n aprovado: o LLM NUNCA confirma agendar/remarcar/cancelar.
Quem confirma e o sistema. Aqui fazemos o parse de data/hora em PT-BR e so
criamos o agendamento quando ele bate com um slot que REALMENTE existe na
disponibilidade do profissional — eliminando horario alucinado.
"""
import re
from datetime import date, datetime, timedelta

from app.tools.availability import buscar_horarios_disponiveis
from app.tools.appointments import criar_agendamento, HorarioIndisponivelError

_DIAS_SEMANA = {
    "domingo": 6, "segunda": 0, "segunda-feira": 0,
    "terca": 1, "terça": 1, "terca-feira": 1, "terça-feira": 1,
    "quarta": 2, "quarta-feira": 2, "quinta": 3, "quinta-feira": 3,
    "sexta": 4, "sexta-feira": 4, "sabado": 5, "sábado": 5,
}
_NOMES_DIA = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"]


def _fmt(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def _prox_dia_semana(base: date, alvo: int) -> date:
    diff = (alvo - base.weekday() + 7) % 7
    if diff == 0:
        diff = 7
    return base + timedelta(days=diff)


def parse_data(text: str, hoje: date | None = None) -> str | None:
    """Extrai uma data (YYYY-MM-DD) de texto PT-BR. None se nao encontrar."""
    hoje = hoje or date.today()
    m = text.lower()

    if re.search(r"depois\s+de\s+amanh", m):
        return _fmt(hoje + timedelta(days=2))
    if re.search(r"amanh[ãa]", m):
        return _fmt(hoje + timedelta(days=1))
    if re.search(r"\bhoje\b", m):
        return _fmt(hoje)

    dm = re.search(r"\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b", m)
    if dm:
        dia, mes = int(dm.group(1)), int(dm.group(2))
        ano = dm.group(3)
        if ano:
            ano = int(ano)
            ano = 2000 + ano if ano < 100 else ano
        else:
            ano = hoje.year
        try:
            return _fmt(date(ano, mes, dia))
        except ValueError:
            return None

    for nome, alvo in _DIAS_SEMANA.items():
        if nome in m:
            return _fmt(_prox_dia_semana(hoje, alvo))
    return None


def parse_hora(text: str) -> str | None:
    """Extrai uma hora (HH:MM) de texto PT-BR. None se nao encontrar."""
    m = text.lower()
    h = re.search(r"\b(\d{1,2})[:h](\d{2})\b", m)
    if h:
        return f"{int(h.group(1)):02d}:{h.group(2)}"
    h = re.search(r"\b(?:às\s+)?(\d{1,2})\s*(?:h|horas?)\b", m)
    if h:
        return f"{int(h.group(1)):02d}:00"
    h = re.search(r"\bàs\s+(\d{1,2})\b", m)
    if h:
        return f"{int(h.group(1)):02d}:00"
    return None


def quer_confirmar_horario(text: str) -> bool:
    """True se a mensagem expressa intencao de AGENDAR num horario, nao apenas
    perguntar disponibilidade. Evita auto-booking em 'tem horario amanha?'."""
    m = text.lower().strip()
    # Perguntas de disponibilidade NAO confirmam.
    if re.search(r"(tem|teria|t[êe]m|h[áa]|existe|quais|qual)\b.*(hor[áa]rio|vaga|dispon)", m):
        return False
    if "?" in m and not re.search(r"(pode ser|confirma|fech)", m):
        return False
    # Intencao explicita de agendar.
    if re.search(r"(marc(ar|a|o)|agend(ar|a|o)|confirm|pode ser|fechad|quero|bora)", m):
        return True
    # Mensagem que comeca direto com dia/hora (ex.: "amanha as 15h", "sexta 10:00").
    if re.match(r"^(às?\s*\d|\d{1,2}\s*h|\d{1,2}:\d{2}|amanh[ãa]|hoje|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)", m):
        return True
    return False


def _norm_hora(t: str) -> str:
    """Normaliza '15:00:00' / '15:00' / '15h' -> 'HH:MM'."""
    t = str(t).strip()
    m = re.match(r"(\d{1,2})[:h]?(\d{2})?", t)
    if not m:
        return t
    return f"{int(m.group(1)):02d}:{m.group(2) or '00'}"


def _msg_confirmacao(data_iso: str, hora: str) -> str:
    d = date.fromisoformat(data_iso)
    dia_nome = _NOMES_DIA[d.weekday()]
    return (
        f"Prontinho! Sua consulta esta agendada para {dia_nome} "
        f"{d.day:02d}/{d.month:02d} as {hora}. "
        f"Qualquer coisa, e so me chamar. 🗓️"
    )


def try_confirmar_agendamento(
    phone: str,
    professional_id: str,
    text: str,
    hoje: date | None = None,
) -> str | None:
    """Caminho deterministico de confirmacao.

    Retorna a mensagem de confirmacao se conseguiu agendar de forma segura
    (data+hora explicitas + intencao de agendar + slot REAL disponivel).
    Retorna None quando deve deixar a conversa seguir pro LLM (que nao confirma).
    """
    if not quer_confirmar_horario(text):
        return None

    data_iso = parse_data(text, hoje=hoje)
    hora = parse_hora(text)
    if not (data_iso and hora):
        return None

    slots = buscar_horarios_disponiveis(professional_id, data_iso)
    match = next((s for s in slots if _norm_hora(s["start_time"]) == hora), None)
    if not match:
        # Horario pedido nao existe/ja ocupado -> NAO confirma. LLM reconduz.
        return None

    try:
        criar_agendamento(
            professional_id=professional_id,
            patient_phone=phone,
            appointment_date=data_iso,
            start_time=match["start_time"],
            end_time=match["end_time"],
        )
    except HorarioIndisponivelError:
        return None

    return _msg_confirmacao(data_iso, hora)

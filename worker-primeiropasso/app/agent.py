"""OpenAI GPT-4o agent with function calling for the WhatsApp assistant."""
# feature: agente-conversa — ver _docs/features/agente-conversa.md
import json
import logging
from openai import OpenAI
from app.config import get_settings
from app.memory import save_message, get_history
from app.pipeline import advance_stage, touch_last_message
from app.rag import query_knowledge_base
from app.tools.availability import buscar_horarios_disponiveis
from app.tools.professional import get_professional_config
from app.scheduling import try_confirmar_agendamento
from app.intent import classificar, objetivo_de
from app.safety import filtro_hard

logger = logging.getLogger(__name__)

# IMPORTANTE: criar_agendamento NAO e exposto como tool do LLM de proposito.
# Confirmar agendamento e responsabilidade DETERMINISTICA do sistema (scheduling.py),
# para o modelo nunca inventar/confirmar um horario que nao existe. (falha #1)
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "buscar_horarios_disponiveis",
            "description": "Busca horarios disponiveis do profissional em uma data especifica",
            "parameters": {
                "type": "object",
                "properties": {
                    "data": {
                        "type": "string",
                        "description": "Data no formato YYYY-MM-DD",
                    }
                },
                "required": ["data"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "consultar_base_conhecimento",
            "description": "Consulta a base de conhecimento do profissional para responder perguntas",
            "parameters": {
                "type": "object",
                "properties": {
                    "pergunta": {"type": "string", "description": "Pergunta a buscar"},
                },
                "required": ["pergunta"],
            },
        },
    },
]


def build_system_prompt(pro: dict, intencao: str = "conversa") -> str:
    """Monta o system prompt por TOPICOS (persona + objetivo da intencao + regras),
    espelhando o node `montar_prompt` do fluxo n8n aprovado."""
    name = pro.get("name", "Profissional")
    specialty = pro.get("specialty", "saude mental")

    persona = (
        f"#PERSONA\n"
        f"Voce e o assistente virtual do(a) {name}, profissional de {specialty}. "
        f"Seu papel e acolher pacientes, tirar duvidas e ajudar a agendar consultas. "
        f"Fale em portugues brasileiro, de forma humana, calorosa e natural."
    )
    objetivo = f"#OBJETIVO DE RESPOSTA\n{objetivo_de(intencao)}"
    regras = (
        "#REGRAS\n"
        "- Maximo 3 linhas. Seja breve.\n"
        "- Uma pergunta por vez.\n"
        "- NUNCA confirme, marque, remarque ou cancele agendamento voce mesmo: "
        "quem confirma e o sistema, automaticamente, quando a pessoa informar um dia e "
        "horario disponiveis. Voce apenas oferece os horarios (buscar_horarios_disponiveis) "
        "e conduz a conversa.\n"
        "- Nao invente horarios, valores ou informacoes. Use consultar_base_conhecimento "
        "para duvidas sobre o profissional.\n"
        "- Nada de discurso ou lista de recursos. Soe como uma pessoa, nao um robo."
    )
    return "\n\n".join([persona, objetivo, regras])


async def run_agent(
    phone: str,
    text: str,
    professional_id: str,
) -> str:
    """Process a message through the AI agent and return the response."""
    # FILTRO HARD de seguranca (#4): barra spam/injection/vazia/so-emoji ANTES de
    # tocar no LLM ou no historico, para nao envenenar o contexto.
    motivo = filtro_hard(text)
    if motivo:
        logger.info(f"Mensagem barrada ({motivo}) de {phone}; nao respondida.")
        return ""

    client = OpenAI(api_key=get_settings().OPENAI_API_KEY)
    pro = get_professional_config(professional_id)

    save_message(phone, "user", text)
    touch_last_message(phone)

    # Auto-advance novo -> em_conversa
    advance_stage(phone, "em_conversa")

    # CONFIRMACAO DETERMINISTICA (nao-LLM): se o paciente informou um dia+hora
    # disponiveis e com intencao de agendar, o SISTEMA confirma — o LLM nunca. (#1)
    confirmacao = try_confirmar_agendamento(phone, professional_id, text)
    if confirmacao:
        save_message(phone, "assistant", confirmacao)
        return confirmacao

    # Classifica intencao para dar objetivo de resposta especifico (#3)
    intencao = classificar(text)

    history = get_history(phone, limit=20)
    messages = [
        {"role": "system", "content": build_system_prompt(pro, intencao)},
        *history,
    ]

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        max_tokens=300,  # resposta curta (max 3 linhas) (#5)
    )

    msg = response.choices[0].message

    # Handle tool calls
    while msg.tool_calls:
        messages.append(msg)
        for tc in msg.tool_calls:
            fn_name = tc.function.name
            args = json.loads(tc.function.arguments)
            result = _execute_tool(fn_name, args, professional_id, phone)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, ensure_ascii=False),
            })

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=300,  # resposta curta (#5)
        )
        msg = response.choices[0].message

    reply = msg.content or ""
    save_message(phone, "assistant", reply)
    return reply


def _execute_tool(name: str, args: dict, professional_id: str, phone: str) -> dict | list:
    if name == "buscar_horarios_disponiveis":
        # Auto-advance to proposta_feita when offering times
        advance_stage(phone, "proposta_feita")
        return buscar_horarios_disponiveis(professional_id, args["data"])
    elif name == "consultar_base_conhecimento":
        docs = query_knowledge_base(professional_id, args["pergunta"])
        return {"documents": docs}
    else:
        return {"error": f"Unknown tool: {name}"}

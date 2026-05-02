"""OpenAI GPT-4o agent with function calling for the WhatsApp assistant."""
import json
from openai import OpenAI
from app.config import get_settings
from app.memory import save_message, get_history
from app.pipeline import advance_stage, touch_last_message
from app.rag import query_knowledge_base
from app.tools.availability import buscar_horarios_disponiveis
from app.tools.appointments import criar_agendamento
from app.tools.professional import get_professional_config

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
            "name": "criar_agendamento",
            "description": "Cria um agendamento para o paciente",
            "parameters": {
                "type": "object",
                "properties": {
                    "appointment_date": {"type": "string", "description": "Data YYYY-MM-DD"},
                    "start_time": {"type": "string", "description": "Horario inicio HH:MM"},
                    "end_time": {"type": "string", "description": "Horario fim HH:MM"},
                    "notes": {"type": "string", "description": "Observacoes"},
                },
                "required": ["appointment_date", "start_time", "end_time"],
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


def build_system_prompt(pro: dict) -> str:
    name = pro.get("name", "Profissional")
    specialty = pro.get("specialty", "saude mental")
    return (
        f"Voce e o assistente virtual do(a) {name}, profissional de {specialty}. "
        f"Seu papel e acolher pacientes, responder duvidas, buscar horarios disponiveis "
        f"e agendar consultas. Seja empatetico, profissional e objetivo. "
        f"Responda sempre em portugues brasileiro. "
        f"Quando o paciente quiser agendar, use a ferramenta buscar_horarios_disponiveis "
        f"para encontrar horarios e depois criar_agendamento para confirmar. "
        f"Se tiver duvidas sobre o profissional ou seus servicos, use consultar_base_conhecimento."
    )


async def run_agent(
    phone: str,
    text: str,
    professional_id: str,
) -> str:
    """Process a message through the AI agent and return the response."""
    client = OpenAI(api_key=get_settings().OPENAI_API_KEY)
    pro = get_professional_config(professional_id)

    save_message(phone, "user", text)
    touch_last_message(phone)

    # Auto-advance novo -> em_conversa
    advance_stage(phone, "em_conversa")

    history = get_history(phone, limit=20)
    messages = [
        {"role": "system", "content": build_system_prompt(pro)},
        *history,
    ]

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        max_tokens=1000,
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
            max_tokens=1000,
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
    elif name == "criar_agendamento":
        return criar_agendamento(
            professional_id=professional_id,
            patient_phone=phone,
            appointment_date=args["appointment_date"],
            start_time=args["start_time"],
            end_time=args["end_time"],
            notes=args.get("notes", ""),
        )
    elif name == "consultar_base_conhecimento":
        docs = query_knowledge_base(professional_id, args["pergunta"])
        return {"documents": docs}
    else:
        return {"error": f"Unknown tool: {name}"}

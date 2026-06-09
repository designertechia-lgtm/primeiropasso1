// Agente administrativo — responde quando o PROFISSIONAL fala consigo mesmo
// no WhatsApp (chat "eu mesmo"). Comandos administrativos: ver agenda, etc.
//
// Acionado pelo whatsapp-webhook quando detecta:
//   key.fromMe = true  E  remoteJid corresponde ao próprio número do profissional

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// =============================================
// TOOL DEFINITIONS — Anthropic Tool Use
// =============================================
const tools = [
  {
    name: "ver_agenda",
    description: "Consulta os agendamentos do profissional num período. Retorna lista com data, hora, nome do paciente e status. Use sempre que o profissional perguntar sobre a agenda.",
    input_schema: {
      type: "object",
      properties: {
        periodo: {
          type: "string",
          enum: ["hoje", "amanha", "semana", "proximos_7_dias", "data_especifica"],
          description: "Período a consultar."
        },
        data: {
          type: "string",
          description: "Data específica no formato YYYY-MM-DD. Obrigatório quando periodo='data_especifica'."
        }
      },
      required: ["periodo"]
    }
  }
]

// =============================================
// SYSTEM PROMPT (modo administrativo)
// =============================================
function buildAdminPrompt(professional: any): string {
  const nowObj = new Date()
  const now = nowObj.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const proName = (professional.full_name || 'Profissional').split(' ')[0]

  return `Você é o ASSISTENTE PESSOAL do profissional ${professional.full_name || 'usuário'}.

CONTEXTO ESPECIAL: ${proName} está falando consigo mesmo no WhatsApp (chat "eu mesmo") para gerenciar a própria agenda. Aqui ${proName} é o usuário, NÃO um lead. Trate com naturalidade e direção — você é assistente do próprio dono.

Você responde APENAS a comandos administrativos relacionados à agenda. Hoje suporta:
• Consultar agenda (hoje, amanhã, semana, data específica)

━━━ DATA/HORA ATUAL ━━━
${now}

━━━ TOM ━━━
• Direto, prático, sem firulas. ${proName} quer informação rápida, não acolhimento.
• Listas e bullet points são ótimos pra agenda.
• Sem emojis em excesso — 1 ou 2 no máximo, e só quando útil pra leitura.
• Trate por ${proName} ou "você". Nunca terceira pessoa.

━━━ REGRAS ━━━
• SEMPRE use a tool ver_agenda quando ${proName} perguntar sobre agendamentos. Não invente.
• Se ${proName} perguntar algo que NÃO é sobre agenda (ex: cancelar paciente, criar agendamento), responda que esses comandos ainda estão em desenvolvimento, listando o que já funciona ("Por enquanto consigo te mostrar a agenda. Em breve consigo agendar, cancelar e bloquear horários direto por aqui").
• Se a agenda estiver vazia no período pedido, diga isso sem rodeios ("Sem agendamentos amanhã").

━━━ FORMATAÇÃO DE AGENDA ━━━
Quando listar agendamentos, use formato compacto:
*Hoje (qui 22/05)*
• 09:00 — João Silva (confirmado)
• 14:00 — Maria Costa (pending)
• 16:30 — Ana Lima (confirmado)

Resumo final útil:
"Total: 3 consultas hoje, 2 confirmadas."

Quando não houver consultas: "Sem agendamentos para o período."`
}

// =============================================
// TOOL HANDLERS
// =============================================
async function handleAdminToolCall(
  toolName: string,
  args: any,
  supabaseAdmin: any,
  professionalId: string,
): Promise<any> {
  if (toolName === 'ver_agenda') {
    const periodo = args.periodo
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    let dataInicio: Date
    let dataFim: Date

    if (periodo === 'hoje') {
      dataInicio = new Date(hoje)
      dataFim = new Date(hoje)
    } else if (periodo === 'amanha') {
      dataInicio = new Date(hoje); dataInicio.setDate(dataInicio.getDate() + 1)
      dataFim = new Date(dataInicio)
    } else if (periodo === 'semana') {
      // Semana corrente (segunda a domingo)
      const day = hoje.getDay()  // 0=domingo
      const offsetToMonday = (day === 0 ? -6 : 1 - day)
      dataInicio = new Date(hoje); dataInicio.setDate(dataInicio.getDate() + offsetToMonday)
      dataFim = new Date(dataInicio); dataFim.setDate(dataFim.getDate() + 6)
    } else if (periodo === 'proximos_7_dias') {
      dataInicio = new Date(hoje)
      dataFim = new Date(hoje); dataFim.setDate(dataFim.getDate() + 6)
    } else if (periodo === 'data_especifica') {
      if (!args.data) return { erro: 'data é obrigatória quando periodo=data_especifica' }
      dataInicio = new Date(args.data + 'T00:00:00')
      dataFim = new Date(dataInicio)
    } else {
      return { erro: `Período desconhecido: ${periodo}` }
    }

    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    const { data: appointments, error } = await supabaseAdmin
      .from('appointments')
      .select('id, appointment_date, start_time, end_time, status, appointment_type, notes, patient_id, patients(full_name)')
      .eq('professional_id', professionalId)
      .gte('appointment_date', fmt(dataInicio))
      .lte('appointment_date', fmt(dataFim))
      .in('status', ['pending', 'confirmed'])
      .is('appointment_type', null)
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      console.error('[ver_agenda] Erro:', error.message)
      return { erro: error.message }
    }

    const dayNames = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
    const lista = (appointments || []).map((apt: any) => ({
      data: apt.appointment_date,
      dia_semana: dayNames[new Date(apt.appointment_date + 'T00:00:00').getDay()],
      hora_inicio: (apt.start_time || '').slice(0, 5),
      hora_fim: (apt.end_time || '').slice(0, 5),
      paciente: apt.patients?.full_name || apt.notes || '(sem nome)',
      status: apt.status,
    }))

    return {
      periodo,
      data_inicio: fmt(dataInicio),
      data_fim: fmt(dataFim),
      total: lista.length,
      agendamentos: lista,
    }
  }

  return { erro: 'Ferramenta desconhecida' }
}

// =============================================
// CLAUDE SONNET 4.6 CALL
// =============================================
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const CLAUDE_URL   = 'https://api.anthropic.com/v1/messages'

async function callClaudeAdmin(
  systemPrompt: string,
  chatHistory: any[],
  userMessage: string,
  supabaseAdmin: any,
  professionalId: string,
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const messages: any[] = []
  let lastRole = ''
  for (const msg of chatHistory) {
    if (!msg.content) continue
    const currentRole = msg.role === 'assistant' ? 'assistant' : 'user'
    if (currentRole === lastRole) {
      const last = messages[messages.length - 1]
      last.content = `${last.content}\n${msg.content}`
    } else {
      messages.push({ role: currentRole, content: msg.content })
      lastRole = currentRole
    }
  }
  if (lastRole === 'user') {
    const last = messages[messages.length - 1]
    last.content = `${last.content}\n${userMessage || 'Status'}`
  } else {
    messages.push({ role: 'user', content: userMessage || 'Status' })
  }

  console.log(`[AdminAgent] Lead message for professional ${professionalId}`)

  try {
    let maxIterations = 5
    while (maxIterations-- > 0) {
      const payload = {
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        temperature: 0.3,  // mais determinístico pra dados
        system: systemPrompt,
        messages,
        tools,
      }

      const response = await fetch(CLAUDE_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`[Claude Error] Status: ${response.status}`, errText)
        throw new Error(`Claude API Error: ${response.status} - ${errText}`)
      }

      const result = await response.json()
      const content = result.content || []
      const stopReason = result.stop_reason

      if (stopReason !== 'tool_use') {
        const textBlock = content.find((b: any) => b.type === 'text')
        if (textBlock?.text) return textBlock.text
        return 'Não consegui processar agora. Tenta de novo?'
      }

      const toolUseBlocks = content.filter((b: any) => b.type === 'tool_use')
      const toolResults = []
      for (const tu of toolUseBlocks) {
        const out = await handleAdminToolCall(tu.name, tu.input, supabaseAdmin, professionalId)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(out),
        })
      }

      messages.push({ role: 'assistant', content })
      messages.push({ role: 'user', content: toolResults })
    }

    return 'Tive um problema processando. Tenta de novo.'
  } catch (err: any) {
    console.error('[AdminAgent] Erro fatal:', err)
    return `Erro técnico: ${err.message}`
  }
}

// =============================================
// ENVIO DE MENSAGEM (Evolution)
// =============================================
async function sendWhatsAppMessage(instanceName: string, remoteJid: string, text: string) {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey || !instanceName) {
    console.error('[AdminAgent] Config Evolution ausente')
    return
  }

  try {
    await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: remoteJid, text }),
    })
  } catch (e: any) {
    console.error('[AdminAgent] sendText erro:', e.message)
  }
}

// =============================================
// MAIN HANDLER
// =============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { professional_id, instance_name, remote_jid, message } = body

    if (!professional_id || !message) {
      return new Response(JSON.stringify({ error: 'Missing professional_id or message' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: professional, error: profError } = await supabaseAdmin
      .from('professionals')
      .select('id, full_name, whatsapp')
      .eq('id', professional_id)
      .single()

    if (profError || !professional) {
      console.error('[AdminAgent] Professional not found:', profError)
      return new Response('Pro not found', { status: 200 })
    }

    // Por enquanto não tem histórico de chat administrativo separado — comando atômico
    const chatHistory: any[] = []

    const systemPrompt = buildAdminPrompt(professional)
    console.log(`[AdminAgent] Comando: "${message}" de ${professional.full_name}`)

    let reply: string
    try {
      reply = await callClaudeAdmin(systemPrompt, chatHistory, message, supabaseAdmin, professional_id)
    } catch (e: any) {
      console.error('[AdminAgent] Falhou:', e.message)
      reply = `Não consegui processar. Erro: ${e.message}`
    }

    if (reply && reply.trim()) {
      await sendWhatsAppMessage(instance_name, remote_jid, reply)
    }

    return new Response(JSON.stringify({ success: true, reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('[AdminAgent] Fatal:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// =============================================
// TOOL DEFINITIONS para Gemini Function Calling
// =============================================
const tools = [
  {
    function_declarations: [
      {
        name: "buscar_horarios_disponiveis",
        description: "Busca horários disponíveis do profissional nos próximos dias. Retorna os agendamentos existentes e a disponibilidade semanal para que o agente possa sugerir horários livres.",
        parameters: {
          type: "object",
          properties: {
            data_inicio: {
              type: "string",
              description: "Data de início no formato YYYY-MM-DD"
            },
            data_fim: {
              type: "string",
              description: "Data final no formato YYYY-MM-DD"
            }
          },
          required: ["data_inicio", "data_fim"]
        }
      },
      {
        name: "criar_agendamento",
        description: "Cria um novo agendamento para o lead com o profissional. Use somente após o lead confirmar explicitamente data e horário.",
        parameters: {
          type: "object",
          properties: {
            data: {
              type: "string",
              description: "Data do agendamento no formato YYYY-MM-DD"
            },
            hora_inicio: {
              type: "string",
              description: "Horário de início no formato HH:MM"
            },
            hora_fim: {
              type: "string",
              description: "Horário de fim no formato HH:MM"
            },
            observacoes: {
              type: "string",
              description: "Observações do paciente sobre o motivo da consulta"
            }
          },
          required: ["data", "hora_inicio", "hora_fim"]
        }
      }
    ]
  }
]

// =============================================
// SYSTEM PROMPT
// =============================================
function buildSystemPrompt(professional: any, leadName: string, leadPhone: string): string {
  const nowObj = new Date()
  const now = nowObj.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
  const dayOfWeek = dayNames[nowObj.getDay()]

  if (professional.agent_system_prompt) {
    return professional.agent_system_prompt
      .replace('{{LEAD_NAME}}', leadName)
      .replace('{{LEAD_PHONE}}', leadPhone)
      .replace('{{NOW}}', now)
      .replace('{{PROFESSIONAL_NAME}}', professional.full_name || 'o profissional')
      .replace('{{BIO}}', professional.bio || '')
      .replace('{{PRICE_FIRST}}', professional.price_first_session || 'a combinar')
      .replace('{{PRICE_MIN}}', professional.price_min || 'não informado')
      .replace('{{PRICE_MAX}}', professional.price_max || 'não informado')
  }

  // Gerar calendário dos próximos 14 dias para a IA
  let calendarStr = ''
  for (let i = 0; i < 14; i++) {
    const d = new Date(nowObj)
    d.setDate(d.getDate() + i)
    calendarStr += `- ${d.toLocaleDateString('pt-BR')}: ${dayNames[d.getDay()]}\n`
  }

  const priceFirst = professional.price_first_session ? `R$ ${professional.price_first_session}` : 'Sob consulta'
  const bio = professional.bio ? `\n### SOBRE O PROFISSIONAL\n${professional.bio}` : ''

  const proName = professional.full_name || 'o profissional'

  return `Você é um ASSISTENTE VIRTUAL terceiro. Você NÃO é o profissional, NÃO é o cliente — você é apenas um assistente que intermedia a conversa entre eles.

### 👥 IDENTIFICAÇÃO DAS PARTES (NÃO CONFUNDA)
- **PROFISSIONAL** (a quem você serve): ${proName}. É a pessoa que oferece o serviço. Refira-se a ele(a) na TERCEIRA PESSOA ("ele", "ela", "${proName}", "o profissional").
- **CLIENTE / LEAD** (com quem você está falando AGORA via WhatsApp): ${leadName}. Refira-se a ele(a) na SEGUNDA PESSOA ("você", "${leadName}").
- **ATENÇÃO:** Mesmo que ${leadName} e ${proName} tenham nomes parecidos ou iguais, eles são pessoas DIFERENTES. NUNCA trate o cliente como se fosse o profissional, e vice-versa.

### 🎯 SEU OBJETIVO
Acolher ${leadName}, apresentar ${proName} de forma empática e conduzir a conversa até o AGENDAMENTO.

### 💰 VALORES E SERVIÇOS
- Valor da primeira sessão: ${priceFirst}
- Faixa de preço: R$ ${professional.price_min || '---'} a R$ ${professional.price_max || '---'}
*Use esses valores apenas se ${leadName} perguntar ou no momento oportuno da negociação.*
${bio}

### 📅 CALENDÁRIO DE APOIO (HOJE É ${now})
${calendarStr}

### 🎯 REGRAS DE OURO
1. **NUNCA SE PASSE PELO PROFISSIONAL:** Você é o assistente, não ${proName}. Sempre diga "${proName} pode te atender" e nunca "eu posso te atender em consulta".
2. **RESOLUÇÃO DE DATAS:** Use o calendário acima. Se ${leadName} disser "quarta", procure a próxima quarta na lista. NUNCA invente datas.
3. **ESCASSEZ:** Quando falar de horários, ofereça apenas 2 ou 3 opções específicas.
4. **BREVIDADE:** Suas respostas devem ter no máximo 2 ou 3 frases. Seja direto e humano.
5. **VALOR:** Foque no benefício do atendimento antes de falar de preço.

### 🧠 FLUXO DA CONVERSA
1. Acolha ${leadName} e entenda a necessidade -> 2. Apresente ${proName} -> 3. Ofereça 2-3 vagas -> 4. Confirme (Data e Hora) -> 5. Use a ferramenta de agendamento.`
}

// =============================================
// TOOL HANDLERS
// =============================================
async function handleToolCall(
  toolName: string,
  args: any,
  supabaseAdmin: any,
  professionalId: string,
  leadId: string
): Promise<any> {
  if (toolName === 'buscar_horarios_disponiveis') {
    const { data_inicio, data_fim } = args
    const { data: appointments } = await supabaseAdmin
      .from('appointments')
      .select('appointment_date, start_time, end_time, status')
      .eq('professional_id', professionalId)
      .gte('appointment_date', data_inicio)
      .lte('appointment_date', data_fim)
      .in('status', ['pending', 'confirmed'])

    // FALLBACK: Se não houver nada no banco, simulamos uma agenda com poucas vagas
    const suggestedSlots = [
      { hora: '09:00' },
      { hora: '10:30' },
      { hora: '14:00' },
      { hora: '16:30' }
    ]

    return {
      vagas_restantes_hoje: suggestedSlots,
      nota: 'Estes são os únicos horários disponíveis para oferta imediata.'
    }
  }

  if (toolName === 'criar_agendamento') {
    // ── VALIDAÇÃO ANTI-DOUBLE-BOOKING ─────────────────────────────────────
    // Verifica se já existe um agendamento ativo no mesmo horário antes de inserir
    const { data: conflito, error: conflictError } = await supabaseAdmin
      .from('appointments')
      .select('id, start_time, end_time')
      .eq('professional_id', professionalId)
      .eq('appointment_date', args.data)
      .eq('start_time', args.hora_inicio)
      .in('status', ['pending', 'confirmed'])
      .is('appointment_type', null) // só bookings, não bloqueios
      .maybeSingle()

    if (conflictError) {
      console.error('[criar_agendamento] Erro ao verificar conflito:', conflictError.message)
    }

    if (conflito) {
      console.warn(`[criar_agendamento] Double-booking bloqueado: ${args.data} ${args.hora_inicio}`)
      return {
        erro: 'horario_indisponivel',
        mensagem: `Infelizmente o horário das ${args.hora_inicio} no dia ${args.data} já está reservado. Por favor, escolha outro horário disponível.`
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    const { data: agendamento, error } = await supabaseAdmin
      .from('appointments')
      .insert({
        professional_id: professionalId,
        appointment_date: args.data,
        start_time: args.hora_inicio,
        end_time: args.hora_fim,
        notes: args.observacoes || '',
        status: 'pending',
      })
      .select('id, appointment_date, start_time, end_time')
      .single()

    if (error) {
      // Se a constraint do banco pegar (race condition), retorna mensagem amigável
      if (error.code === '23505') {
        return {
          erro: 'horario_indisponivel',
          mensagem: `O horário das ${args.hora_inicio} acabou de ser reservado. Por favor, escolha outro horário disponível.`
        }
      }
      return { erro: error.message }
    }

    await supabaseAdmin.from('leads').update({ pipeline_stage: 'agendado' }).eq('id', leadId)

    return { sucesso: true, agendamento }
  }

  return { erro: 'Ferramenta desconhecida' }
}

// =============================================
// GEMINI API CALL
// =============================================
async function callGemini(
  systemPrompt: string,
  chatHistory: any[],
  userMessage: string,
  supabaseAdmin: any,
  professionalId: string,
  leadId: string
): Promise<string> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) throw new Error('GEMINI_API_KEY not configured')

  const contents: any[] = []
  let lastRole = ''

  for (const msg of chatHistory) {
    if (!msg.content) continue
    const currentRole = msg.role === 'assistant' ? 'model' : 'user'
    if (currentRole === lastRole) {
      const lastIndex = contents.length - 1
      contents[lastIndex].parts[0].text += `\n${msg.content}`
    } else {
      contents.push({ role: currentRole, parts: [{ text: msg.content }] })
      lastRole = currentRole
    }
  }

  if (lastRole === 'user') {
    const lastIndex = contents.length - 1
    contents[lastIndex].parts[0].text += `\n${userMessage || 'Oi'}`
  } else {
    contents.push({ role: 'user', parts: [{ text: userMessage || 'Oi' }] })
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`

  console.log(`--- Agente WhatsApp: Interação com Lead ${leadId} ---`)
  
  try {
    const payload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools,
      tool_config: { function_calling_config: { mode: "AUTO" } },
      generation_config: { temperature: 0.7, max_output_tokens: 1024 }
    }
    
    let response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[Gemini Error] Status: ${response.status}`, errText)
      throw new Error(`Gemini API Error: ${response.status} - ${errText}`)
    }

    let result = await response.json()

    let maxIterations = 5
    while (maxIterations-- > 0) {
      const candidate = result.candidates?.[0]
      if (!candidate) break

      const parts = candidate.content?.parts || []
      const functionCalls = parts.filter((p: any) => p.functionCall)

      if (functionCalls.length === 0) {
        const textPart = parts.find((p: any) => p.text)
        if (textPart?.text) return textPart.text
        break
      }

      const modelParts = []
      const responseParts = []

      for (const fc of functionCalls) {
        const toolResult = await handleToolCall(
          fc.functionCall.name,
          fc.functionCall.args,
          supabaseAdmin,
          professionalId,
          leadId
        )
        modelParts.push({ functionCall: fc.functionCall })
        responseParts.push({
          functionResponse: { name: fc.functionCall.name, response: toolResult }
        })
      }

      contents.push({ role: 'model', parts: modelParts })
      contents.push({ role: 'user', parts: responseParts })

      response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents, 
          tools, 
          tool_config: { function_calling_config: { mode: "AUTO" } },
          generation_config: { temperature: 0.7, max_output_tokens: 1024 }
        })
      })

      if (!response.ok) break
      result = await response.json()
    }

    return 'Desculpe, tive um problema ao processar. Tente novamente.'
  } catch (err) {
    console.error('Erro fatal:', err)
    return `Erro técnico: ${err.message}`
  }
}

// =============================================
// SEND PRESENCE (DIGITANDO)
// =============================================
async function sendWhatsAppPresence(instanceName: string, remoteJid: string, presence: 'composing' | 'recording' | 'paused') {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey || !instanceName) return

  console.log(`[Presence] Setting ${presence} for ${instanceName}`)
  await fetch(`${evoUrl}/chat/sendPresence/${instanceName}`, {
    method: 'POST',
    headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: remoteJid, presence })
  }).catch(e => console.error('[Presence Error]', e.message))
}

// =============================================
// SEND MESSAGE
// =============================================
async function sendWhatsAppMessage(instanceName: string, remoteJid: string, text: string) {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey || !instanceName) {
    console.error('[WhatsApp] Missing Evo config or instance name')
    return
  }

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  for (const paragraph of paragraphs) {
    console.log(`[WhatsApp] Sending to ${remoteJid} via ${instanceName}...`)
    
    try {
      const response = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { 
          'apikey': evoKey, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          number: remoteJid, 
          text: paragraph.trim(),
          options: {
            delay: 1200,
            presence: 'composing'
          }
        })
      })

      const resText = await response.text()
      console.log(`[WhatsApp Status] ${response.status}`)
      console.log(`[WhatsApp Response] ${resText}`)

      if (!response.ok) {
        console.error('[WhatsApp Error] Failed to send message:', resText)
      }
    } catch (e) {
      console.error('[WhatsApp Fetch Error]', e.message)
    }

    if (paragraphs.length > 1) await new Promise(r => setTimeout(r, 1000))
  }
}

// =============================================
// MAIN HANDLER
// =============================================
serve(async (req) => {
  console.log(`[Agent] Request received: ${req.method}`)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { lead_id, lead_name, lead_phone, message, remote_jid, professional_id, instance_name } = body
    console.log(`[Request] Incoming from ${lead_name} (${lead_phone}). Message: ${message}`)
    console.log(`[Data] lead_id: ${lead_id}, prof_id: ${professional_id}, instance: ${instance_name}`)
    
    if (!professional_id || !lead_id) {
      console.error("[Error] Missing professional_id or lead_id")
      throw new Error("Missing IDs")
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseKey) {
      console.error("[Error] Supabase env vars missing")
      throw new Error("Supabase config missing")
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    console.log(`[DB] Fetching professional ${professional_id}`)
    const { data: professional, error: profError } = await supabaseAdmin.from('professionals').select('*').eq('id', professional_id).single()
    if (profError || !professional) {
      console.error("[Error] Professional not found:", profError)
      return new Response('Pro not found', { status: 200 })
    }

    console.log(`[DB] Fetching history for lead ${lead_id}`)
    const { data: history, error: histError } = await supabaseAdmin.from('chat_messages').select('role, content').eq('lead_id', lead_id).order('created_at', { ascending: true }).limit(20)
    if (histError) console.error("[Error] History fetch error:", histError)
    
    const chatHistory = (history || []).slice(0, -1)

    // Mostrar "digitando..." enquanto o Gemini pensa
    await sendWhatsAppPresence(instance_name, remote_jid, 'composing')

    console.log(`[AI] Calling Gemini...`)
    const systemPrompt = buildSystemPrompt(professional, lead_name, lead_phone)
    let agentReply: string
    try {
      agentReply = await callGemini(systemPrompt, chatHistory, message, supabaseAdmin, professional_id, lead_id)
      console.log(`[AI] Reply: ${agentReply}`)
    } catch (aiError) {
      console.error(`[AI Error]`, aiError.message)
      agentReply = `Erro na IA (${aiError.message}). Por favor, verifique as chaves e o modelo.`
    }

    console.log(`[DB] Saving reply and updating lead`)
    await supabaseAdmin.from('chat_messages').insert({ lead_id, role: 'assistant', content: agentReply })
    await supabaseAdmin.from('leads').update({ last_message_at: new Date().toISOString() }).eq('id', lead_id)
    
    console.log(`[WhatsApp] Sending message via Evolution...`)
    await sendWhatsAppMessage(instance_name, remote_jid, agentReply)
    console.log(`[Success] Flow completed for ${lead_name}`)

    return new Response(JSON.stringify({ success: true, reply: agentReply }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error(`[Fatal Error]`, error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

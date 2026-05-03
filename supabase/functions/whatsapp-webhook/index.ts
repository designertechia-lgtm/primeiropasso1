import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mensagem programada que o site envia automaticamente quando o usuário clica em "Agendar consulta"
const SITE_GREETING = "Olá! Gostaria de agendar um horário."

/**
 * Formata número de telefone do WhatsApp:
 * - Remove @s.whatsapp.net e :XX (session id)
 * - Adiciona 9º dígito se número brasileiro com 12 dígitos
 */
function formatPhoneNumber(remoteJid: string): string {
  let num = remoteJid.split('@')[0].split(':')[0]
  if (num.length === 12 && num.startsWith('55')) {
    num = num.slice(0, 4) + '9' + num.slice(4)
  }
  return num
}

/**
 * Envia indicador "digitando" para o WhatsApp via Evolution API
 */
async function sendPresence(instanceName: string, remoteJid: string) {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey || !instanceName) return
  await fetch(`${evoUrl}/chat/sendPresence/${instanceName}`, {
    method: 'POST',
    headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: remoteJid, presence: 'composing', delay: 1500 })
  }).catch(e => console.error('[Presence Error]', e.message))
}

/**
 * Envia menu de botões via Evolution API com as opções iniciais
 */
async function sendOptionsMenu(instanceName: string, remoteJid: string, professionalName: string) {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey || !instanceName) {
    console.error('[Options Menu] Missing Evo config')
    return
  }

  const proLabel = professionalName ? `Conversar com ${professionalName}` : 'Conversar com profissional'

  const body = {
    number: remoteJid,
    title: 'Como posso te ajudar?',
    description: 'Escolha uma das opções abaixo:',
    footer: 'Atendimento Virtual',
    buttons: [
      { type: 'reply', displayText: proLabel, id: 'opt_conversar' },
      { type: 'reply', displayText: 'Conferir agenda', id: 'opt_agenda' },
      { type: 'reply', displayText: 'Agendar um horário', id: 'opt_agendar' },
      { type: 'reply', displayText: 'Tirar dúvidas', id: 'opt_duvidas' },
    ],
  }

  console.log(`[Options Menu] Enviando botões para ${remoteJid}`)
  const res = await fetch(`${evoUrl}/message/sendButtons/${instanceName}`, {
    method: 'POST',
    headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  console.log(`[Options Menu] Status: ${res.status}, Response: ${text.substring(0, 200)}`)

  // Fallback para mensagem de texto numerada se botões falharem
  if (!res.ok) {
    console.log('[Options Menu] Botões falharam, enviando texto numerado como fallback')
    const fallback = `Como posso te ajudar? 😊\n\n1️⃣ ${proLabel}\n2️⃣ Conferir agenda\n3️⃣ Agendar um horário\n4️⃣ Tirar dúvidas\n\nResponda com o número da opção desejada.`
    await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: remoteJid, text: fallback }),
    })
  }
}

serve(async (req) => {
  console.log(`[WEBHOOK] ===== REQUISIÇÃO RECEBIDA =====`)
  console.log(`[WEBHOOK] Method: ${req.method}`)
  console.log(`[WEBHOOK] URL: ${req.url}`)
  console.log(`[WEBHOOK] Headers:`, Object.fromEntries(req.headers))

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log(`[DEBUG_WEBHOOK_V3_NOVO] Webhook iniciado - body recebido`)
    console.log(JSON.stringify(body, null, 2))

    const event = (body.event || '').toLowerCase()
    console.log(`[WEBHOOK] Event normalizado: "${event}"`)

    if (event !== 'messages.upsert' && event !== 'messages_upsert') {
      console.log(`[WEBHOOK] ⚠️ Evento ignorado (não é message): ${event}`)
      return new Response(JSON.stringify({ ignored: true, reason: 'not a message event', event }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[WEBHOOK] ✅ Evento válido: ${event}`)

    const data = body.data
    const key = data?.key
    const message = data?.message

    console.log(`[WEBHOOK] fromMe: ${key?.fromMe}, remoteJid: ${key?.remoteJid}`)

    if (key?.fromMe) {
      console.log(`[WEBHOOK] ⚠️ Ignorado: mensagem enviada por nós`)
      return new Response(JSON.stringify({ ignored: true, reason: 'fromMe' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (key?.remoteJid?.includes('@g.us')) {
      console.log(`[WEBHOOK] ⚠️ Ignorado: mensagem de grupo`)
      return new Response(JSON.stringify({ ignored: true, reason: 'group message' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[WEBHOOK] ✅ Passou nos filtros (não é fromMe, não é grupo)`)

    // Extrair texto da mensagem (suporta texto simples, botões e templates)
    const messageText =
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      message?.buttonsResponseMessage?.selectedDisplayText ||
      message?.templateButtonReplyMessage?.selectedDisplayText ||
      message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      ''

    if (!messageText.trim()) {
      console.log(`[WEBHOOK] ⚠️ Ignorado: sem conteúdo de texto`)
      return new Response(JSON.stringify({ ignored: true, reason: 'no text content (audio/image/etc not yet supported)' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[WEBHOOK] ✅ Mensagem com texto: "${messageText.substring(0, 50)}..."`)

    // Dados do remetente
    const remoteJid = key.remoteJid
    const formattedNumber = formatPhoneNumber(remoteJid)
    const pushName = data.pushName || 'Visitante'
    const instanceName = body.instance || body.instanceName || ''

    console.log(`[DEBUG] Dados extraídos: formattedNumber=${formattedNumber}, pushName=${pushName}, instanceName=${instanceName}`)

    // Criar cliente admin (Service Role para bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Buscar o profissional dono desta instância
    console.log(`[DEBUG] Buscando profissional com instanceName="${instanceName}"...`)
    const { data: professional, error: proError } = await supabaseAdmin
      .from('professionals')
      .select('id, full_name, bio, approaches, whatsapp, price_first_session, price_min, price_max, agent_system_prompt, evolution_instance_name')
      .eq('evolution_instance_name', instanceName)
      .maybeSingle()

    console.log(`[DEBUG] Resultado da busca: professional=${professional ? professional.id : 'NOT FOUND'}, error=${proError ? proError.message : 'NONE'}`)

    if (proError || !professional) {
      console.error('[ERROR] Professional not found for instance:', instanceName, proError)
      return new Response(JSON.stringify({ error: 'Professional not found for this instance' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[DEBUG] ✅ Profissional encontrado: ${professional.id}`)

    // 2. Upsert do lead (criar se não existe, atualizar se existe)
    const { data: existingLead } = await supabaseAdmin
      .from('leads')
      .select('id, agent_enabled, pipeline_stage')
      .eq('whatsapp', formattedNumber)
      .eq('professional_id', professional.id)
      .maybeSingle()

    let leadId: string

    if (existingLead) {
      leadId = existingLead.id

      // Atualizar last_message_at e mover para em_conversa se ainda for novo
      const updates: Record<string, unknown> = { last_message_at: new Date().toISOString() }
      if (existingLead.pipeline_stage === 'novo') {
        updates.pipeline_stage = 'em_conversa'
      }
      await supabaseAdmin
        .from('leads')
        .update(updates)
        .eq('id', leadId)

      // Se o agente está desabilitado para este lead, não processar
      if (!existingLead.agent_enabled) {
        return new Response(JSON.stringify({ ignored: true, reason: 'agent_disabled' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      // Criar novo lead
      const { data: newLead, error: leadError } = await supabaseAdmin
        .from('leads')
        .insert({
          professional_id: professional.id,
          name: pushName,
          whatsapp: formattedNumber,
          pipeline_stage: 'em_conversa',
          last_message_at: new Date().toISOString(),
          origin_platform: 'whatsapp',
          agent_enabled: true,
        })
        .select('id')
        .single()

      if (leadError || !newLead) {
        console.error('Failed to create lead:', leadError)
        return new Response(JSON.stringify({ error: 'Failed to create lead' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      leadId = newLead.id
    }

    // 3. Salvar mensagem do usuário na memória
    console.log(`[DEBUG] Salvando mensagem do usuário...`)
    await supabaseAdmin
      .from('chat_messages')
      .insert({
        lead_id: leadId,
        role: 'user',
        content: messageText,
      })
    console.log(`[DEBUG] ✅ Mensagem salva`)

    // 3.5. Detectar resposta de botão "Conversar com profissional" → desabilita agente
    const proName = professional.full_name || ''
    const conversarLabel = proName ? `Conversar com ${proName}` : 'Conversar com profissional'
    if (messageText.trim() === conversarLabel) {
      console.log(`[DEBUG] Lead pediu para falar com humano. Desabilitando agente.`)
      await supabaseAdmin.from('leads').update({ agent_enabled: false }).eq('id', leadId)
      await sendPresence(instanceName, remoteJid)
      const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
      const evoKey = Deno.env.get('EVOLUTION_API_KEY')
      await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evoKey ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: remoteJid,
          text: 'Estou em atendimento logo retornarei sua mensagem',
        }),
      })
      return new Response(JSON.stringify({ success: true, action: 'transferred_to_human' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3.6. Lead novo + mensagem diferente da programada do site → enviar menu de botões
    if (!existingLead && messageText.trim() !== SITE_GREETING) {
      console.log(`[DEBUG] Lead novo sem contexto do site. Enviando menu de opções.`)
      await sendPresence(instanceName, remoteJid)
      await sendOptionsMenu(instanceName, remoteJid, proName)
      return new Response(JSON.stringify({ success: true, action: 'options_menu_sent' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3.7. Mostrar "digitando" enquanto o agente processa
    await sendPresence(instanceName, remoteJid)

    // 4. Chamar o agente IA para gerar resposta
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || ''
    console.log(`[DEBUG] anonKey length: ${anonKey.length}, prefix: ${anonKey.substring(0, 20)}`)
    console.log(`[DEBUG] Invocando whatsapp-agent...`)
    const agentUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-agent`
    const agentResponse = await fetch(agentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        lead_id: leadId,
        lead_name: existingLead ? pushName : pushName,
        lead_phone: formattedNumber,
        message: messageText,
        remote_jid: remoteJid,
        professional_id: professional.id,
        instance_name: instanceName,
      }),
    })

    console.log(`[DEBUG] Agent response status: ${agentResponse.status}`)
    const agentResult = await agentResponse.json()
    console.log(`[DEBUG] Agent result:`, JSON.stringify(agentResult).substring(0, 200))

    console.log(`[WEBHOOK] ✅ SUCESSO COMPLETO: Webhook processado, agente respondeu`)

    return new Response(JSON.stringify({ success: true, agent: agentResult }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

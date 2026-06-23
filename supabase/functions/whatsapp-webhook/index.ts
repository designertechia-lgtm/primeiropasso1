import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mensagem programada que o site envia automaticamente quando o usuário clica em "Agendar consulta"
const SITE_GREETING = "Olá! Gostaria de agendar um horário."

// (parseUserIntent + tipo ParsedIntent removidos em 17/06 — eram usados só pelo
//  roteamento determinístico, descontinuado. Agendamento agora é todo no agente.)

// === Guardrail de crise + alerta ao profissional (22/06) ===
// Detecta sinais de risco (ideação suicida / autolesão / desejo de morte). PRÓ-RECALL: o custo
// de um falso-positivo é leve (acolhimento + alerta, revisado pela humana); o de um falso-negativo
// é vida. NÃO usa kill-switch global de figurado (suprimia ideação explícita na mesma msg) — as
// exclusões de idioma ("me matar de rir", "morrer de rir") vão por negative-lookahead em cada âncora.
function detectCrisisSignal(raw: string): boolean {
  const t = (raw || '').toLowerCase()
  return /suic[íi]d|me suicidar|(quero|queria|vou|penso em|pensei em|j[áa] pensei em|pensand[oa] em|tive vontade de|com vontade de|planejand[oa]) me (suicidar|matar(?! de (rir|trabalh|estud|tanto|fome|sono)))|(quero|queria|vou|com vontade de|tive vontade de|penso em|pensei em) (me )?morrer(?! de (rir|amor|fome|sono|saudade|vergonha|t[ée]dio))|tirar (a |minha |a propria |a própria |minha própria )*vida|me (cort|mutil)\w*|me fer(ir|i|indo)|me machuc(ar|ando|o)|me machuqu\w*|acabar com (a )?minha vida|acabar comigo|dar (um )?fim (em mim|na minha vida|à minha vida)|n[ãa]o (quero|aguento|consigo) mais viver|cansei de viver|n[ãa]o (quero|vou) mais acordar|dormir e (nunca mais |n[ãa]o )acordar|n[ãa]o vejo (mais )?(sentido|motivo|sa[íi]da) (na vida|em viver|pra (viver|continuar|seguir))|queria (sumir (pra sempre|de vez|do mundo|dessa vida)|desaparecer|n[ãa]o existir|estar mort)|melhor (eu )?(morrer|n[ãa]o (estivesse|tivesse|tinha) (aqui|nascido))|n[ãa]o (vou|quero) mais incomodar|n[ãa]o quero mais (estar aqui|viver)|(estariam|ficariam|seria|estaria) melhor sem mim/.test(t)
}

// Avisa o profissional no número AUTORIZADO (agent_preferences.owner_whatsapp) via a instância do
// lead. Evolution NÃO entrega pro próprio número da instância — por design o owner é OUTRO número.
// Retorna TRUE só se a Evolution aceitou (response.ok) — self-send / número inválido / instância
// off devolvem erro e viram FALSE (caller registra "não avisado" no painel). Timeout best-effort.
async function alertarProfissional(instanceName: string, ownerWhatsapp: string, texto: string): Promise<boolean> {
  const num = (ownerWhatsapp || '').replace(/\D/g, '')
  if (!num) { console.log('[alertarProfissional] sem owner_whatsapp — alerta NÃO enviado'); return false }
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  if (!evoUrl || !evoKey || !instanceName) return false
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: num, text: texto }),
      signal: ctrl.signal,
    })
    if (!r.ok) { console.error(`[alertarProfissional] Evolution ${r.status} (poss. self-send / nº inválido / instância off)`); return false }
    return true
  } catch (e) {
    console.error('[alertarProfissional] falha:', (e as any)?.message)
    return false
  } finally {
    clearTimeout(to)
  }
}

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
      // ✦ MODO ADMINISTRATIVO ✦
      // Suporta 2 cenários:
      // 1. Self-chat: dispatch pro whatsapp-admin-agent (consultar agenda etc)
      // 2. Chat com LEAD: detecta comandos com prefixo "#" do profissional
      //    (ex: #ok desliga agente nesse lead, #ativar religa)
      const remoteJidRaw = key?.remoteJid || ''
      const remoteJidNum = remoteJidRaw.replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '').replace(/\D/g, '')
      const instanceName = body.instance || ''

      const supabaseAdminEarly = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )

      const { data: proSelf } = await supabaseAdminEarly
        .from('professionals')
        .select('id, full_name, whatsapp')
        .eq('evolution_instance_name', instanceName)
        .maybeSingle()

      if (!proSelf) {
        return new Response(JSON.stringify({ ignored: true, reason: 'fromMe_pro_not_found' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const proPhone = (proSelf?.whatsapp || '').replace(/\D/g, '')
      const isSelfChat = !!proPhone && remoteJidNum === proPhone

      // Extrai texto da mensagem
      const msgFromMe = data?.message
      const adminText = (
        msgFromMe?.conversation ||
        msgFromMe?.extendedTextMessage?.text ||
        msgFromMe?.buttonsResponseMessage?.selectedDisplayText ||
        msgFromMe?.templateButtonReplyMessage?.selectedDisplayText ||
        ''
      ).trim()

      if (!adminText) {
        return new Response(JSON.stringify({ ignored: true, reason: 'fromMe_no_text' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // ── Comandos do profissional em chat com lead (#ok, #ativar) ─────
      const lowerCmd = adminText.toLowerCase().split(/\s+/)[0]
      const isCommand = lowerCmd.startsWith('#') && !isSelfChat

      if (isCommand) {
        // Acha o lead pelo whatsapp do remoteJid
        const { data: leadCmd } = await supabaseAdminEarly
          .from('leads')
          .select('id, name, agent_enabled')
          .eq('professional_id', proSelf.id)
          .eq('whatsapp', remoteJidNum)
          .maybeSingle()

        if (!leadCmd) {
          console.log(`[WEBHOOK] Comando "${lowerCmd}" mas lead ${remoteJidNum} não encontrado`)
          return new Response(JSON.stringify({ ignored: true, reason: 'cmd_lead_not_found' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        let actionMsg = ''
        let newEnabled: boolean | null = null

        if (lowerCmd === '#ok' || lowerCmd === '#desligar' || lowerCmd === '#pausar') {
          newEnabled = false
          actionMsg = `🔕 Agente desligado para ${leadCmd.name}. Digite #ativar para religar.`
        } else if (lowerCmd === '#ativar' || lowerCmd === '#on' || lowerCmd === '#ligar') {
          newEnabled = true
          actionMsg = `🔔 Agente reativado para ${leadCmd.name}.`
        } else if (lowerCmd === '#status') {
          actionMsg = `Agente: ${leadCmd.agent_enabled ? '🟢 ligado' : '🔴 desligado'} para ${leadCmd.name}`
        } else {
          actionMsg = `Comando "${lowerCmd}" não reconhecido. Disponíveis: #ok (desliga), #ativar (liga), #status.`
        }

        if (newEnabled !== null) {
          await supabaseAdminEarly
            .from('leads')
            .update({ agent_enabled: newEnabled })
            .eq('id', leadCmd.id)
          console.log(`[WEBHOOK] Comando "${lowerCmd}": agent_enabled=${newEnabled} para lead ${leadCmd.name}`)
        }

        // Envia confirmação discreta no chat (mensagem aparece no celular do profissional)
        const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
        const evoKey = Deno.env.get('EVOLUTION_API_KEY')
        if (evoUrl && evoKey) {
          try {
            await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
              method: 'POST',
              headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ number: remoteJidRaw, text: actionMsg }),
            })
          } catch (e: any) {
            console.error('[WEBHOOK] Erro ao enviar confirmação de comando:', e.message)
          }
        }

        return new Response(JSON.stringify({ success: true, action: 'cmd_executed', cmd: lowerCmd, agent_enabled: newEnabled }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // ── Self-chat → dispatch pro admin-agent (hoje não dispara — Baileys) ──
      if (isSelfChat) {
        console.log(`[WEBHOOK] ✦ Self-chat administrativo: "${adminText}"`)
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || ''
        const adminUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-admin-agent`
        try {
          await fetch(adminUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
            body: JSON.stringify({
              professional_id: proSelf.id,
              instance_name: instanceName,
              remote_jid: remoteJidRaw,
              message: adminText,
            }),
          })
        } catch (e: any) {
          console.error('[WEBHOOK] Erro admin-agent:', e.message)
        }
        return new Response(JSON.stringify({ success: true, action: 'admin_dispatched' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Mensagem fromMe normal pra outro contato (sem #) — ignora
      // (NÃO desabilitamos agente automaticamente; só o comando explícito faz isso)
      console.log(`[WEBHOOK] fromMe sem # para ${remoteJidNum} — ignorado`)
      return new Response(JSON.stringify({ ignored: true, reason: 'fromMe_no_command' }), {
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
    let messageText =
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      message?.buttonsResponseMessage?.selectedDisplayText ||
      message?.templateButtonReplyMessage?.selectedDisplayText ||
      message?.listResponseMessage?.title ||
      message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      ''

    // Atribuição de campanha: o botão da landing pode anexar "(ref: <code>)" à mensagem
    // quando o visitante veio de tráfego pago (utm/gclid). Extrai o código, REMOVE o
    // marcador do texto (pra não poluir histórico/roteamento) e guarda p/ casar no lead.
    let campaignRef: string | null = null
    {
      const refMatch = messageText.match(/\(ref:\s*([a-z0-9]{4,12})\)/i)
      if (refMatch) {
        campaignRef = refMatch[1]
        messageText = messageText.replace(refMatch[0], '').replace(/\s{2,}/g, ' ').trim()
        console.log(`[CAMPANHA] ref detectado: ${campaignRef}`)
      }
    }

    // click_id estruturado (id do botão / rowId da lista) — usado pelo roteamento
    // determinístico de agendamento. Tem prioridade sobre o texto livre do lead.
    const clickId =
      message?.buttonsResponseMessage?.selectedButtonId ||
      message?.templateButtonReplyMessage?.selectedId ||
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
      .select('id, full_name, bio, approaches, whatsapp, price_first_session, price_min, price_max, agent_system_prompt, evolution_instance_name, agent_preferences')
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

    // 1.5. Master switch do agente (Configurações → Agente de Atendimento).
    //      Off = o agente não responde. Lembrete e pós-atendimento
    //      já são desligados nos crons pela mesma preferência (agent_preferences.enabled).
    if ((professional as any).agent_preferences?.enabled === false) {
      console.log('[WEBHOOK] Agente desligado (master) para este profissional — ignorando mensagem.')
      return new Response(JSON.stringify({ ignored: true, reason: 'agent_master_disabled' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1.7. Atribuição CTWA (F4 Meta Ads): lead que chega por anúncio Click-to-WhatsApp
    //      traz contextInfo.externalAdReply na 1ª mensagem. Gravamos em leads.utm —
    //      o funil de Relatórios casa por utm->>'utm_campaign' = ads_campaigns.id.
    const adReply =
      message?.extendedTextMessage?.contextInfo?.externalAdReply ||
      message?.contextInfo?.externalAdReply ||
      null
    let ctwaUtm: Record<string, unknown> | null = null
    if (adReply) {
      ctwaUtm = {
        utm_source: 'meta_ctwa',
        utm_medium: 'ctwa',
        ctwa_clid: adReply.ctwaClid ?? null,
        ad_source_id: adReply.sourceId ?? null,
        ad_title: adReply.title ?? null,
        ad_source_url: adReply.sourceUrl ?? null,
      }
      // Sem Marketing API ainda não há mapa sourceId→campanha; se o profissional tem
      // EXATAMENTE 1 campanha Meta publicada/ativa, atribui a ela (caso comum).
      const { data: metaCampaigns } = await supabaseAdmin
        .from('ads_campaigns')
        .select('id')
        .eq('professional_id', professional.id)
        .eq('platform', 'meta_ads')
        .in('status', ['published', 'active'])
        .limit(2)
      if (metaCampaigns?.length === 1) {
        ctwaUtm.utm_campaign = metaCampaigns[0].id
      }
      console.log(`[WEBHOOK] 📣 Lead veio de anúncio CTWA (sourceId=${adReply.sourceId ?? '?'}, campanha=${ctwaUtm.utm_campaign ?? 'não mapeada'})`)
    }

    // 1.8. ORIGEM → Modo Conversão (IA assume) x Relacionamento (recado).
    //       Sinais que chegam JUNTO da 1a mensagem: greeting do site (todos os botões da
    //       landing mandam SITE_GREETING) ou anúncio Click-to-WhatsApp do Meta (adReply).
    //       Sem sinal de campanha = contato orgânico/conhecido → a IA NÃO assume (a Daiane atende).
    //       Vale só na CRIAÇÃO do lead; depois o switch é o agent_enabled (e #ativar/#ok).
    // "Veio do botão da landing": texto padrão (=== SITE_GREETING) OU mensagem com
    // marcador de campanha (campaignRef). Cobre o caso do profissional ter editado o
    // texto do botão — aí o ref é o que preserva a detecção de origem de campanha.
    const fromSiteButton = messageText.trim() === SITE_GREETING || !!campaignRef
    const isFromCampaign = fromSiteButton || !!adReply

    // 2. Upsert do lead (criar se não existe, atualizar se existe)
    const { data: existingLead } = await supabaseAdmin
      .from('leads')
      .select('id, agent_enabled, pipeline_stage, utm')
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
      // CTWA: não sobrescreve atribuição existente (vale a PRIMEIRA origem)
      if (ctwaUtm && !(existingLead as any).utm) {
        updates.utm = ctwaUtm
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
          origin_platform: isFromCampaign ? (adReply ? 'meta_ctwa' : 'site') : 'whatsapp',
          // Fase 1 (triagem pelo agente): TODO lead novo entra com o agente LIGADO.
          // Orgânico novo passa por TRIAGEM no agente (bloco 3.2), que decide atender
          // (lead real) ou silenciar (contato pessoal, via rotear_conversa). Reversível por #ativar/#ok.
          agent_enabled: true,
          ...(ctwaUtm ? { utm: ctwaUtm } : {}),
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

    // 3. Salvar mensagem do usuário na memória (processed=false: vai ser
    //    processada pelo debounce no passo 4)
    console.log(`[DEBUG] Salvando mensagem do usuário...`)
    await supabaseAdmin
      .from('chat_messages')
      .insert({
        lead_id: leadId,
        role: 'user',
        content: messageText,
        processed: false,
      })
    console.log(`[DEBUG] ✅ Mensagem salva (processed=false)`)

    // 3.1b. Atribuição de campanha: se a mensagem trouxe "(ref:)", copia utm/gclid do
    //       landing_visits pro lead — sem sobrescrever atribuição já existente (first-touch).
    if (campaignRef && leadId) {
      const { data: visit } = await supabaseAdmin
        .from('landing_visits')
        .select('utm, gclid')
        .eq('ref_code', campaignRef)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (visit) {
        const { data: leadNow } = await supabaseAdmin
          .from('leads').select('utm, gclid').eq('id', leadId).maybeSingle()
        const patch: Record<string, unknown> = {}
        const hasUtm = leadNow?.utm && Object.keys(leadNow.utm).length > 0
        if (!hasUtm && visit.utm && Object.keys(visit.utm).length > 0) patch.utm = visit.utm
        if (!leadNow?.gclid && visit.gclid) patch.gclid = visit.gclid
        if (Object.keys(patch).length > 0) {
          await supabaseAdmin.from('leads').update(patch).eq('id', leadId)
          console.log(`[CAMPANHA] ref=${campaignRef} → lead ${leadId} atribuído:`, JSON.stringify(patch))
        }
      } else {
        console.log(`[CAMPANHA] ref=${campaignRef} sem landing_visits correspondente`)
      }
    }

    // 3.15. GUARDRAIL DE CRISE (determinístico, ANTES de qualquer roteamento p/ o LLM).
    //        Sinais de risco → acolhe + CVV/SAMU (texto FIXO), silencia o bot, registra e
    //        AVISA o profissional no número autorizado. Vida não depende do LLM "lembrar".
    if (detectCrisisSignal(messageText)) {
      console.log(`[CRISE] sinal de risco detectado — lead ${leadId}`)
      const proFirstC = ((professional as any).full_name || 'a profissional').split(' ')[0]
      const acolhimento = `Sinto muito que você esteja passando por isso. O que você sente importa, e você não está sozinho(a). 💛\n\nQuero te passar um apoio que pode te acolher agora mesmo:\n• CVV – Centro de Valorização da Vida: ligue 188 (24h, gratuito e sigiloso) ou converse em cvv.org.br\n• Se o risco for iminente, ligue 192 (SAMU) ou procure o pronto-socorro mais próximo.\n\nJá estou avisando ${proFirstC} pra te dar atenção pessoal. Você não precisa passar por isso sozinho(a).`
      // 1. acolhe o lead (texto fixo, não passa pelo LLM) — best-effort com timeout
      const evoUrlC = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
      const evoKeyC = Deno.env.get('EVOLUTION_API_KEY')
      if (evoUrlC && evoKeyC) {
        const ctrlA = new AbortController(); const toA = setTimeout(() => ctrlA.abort(), 8000)
        await fetch(`${evoUrlC}/message/sendText/${instanceName}`, {
          method: 'POST', headers: { 'apikey': evoKeyC, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: remoteJid, text: acolhimento }), signal: ctrlA.signal,
        }).catch(() => {}).finally(() => clearTimeout(toA))
      }
      // 2. ALERTA o profissional no número autorizado (sabe se ENTREGOU)
      const ownerWaC = ((professional as any).agent_preferences || {}).owner_whatsapp || ''
      const alertaOk = await alertarProfissional(instanceName, ownerWaC, `Oi ${proFirstC}, aqui é o Axel 👋 Pausei o atendimento de ${pushName} (${formattedNumber}): a mensagem teve *sinais de risco/crise*. Já enviei os canais de apoio (CVV 188 / SAMU 192) e pausei o automático. Recomendo falar com a pessoa pessoalmente.\n\nMensagem do contato: "${messageText.slice(0, 200)}"`)
      // 3. silencia o bot + registra a crise (merge seguro; guarda se o alerta entregou)
      const { data: lcCur } = await supabaseAdmin.from('leads').select('collected_info').eq('id', leadId).maybeSingle()
      await supabaseAdmin.from('leads').update({
        agent_enabled: false,
        collected_info: { ...(((lcCur as any)?.collected_info) || {}), crise: { at: new Date().toISOString(), trecho: messageText.slice(0, 200), alerta_entregue: alertaOk } },
      }).eq('id', leadId)
      // 4. histórico: acolhimento + nota visível no painel (avisa se o alerta NÃO chegou); zera pendentes
      const notaCrise = alertaOk
        ? '⚠️ Crise detectada — atendimento automático pausado e profissional avisado no WhatsApp.'
        : '⚠️ Crise detectada — atendimento pausado. NÃO consegui avisar o profissional no WhatsApp (confira o "número autorizado" em Configurações).'
      await supabaseAdmin.from('chat_messages').insert([
        { lead_id: leadId, role: 'assistant', content: acolhimento, processed: true },
        { lead_id: leadId, role: 'assistant', content: notaCrise, processed: true },
      ])
      await supabaseAdmin.from('chat_messages').update({ processed: true }).eq('lead_id', leadId).eq('processed', false)
      return new Response(JSON.stringify({ success: true, action: 'crisis_guardrail' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3.2. TRIAGEM (Fase 1) — lead novo SEM origem de campanha: em vez do recado fixo,
    //       o AGENTE assume e TRIA (lead real x contato pessoal). Se for contato pessoal,
    //       o agente chama rotear_conversa('silenciar') e avisa que o profissional retorna.
    //       Vai DIRETO pro agente (sem debounce/menu) por ser o 1º contato.
    //       Rede de segurança: se o agente falhar, cai no recado de relacionamento (determinístico).
    if (!existingLead && !isFromCampaign) {
      console.log('[FLUXO] Lead novo orgânico → TRIAGEM pelo agente (Fase 1).')
      await sendPresence(instanceName, remoteJid)
      const anonKeyT = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || ''
      const agentUrlT = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-agent`
      try {
        const agentRes = await fetch(agentUrlT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKeyT}` },
          body: JSON.stringify({
            lead_id: leadId,
            lead_name: pushName,
            lead_phone: formattedNumber,
            message: messageText,
            remote_jid: remoteJid,
            professional_id: professional.id,
            instance_name: instanceName,
            triage: true,
            contact_status: 'novo',
          }),
        })
        const agentJson = await agentRes.json().catch(() => ({}))
        // Triagem responde direto (sem debounce) → marca a msg do lead como processada.
        await supabaseAdmin.from('chat_messages').update({ processed: true }).eq('lead_id', leadId).eq('processed', false)
        return new Response(JSON.stringify({ success: true, action: 'triage', result: agentJson }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (e: any) {
        console.error('[Triagem] Erro ao chamar agente — fallback recado de relacionamento:', e.message)
        const proFirst = (professional.full_name || 'o profissional').split(' ')[0]
        const recado = `Oi! 💛 Sua mensagem chegou e ${proFirst} te responde por aqui assim que puder.`
        const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
        const evoKey = Deno.env.get('EVOLUTION_API_KEY')
        if (evoUrl && evoKey && instanceName) {
          await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: remoteJid, text: recado }),
          }).catch(() => {})
        }
        await supabaseAdmin.from('chat_messages').insert({ lead_id: leadId, role: 'assistant', content: recado, processed: true })
        await supabaseAdmin.from('chat_messages').update({ processed: true }).eq('lead_id', leadId).eq('processed', false)
        return new Response(JSON.stringify({ success: true, action: 'relationship_mode_greeting_fallback' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 3.35. RESPOSTA A LEMBRETE 24h — Confirmar/Remarcar/Cancelar atualizam
    //       appointments.status + appointment_reminders.patient_response, sem invocar agente.
    //       Identificação: existe appointment_reminders sent_at nas últimas 6h sem patient_response,
    //       E a mensagem do lead bate com uma das 3 opções.
    {
      const txtR = messageText.trim()
      const lowerR = txtR.toLowerCase()
      const isConfirm   = /^confirmar(\s|$|✅)/i.test(txtR) || lowerR === 'confirmar' || lowerR === 'confirmar ✅' || lowerR === '✅ confirmar'
      const isReschedule= /^remarcar(\s|$)/i.test(txtR) || lowerR === 'remarcar'
      const isCancel    = /^cancelar(\s|$)/i.test(txtR) || lowerR === 'cancelar'

      if (isConfirm || isReschedule || isCancel) {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
        const { data: pendingReminders } = await supabaseAdmin
          .from('appointment_reminders')
          .select('id, appointment_id, kind, sent_at, appointments!inner(id, professional_id, appointment_date, start_time, status, professionals!inner(id, full_name, evolution_instance_name))')
          .is('patient_response', null)
          .gte('sent_at', sixHoursAgo)
          .order('sent_at', { ascending: false })
          .limit(5)

        // Filtra: apenas reminders cujo appointment pertence a este lead (via booking_state.appointment_id)
        const { data: leadBs } = await supabaseAdmin
          .from('leads')
          .select('booking_state, name')
          .eq('id', leadId)
          .single()
        const myApptId = (leadBs?.booking_state as any)?.appointment_id

        const matched = (pendingReminders || []).find((r: any) => r.appointment_id === myApptId)

        if (matched) {
          console.log(`[reminder-response] Match: lead ${leadId} respondeu "${txtR}" ao reminder ${matched.id} (kind=${matched.kind})`)

          const appt: any = matched.appointments
          const pro: any = appt?.professionals
          const proName = (pro?.full_name || 'o profissional').split(' ')[0]
          const instName = pro?.evolution_instance_name
          const dateStr  = appt?.appointment_date as string
          const hora     = ((appt?.start_time as string) || '').slice(0, 5)

          let newStatus: string | null = null
          let responseValue = ''
          let replyText = ''

          if (isConfirm) {
            newStatus = 'confirmed'
            responseValue = 'confirmed'
            replyText = `Combinado, ${(leadBs?.name || 'amigo(a)').split(' ')[0]}! Te espero ${dateStr} às ${hora} 🙌`
          } else if (isCancel) {
            newStatus = 'cancelled'
            responseValue = 'cancelled'
            replyText = `Tudo bem, agendamento cancelado. Quando quiser remarcar, é só chamar. Um abraço!`
          } else if (isReschedule) {
            // Não muda status do appointment — deixa o agente conduzir o fluxo de remarcação
            responseValue = 'reschedule_requested'
            replyText = '' // não responde aqui — agente vai responder
          }

          // Atualiza appointment_reminders
          await supabaseAdmin
            .from('appointment_reminders')
            .update({ patient_response: responseValue, response_at: new Date().toISOString() })
            .eq('id', matched.id)

          // Atualiza appointments.status se for Confirmar ou Cancelar
          if (newStatus) {
            await supabaseAdmin
              .from('appointments')
              .update({ status: newStatus, updated_at: new Date().toISOString() })
              .eq('id', matched.appointment_id)
            console.log(`[reminder-response] appointments.status → ${newStatus}`)

            // Se cancelado, atualiza booking_state também
            if (newStatus === 'cancelled') {
              const prev = (leadBs?.booking_state as any) || {}
              await supabaseAdmin.from('leads').update({
                booking_state: { ...prev, stage: 'cancelled', cancelled_at: new Date().toISOString() },
              }).eq('id', leadId)
            }
          }

          // Pra Confirmar/Cancelar: responde direto e encerra (sem invocar agente)
          if (replyText) {
            const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
            const evoKey = Deno.env.get('EVOLUTION_API_KEY')
            if (evoUrl && evoKey && instName) {
              try {
                await fetch(`${evoUrl}/message/sendText/${instName}`, {
                  method: 'POST',
                  headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ number: remoteJid, text: replyText }),
                })
              } catch (e: any) {
                console.error('[reminder-response] Erro Evolution:', e.message)
              }
            }
            // Grava resposta no histórico e marca msg do user como processed
            await supabaseAdmin.from('chat_messages').insert({
              lead_id: leadId, role: 'assistant', content: replyText, processed: true,
            })
            await supabaseAdmin
              .from('chat_messages')
              .update({ processed: true })
              .eq('lead_id', leadId)
              .eq('processed', false)

            return new Response(JSON.stringify({ success: true, action: 'reminder_response_handled', kind: matched.kind, response: responseValue }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
          // Pra Remarcar: cai no fluxo normal e o agente assume
        }
      }
    }

    // 3.5. ORQUESTRAÇÃO DE ESTADO — agente Sonnet só é chamado quando o fluxo
    //      decide que é hora. Webhook gerencia bloqueios, buffer e expiração.
    const proName = professional.full_name || ''
    const conversarLabel = proName ? `Conversar com ${proName}` : 'Conversar com profissional'

    // Re-fetch lead pra cobrir race condition (lead recém-criado pela rajada)
    const { data: leadFresh } = await supabaseAdmin
      .from('leads')
      .select('awaiting_form, awaiting_form_options, awaiting_form_expires_at')
      .eq('id', leadId)
      .single()

    // Bloqueio ativo? = tem formulário pendente E não expirou
    const expiresAt = leadFresh?.awaiting_form_expires_at
      ? new Date(leadFresh.awaiting_form_expires_at).getTime()
      : 0
    const blockingActive = !!leadFresh?.awaiting_form && expiresAt > Date.now()

    if (blockingActive) {
      const options: string[] = Array.isArray(leadFresh.awaiting_form_options)
        ? (leadFresh.awaiting_form_options as string[])
        : []

      // Match flexível: case-insensitive + ignora acentos básicos
      const txt = messageText.trim()
      const lowerTxt = txt.toLowerCase()
      const matchedOption = options.find((opt) => {
        const lowerOpt = opt.toLowerCase()
        return txt === opt || lowerTxt === lowerOpt
      })

      if (matchedOption) {
        // ✅ Clique reconhecido — DESBLOQUEIA e processa
        console.log(`[FLUXO] Match de opção: "${matchedOption}". Desbloqueando.`)
        await supabaseAdmin
          .from('leads')
          .update({
            awaiting_form: null,
            awaiting_form_options: null,
            awaiting_form_expires_at: null,
          })
          .eq('id', leadId)

        // Caso especial: "Conversar com X" → desabilita agente, manda mensagem de transferência
        if (matchedOption === conversarLabel) {
          console.log(`[FLUXO] Lead pediu para falar com humano. Desabilitando agente.`)
          await supabaseAdmin.from('leads').update({ agent_enabled: false }).eq('id', leadId)
          // avisa o profissional que o lead pediu pra falar com uma pessoa
          {
            const proFirstH = ((professional as any).full_name || 'a profissional').split(' ')[0]
            const ownerWaH = ((professional as any).agent_preferences || {}).owner_whatsapp || ''
            await alertarProfissional(instanceName, ownerWaH, `Oi ${proFirstH}, aqui é o Axel 👋 ${pushName} (${formattedNumber}) pediu pra falar com uma pessoa. Pausei o atendimento — é com você agora 🙂`)
          }
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
          // Marca tudo como processed (já foi cuidado)
          await supabaseAdmin
            .from('chat_messages')
            .update({ processed: true })
            .eq('lead_id', leadId)
            .eq('processed', false)
          return new Response(JSON.stringify({ success: true, action: 'transferred_to_human' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Demais opções → chama agente com o clique + buffer. Cai no fluxo normal abaixo
        // sem debounce (resposta imediata após clique). Continua pro processamento normal.
      } else {
        // 🛑 Mensagem livre durante bloqueio — empilha (já está em chat_messages
        //    com processed=false) e SILENCIA. Agente não é chamado.
        console.log(`[FLUXO] Lead bloqueado em "${leadFresh.awaiting_form}" e mensagem não bate. Empilhando.`)
        return new Response(JSON.stringify({ success: true, action: 'buffered_during_block' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 3.6. Lead novo + mensagem diferente da programada do site → enviar menu de botões.
    // BLOQUEIA o lead ANTES de chamar Evolution pra evitar race condition.
    if (!existingLead && !fromSiteButton) {
      console.log(`[FLUXO] Lead novo sem contexto do site. Bloqueando + enviando menu.`)

      const menuOptions = [conversarLabel, 'Conferir agenda', 'Agendar um horário', 'Tirar dúvidas']
      const expiresAt5min = new Date(Date.now() + 5 * 60_000).toISOString()

      // 1. Bloqueia ANTES da chamada Evolution (rápido, atômico)
      await supabaseAdmin
        .from('leads')
        .update({
          awaiting_form: 'menu_inicial',
          awaiting_form_options: menuOptions,
          awaiting_form_expires_at: expiresAt5min,
        })
        .eq('id', leadId)

      // 2. Marca a mensagem do user como processed=true — ela foi respondida pelo menu
      await supabaseAdmin
        .from('chat_messages')
        .update({ processed: true })
        .eq('lead_id', leadId)
        .eq('processed', false)

      // 3. Grava registro do menu no histórico (pro agente ter contexto se conversa retomar)
      await supabaseAdmin.from('chat_messages').insert({
        lead_id: leadId,
        role: 'assistant',
        content: `[Menu enviado: ${menuOptions.join(' · ')}]`,
        processed: true,
      })

      // 4. AGORA chama Evolution (parte lenta — pode demorar 1-2s)
      await sendPresence(instanceName, remoteJid)
      await sendOptionsMenu(instanceName, remoteJid, proName)

      return new Response(JSON.stringify({ success: true, action: 'options_menu_sent' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3.64. RESPOSTA À PESQUISA DE SATISFAÇÃO (pós-atendimento, caso H)
    //        Clique sat:<nota>:<appointment_id>. Registra a nota, marca o lead ativo
    //        e oferece reagendar. Não chama o agente.
    if (clickId && clickId.startsWith('sat:')) {
      const [, nota, apptId] = clickId.split(':')
      console.log(`[FLUXO] satisfação nota=${nota} appt=${apptId || '-'}`)
      const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
      const evoKey = Deno.env.get('EVOLUTION_API_KEY')
      const sendText = async (text: string) => {
        if (!evoUrl || !evoKey) return
        await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: remoteJid, text }),
        }).catch((e: any) => console.error('[satisfação] envio erro:', e.message))
      }

      if (nota === 'skip') {
        await sendText('Tranquilo! Quando quiser marcar a próxima, é só chamar. 🙌')
        await supabaseAdmin.from('chat_messages').insert({ lead_id: leadId, role: 'assistant', content: '[Satisfação: reoferta dispensada]', processed: true })
        return new Response(JSON.stringify({ success: true, action: 'satisfaction_skip' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Registra a nota; respondeu = lead engajado → 'cliente_ativo'. Limpa o
      // booking_state pra a reoferta iniciar um agendamento novo e limpo.
      if (apptId) {
        await supabaseAdmin.from('appointment_reminders')
          .update({ patient_response: nota, response_at: new Date().toISOString() })
          .eq('appointment_id', apptId).eq('kind', 'satisfaction')
      }
      await supabaseAdmin.from('leads')
        .update({ pipeline_stage: 'cliente_ativo', booking_state: {} })
        .eq('id', leadId)

      const agradece = nota === 'ruim'
        ? 'Obrigado pela sinceridade! Vou passar seu retorno pro profissional. 🙏'
        : 'Que bom que você gostou! 😊'
      let sentOk = false
      if (evoUrl && evoKey) {
        try {
          const res = await fetch(`${evoUrl}/message/sendButtons/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              number: remoteJid,
              title: agradece,
              description: 'Quer já deixar a próxima marcada?',
              footer: 'Atendimento Virtual',
              buttons: [
                { type: 'reply', displayText: 'Agendar próxima', id: 'opt_agendar' },
                { type: 'reply', displayText: 'Agora não',       id: 'sat:skip' },
              ],
            }),
          })
          sentOk = res.ok
        } catch (e: any) { console.error('[satisfação] botões erro:', e.message) }
      }
      if (!sentOk) await sendText(`${agradece}\n\nQuer já deixar a próxima marcada? Responda *agendar* pra ver os horários.`)

      await supabaseAdmin.from('chat_messages').insert({ lead_id: leadId, role: 'assistant', content: `[Satisfação registrada: ${nota}]`, processed: true })
      return new Response(JSON.stringify({ success: true, action: 'satisfaction', nota }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3.65. O AGENTE (LLM) conduz agendar/remarcar/cancelar pelas
    //        tools abrir_agenda/criar_agendamento/remarcar_agendamento/cancelar_agendamento.
    //        Toda mensagem (inclusive cliques de botão, lidos pelo displayText) segue
    //        pro fluxo do agent abaixo (debounce + whatsapp-agent).

    // 3.7. Mostrar "digitando" enquanto o agente processa
    await sendPresence(instanceName, remoteJid)

    // 4. DEBOUNCE — espera 4s pra dar tempo de chegar mensagens em rajada.
    //    Se outra mensagem chegar nesse intervalo, abandona esta task e deixa
    //    a próxima processar tudo. Garante resposta única com contexto completo.
    const DEBOUNCE_MS = 4000
    const messageReceivedAt = Date.now()
    console.log(`[DEBOUNCE] Aguardando ${DEBOUNCE_MS}ms antes de processar...`)
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS))

    // Confere se chegou mensagem mais recente — se sim, abandona pra que a próxima task processe tudo.
    const { data: leadAfter } = await supabaseAdmin
      .from('leads')
      .select('last_message_at, awaiting_form, awaiting_form_expires_at')
      .eq('id', leadId)
      .single()

    const lastAt = leadAfter?.last_message_at ? new Date(leadAfter.last_message_at).getTime() : 0
    if (lastAt > messageReceivedAt + 500) {
      console.log(`[DEBOUNCE] Mensagem mais recente chegou — abandonando esta task`)
      return new Response(JSON.stringify({ debounced: true, reason: 'newer_message_arrived' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Re-check: webhook concorrente bloqueou o lead enquanto dormíamos no debounce?
    const lateBlockActive = leadAfter?.awaiting_form
      && leadAfter.awaiting_form_expires_at
      && new Date(leadAfter.awaiting_form_expires_at).getTime() > Date.now()
    if (lateBlockActive) {
      console.log(`[DEBOUNCE] Bloqueio "${leadAfter.awaiting_form}" detectado tarde — abandonando`)
      return new Response(JSON.stringify({ debounced: true, reason: 'form_became_pending' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Marca atomicamente todas as mensagens não-processadas como processed=true
    // ANTES de chamar o agente. Se uma 2ª task chegar aqui em paralelo, vai
    // pegar zero linhas e desistir naturalmente.
    const { data: pendingMessages } = await supabaseAdmin
      .from('chat_messages')
      .update({ processed: true })
      .eq('lead_id', leadId)
      .eq('processed', false)
      .select('id, content, created_at')
      .order('created_at', { ascending: true })

    if (!pendingMessages || pendingMessages.length === 0) {
      console.log(`[DEBOUNCE] Nenhuma mensagem pendente — outra task já processou`)
      return new Response(JSON.stringify({ debounced: true, reason: 'already_processed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Junta o conteúdo de todas as mensagens pendentes. Quando o lead manda
    // 3 mensagens em rajada, o agente vê tudo de uma vez como um único turno.
    const mergedText = pendingMessages.map((m: any) => m.content).join('\n')
    console.log(`[DEBOUNCE] Processando ${pendingMessages.length} mensagem(ns) merged`)

    // 5. Chamar o agente IA para gerar resposta.
    //    ROBUSTEZ (fix 18/06): as mensagens JÁ foram marcadas processed=true logo acima.
    //    Se a chamada do agente falhar (Anthropic sobrecarregada/timeout/cold start), NÃO
    //    podemos deixar o lead no silêncio — era essa a causa do "Axel não responde"
    //    intermitente: a mensagem sumia sem resposta e sem rastro. Então: tenta 2x e, se
    //    ainda assim nada for entregue, manda um fallback gentil + grava no histórico.
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || ''
    const agentUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-agent`
    const agentPayload = {
      lead_id: leadId,
      lead_name: pushName,
      lead_phone: formattedNumber,
      message: mergedText,
      remote_jid: remoteJid,
      professional_id: professional.id,
      instance_name: instanceName,
      contact_status: (existingLead?.pipeline_stage === 'agendado' || existingLead?.pipeline_stage === 'cliente_ativo') ? 'cliente' : 'em_conversa',
    }

    // Marco do início do turno — pra saber se o agente chegou a GRAVAR uma resposta
    // (evita resposta dupla no retry e fallback indevido se só a resposta HTTP caiu).
    const turnStartIso = new Date().toISOString()
    const assistantRepliedSince = async (): Promise<boolean> => {
      const { data } = await supabaseAdmin
        .from('chat_messages')
        .select('id')
        .eq('lead_id', leadId)
        .eq('role', 'assistant')
        .gt('created_at', turnStartIso)
        .limit(1)
      return !!(data && data.length > 0)
    }
    const callAgent = async (): Promise<{ ok: boolean; status: number; result: any }> => {
      try {
        const res = await fetch(agentUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify(agentPayload),
        })
        const result = await res.json().catch(() => ({}))
        // Sucesso real = HTTP ok + o agente reportou success (ele devolve {error} no catch dele).
        return { ok: res.ok && result?.success === true && !result?.error, status: res.status, result }
      } catch (e: any) {
        return { ok: false, status: 0, result: { error: e?.message || String(e) } }
      }
    }

    console.log(`[DEBUG] Invocando whatsapp-agent (tentativa 1)...`)
    let attempt = await callAgent()
    if (!attempt.ok && !(await assistantRepliedSince())) {
      console.warn(`[WEBHOOK] agente falhou (status=${attempt.status}, err=${attempt.result?.error}) — retry`)
      attempt = await callAgent()
    }

    if (attempt.ok || await assistantRepliedSince()) {
      console.log(`[WEBHOOK] ✅ SUCESSO: agente respondeu`)
      return new Response(JSON.stringify({ success: true, agent: attempt.result, merged: pendingMessages.length }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Falhou nas 2 tentativas E nada foi gravado → nunca deixar o lead no vácuo.
    const proFirst = (professional.full_name || 'o profissional').split(' ')[0]
    const recado = `Oi! 💛 Sua mensagem chegou. Estou com uma instabilidade pra responder agora, mas já já retomo — ${proFirst} também acompanha por aqui.`
    const evoUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/$/, '')
    const evoKey = Deno.env.get('EVOLUTION_API_KEY')
    if (evoUrl && evoKey && instanceName) {
      await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: remoteJid, text: recado }),
      }).catch(() => {})
    }
    await supabaseAdmin.from('chat_messages').insert({ lead_id: leadId, role: 'assistant', content: recado, processed: true })
    console.warn(`[WEBHOOK] ⚠️ agente falhou 2x — fallback gentil enviado ao lead (lead ${leadId})`)

    return new Response(JSON.stringify({ success: false, fallback: true, merged: pendingMessages.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: (error as any)?.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

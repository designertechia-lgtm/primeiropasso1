import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error("Unauthorized: Missing Authorization header")
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // O JWT vem como "Bearer <token>", extraímos apenas o token
    const token = authHeader.replace('Bearer ', '')

    // Get professional context
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) {
      throw new Error(`Unauthorized: ${authError?.message || 'No user found'}`)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let { data: pro, error: proError } = await supabaseAdmin
      .from('professionals')
      .select('id, evolution_instance_name, whatsapp_channel')
      .eq('user_id', user.id)
      .maybeSingle()

    if (proError) {
      throw new Error(`Erro ao buscar profissional: ${proError.message}`)
    }

    // Se for a conta admin e não tiver perfil, auto-cria via Service Role para arrumar o BD
    if (!pro && user.email === 'designertech.ia@gmail.com') {
      const { data: newPro, error: insertError } = await supabaseAdmin
        .from('professionals')
        .insert({ user_id: user.id, slug: 'designertech' })
        .select('id, evolution_instance_name, whatsapp_channel')
        .single()

      if (insertError) {
        throw new Error(`Erro ao auto-criar perfil admin: ${insertError.message}`)
      }
      pro = newPro
    }

    if (!pro) {
      throw new Error(`Nenhum perfil de profissional encontrado para o usuário: ${user.id}`)
    }

    const { action, number, to, message } = await req.json()
    const evoUrl = Deno.env.get('EVOLUTION_API_URL')
    const evoKey = Deno.env.get('EVOLUTION_API_KEY')

    if (!evoUrl || !evoKey) {
      throw new Error("Evolution API not configured")
    }

    const evoHeaders = {
      'apikey': evoKey,
      'Content-Type': 'application/json'
    }

    // ── action: send — envio manual do painel (campo "Digite sua mensagem"), roteado
    // pelo canal do profissional (Evolution x Cloud API oficial). O caller garante que
    // o agente está desligado pro lead; aqui só entregamos o texto.
    if (action === 'send') {
      const toNum = ((to || '') as string).split('@')[0].split(':')[0].replace(/\D/g, '')
      const text = ((message || '') as string).trim()
      if (!toNum || !text) {
        return new Response(JSON.stringify({ error: 'to e message obrigatórios' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if ((pro as any).whatsapp_channel === 'cloud') {
        const { data: acc } = await supabaseAdmin
          .from('whatsapp_cloud_accounts')
          .select('phone_number_id, access_token')
          .eq('professional_id', pro.id)
          .eq('status', 'active')
          .maybeSingle()
        if (acc?.phone_number_id && acc?.access_token) {
          // Graph API limita a 4096 chars por mensagem — fatia pra não perder texto longo.
          const partes: string[] = []
          for (let i = 0; i < text.length; i += 4000) partes.push(text.slice(i, i + 4000))
          for (const parte of partes) {
            const res = await fetch(`https://graph.facebook.com/v21.0/${acc.phone_number_id}/messages`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${acc.access_token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ messaging_product: 'whatsapp', to: toNum, type: 'text', text: { body: parte } }),
            })
            if (!res.ok) {
              const err = (await res.text().catch(() => '')).slice(0, 200)
              console.error(`[proxy send][cloud] ${res.status}: ${err}`)
              return new Response(JSON.stringify({ error: `cloud_send_failed_${res.status}` }), {
                status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              })
            }
          }
          return new Response(JSON.stringify({ status: 'sent' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        // canal cloud sem conta ativa → degrada pra Evolution abaixo
      }

      if (!pro.evolution_instance_name) {
        return new Response(JSON.stringify({ error: 'whatsapp_nao_conectado' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const res = await fetch(`${evoUrl}/message/sendText/${pro.evolution_instance_name}`, {
        method: 'POST',
        headers: evoHeaders,
        body: JSON.stringify({ number: toNum, text }),
      })
      if (!res.ok) {
        const err = (await res.text().catch(() => '')).slice(0, 200)
        console.error(`[proxy send][evolution] ${res.status}: ${err}`)
        return new Response(JSON.stringify({ error: `evolution_send_failed_${res.status}` }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ status: 'sent' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'status') {
      // Canal cloud: sem instância/QR. Conta ativa = 'open' (o front usa esse status pra
      // liberar o envio manual do painel). Sem conta ativa, degrada pro fluxo Evolution.
      if ((pro as any).whatsapp_channel === 'cloud') {
        const { data: acc } = await supabaseAdmin
          .from('whatsapp_cloud_accounts')
          .select('phone_number_id, display_number')
          .eq('professional_id', pro.id)
          .eq('status', 'active')
          .maybeSingle()
        if (acc?.phone_number_id) {
          return new Response(JSON.stringify({ status: 'open', channel: 'cloud', number: acc.display_number || null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      }

      if (!pro.evolution_instance_name) {
        return new Response(JSON.stringify({ status: 'not_created' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const res = await fetch(`${evoUrl}/instance/connectionState/${pro.evolution_instance_name}`, {
        headers: evoHeaders
      });
      
      if (!res.ok) {
        // Might be deleted in Evolution API but still in DB
        if (res.status === 404) {
           return new Response(JSON.stringify({ status: 'not_created' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        throw new Error("Failed to get status")
      }
      
      const data = await res.json()
      const state = data?.instance?.state || 'unknown'

      const payload: Record<string, unknown> = {
        status: state,
        instance_name: pro.evolution_instance_name,
      }

      // Quando conectado, busca o número e o nome do perfil pra exibir no card.
      // Best-effort: se a Evolution não responder, devolve só o status (como antes).
      if (state === 'open') {
        try {
          const infoRes = await fetch(
            `${evoUrl}/instance/fetchInstances?instanceName=${pro.evolution_instance_name}`,
            { headers: evoHeaders }
          )
          if (infoRes.ok) {
            const infoData = await infoRes.json()
            const inst = Array.isArray(infoData) ? infoData[0] : infoData
            // v2: { ownerJid, profileName } no nível raiz | v1: { instance: { owner, profileName } }
            const node = inst?.instance ?? inst ?? {}
            const ownerJid = node.ownerJid ?? node.owner ?? null
            payload.number = ownerJid ? String(ownerJid).split('@')[0] : null
            payload.profile_name = node.profileName ?? null
          }
        } catch (e) {
          console.warn(`[evolution-proxy] fetchInstances falhou: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'create') {
      const instanceName = `prof_${pro.id.replace(/-/g, '')}`
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`

      // Limpa estado anterior (DB pode ter nome salvo mas Evolution pode não ter, ou vice-versa)
      const staleInstance = pro.evolution_instance_name || instanceName
      await fetch(`${evoUrl}/instance/logout/${staleInstance}`, { method: 'DELETE', headers: evoHeaders }).catch(() => {})
      await fetch(`${evoUrl}/instance/delete/${staleInstance}`, { method: 'DELETE', headers: evoHeaders }).catch(() => {})
      await supabaseAdmin.from('professionals').update({ evolution_instance_name: null }).eq('id', pro.id)

      const body = {
        instanceName: instanceName,
        token: instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: ["MESSAGES_UPSERT"]
        }
      }

      const res = await fetch(`${evoUrl}/instance/create`, {
        method: 'POST',
        headers: evoHeaders,
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        let errMsg = "Evolution API: "
        try {
          const errData = await res.json()
          errMsg += errData?.response?.message || errData?.message || `Erro HTTP ${res.status}`
          if (Array.isArray(errMsg)) errMsg = errMsg[0]
        } catch (e) {
          errMsg += `Erro HTTP ${res.status}`
        }
        throw new Error(errMsg)
      }

      const data = await res.json()

      // Update DB
      await supabaseAdmin
        .from('professionals')
        .update({ evolution_instance_name: instanceName })
        .eq('id', pro.id)

      // Ativar webhook explicitamente
      const webhookRes = await fetch(`${evoUrl}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: evoHeaders,
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT"]
          }
        })
      })

      if (!webhookRes.ok) {
        const whErr = await webhookRes.text()
        console.warn(`[Webhook Set] Status ${webhookRes.status}: ${whErr}`)
        // Não bloqueia o flow, webhook pode ser ativado manualmente depois
      }

      return new Response(JSON.stringify({ status: 'created', qrcode: data?.qrcode?.base64 || null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'connect') {
      if (!pro.evolution_instance_name) {
        throw new Error("Nenhuma instância criada.")
      }

      const res = await fetch(`${evoUrl}/instance/connect/${pro.evolution_instance_name}`, {
        headers: evoHeaders
      });
      
      if (!res.ok) {
        throw new Error("Falha ao obter o QR Code da Evolution.")
      }

      const data = await res.json()
      return new Response(JSON.stringify({ base64: data?.base64 || null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'logout') {
      if (!pro.evolution_instance_name) {
        throw new Error("Nenhuma instância criada.")
      }

      const instanceName = pro.evolution_instance_name

      // Desconecta a sessão primeiro (best-effort, pode falhar se já desconectado)
      await fetch(`${evoUrl}/instance/logout/${instanceName}`, {
        method: 'DELETE',
        headers: evoHeaders
      }).catch(() => {})

      // Remove a instância completamente do Evolution API
      await fetch(`${evoUrl}/instance/delete/${instanceName}`, {
        method: 'DELETE',
        headers: evoHeaders
      })

      // Limpa o banco para permitir criar uma nova instância do zero
      await supabaseAdmin
        .from('professionals')
        .update({ evolution_instance_name: null })
        .eq('id', pro.id)

      return new Response(JSON.stringify({ status: 'deleted' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'set_webhook') {
      if (!pro.evolution_instance_name) {
        throw new Error("Nenhuma instância criada.")
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`

      const body = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: ["MESSAGES_UPSERT"]
        }
      }

      const res = await fetch(`${evoUrl}/webhook/set/${pro.evolution_instance_name}`, {
        method: 'POST',
        headers: evoHeaders,
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        throw new Error("Erro ao configurar webhook na Evolution.")
      }

      return new Response(JSON.stringify({ status: 'webhook_set' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'profile-picture') {
      if (!pro.evolution_instance_name || !number) {
        return new Response(JSON.stringify({ pictureUrl: null, name: null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      // Evolution (Baileys): POST /chat/fetchProfilePictureUrl/{instance} { number } -> { wuid, profilePictureUrl }
      const res = await fetch(`${evoUrl}/chat/fetchProfilePictureUrl/${pro.evolution_instance_name}`, {
        method: 'POST',
        headers: evoHeaders,
        body: JSON.stringify({ number }),
      })
      if (!res.ok) {
        const raw = await res.text().catch(() => '')
        console.warn(`[profile-picture] Evolution status ${res.status}: ${raw.slice(0, 200)}`)
        return new Response(JSON.stringify({ pictureUrl: null, name: null, raw: { status: res.status } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const data = await res.json().catch(() => ({}))
      return new Response(JSON.stringify({
        pictureUrl: (data as any)?.profilePictureUrl || null,
        name: (data as any)?.name || null,
        raw: data,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error("Ação inválida solicitada.")

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[evolution-proxy] Error: ${errorMsg}`)
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 200, // 200 para que o frontend processe e exiba a mensagem
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

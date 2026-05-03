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
      .select('id, evolution_instance_name')
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
        .select('id, evolution_instance_name')
        .single()

      if (insertError) {
        throw new Error(`Erro ao auto-criar perfil admin: ${insertError.message}`)
      }
      pro = newPro
    }

    if (!pro) {
      throw new Error(`Nenhum perfil de profissional encontrado para o usuário: ${user.id}`)
    }

    const { action } = await req.json()
    const evoUrl = Deno.env.get('EVOLUTION_API_URL')
    const evoKey = Deno.env.get('EVOLUTION_API_KEY')

    if (!evoUrl || !evoKey) {
      throw new Error("Evolution API not configured")
    }

    const evoHeaders = {
      'apikey': evoKey,
      'Content-Type': 'application/json'
    }

    if (action === 'status') {
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
      return new Response(JSON.stringify({ status: data?.instance?.state || 'unknown' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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

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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Get professional context
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      throw new Error("Unauthorized")
    }

    const { data: pro, error: proError } = await supabaseClient
      .from('professionals')
      .select('id, evolution_instance_name')
      .eq('user_id', user.id)
      .single()

    if (proError || !pro) {
      throw new Error("Professional not found")
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
      if (pro.evolution_instance_name) {
        throw new Error("Instance already created")
      }

      const instanceName = `prof_${pro.id.replace(/-/g, '')}`
      const webhookUrl = Deno.env.get('EVOLUTION_WEBHOOK_URL') || ''

      const body = {
        instanceName: instanceName,
        token: instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: webhookUrl ? webhookUrl : undefined,
        webhook_by_events: false,
        webhook_base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
      }

      const res = await fetch(`${evoUrl}/instance/create`, {
        method: 'POST',
        headers: evoHeaders,
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        throw new Error("Failed to create instance")
      }

      const data = await res.json()
      
      // Update DB
      await supabaseClient
        .from('professionals')
        .update({ evolution_instance_name: instanceName })
        .eq('id', pro.id)

      return new Response(JSON.stringify({ status: 'created', qrcode: data?.qrcode?.base64 || null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'connect') {
      if (!pro.evolution_instance_name) {
        throw new Error("No instance created")
      }

      const res = await fetch(`${evoUrl}/instance/connect/${pro.evolution_instance_name}`, {
        headers: evoHeaders
      });
      
      if (!res.ok) {
        throw new Error("Failed to get qrcode")
      }

      const data = await res.json()
      return new Response(JSON.stringify({ base64: data?.base64 || null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'logout') {
      if (!pro.evolution_instance_name) {
        throw new Error("No instance created")
      }

      const res = await fetch(`${evoUrl}/instance/logout/${pro.evolution_instance_name}`, {
        method: 'DELETE',
        headers: evoHeaders
      });
      
      if (!res.ok) {
        throw new Error("Failed to logout instance")
      }

      return new Response(JSON.stringify({ status: 'logged_out' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error("Invalid action")

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

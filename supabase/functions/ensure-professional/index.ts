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
      return new Response(JSON.stringify({ error: 'No auth header' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate user via anon client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Admin client to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if user has professional role
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const isProfessional = roles?.some(r => r.role === 'professional')

    // If user is not professional, make them one (for admin account)
    if (!isProfessional && user.email === 'designertech.ia@gmail.com') {
      await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: user.id, role: 'professional' }, { onConflict: 'user_id,role' })
    }

    // Check if professional record exists
    const { data: pro } = await supabaseAdmin
      .from('professionals')
      .select('id, slug')
      .eq('user_id', user.id)
      .maybeSingle()

    // If professional exists, sync slug from user_metadata if metadata has one and different
    const metadataSlugExisting = user.user_metadata?.slug as string | undefined
    if (pro) {
      if (metadataSlugExisting && pro.slug !== metadataSlugExisting) {
        await supabaseAdmin
          .from('professionals')
          .update({ slug: metadataSlugExisting })
          .eq('id', pro.id)
        pro.slug = metadataSlugExisting
      }
      return new Response(JSON.stringify({ professional: pro, created: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auto-create professional record
    // Use slug from user_metadata (set during Cadastro), fallback to email prefix
    const emailSlug = metadataSlugExisting ||
      user.email?.split('@')[0]?.replace(/[^a-z0-9]/gi, '-')?.toLowerCase() ||
      `pro-${user.id.substring(0, 8)}`

    const { data: newPro, error: insertError } = await supabaseAdmin
      .from('professionals')
      .insert({ user_id: user.id, slug: emailSlug })
      .select('id, slug')
      .single()

    if (insertError) {
      // Slug conflict - add random suffix
      const fallbackSlug = `${emailSlug}-${Date.now().toString(36)}`
      const { data: retryPro, error: retryError } = await supabaseAdmin
        .from('professionals')
        .insert({ user_id: user.id, slug: fallbackSlug })
        .select('id, slug')
        .single()

      if (retryError) {
        return new Response(JSON.stringify({ error: `Erro ao criar perfil: ${retryError.message}` }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ professional: retryPro, created: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ professional: newPro, created: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

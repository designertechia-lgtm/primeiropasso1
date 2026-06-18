-- Aba "Workspaces" (super-admin / desenvolvedor): snapshot de saude de uma conta.
-- Somente leitura: consolida o estado de onboarding + contadores de uso de UMA conta.
-- SECURITY DEFINER com guard is_super_admin() — mesmo padrao de owner_grant_credits.
-- Os dados de assinatura (status, vencimento, cobranca) ja vem de owner_list_all_users;
-- aqui focamos no que falta: checklist de configuracao + contadores.

CREATE OR REPLACE FUNCTION public.owner_workspace_detail(p_professional_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prof   professionals%ROWTYPE;
  v_result json;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  SELECT * INTO v_prof FROM professionals WHERE id = p_professional_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional not found';
  END IF;

  SELECT json_build_object(
    'professional_id',   v_prof.id,
    'full_name',         v_prof.full_name,
    'email',             v_prof.email,
    'slug',              v_prof.slug,
    'whatsapp',          v_prof.whatsapp,
    'photo_url',         v_prof.photo_url,
    'created_at',        v_prof.created_at,
    -- checklist de onboarding (booleans)
    'has_profile',       (v_prof.full_name IS NOT NULL AND v_prof.photo_url IS NOT NULL AND v_prof.bio IS NOT NULL),
    'has_slug',          (v_prof.slug IS NOT NULL AND btrim(v_prof.slug) <> ''),
    'landing_published', COALESCE(v_prof.landing_published, false),
    'whatsapp_connected',(v_prof.evolution_instance_name IS NOT NULL AND btrim(v_prof.evolution_instance_name) <> ''),
    'has_availability',  EXISTS (SELECT 1 FROM availability a WHERE a.professional_id = v_prof.id AND a.active),
    'has_services',      (v_prof.price_min IS NOT NULL OR EXISTS (SELECT 1 FROM professional_services s WHERE s.professional_id = v_prof.id AND s.active)),
    -- contadores de uso
    'posts_count',        (SELECT count(*) FROM social_posts sp WHERE sp.professional_id = v_prof.id),
    'leads_count',        (SELECT count(*) FROM leads l WHERE l.professional_id = v_prof.id),
    'appointments_count', (SELECT count(*) FROM appointments ap WHERE ap.professional_id = v_prof.id),
    'messages_count',     (SELECT count(*) FROM chat_messages cm JOIN leads l ON l.id = cm.lead_id WHERE l.professional_id = v_prof.id),
    'credit_balance',     COALESCE((SELECT cb.balance FROM credit_balance cb WHERE cb.professional_id = v_prof.id), 0)
  ) INTO v_result;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.owner_workspace_detail(uuid) TO authenticated;

-- =============================================================================
-- Identidade por telefone — o cadastro JÁ coleta o WhatsApp (obrigatório) e salva
-- em profiles.phone, mas o trigger criava o professional SEM o telefone. Isso fazia
-- professionals.phone/whatsapp ficarem NULL (Axel e WhatsApp agent leem de lá).
--
-- Correção: handle_new_user passa a copiar o telefone do cadastro para
-- professionals.phone E professionals.whatsapp. + backfill dos já cadastrados.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role     text;
  _slug     text;
  _ref_slug text;
  _prof_id  uuid;
  _phone    text;
BEGIN
  _phone := NEW.raw_user_meta_data->>'phone';

  -- Cria perfil com telefone
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), _phone);

  -- Atribui apenas o role principal escolhido no cadastro
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'patient');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role::app_role);

  -- Profissional: cria registro em professionals com slug + telefone (identidade principal)
  IF _role = 'professional' THEN
    _slug := NEW.raw_user_meta_data->>'slug';
    IF _slug IS NOT NULL AND _slug <> '' THEN
      INSERT INTO public.professionals (user_id, slug, phone, whatsapp)
      VALUES (NEW.id, _slug, _phone, _phone);
    END IF;
  END IF;

  -- Vincula paciente ao profissional se ref_slug presente
  IF _role = 'patient' THEN
    _ref_slug := NEW.raw_user_meta_data->>'ref_slug';
    IF _ref_slug IS NOT NULL AND _ref_slug <> '' THEN
      SELECT id INTO _prof_id FROM public.professionals WHERE slug = _ref_slug LIMIT 1;
      IF _prof_id IS NOT NULL THEN
        INSERT INTO public.patient_professionals (patient_id, professional_id)
        VALUES (NEW.id, _prof_id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: profissionais já cadastrados que têm telefone em profiles mas não em
-- professionals (não sobrescreve quem já editou o telefone no painel).
UPDATE public.professionals p
SET phone    = COALESCE(NULLIF(p.phone, ''), pr.phone),
    whatsapp = COALESCE(NULLIF(p.whatsapp, ''), pr.phone)
FROM public.profiles pr
WHERE pr.user_id = p.user_id
  AND pr.phone IS NOT NULL AND pr.phone <> ''
  AND (p.phone IS NULL OR p.phone = '' OR p.whatsapp IS NULL OR p.whatsapp = '');

-- =============================================================================
-- Identidade com FONTE ÚNICA: profiles.full_name é a verdade → espelhado em
-- professionals.full_name por trigger. Resolve a dessincronia (professionals
-- ficava NULL; Axel/landing não viam o nome) SEM remover colunas e SEM quebrar
-- os ~10 consumidores que leem professionals.
--
-- Escopo: só full_name. phone NÃO é auto-sincronizado de propósito — o telefone
-- de CONTATO da landing (professionals) pode divergir do telefone de CADASTRO
-- (profiles) intencionalmente; o cadastro já popula ambos via handle_new_user.
-- =============================================================================

-- 1) Trigger: profiles.full_name muda → espelha em professionals.full_name
CREATE OR REPLACE FUNCTION public.sync_profile_name_to_professional()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.full_name IS NOT NULL AND NEW.full_name <> '' THEN
    UPDATE public.professionals
    SET full_name = NEW.full_name
    WHERE user_id = NEW.user_id
      AND full_name IS DISTINCT FROM NEW.full_name;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_profile_name ON public.profiles;
CREATE TRIGGER trg_sync_profile_name
  AFTER INSERT OR UPDATE OF full_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_name_to_professional();

-- 2) handle_new_user: novos profissionais já nascem com full_name em professionals
--    (recria a função mantendo o resto; única mudança = full_name no INSERT).
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
  _name     text;
BEGIN
  _phone := NEW.raw_user_meta_data->>'phone';
  _name  := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (NEW.id, _name, _phone);

  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'patient');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role::app_role);

  IF _role = 'professional' THEN
    _slug := NEW.raw_user_meta_data->>'slug';
    IF _slug IS NOT NULL AND _slug <> '' THEN
      INSERT INTO public.professionals (user_id, slug, full_name, phone, whatsapp)
      VALUES (NEW.id, _slug, _name, _phone, _phone);
    END IF;
  END IF;

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

-- 3) Backfill: copia o nome de profiles para professionals onde está vazio.
UPDATE public.professionals p
SET full_name = pr.full_name
FROM public.profiles pr
WHERE pr.user_id = p.user_id
  AND pr.full_name IS NOT NULL AND pr.full_name <> ''
  AND (p.full_name IS NULL OR p.full_name = '');

SELECT slug, full_name FROM public.professionals ORDER BY created_at DESC LIMIT 6;

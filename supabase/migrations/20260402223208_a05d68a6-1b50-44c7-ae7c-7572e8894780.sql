
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role text;
  _slug text;
BEGIN
  -- Create profile with phone
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.raw_user_meta_data->>'phone');

  -- Assign role
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'patient');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role::app_role);

  -- Create professional record and assign admin role if applicable
  IF _role = 'professional' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role);

    _slug := NEW.raw_user_meta_data->>'slug';
    IF _slug IS NOT NULL AND _slug <> '' THEN
      INSERT INTO public.professionals (user_id, slug)
      VALUES (NEW.id, _slug);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

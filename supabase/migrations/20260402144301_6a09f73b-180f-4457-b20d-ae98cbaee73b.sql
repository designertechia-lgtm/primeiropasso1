
-- Replace handle_new_user to also insert role and professional record
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
  _slug text;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  -- Assign role
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'patient');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role::app_role);

  -- Create professional record if applicable
  IF _role = 'professional' THEN
    _slug := NEW.raw_user_meta_data->>'slug';
    IF _slug IS NOT NULL AND _slug <> '' THEN
      INSERT INTO public.professionals (user_id, slug)
      VALUES (NEW.id, _slug);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists (DROP IF EXISTS to avoid duplicate)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

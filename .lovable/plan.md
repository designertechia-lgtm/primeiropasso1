

# Fix: RLS Blocking Signup for Roles & Professionals

## Problem

After `signUp()`, the user hasn't confirmed their email yet, so the Supabase client still uses the **anon key** (`auth.uid()` is null). The code tries to insert into `user_roles` and `professionals` from the client, but:
- `user_roles` INSERT policy requires admin role
- `professionals` INSERT policy requires `auth.uid() = user_id`

Both fail with RLS violations.

## Solution

Move role assignment and professional record creation to a **database trigger** (`SECURITY DEFINER`) that fires on `auth.users` INSERT. The signup metadata will carry the role and slug.

### 1. Migration: Extend `handle_new_user()` trigger

Replace the existing `handle_new_user` function to also:
- Read `role` and `slug` from `NEW.raw_user_meta_data`
- Insert into `user_roles` with the chosen role
- If role is `professional`, insert into `professionals` with the slug

```sql
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
```

Also ensure the trigger exists on `auth.users`:
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```
(Only if not already present.)

### 2. Update `Cadastro.tsx`

- Pass `role` and `slug` in the signup metadata (`options.data`)
- Remove the client-side inserts to `user_roles` and `professionals`

The signup call becomes:
```ts
await supabase.auth.signUp({
  email, password,
  options: {
    data: { full_name: fullName, role, slug: normalizedSlug },
    emailRedirectTo: window.location.origin,
  },
});
```

Delete lines 52-78 (the client-side role and professional inserts).

### 3. No RLS changes needed

The trigger runs as `SECURITY DEFINER` (superuser context), bypassing RLS entirely.


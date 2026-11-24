
-- ============================================================================
-- AI ENGINEERING WORKSPACE — SUPABASE AUTH PROFILE SYNCHRONIZATION TRIGGER
-- File: apps/api/prisma/supabase-auth-trigger.sql
--
-- Purpose:
-- Synchronizes new Supabase Auth registrations with public.profiles.
--
-- Security:
-- - SECURITY DEFINER: Executes with the function owner's privileges.
-- - Empty search_path: Prevents search-path hijacking.
-- - Explicit schema qualification for database objects.
-- - Direct function execution revoked from PUBLIC, anon, authenticated.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw_full_name TEXT;
  v_full_name VARCHAR(150);
  v_raw_display_name TEXT;
  v_display_name VARCHAR(100);
  v_avatar_url TEXT;
  v_email VARCHAR(255);
BEGIN
  -- 1. Validate required Auth fields.
  IF NEW.id IS NULL THEN
    RAISE EXCEPTION 'Cannot synchronize profile: auth.users.id is NULL.'
      USING ERRCODE = 'not_null_violation';
  END IF;

  IF NEW.email IS NULL OR pg_catalog.btrim(NEW.email) = '' THEN
    RAISE EXCEPTION 'Cannot synchronize profile: auth.users.email is required and cannot be empty.'
      USING ERRCODE = 'not_null_violation';
  END IF;

  v_email := pg_catalog.lower(pg_catalog.btrim(NEW.email));

  -- 2. Determine full_name using metadata fallback order:
  -- full_name -> name -> email prefix.
  v_raw_full_name := pg_catalog.btrim(
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );

  IF v_raw_full_name = '' THEN
    v_raw_full_name := pg_catalog.btrim(
      COALESCE(NEW.raw_user_meta_data->>'name', '')
    );
  END IF;

  IF v_raw_full_name = '' THEN
    v_raw_full_name := pg_catalog.btrim(
      pg_catalog.split_part(v_email, '@', 1)
    );
  END IF;

  -- FIX: Use schema-qualified substr() function.
  v_full_name := pg_catalog.substr(v_raw_full_name, 1, 150);

  -- 3. Extract optional display_name.
  v_raw_display_name := pg_catalog.btrim(
    COALESCE(NEW.raw_user_meta_data->>'display_name', '')
  );

  IF v_raw_display_name = '' THEN
    v_display_name := NULL;
  ELSE
    -- FIX: Use schema-qualified substr() function.
    v_display_name := pg_catalog.substr(v_raw_display_name, 1, 100);
  END IF;

  -- 4. Extract optional avatar_url.
  v_avatar_url := NULLIF(
    pg_catalog.btrim(
      COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    ),
    ''
  );

  -- 5. Insert or update the profile.
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    display_name,
    avatar_url,
    status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_email,
    v_full_name,
    v_display_name,
    v_avatar_url,
    'ACTIVE'::public.user_status,
    pg_catalog.now(),
    pg_catalog.now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE
      WHEN public.profiles.full_name IS NULL
        OR pg_catalog.btrim(public.profiles.full_name) = ''
      THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END,
    updated_at = pg_catalog.now();

  RETURN NEW;
END;
$$;

-- Explicitly assign function ownership.
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- Document the function.
COMMENT ON FUNCTION public.handle_new_user() IS
  'Synchronizes new Supabase Auth users to public.profiles.';

-- Prevent direct execution by application roles.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;

-- Create the Auth signup trigger.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;

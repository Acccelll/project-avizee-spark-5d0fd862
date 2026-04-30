CREATE OR REPLACE FUNCTION public.get_secret_vault_by_name(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret text;
BEGIN
  IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT decrypted_secret
    INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.get_secret_vault_by_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_secret_vault_by_name(text) TO service_role;
CREATE OR REPLACE FUNCTION public.ler_secret_vault(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  SELECT decrypted_secret
    INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.ler_secret_vault(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ler_secret_vault(text) TO authenticated, service_role;
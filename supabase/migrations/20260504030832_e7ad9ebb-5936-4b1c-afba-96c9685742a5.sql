-- Etapa 2: consumo transacional de convite no signup.
-- handle_new_user agora lê invite_token de raw_user_meta_data, valida atomicamente
-- (rowCount=1 garante que apenas um signup consome o token) e aplica role + ativa profile.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
  v_invite RECORD;
  v_status text := 'pendente';
BEGIN
  v_token := NULLIF(TRIM(NEW.raw_user_meta_data->>'invite_token'), '');

  -- Se há token: validar e consumir atomicamente
  IF v_token IS NOT NULL THEN
    -- UPDATE com guard: garante que só um signup consome o token (proteção de race)
    UPDATE public.invites
       SET used_at = now(),
           used_by = NEW.id
     WHERE token = v_token
       AND used_at IS NULL
       AND expires_at > now()
       AND lower(trim(email)) = lower(trim(NEW.email))
    RETURNING * INTO v_invite;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Convite inválido, expirado ou já utilizado.'
        USING ERRCODE = '22023';
    END IF;

    -- Aplica role do convite
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, v_invite.role)
    ON CONFLICT (user_id, role) DO NOTHING;

    v_status := 'ativo';
  END IF;

  INSERT INTO public.profiles (id, nome, email, status)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NEW.email
    ),
    NEW.email,
    v_status
  )
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

  RETURN NEW;
END;
$function$;
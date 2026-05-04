
CREATE OR REPLACE FUNCTION public.trg_nf_protege_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF current_setting('app.hard_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF OLD.status = 'rascunho' AND OLD.status_sefaz = 'nao_enviada' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'DELETE bloqueado: NF % está em status=% / sefaz=%. Use cancelar_nota_fiscal ou inutilizar_nota_fiscal.', OLD.id, OLD.status, OLD.status_sefaz;
END;
$function$;

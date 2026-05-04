
CREATE OR REPLACE FUNCTION public.trg_nf_itens_protege_edicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_internal_op text := current_setting('app.nf_internal_op', true);
  v_status text;
BEGIN
  IF current_setting('app.hard_delete', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF v_internal_op = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT status INTO v_status FROM public.notas_fiscais
    WHERE id = COALESCE(NEW.nota_fiscal_id, OLD.nota_fiscal_id);

  IF v_status IN ('confirmada','importada','cancelada') THEN
    RAISE EXCEPTION 'Itens da NF estão bloqueados para edição (status=%).', v_status
      USING HINT = 'Use estorno (estornar_nota_fiscal) para liberar alterações.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

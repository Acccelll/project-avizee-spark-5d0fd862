
CREATE OR REPLACE FUNCTION public.trg_financeiro_protege_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_baixas_ativas int;
BEGIN
  IF current_setting('app.hard_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF OLD.origem_tipo IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION 'Lançamento originado de % não pode ser excluído. Use cancelamento.', OLD.origem_tipo;
  END IF;
  SELECT COUNT(*) INTO v_baixas_ativas
  FROM public.financeiro_baixas
  WHERE lancamento_id = OLD.id AND estornada_em IS NULL;
  IF v_baixas_ativas > 0 THEN
    RAISE EXCEPTION 'Lançamento possui baixas ativas. Estorne antes de excluir.';
  END IF;
  IF OLD.status NOT IN ('aberto','cancelado') THEN
    RAISE EXCEPTION 'Apenas lançamentos manuais em aberto ou cancelados podem ser excluídos.';
  END IF;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_orcamento_protege_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF current_setting('app.hard_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF OLD.status = 'historico' AND OLD.origem = 'importacao_historica' THEN
    RETURN OLD;
  END IF;
  IF OLD.status <> 'rascunho' THEN
    RAISE EXCEPTION 'Somente orçamentos em rascunho podem ser excluídos (status atual: %). Use cancelar_orcamento.', OLD.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ordens_venda WHERE cotacao_id = OLD.id) THEN
    RAISE EXCEPTION 'Orçamento possui pedido vinculado — não pode ser excluído.';
  END IF;
  RETURN OLD;
END;
$function$;

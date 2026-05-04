CREATE OR REPLACE FUNCTION public.trg_lancamento_status_requer_baixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tem_baixa boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IN ('pago','parcial')
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.valor_pago IS DISTINCT FROM NEW.valor_pago) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.financeiro_baixas
      WHERE lancamento_id = NEW.id AND estornada_em IS NULL
    ) INTO v_tem_baixa;
    IF NOT v_tem_baixa THEN
      RAISE EXCEPTION 'Lancamento % nao pode ter status % sem baixa registrada. Use o fluxo de baixa financeira.', NEW.id, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_lancamento_status_requer_baixa ON public.financeiro_lancamentos;
CREATE TRIGGER trg_lancamento_status_requer_baixa
BEFORE UPDATE ON public.financeiro_lancamentos
FOR EACH ROW
EXECUTE FUNCTION public.trg_lancamento_status_requer_baixa();
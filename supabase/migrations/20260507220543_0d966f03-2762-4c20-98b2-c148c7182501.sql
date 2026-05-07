-- 1) Garante trigger de empresa_id em financeiro_baixa_lotes (estava faltando)
DROP TRIGGER IF EXISTS trg_set_empresa_id_financeiro_baixa_lotes ON public.financeiro_baixa_lotes;
CREATE TRIGGER trg_set_empresa_id_financeiro_baixa_lotes
  BEFORE INSERT ON public.financeiro_baixa_lotes
  FOR EACH ROW EXECUTE FUNCTION public.set_empresa_id_default();

-- 2) Remove trigger duplicado de sync (existem dois triggers AFTER INSERT/UPDATE/DELETE
--    chamando a mesma função trg_sync_financeiro_saldo, causando dupla execução).
DROP TRIGGER IF EXISTS trg_financeiro_baixas_sync ON public.financeiro_baixas;
-- mantém apenas trg_sync_financeiro_saldo

-- 3) Hardening: registrar_baixa_lote_financeira agora valida empresa_id antes
--    de inserir o lote, dando mensagem clara em vez do erro genérico de constraint.
CREATE OR REPLACE FUNCTION public.registrar_baixa_lote_financeira(
  p_items jsonb,
  p_data_baixa date,
  p_forma_pagamento text,
  p_conta_bancaria_id uuid,
  p_observacoes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_grupo uuid;
  v_total numeric := 0;
  v_processados int := 0;
  v_ignorados int := 0;
  v_erros text[] := '{}';
  v_status text;
  v_lanc_id uuid;
  v_valor numeric;
  v_empresa uuid;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Nenhum item informado';
  END IF;

  v_empresa := public.current_empresa_id();
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada — contate o administrador.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.financeiro_baixa_lotes
    (tipo, data_pagamento, conta_bancaria_id, forma_pagamento, valor_total, observacoes, usuario_id, empresa_id)
  VALUES ('lote', p_data_baixa, p_conta_bancaria_id, p_forma_pagamento, 0, p_observacoes, auth.uid(), v_empresa)
  RETURNING id INTO v_grupo;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      v_lanc_id := (v_item->>'lancamento_id')::uuid;
      SELECT status INTO v_status FROM public.financeiro_lancamentos WHERE id = v_lanc_id;
      IF v_status IS NULL THEN
        v_erros := array_append(v_erros, 'Lançamento ' || v_lanc_id || ' não encontrado');
        CONTINUE;
      END IF;
      IF v_status IN ('pago','cancelado') THEN
        v_ignorados := v_ignorados + 1;
        CONTINUE;
      END IF;
      v_valor := (v_item->>'valor_pago')::numeric;
      PERFORM public.registrar_baixa_financeira(
        v_lanc_id,
        v_valor,
        COALESCE((v_item->>'data_baixa')::date, p_data_baixa),
        COALESCE(v_item->>'forma_pagamento', p_forma_pagamento),
        COALESCE((v_item->>'conta_bancaria_id')::uuid, p_conta_bancaria_id),
        COALESCE(v_item->>'observacoes', p_observacoes),
        COALESCE((v_item->>'desconto')::numeric, 0),
        COALESCE((v_item->>'juros')::numeric, 0),
        COALESCE((v_item->>'multa')::numeric, 0),
        COALESCE((v_item->>'abatimento')::numeric, 0),
        v_grupo,
        false
      );
      v_total := v_total + v_valor;
      v_processados := v_processados + 1;
    EXCEPTION WHEN OTHERS THEN
      v_erros := array_append(v_erros, SQLERRM);
    END;
  END LOOP;

  UPDATE public.financeiro_baixa_lotes SET valor_total = v_total WHERE id = v_grupo;

  RETURN jsonb_build_object(
    'grupo_id', v_grupo,
    'processados', v_processados,
    'ignorados', v_ignorados,
    'erros', to_jsonb(v_erros)
  );
END;
$function$;
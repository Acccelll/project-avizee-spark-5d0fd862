-- Extende gerar_parcelas_financeiras para suportar parcelamento em cartão de crédito.
-- Quando p_base.forma_pagamento = 'cartao_credito' e p_base.cartao_id estiver presente,
-- cada parcela tem seu vencimento definido pela fatura correspondente (resolvida via
-- cartao_fatura_para_data) e os vínculos cartao_id / cartao_fatura_id são persistidos.
-- Mantém retrocompatibilidade: sem cartão, comportamento idêntico ao anterior.

CREATE OR REPLACE FUNCTION public.gerar_parcelas_financeiras(
  p_base jsonb,
  p_num_parcelas integer,
  p_intervalo_dias integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_id uuid;
  v_valor_total numeric;
  v_valor_parcela numeric;
  v_resto numeric;
  v_data_base date;
  i int;
  v_descricao text;
  v_cartao_id uuid;
  v_is_cartao boolean;
  v_data_parcela_calc date;
  v_data_parcela_efetiva date;
  v_fatura_id uuid;
  v_fatura_venc date;
BEGIN
  IF p_num_parcelas IS NULL OR p_num_parcelas < 2 THEN
    RAISE EXCEPTION 'Número de parcelas deve ser >= 2';
  END IF;

  v_valor_total := (p_base->>'valor')::numeric;
  v_data_base := (p_base->>'data_vencimento')::date;
  v_descricao := COALESCE(p_base->>'descricao','Parcelamento');
  v_valor_parcela := round(v_valor_total / p_num_parcelas, 2);
  v_resto := round(v_valor_total - (v_valor_parcela * p_num_parcelas), 2);

  v_cartao_id := NULLIF(p_base->>'cartao_id','')::uuid;
  v_is_cartao := (COALESCE(p_base->>'forma_pagamento','') = 'cartao_credito') AND v_cartao_id IS NOT NULL;

  -- Agrupador (parcela_numero = 0). Sem fatura no agrupador (representa o todo).
  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, valor, data_vencimento, status,
     forma_pagamento, banco, cartao, cartao_id,
     cliente_id, fornecedor_id, conta_bancaria_id, conta_contabil_id,
     observacoes, parcela_numero, parcela_total)
  VALUES
    (COALESCE(p_base->>'tipo','receber'),
     v_descricao || ' (agrupador)',
     v_valor_total,
     v_data_base,
     'aberto',
     NULLIF(p_base->>'forma_pagamento',''),
     NULLIF(p_base->>'banco',''),
     NULLIF(p_base->>'cartao',''),
     v_cartao_id,
     NULLIF(p_base->>'cliente_id','')::uuid,
     NULLIF(p_base->>'fornecedor_id','')::uuid,
     NULLIF(p_base->>'conta_bancaria_id','')::uuid,
     NULLIF(p_base->>'conta_contabil_id','')::uuid,
     NULLIF(p_base->>'observacoes',''),
     0, p_num_parcelas)
  RETURNING id INTO v_parent_id;

  -- Parcelas filhas
  FOR i IN 1..p_num_parcelas LOOP
    v_data_parcela_calc := v_data_base + ((i - 1) * p_intervalo_dias);
    v_data_parcela_efetiva := v_data_parcela_calc;
    v_fatura_id := NULL;

    IF v_is_cartao THEN
      -- Para parcelas em cartão: cada parcela tipicamente cai em uma fatura mensal.
      -- A data-base de referência da i-ésima parcela é o mesmo dia do mês da compra
      -- avançado em (i-1) meses; usar a data calculada por intervalo é uma aproximação
      -- aceitável (e o cartao_fatura_para_data já normaliza pela competência da fatura).
      BEGIN
        v_fatura_id := public.cartao_fatura_para_data(v_cartao_id, v_data_parcela_calc);
        IF v_fatura_id IS NOT NULL THEN
          SELECT data_vencimento INTO v_fatura_venc
          FROM public.cartao_faturas WHERE id = v_fatura_id;
          IF v_fatura_venc IS NOT NULL THEN
            v_data_parcela_efetiva := v_fatura_venc;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Falha em resolver fatura não bloqueia o parcelamento; mantém data calculada.
        v_fatura_id := NULL;
      END;
    END IF;

    INSERT INTO public.financeiro_lancamentos
      (tipo, descricao, valor, data_vencimento, status,
       forma_pagamento, banco, cartao, cartao_id, cartao_fatura_id,
       cliente_id, fornecedor_id, conta_bancaria_id, conta_contabil_id,
       observacoes, parcela_numero, parcela_total, documento_pai_id)
    VALUES
      (COALESCE(p_base->>'tipo','receber'),
       v_descricao || ' - ' || i || '/' || p_num_parcelas,
       CASE WHEN i = p_num_parcelas THEN v_valor_parcela + v_resto ELSE v_valor_parcela END,
       v_data_parcela_efetiva,
       'aberto',
       NULLIF(p_base->>'forma_pagamento',''),
       NULLIF(p_base->>'banco',''),
       NULLIF(p_base->>'cartao',''),
       v_cartao_id,
       v_fatura_id,
       NULLIF(p_base->>'cliente_id','')::uuid,
       NULLIF(p_base->>'fornecedor_id','')::uuid,
       NULLIF(p_base->>'conta_bancaria_id','')::uuid,
       NULLIF(p_base->>'conta_contabil_id','')::uuid,
       NULLIF(p_base->>'observacoes',''),
       i, p_num_parcelas, v_parent_id);
  END LOOP;

  RETURN v_parent_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.atualizar_financeiro_nota(
  p_nota_id uuid,
  p_forma_pagamento text,
  p_condicao_pagamento text,
  p_parcelas jsonb DEFAULT NULL
) RETURNS TABLE(lancamento_id uuid, parcela int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nf record;
  v_tipo_lanc text;
  v_baixados int;
  v_total int;
  v_dup jsonb;
  v_idx int := 0;
  v_id uuid;
BEGIN
  SELECT id, tipo, fornecedor_id, cliente_id, numero, chave_acesso,
         valor_total, data_emissao
    INTO v_nf
    FROM public.notas_fiscais
   WHERE id = p_nota_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota fiscal % não encontrada', p_nota_id;
  END IF;

  v_tipo_lanc := CASE WHEN v_nf.tipo = 'entrada' THEN 'pagar' ELSE 'receber' END;

  SELECT count(*) INTO v_baixados
    FROM public.financeiro_lancamentos
   WHERE nota_fiscal_id = p_nota_id
     AND ativo = true
     AND status IN ('pago','parcial');

  IF v_baixados > 0 THEN
    RAISE EXCEPTION 'Existem % parcela(s) já baixada(s); estorne antes de alterar a condição de pagamento.', v_baixados;
  END IF;

  UPDATE public.financeiro_lancamentos
     SET ativo = false, updated_at = now()
   WHERE nota_fiscal_id = p_nota_id
     AND ativo = true
     AND status NOT IN ('pago','parcial');

  IF p_parcelas IS NULL OR jsonb_array_length(p_parcelas) = 0 THEN
    p_parcelas := jsonb_build_array(
      jsonb_build_object(
        'numero', 1,
        'vencimento', COALESCE(v_nf.data_emissao, CURRENT_DATE),
        'valor', v_nf.valor_total
      )
    );
  END IF;

  v_total := jsonb_array_length(p_parcelas);

  FOR v_dup IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
    v_idx := v_idx + 1;
    INSERT INTO public.financeiro_lancamentos (
      tipo, descricao, valor, data_vencimento, status,
      forma_pagamento, fornecedor_id, cliente_id, nota_fiscal_id,
      parcela_numero, parcela_total,
      origem_tipo, origem_tabela, origem_id, origem_descricao,
      ativo, data_emissao
    ) VALUES (
      v_tipo_lanc,
      'NF ' || COALESCE(v_nf.numero,'?') || ' - parcela ' || v_idx || '/' || v_total,
      (v_dup->>'valor')::numeric,
      (v_dup->>'vencimento')::date,
      'aberto',
      COALESCE(p_forma_pagamento, 'boleto_dda'),
      CASE WHEN v_tipo_lanc = 'pagar' THEN v_nf.fornecedor_id ELSE NULL END,
      CASE WHEN v_tipo_lanc = 'receber' THEN v_nf.cliente_id ELSE NULL END,
      v_nf.id,
      v_idx,
      v_total,
      'fiscal_nota',
      'notas_fiscais', v_nf.id,
      'NF ' || COALESCE(v_nf.numero,'') || COALESCE(' / chave ' || v_nf.chave_acesso, ''),
      true,
      COALESCE(v_nf.data_emissao, CURRENT_DATE)
    )
    RETURNING id INTO v_id;

    lancamento_id := v_id;
    parcela := v_idx;
    RETURN NEXT;
  END LOOP;

  UPDATE public.notas_fiscais
     SET forma_pagamento = p_forma_pagamento,
         condicao_pagamento = p_condicao_pagamento,
         updated_at = now()
   WHERE id = p_nota_id;

  INSERT INTO public.nota_fiscal_eventos (nota_fiscal_id, tipo_evento, descricao, payload_resumido)
  VALUES (
    p_nota_id, 'edicao',
    'Forma/condição de pagamento atualizada: ' || COALESCE(p_forma_pagamento,'-') || ' / ' || COALESCE(p_condicao_pagamento,'-'),
    jsonb_build_object('forma_pagamento', p_forma_pagamento, 'condicao_pagamento', p_condicao_pagamento, 'parcelas', v_total)
  );

  RETURN;
END;
$$;
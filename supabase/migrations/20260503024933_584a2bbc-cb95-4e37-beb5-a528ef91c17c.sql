CREATE OR REPLACE FUNCTION public.confirmar_nota_fiscal(p_nf_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nf RECORD;
  v_item RECORD;
  v_tipo_mov text;
  v_tipo_fin text;
  v_parcela jsonb;
  v_qtd_parcelas int;
  v_data_base date;
  v_intervalo int := 30;
  i int;
BEGIN
  SELECT * INTO v_nf FROM public.notas_fiscais WHERE id = p_nf_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NF % não encontrada', p_nf_id; END IF;
  IF v_nf.status NOT IN ('pendente','rascunho') THEN
    RAISE EXCEPTION 'NF % já está em status % e não pode ser confirmada', p_nf_id, v_nf.status;
  END IF;

  UPDATE public.notas_fiscais SET status='confirmada', updated_at=now() WHERE id=p_nf_id;

  IF v_nf.movimenta_estoque
     AND NOT EXISTS (SELECT 1 FROM public.estoque_movimentos WHERE documento_tipo='fiscal' AND documento_id=p_nf_id) THEN
    v_tipo_mov := CASE WHEN v_nf.tipo = 'entrada' THEN 'entrada' ELSE 'saida' END;
    FOR v_item IN SELECT * FROM public.notas_fiscais_itens WHERE nota_fiscal_id = p_nf_id LOOP
      INSERT INTO public.estoque_movimentos
        (produto_id, tipo, quantidade, documento_tipo, documento_id, motivo, empresa_id)
      VALUES
        (v_item.produto_id, v_tipo_mov, v_item.quantidade, 'fiscal', p_nf_id, 'NF ' || v_nf.numero, v_nf.empresa_id);
    END LOOP;
  END IF;

  IF v_nf.gera_financeiro
     AND NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos WHERE nota_fiscal_id = p_nf_id) THEN
    v_tipo_fin := CASE WHEN v_nf.tipo = 'entrada' THEN 'pagar' ELSE 'receber' END;
    v_data_base := COALESCE(v_nf.data_emissao, CURRENT_DATE);

    IF v_nf.condicao_pagamento = 'a_vista' THEN
      INSERT INTO public.financeiro_lancamentos
        (tipo, descricao, valor, valor_pago, saldo_restante,
         data_emissao, data_vencimento, status,
         fornecedor_id, cliente_id, nota_fiscal_id, forma_pagamento, origem_tipo)
      VALUES
        (v_tipo_fin, 'NF ' || v_nf.numero,
         v_nf.valor_total, 0, v_nf.valor_total,
         v_data_base, v_data_base, 'aberto',
         v_nf.fornecedor_id, v_nf.cliente_id, p_nf_id, v_nf.forma_pagamento, 'fiscal_nota');

    ELSIF jsonb_typeof(v_nf.parcelas) = 'array' AND jsonb_array_length(v_nf.parcelas) > 0 THEN
      v_qtd_parcelas := jsonb_array_length(v_nf.parcelas);
      i := 1;
      FOR v_parcela IN SELECT value FROM jsonb_array_elements(v_nf.parcelas) LOOP
        INSERT INTO public.financeiro_lancamentos
          (tipo, descricao, valor, valor_pago, saldo_restante,
           data_emissao, data_vencimento, status,
           fornecedor_id, cliente_id, nota_fiscal_id, forma_pagamento,
           parcela_numero, parcela_total, origem_tipo)
        VALUES
          (v_tipo_fin,
           'NF ' || v_nf.numero || ' - Parc. ' || COALESCE((v_parcela->>'numero')::int, i) || '/' || v_qtd_parcelas,
           COALESCE((v_parcela->>'valor')::numeric, v_nf.valor_total / v_qtd_parcelas),
           0,
           COALESCE((v_parcela->>'valor')::numeric, v_nf.valor_total / v_qtd_parcelas),
           v_data_base,
           COALESCE((v_parcela->>'vencimento')::date, v_data_base + (i * v_intervalo)),
           'aberto',
           v_nf.fornecedor_id, v_nf.cliente_id, p_nf_id, v_nf.forma_pagamento,
           COALESCE((v_parcela->>'numero')::int, i),
           v_qtd_parcelas, 'fiscal_nota');
        i := i + 1;
      END LOOP;

    ELSE
      INSERT INTO public.financeiro_lancamentos
        (tipo, descricao, valor, valor_pago, saldo_restante,
         data_emissao, data_vencimento, status,
         fornecedor_id, cliente_id, nota_fiscal_id, forma_pagamento,
         parcela_numero, parcela_total, origem_tipo)
      VALUES
        (v_tipo_fin, 'NF ' || v_nf.numero,
         v_nf.valor_total, 0, v_nf.valor_total,
         v_data_base, v_data_base + v_intervalo, 'aberto',
         v_nf.fornecedor_id, v_nf.cliente_id, p_nf_id, v_nf.forma_pagamento,
         1, 1, 'fiscal_nota');
    END IF;
  END IF;

  INSERT INTO public.nota_fiscal_eventos (nota_fiscal_id, tipo_evento, status_anterior, status_novo, descricao)
  VALUES (p_nf_id, 'confirmacao', v_nf.status, 'confirmada', 'NF confirmada');
END;
$function$;
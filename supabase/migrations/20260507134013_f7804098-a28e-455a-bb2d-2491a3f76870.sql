
-- 1) Validação de itens em confirmar_nota_fiscal
CREATE OR REPLACE FUNCTION public.confirmar_nota_fiscal(p_nf_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nf RECORD;
  v_item RECORD;
  v_qtd_itens int;
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

  SELECT count(*) INTO v_qtd_itens FROM public.notas_fiscais_itens WHERE nota_fiscal_id = p_nf_id;
  IF v_qtd_itens = 0 THEN
    RAISE EXCEPTION 'NF % sem itens — adicione produtos antes de confirmar', p_nf_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.notas_fiscais SET status='confirmada', updated_at=now() WHERE id=p_nf_id;

  IF v_nf.movimenta_estoque
     AND NOT EXISTS (SELECT 1 FROM public.estoque_movimentos WHERE documento_tipo='nota_fiscal' AND documento_id=p_nf_id) THEN
    v_tipo_mov := CASE WHEN v_nf.tipo = 'entrada' THEN 'entrada' ELSE 'saida' END;
    FOR v_item IN SELECT * FROM public.notas_fiscais_itens WHERE nota_fiscal_id = p_nf_id LOOP
      INSERT INTO public.estoque_movimentos
        (produto_id, tipo, quantidade, documento_tipo, documento_id, motivo, empresa_id)
      VALUES
        (v_item.produto_id, v_tipo_mov, v_item.quantidade, 'nota_fiscal', p_nf_id, 'NF ' || v_nf.numero, v_nf.empresa_id);
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
         fornecedor_id, cliente_id, nota_fiscal_id, forma_pagamento, origem_tipo, empresa_id)
      VALUES
        (v_tipo_fin, 'NF ' || v_nf.numero,
         v_nf.valor_total, 0, v_nf.valor_total,
         v_data_base, v_data_base, 'aberto',
         v_nf.fornecedor_id, v_nf.cliente_id, p_nf_id, v_nf.forma_pagamento, 'fiscal_nota', v_nf.empresa_id);

    ELSIF jsonb_typeof(v_nf.parcelas) = 'array' AND jsonb_array_length(v_nf.parcelas) > 0 THEN
      v_qtd_parcelas := jsonb_array_length(v_nf.parcelas);
      i := 1;
      FOR v_parcela IN SELECT value FROM jsonb_array_elements(v_nf.parcelas) LOOP
        INSERT INTO public.financeiro_lancamentos
          (tipo, descricao, valor, valor_pago, saldo_restante,
           data_emissao, data_vencimento, status,
           fornecedor_id, cliente_id, nota_fiscal_id, forma_pagamento,
           parcela_numero, parcela_total, origem_tipo, empresa_id)
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
           v_qtd_parcelas, 'fiscal_nota', v_nf.empresa_id);
        i := i + 1;
      END LOOP;

    ELSE
      INSERT INTO public.financeiro_lancamentos
        (tipo, descricao, valor, valor_pago, saldo_restante,
         data_emissao, data_vencimento, status,
         fornecedor_id, cliente_id, nota_fiscal_id, forma_pagamento, origem_tipo, empresa_id)
      VALUES
        (v_tipo_fin, 'NF ' || v_nf.numero,
         v_nf.valor_total, 0, v_nf.valor_total,
         v_data_base, v_data_base + v_intervalo, 'aberto',
         v_nf.fornecedor_id, v_nf.cliente_id, p_nf_id, v_nf.forma_pagamento, 'fiscal_nota', v_nf.empresa_id);
    END IF;
  END IF;
END;
$$;

-- 2) RPC atômica para retorno SEFAZ
CREATE OR REPLACE FUNCTION public.registrar_retorno_sefaz(
  p_nf_id uuid,
  p_status_sefaz text,
  p_protocolo text DEFAULT NULL,
  p_chave_acesso text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_ambiente text DEFAULT NULL,
  p_xml_retorno text DEFAULT NULL,
  p_payload_resumido jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nf RECORD;
  v_status_anterior text;
  v_tipo_evento text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_status_sefaz NOT IN ('nao_enviada','enviada','processando','autorizada','rejeitada','cancelada_sefaz','denegada','inutilizada') THEN
    RAISE EXCEPTION 'status_sefaz inválido: %', p_status_sefaz USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_nf FROM public.notas_fiscais WHERE id = p_nf_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NF % não encontrada', p_nf_id;
  END IF;

  v_status_anterior := COALESCE(v_nf.status_sefaz, 'nao_enviada');

  UPDATE public.notas_fiscais
     SET status_sefaz       = p_status_sefaz,
         protocolo_autorizacao = COALESCE(p_protocolo, protocolo_autorizacao),
         chave_acesso       = COALESCE(p_chave_acesso, chave_acesso),
         motivo_rejeicao    = CASE WHEN p_status_sefaz = 'rejeitada' THEN p_motivo ELSE NULL END,
         ambiente_emissao   = COALESCE(p_ambiente, ambiente_emissao),
         updated_at         = now()
   WHERE id = p_nf_id;

  v_tipo_evento := CASE p_status_sefaz
    WHEN 'autorizada' THEN 'autorizacao'
    WHEN 'rejeitada' THEN 'rejeicao'
    WHEN 'cancelada_sefaz' THEN 'cancelamento_sefaz'
    WHEN 'denegada' THEN 'denegacao'
    WHEN 'inutilizada' THEN 'inutilizacao'
    ELSE 'retorno_sefaz'
  END;

  INSERT INTO public.notas_fiscais_eventos
    (nota_fiscal_id, tipo_evento, status_anterior, status_novo, descricao, payload_resumido, xml_retorno, usuario_id)
  VALUES
    (p_nf_id, v_tipo_evento, v_status_anterior, p_status_sefaz, p_motivo,
     COALESCE(p_payload_resumido, jsonb_build_object('protocolo', p_protocolo, 'ambiente', p_ambiente)),
     p_xml_retorno, auth.uid());
END;
$$;

-- 3) Idempotência reforçada por chave_acesso + parcela
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fin_lanc_nfe_chave_parcela
  ON public.financeiro_lancamentos (nota_fiscal_id, parcela_numero)
  WHERE nota_fiscal_id IS NOT NULL AND ativo = true;

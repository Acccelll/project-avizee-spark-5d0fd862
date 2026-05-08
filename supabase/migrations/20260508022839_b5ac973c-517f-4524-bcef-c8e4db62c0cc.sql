-- HOTFIX: restaura corpo completo de confirmar_nota_fiscal (movimentação de
-- estoque + financeiro + evento) que foi inadvertidamente truncado, agora
-- com gate de permissão no topo. Também adiciona gate em cancelar/devolução.

CREATE OR REPLACE FUNCTION public.confirmar_nota_fiscal(p_nf_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_fornecedor_id uuid;
  v_cliente_id uuid;
BEGIN
  -- BK-01 (Onda 8): gate de permissão. SR/cron (auth.uid() IS NULL) bypass.
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_fiscal_permission('criar') OR public.has_fiscal_permission('editar')) THEN
    RAISE EXCEPTION 'Permissão negada: confirmar nota fiscal requer faturamento_fiscal:criar ou :editar.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('nf:'||p_nf_id::text));

  SELECT * INTO v_nf FROM public.notas_fiscais WHERE id = p_nf_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NF % não encontrada', p_nf_id; END IF;

  IF v_nf.status NOT IN ('pendente','rascunho') THEN
    RAISE EXCEPTION 'NF % já está em status % e não pode ser confirmada', p_nf_id, v_nf.status;
  END IF;

  IF COALESCE(v_nf.status_sefaz,'') IN ('rejeitada','denegada','cancelada_sefaz','inutilizada') THEN
    RAISE EXCEPTION 'NF % com status SEFAZ % — não pode ser confirmada', p_nf_id, v_nf.status_sefaz
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_qtd_itens FROM public.notas_fiscais_itens WHERE nota_fiscal_id = p_nf_id;
  IF v_qtd_itens = 0 THEN
    RAISE EXCEPTION 'NF % sem itens — adicione produtos antes de confirmar', p_nf_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.nf_internal_op','1',true);

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
    v_fornecedor_id := CASE WHEN v_nf.tipo = 'entrada' THEN v_nf.fornecedor_id ELSE NULL END;
    v_cliente_id    := CASE WHEN v_nf.tipo = 'saida'   THEN v_nf.cliente_id    ELSE NULL END;

    IF v_nf.condicao_pagamento = 'a_vista' THEN
      INSERT INTO public.financeiro_lancamentos
        (tipo, descricao, valor, valor_pago, saldo_restante,
         data_emissao, data_vencimento, status,
         fornecedor_id, cliente_id, nota_fiscal_id, forma_pagamento, origem_tipo, empresa_id)
      VALUES
        (v_tipo_fin, 'NF ' || v_nf.numero,
         v_nf.valor_total, 0, v_nf.valor_total,
         v_data_base, v_data_base, 'aberto',
         v_fornecedor_id, v_cliente_id, p_nf_id, v_nf.forma_pagamento, 'fiscal_nota', v_nf.empresa_id);

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
           COALESCE((v_parcela->>'vencimento')::date, v_data_base + (v_intervalo * i)),
           'aberto',
           v_fornecedor_id, v_cliente_id, p_nf_id, v_nf.forma_pagamento,
           COALESCE((v_parcela->>'numero')::int, i), v_qtd_parcelas, 'fiscal_nota', v_nf.empresa_id);
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
         v_fornecedor_id, v_cliente_id, p_nf_id, v_nf.forma_pagamento, 'fiscal_nota', v_nf.empresa_id);
    END IF;
  END IF;

  INSERT INTO public.nota_fiscal_eventos (nota_fiscal_id, tipo_evento, status_anterior, status_novo, descricao, usuario_id)
  VALUES (p_nf_id, 'confirmacao', v_nf.status, 'confirmada', 'NF confirmada com impacto operacional', auth.uid());

  PERFORM set_config('app.nf_internal_op','',true);
END;
$function$;

-- BK-02: cancelar_nota_fiscal_sefaz — gate de permissão
CREATE OR REPLACE FUNCTION public.cancelar_nota_fiscal_sefaz(p_nf_id uuid, p_protocolo text, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nf public.notas_fiscais%ROWTYPE;
  v_lanc record;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_fiscal_permission('cancelar_sefaz') OR public.has_fiscal_permission('admin_fiscal')) THEN
    RAISE EXCEPTION 'Permissão negada: cancelamento SEFAZ requer faturamento_fiscal:cancelar_sefaz ou :admin_fiscal.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 15 THEN
    RAISE EXCEPTION 'Motivo de cancelamento SEFAZ exige mínimo 15 caracteres.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('nf:'||p_nf_id::text));
  SELECT * INTO v_nf FROM public.notas_fiscais WHERE id=p_nf_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NF % não encontrada.', p_nf_id;
  END IF;
  IF v_nf.status_sefaz <> 'autorizada' THEN
    RAISE EXCEPTION 'Cancelamento SEFAZ só permitido em NFs autorizadas (atual=%).', v_nf.status_sefaz;
  END IF;

  PERFORM set_config('app.nf_internal_op','1',true);

  IF COALESCE(v_nf.movimenta_estoque,false)
     AND v_nf.status = 'confirmada' THEN
    INSERT INTO public.estoque_movimentos (produto_id, tipo, quantidade, documento_tipo, documento_id, motivo, usuario_id)
    SELECT i.produto_id,
           CASE WHEN v_nf.tipo='saida' THEN 'entrada' ELSE 'saida' END,
           i.quantidade,
           'fiscal_estorno', v_nf.id,
           'Cancelamento SEFAZ NF '||COALESCE(v_nf.numero,v_nf.id::text),
           auth.uid()
      FROM public.notas_fiscais_itens i
     WHERE i.nota_fiscal_id = v_nf.id
       AND NOT EXISTS (
         SELECT 1 FROM public.estoque_movimentos m
          WHERE m.documento_tipo='fiscal_estorno' AND m.documento_id=v_nf.id AND m.produto_id=i.produto_id
       );
  END IF;

  IF v_nf.status = 'confirmada' THEN
    FOR v_lanc IN
      SELECT id FROM public.financeiro_lancamentos
       WHERE nota_fiscal_id = v_nf.id AND status NOT IN ('cancelado')
    LOOP
      BEGIN
        PERFORM public.financeiro_cancelar_lancamento(
          v_lanc.id,
          'Cancelamento SEFAZ NF '||COALESCE(v_nf.numero,'')||' — '||p_motivo
        );
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.auditoria_logs (acao, tabela, registro_id, usuario_id, dados_novos)
        VALUES ('cancelar_nf_sefaz_lancamento_bloqueado','financeiro_lancamentos', v_lanc.id, auth.uid(),
                jsonb_build_object('motivo', SQLERRM, 'nf_id', v_nf.id));
      END;
    END LOOP;
  END IF;

  UPDATE public.notas_fiscais
     SET status_sefaz='cancelada_sefaz',
         protocolo_autorizacao = COALESCE(p_protocolo, protocolo_autorizacao),
         updated_at = now()
   WHERE id = p_nf_id;

  INSERT INTO public.nota_fiscal_eventos (nota_fiscal_id, tipo_evento, status_novo, descricao, payload_resumido, usuario_id)
  VALUES (p_nf_id,'cancelamento_sefaz','cancelada_sefaz', p_motivo,
          jsonb_build_object('protocolo', p_protocolo, 'estorno_aplicado', v_nf.status='confirmada'), auth.uid());

  INSERT INTO public.auditoria_logs (acao, tabela, registro_id, usuario_id, dados_novos)
  VALUES ('cancelar_nf_sefaz','notas_fiscais', p_nf_id, auth.uid(),
          jsonb_build_object('motivo', p_motivo, 'protocolo', p_protocolo, 'estorno_aplicado', v_nf.status='confirmada'));

  PERFORM set_config('app.nf_internal_op','',true);
END;
$function$;

-- BK-03: gerar_devolucao_nota_fiscal — gate de permissão
CREATE OR REPLACE FUNCTION public.gerar_devolucao_nota_fiscal(p_nf_origem_id uuid, p_itens jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_origem public.notas_fiscais%ROWTYPE;
  v_nova_id uuid;
  v_item jsonb;
  v_qtd_origem numeric;
  v_qtd_devolvida numeric;
  v_qtd_solicitada numeric;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_fiscal_permission('criar') OR public.has_fiscal_permission('editar')) THEN
    RAISE EXCEPTION 'Permissão negada: gerar devolução requer faturamento_fiscal:criar ou :editar.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_origem FROM public.notas_fiscais WHERE id=p_nf_origem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NF origem % não encontrada.', p_nf_origem_id;
  END IF;
  IF v_origem.status <> 'confirmada' THEN
    RAISE EXCEPTION 'NF origem deve estar confirmada (status atual=%).', v_origem.status;
  END IF;

  IF p_itens IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
      SELECT COALESCE(SUM(quantidade),0) INTO v_qtd_origem
        FROM public.notas_fiscais_itens
       WHERE nota_fiscal_id = p_nf_origem_id
         AND produto_id = (v_item->>'produto_id')::uuid;

      SELECT COALESCE(SUM(nfi.quantidade),0) INTO v_qtd_devolvida
        FROM public.notas_fiscais_itens nfi
        JOIN public.notas_fiscais nf ON nf.id = nfi.nota_fiscal_id
       WHERE nf.nf_referenciada_id = p_nf_origem_id
         AND nf.tipo_operacao = 'devolucao'
         AND nf.status <> 'cancelada'
         AND nfi.produto_id = (v_item->>'produto_id')::uuid;

      v_qtd_solicitada := (v_item->>'quantidade')::numeric;

      IF v_qtd_devolvida + v_qtd_solicitada > v_qtd_origem THEN
        RAISE EXCEPTION 'Quantidade devolvida (% + % solicitada) excede a NF origem (%) para produto %.',
          v_qtd_devolvida, v_qtd_solicitada, v_qtd_origem, v_item->>'produto_id';
      END IF;
    END LOOP;
  END IF;

  PERFORM set_config('app.nf_internal_op','1',true);

  INSERT INTO public.notas_fiscais
    (tipo, tipo_operacao, nf_referenciada_id, cliente_id, fornecedor_id,
     ordem_venda_id, status, status_sefaz, origem,
     valor_total, modelo_documento, serie, data_emissao,
     movimenta_estoque, gera_financeiro, observacoes)
  VALUES (
     CASE WHEN v_origem.tipo='saida' THEN 'entrada' ELSE 'saida' END,
     'devolucao', v_origem.id,
     v_origem.cliente_id, v_origem.fornecedor_id,
     v_origem.ordem_venda_id, 'rascunho','nao_enviada','devolucao',
     0, v_origem.modelo_documento, v_origem.serie, CURRENT_DATE,
     true, true, 'Devolução referente à NF '||COALESCE(v_origem.numero,'')
  )
  RETURNING id INTO v_nova_id;

  IF p_itens IS NOT NULL THEN
    INSERT INTO public.notas_fiscais_itens (nota_fiscal_id, produto_id, quantidade, valor_unitario)
    SELECT v_nova_id,
           (item->>'produto_id')::uuid,
           (item->>'quantidade')::numeric,
           COALESCE((item->>'valor_unitario')::numeric, 0)
      FROM jsonb_array_elements(p_itens) AS item;
  ELSE
    INSERT INTO public.notas_fiscais_itens (nota_fiscal_id, produto_id, quantidade, valor_unitario)
    SELECT v_nova_id, produto_id, quantidade, valor_unitario
      FROM public.notas_fiscais_itens WHERE nota_fiscal_id = p_nf_origem_id;
  END IF;

  UPDATE public.notas_fiscais
     SET valor_total = COALESCE((SELECT SUM(quantidade*valor_unitario) FROM public.notas_fiscais_itens WHERE nota_fiscal_id=v_nova_id),0)
   WHERE id = v_nova_id;

  INSERT INTO public.nota_fiscal_eventos (nota_fiscal_id, tipo_evento, status_novo, descricao, usuario_id)
  VALUES (v_nova_id,'criacao_devolucao','rascunho','Devolução gerada a partir da NF '||COALESCE(v_origem.numero,''), auth.uid());

  INSERT INTO public.auditoria_logs (acao, tabela, registro_id, usuario_id, dados_novos)
  VALUES ('gerar_devolucao','notas_fiscais', v_nova_id, auth.uid(), jsonb_build_object('nf_origem', p_nf_origem_id));

  PERFORM set_config('app.nf_internal_op','',true);
  RETURN v_nova_id;
END;
$function$;

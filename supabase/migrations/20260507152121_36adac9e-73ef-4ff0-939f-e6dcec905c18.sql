-- ── confirmar_nota_fiscal: guards de status_sefaz e parceiro por tipo ──
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
  PERFORM pg_advisory_xact_lock(hashtext('nf:'||p_nf_id::text));

  SELECT * INTO v_nf FROM public.notas_fiscais WHERE id = p_nf_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NF % não encontrada', p_nf_id; END IF;

  IF v_nf.status NOT IN ('pendente','rascunho') THEN
    RAISE EXCEPTION 'NF % já está em status % e não pode ser confirmada', p_nf_id, v_nf.status;
  END IF;

  -- Sprint 7.1 P0: bloqueia confirmação se SEFAZ já rejeitou/denegou/cancelou.
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

  -- Estoque (idempotente)
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

  -- Financeiro (idempotente, parceiro correto por tipo)
  IF v_nf.gera_financeiro
     AND NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos WHERE nota_fiscal_id = p_nf_id) THEN
    v_tipo_fin := CASE WHEN v_nf.tipo = 'entrada' THEN 'pagar' ELSE 'receber' END;
    v_data_base := COALESCE(v_nf.data_emissao, CURRENT_DATE);

    -- Sprint 7.1 P0: zera o parceiro do lado oposto para evitar contas espúrias.
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

-- ── cancelar_nota_fiscal_sefaz: agora reverte estoque + financeiro ──
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

  -- Sprint 7.1 P0: estorna efeitos automaticamente (idempotente via NOT EXISTS).
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

-- ── índice composto para dashboards/listagens ──
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_empresa_status_emissao
  ON public.notas_fiscais (empresa_id, status, data_emissao DESC);

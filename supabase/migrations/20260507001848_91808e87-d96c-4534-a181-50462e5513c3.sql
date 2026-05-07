-- =========================================================================
-- CC-01/CC-03/DB-03: gerar_pedido_compra reforçada
-- =========================================================================
CREATE OR REPLACE FUNCTION public.gerar_pedido_compra(p_cotacao_id uuid, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cotacao RECORD;
  v_existing uuid; v_existing_numero text;
  v_numero text; v_pedido_id uuid; v_fornecedor_id uuid;
  v_valor_total numeric := 0; v_item RECORD; v_pendentes int;
  v_distinct_forn int;
  v_data_entrega_prev date;
BEGIN
  SELECT * INTO v_cotacao FROM public.cotacoes_compra WHERE id = p_cotacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cotação % não encontrada', p_cotacao_id; END IF;

  -- Idempotência
  SELECT id, numero INTO v_existing, v_existing_numero
    FROM public.pedidos_compra WHERE cotacao_compra_id = p_cotacao_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('pedido_id',v_existing,'pedido_numero',v_existing_numero,'idempotente',true);
  END IF;

  IF v_cotacao.status <> 'aprovada' THEN
    RAISE EXCEPTION 'Cotação deve estar aprovada (status atual: %)', v_cotacao.status;
  END IF;

  -- CA-03: bloqueia cotação vencida
  IF v_cotacao.data_validade IS NOT NULL AND v_cotacao.data_validade < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cotação vencida em %. Crie uma revisão antes de converter em pedido.', v_cotacao.data_validade;
  END IF;

  -- Itens com proposta válida
  SELECT COUNT(*) INTO v_pendentes FROM public.cotacoes_compra_itens i
    WHERE i.cotacao_compra_id = p_cotacao_id
      AND NOT EXISTS (SELECT 1 FROM public.cotacoes_compra_propostas p
        WHERE p.item_id = i.id AND p.selecionado = true AND COALESCE(p.preco_unitario,0) > 0);
  IF v_pendentes > 0 THEN RAISE EXCEPTION 'Existem % itens sem proposta selecionada válida', v_pendentes; END IF;

  -- CC-01: exige UM único fornecedor entre as propostas selecionadas
  SELECT COUNT(DISTINCT fornecedor_id) INTO v_distinct_forn
    FROM public.cotacoes_compra_propostas
   WHERE cotacao_compra_id = p_cotacao_id AND selecionado = true;
  IF v_distinct_forn = 0 THEN
    RAISE EXCEPTION 'Nenhuma proposta selecionada para gerar pedido';
  END IF;
  IF v_distinct_forn > 1 THEN
    RAISE EXCEPTION 'Propostas selecionadas pertencem a % fornecedores distintos. Selecione apenas um fornecedor para gerar o pedido.', v_distinct_forn;
  END IF;

  SELECT DISTINCT fornecedor_id INTO v_fornecedor_id FROM public.cotacoes_compra_propostas
    WHERE cotacao_compra_id = p_cotacao_id AND selecionado = true LIMIT 1;

  v_numero := public.proximo_numero_pedido_compra();
  v_data_entrega_prev := v_cotacao.data_validade;

  -- CC-03: cria como rascunho; o gate de aprovação é aplicado por solicitar_aprovacao_pedido
  INSERT INTO public.pedidos_compra (numero, fornecedor_id, data_pedido, data_entrega_prevista, valor_total, status, observacoes, cotacao_compra_id)
  VALUES (v_numero, v_fornecedor_id, CURRENT_DATE, v_data_entrega_prev, 0, 'rascunho',
          COALESCE(p_observacoes, v_cotacao.observacoes), p_cotacao_id) RETURNING id INTO v_pedido_id;

  FOR v_item IN
    SELECT i.id AS item_id, i.produto_id, i.quantidade, p.id AS proposta_id, COALESCE(p.preco_unitario,0) AS preco_unitario
      FROM public.cotacoes_compra_itens i
      JOIN public.cotacoes_compra_propostas p ON p.item_id = i.id AND p.selecionado = true
     WHERE i.cotacao_compra_id = p_cotacao_id
  LOOP
    INSERT INTO public.pedidos_compra_itens (pedido_compra_id, produto_id, quantidade, preco_unitario, subtotal, proposta_selecionada_id)
    VALUES (v_pedido_id, v_item.produto_id, v_item.quantidade, v_item.preco_unitario,
            v_item.preco_unitario * COALESCE(v_item.quantidade,0), v_item.proposta_id);
    v_valor_total := v_valor_total + v_item.preco_unitario * COALESCE(v_item.quantidade,0);
  END LOOP;

  UPDATE public.pedidos_compra SET valor_total = v_valor_total WHERE id = v_pedido_id;
  UPDATE public.cotacoes_compra SET status = 'convertida', updated_at = now() WHERE id = p_cotacao_id;

  -- Aplica gate de aprovação por valor (pode terminar em aprovado OU aguardando_aprovacao)
  PERFORM public.solicitar_aprovacao_pedido(v_pedido_id);

  INSERT INTO public.auditoria_logs (tabela, acao, registro_id, usuario_id, dados_novos)
  VALUES ('pedidos_compra','gerar_pedido_compra',v_pedido_id::text,auth.uid(),
          jsonb_build_object('cotacao_id',p_cotacao_id,'pedido_numero',v_numero,'valor_total',v_valor_total,'fornecedor_id',v_fornecedor_id));

  RETURN jsonb_build_object('pedido_id',v_pedido_id,'pedido_numero',v_numero,'valor_total',v_valor_total);
END; $function$;

-- =========================================================================
-- CA-05: estornar_recebimento_compra trava a linha do produto antes de ler saldo
-- =========================================================================
CREATE OR REPLACE FUNCTION public.estornar_recebimento_compra(p_compra_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_compra RECORD; v_pedido_id uuid; v_item RECORD; v_saldo_ant numeric;
  v_qtd_pedida numeric; v_qtd_recebida numeric; v_status text;
BEGIN
  SELECT * INTO v_compra FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra % não encontrada', p_compra_id; END IF;
  IF v_compra.status = 'cancelada' THEN RAISE EXCEPTION 'Compra já está cancelada'; END IF;

  v_pedido_id := v_compra.pedido_compra_id;
  IF v_pedido_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(v_pedido_id::text)); END IF;

  FOR v_item IN SELECT produto_id, quantidade FROM public.compras_itens WHERE compra_id = p_compra_id LOOP
    IF v_item.produto_id IS NOT NULL THEN
      -- CA-05: lock da linha do produto antes de ler estoque_atual
      SELECT COALESCE(estoque_atual,0) INTO v_saldo_ant FROM public.produtos WHERE id = v_item.produto_id FOR UPDATE;
      INSERT INTO public.estoque_movimentos (produto_id, tipo, quantidade, saldo_anterior, saldo_atual, documento_id, documento_tipo, motivo)
      VALUES (v_item.produto_id, 'saida', v_item.quantidade, v_saldo_ant, v_saldo_ant - v_item.quantidade,
              p_compra_id, 'compra', COALESCE('Estorno: ' || p_motivo, 'Estorno de recebimento'));
      IF v_pedido_id IS NOT NULL THEN
        UPDATE public.pedidos_compra_itens
           SET quantidade_recebida = GREATEST(COALESCE(quantidade_recebida,0) - v_item.quantidade, 0)
         WHERE pedido_compra_id = v_pedido_id AND produto_id = v_item.produto_id;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.compras SET status = 'cancelada',
         observacoes = COALESCE(observacoes,'') || CASE WHEN p_motivo IS NOT NULL THEN E'\n[ESTORNO] ' || p_motivo ELSE '' END,
         updated_at = now() WHERE id = p_compra_id;

  IF v_pedido_id IS NOT NULL THEN
    SELECT COALESCE(SUM(quantidade),0), COALESCE(SUM(quantidade_recebida),0)
      INTO v_qtd_pedida, v_qtd_recebida
      FROM public.pedidos_compra_itens WHERE pedido_compra_id = v_pedido_id;
    IF v_qtd_recebida <= 0 THEN v_status := 'aprovado';
    ELSIF v_qtd_recebida >= v_qtd_pedida THEN v_status := 'recebido';
    ELSE v_status := 'parcialmente_recebido'; END IF;
    UPDATE public.pedidos_compra SET status = v_status, updated_at = now() WHERE id = v_pedido_id;
  END IF;

  INSERT INTO public.auditoria_logs (tabela, acao, registro_id, usuario_id, dados_novos)
  VALUES ('compras','estornar_recebimento_compra',p_compra_id::text,auth.uid(),
          jsonb_build_object('motivo',p_motivo,'pedido_id',v_pedido_id,'status_pedido',v_status));

  RETURN jsonb_build_object('compra_id',p_compra_id,'pedido_id',v_pedido_id,'status_pedido',v_status);
END; $function$;

-- =========================================================================
-- DB-01: UNIQUE em numero (cotação e pedido)
-- =========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS ux_cotacoes_compra_numero ON public.cotacoes_compra (numero);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pedidos_compra_numero ON public.pedidos_compra (numero);

-- =========================================================================
-- DB-04: UNIQUE proposta por (cotacao, item, fornecedor)
-- =========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS ux_cotacoes_compra_propostas_unique
  ON public.cotacoes_compra_propostas (cotacao_compra_id, item_id, fornecedor_id);

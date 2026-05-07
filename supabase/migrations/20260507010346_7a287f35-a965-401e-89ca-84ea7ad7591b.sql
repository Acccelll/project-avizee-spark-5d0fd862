-- Relaxa a obrigatoriedade de motivo_estruturado em ajustes críticos de estoque.
CREATE OR REPLACE FUNCTION public.fn_estoque_mov_validacao_manual()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.documento_tipo = 'manual' THEN
    IF NEW.tipo IN ('ajuste','perda_avaria','inventario') THEN
      IF NEW.categoria_ajuste IS NULL THEN
        RAISE EXCEPTION 'Movimentação crítica (%) requer categoria_ajuste', NEW.tipo;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ajustar_estoque_manual(
  p_produto_id uuid, p_tipo text, p_quantidade numeric,
  p_motivo text DEFAULT NULL, p_categoria_ajuste text DEFAULT NULL, p_motivo_estruturado text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_saldo_anterior numeric; v_saldo_atual numeric; v_quantidade_mov numeric;
  v_user uuid := auth.uid(); v_mov_id uuid;
  v_critico boolean := p_tipo IN ('ajuste','perda_avaria','inventario');
BEGIN
  IF v_critico THEN
    IF NOT (public.has_role(v_user,'admin') OR public.has_role(v_user,'estoquista')) THEN
      RAISE EXCEPTION 'Permissão negada: ajustes críticos requerem role admin ou estoquista';
    END IF;
    IF p_categoria_ajuste IS NULL THEN
      RAISE EXCEPTION 'Ajustes críticos requerem categoria_ajuste';
    END IF;
  END IF;
  SELECT COALESCE(estoque_atual,0) INTO v_saldo_anterior FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
  IF p_tipo = 'entrada' THEN v_quantidade_mov := abs(p_quantidade); v_saldo_atual := v_saldo_anterior + v_quantidade_mov;
  ELSIF p_tipo IN ('saida','perda_avaria') THEN v_quantidade_mov := -abs(p_quantidade); v_saldo_atual := v_saldo_anterior + v_quantidade_mov;
  ELSIF p_tipo IN ('ajuste','inventario') THEN v_quantidade_mov := p_quantidade - v_saldo_anterior; v_saldo_atual := p_quantidade;
  ELSE RAISE EXCEPTION 'Tipo % não suportado', p_tipo; END IF;
  INSERT INTO public.estoque_movimentos (produto_id, tipo, quantidade, saldo_anterior, saldo_atual, motivo, documento_tipo, usuario_id, categoria_ajuste, motivo_estruturado)
  VALUES (p_produto_id, p_tipo, v_quantidade_mov, v_saldo_anterior, v_saldo_atual, p_motivo, 'manual', v_user, p_categoria_ajuste, p_motivo_estruturado)
  RETURNING id INTO v_mov_id;
  UPDATE public.produtos SET estoque_atual = v_saldo_atual, updated_at = now() WHERE id = p_produto_id;
  IF v_critico THEN
    INSERT INTO public.auditoria_logs (acao, tabela, registro_id, usuario_id, dados_novos)
    VALUES ('ajuste_critico','estoque_movimentos', v_mov_id, v_user,
      jsonb_build_object('produto_id',p_produto_id,'tipo',p_tipo,'quantidade',p_quantidade,'categoria',p_categoria_ajuste,'motivo',p_motivo_estruturado));
  END IF;
  RETURN v_mov_id;
END;
$$;

-- Bloco 3 — DB-06: index para timeline de eventos de remessa.
CREATE INDEX IF NOT EXISTS idx_remessa_eventos_remessa_data
  ON public.remessa_eventos (remessa_id, data_hora DESC);
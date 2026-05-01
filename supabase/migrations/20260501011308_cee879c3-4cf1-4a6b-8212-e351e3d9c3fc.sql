
-- =========================================================================
-- RPC: scan_dups_lancamentos -> popula audit_dups_lancamentos
-- =========================================================================
CREATE OR REPLACE FUNCTION public.scan_dups_lancamentos()
RETURNS TABLE(grupos_inseridos integer, claros integer, revisao_manual integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_claros integer := 0;
  v_revisao integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem executar a auditoria de duplicidades';
  END IF;

  -- Limpa pendentes anteriores para reescanear (mantém registros já resolvidos)
  DELETE FROM public.audit_dups_lancamentos WHERE status = 'pendente';

  WITH grupos AS (
    SELECT
      md5(
        coalesce(tipo,'') || '|' ||
        coalesce(fornecedor_id::text,'') || '|' ||
        coalesce(cliente_id::text,'') || '|' ||
        valor::text || '|' ||
        data_vencimento::text || '|' ||
        coalesce(parcela_numero::text,'0') || '|' ||
        coalesce(nota_fiscal_id::text, pedido_compra_id::text, origem_id::text, '')
      ) as grupo_hash,
      tipo,
      fornecedor_id,
      cliente_id,
      valor,
      data_vencimento,
      parcela_numero,
      coalesce(nota_fiscal_id::text, pedido_compra_id::text, origem_id::text) as origem_ref,
      array_agg(id ORDER BY created_at) as ids,
      array_agg(id ORDER BY created_at) FILTER (WHERE status IN ('pago','parcial')) as ids_baixados,
      count(*) as qtd
    FROM public.financeiro_lancamentos
    WHERE ativo = true
      AND (fornecedor_id IS NOT NULL OR cliente_id IS NOT NULL)
    GROUP BY 1,2,3,4,5,6,7,8
    HAVING count(*) > 1
  )
  INSERT INTO public.audit_dups_lancamentos (
    grupo_hash, tipo, fornecedor_id, cliente_id, valor, data_vencimento,
    parcela_numero, origem_ref, ids, ids_baixados, ids_a_remover, classificacao, status
  )
  SELECT
    g.grupo_hash, g.tipo, g.fornecedor_id, g.cliente_id, g.valor, g.data_vencimento,
    g.parcela_numero, g.origem_ref,
    g.ids,
    coalesce(g.ids_baixados, '{}'::uuid[]),
    -- ids a remover: se há 1 baixado, remover os não-baixados; se nenhum baixado, manter o mais antigo
    CASE
      WHEN coalesce(array_length(g.ids_baixados,1),0) = 1 THEN
        (SELECT array_agg(x) FROM unnest(g.ids) x WHERE x <> g.ids_baixados[1])
      WHEN coalesce(array_length(g.ids_baixados,1),0) = 0 THEN
        (SELECT array_agg(x) FROM unnest(g.ids) WITH ORDINALITY t(x,o) WHERE o > 1)
      ELSE '{}'::uuid[]
    END,
    CASE
      WHEN coalesce(array_length(g.ids_baixados,1),0) >= 2 THEN 'manual_review'
      WHEN g.origem_ref IS NULL THEN 'manual_review' -- sem origem fiscal: revisar manual
      ELSE 'clara'
    END,
    'pendente'
  FROM grupos g;

  GET DIAGNOSTICS v_total = ROW_COUNT;

  SELECT count(*) INTO v_claros FROM public.audit_dups_lancamentos
    WHERE status = 'pendente' AND classificacao = 'clara';
  SELECT count(*) INTO v_revisao FROM public.audit_dups_lancamentos
    WHERE status = 'pendente' AND classificacao = 'manual_review';

  RETURN QUERY SELECT v_total, v_claros, v_revisao;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_dups_lancamentos() FROM public;
GRANT EXECUTE ON FUNCTION public.scan_dups_lancamentos() TO authenticated;

-- =========================================================================
-- RPC: purge_dups_confirmado(audit_id) -> remove definitivamente o grupo
-- =========================================================================
CREATE OR REPLACE FUNCTION public.purge_dups_confirmado(p_audit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit public.audit_dups_lancamentos;
  v_removidos integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem confirmar a remoção';
  END IF;

  SELECT * INTO v_audit FROM public.audit_dups_lancamentos WHERE id = p_audit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro de auditoria não encontrado'; END IF;
  IF v_audit.status <> 'pendente' THEN
    RAISE EXCEPTION 'Este grupo já foi resolvido (status=%)', v_audit.status;
  END IF;
  IF coalesce(array_length(v_audit.ids_a_remover,1),0) = 0 THEN
    RAISE EXCEPTION 'Nenhum lançamento marcado para remoção neste grupo';
  END IF;

  -- Segurança extra: nunca remover lançamentos baixados
  DELETE FROM public.financeiro_lancamentos
  WHERE id = ANY(v_audit.ids_a_remover)
    AND status NOT IN ('pago','parcial');

  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  UPDATE public.audit_dups_lancamentos
  SET status = 'removido',
      resolved_at = now(),
      resolved_by = auth.uid(),
      motivo = coalesce(motivo,'') || format(' [purge: %s removidos em %s]', v_removidos, now())
  WHERE id = p_audit_id;

  RETURN v_removidos;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_dups_confirmado(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_dups_confirmado(uuid) TO authenticated;

-- =========================================================================
-- RPC: marcar_dup_como_mantido(audit_id, motivo) -> não é duplicidade real
-- =========================================================================
CREATE OR REPLACE FUNCTION public.marcar_dup_como_mantido(p_audit_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  UPDATE public.audit_dups_lancamentos
  SET status = 'mantido',
      resolved_at = now(),
      resolved_by = auth.uid(),
      motivo = p_motivo
  WHERE id = p_audit_id AND status = 'pendente';

  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado ou já resolvido'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_dup_como_mantido(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.marcar_dup_como_mantido(uuid, text) TO authenticated;

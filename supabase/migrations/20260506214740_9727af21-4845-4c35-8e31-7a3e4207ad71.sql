-- C-03/B-04: Restringe ação pública do cliente a orçamentos em 'pendente'.
-- Rascunho não deve ser aprovável via link público (não foi enviado ainda).

CREATE OR REPLACE FUNCTION public.acao_cliente_orcamento(p_token uuid, p_acao text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orc public.orcamentos%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_acao NOT IN ('aprovado','rejeitado') THEN
    RAISE EXCEPTION 'Ação inválida: %', p_acao USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_orc
  FROM public.orcamentos
  WHERE public_token = p_token
    AND COALESCE(ativo, true) = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Apenas orçamentos efetivamente enviados (status pendente) podem ser
  -- respondidos pelo cliente. Rascunhos seguem ocultos do fluxo público.
  IF v_orc.status <> 'pendente' THEN
    RAISE EXCEPTION 'Orçamento no status "%" não permite esta ação', v_orc.status USING ERRCODE = 'P0001';
  END IF;

  IF v_orc.validade IS NOT NULL AND v_orc.validade < CURRENT_DATE THEN
    RAISE EXCEPTION 'Orçamento expirado' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.orcamentos
     SET status = p_acao,
         updated_at = v_now
   WHERE id = v_orc.id;

  INSERT INTO public.auditoria_logs (tabela, acao, registro_id, usuario_id, dados_anteriores, dados_novos)
  VALUES (
    'orcamentos',
    'cliente_publico_' || p_acao,
    v_orc.id,
    NULL,
    jsonb_build_object('status', v_orc.status),
    jsonb_build_object('status', p_acao, 'origem', 'cliente_publico')
  );

  RETURN jsonb_build_object('id', v_orc.id, 'status', p_acao);
END;
$$;

REVOKE ALL ON FUNCTION public.acao_cliente_orcamento(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.acao_cliente_orcamento(uuid, text) TO anon, authenticated;

-- B-05: índice para lookup do pedido vinculado ao orçamento (linkedOV).
CREATE INDEX IF NOT EXISTS idx_ordens_venda_cotacao_id
  ON public.ordens_venda (cotacao_id)
  WHERE cotacao_id IS NOT NULL;

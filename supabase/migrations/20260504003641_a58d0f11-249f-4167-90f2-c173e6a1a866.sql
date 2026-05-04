
CREATE OR REPLACE FUNCTION public.hard_delete_record(p_table text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_user, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem executar exclusão definitiva.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.hard_delete', 'on', true);

  CASE p_table
    WHEN 'financeiro_lancamentos' THEN
      DELETE FROM public.financeiro_baixas WHERE lancamento_id = p_id;
      DELETE FROM public.conciliacao_pares WHERE lancamento_id = p_id;
      UPDATE public.nfe_distribuicao SET financeiro_lancamento_id = NULL WHERE financeiro_lancamento_id = p_id;
      UPDATE public.socios_retiradas SET financeiro_lancamento_id = NULL WHERE financeiro_lancamento_id = p_id;
      DELETE FROM public.financeiro_lancamentos WHERE documento_pai_id = p_id;
      DELETE FROM public.financeiro_lancamentos WHERE id = p_id;

    WHEN 'notas_fiscais' THEN
      DELETE FROM public.notas_fiscais_itens WHERE nota_fiscal_id = p_id;
      DELETE FROM public.nota_fiscal_eventos WHERE nota_fiscal_id = p_id;
      DELETE FROM public.nota_fiscal_anexos WHERE nota_fiscal_id = p_id;
      DELETE FROM public.eventos_fiscais WHERE nota_fiscal_id = p_id;
      DELETE FROM public.financeiro_baixas
        WHERE lancamento_id IN (SELECT id FROM public.financeiro_lancamentos WHERE nota_fiscal_id = p_id);
      DELETE FROM public.financeiro_lancamentos WHERE nota_fiscal_id = p_id;
      UPDATE public.remessas SET nota_fiscal_id = NULL WHERE nota_fiscal_id = p_id;
      UPDATE public.notas_fiscais SET nf_referenciada_id = NULL WHERE nf_referenciada_id = p_id;
      DELETE FROM public.recebimentos_compra WHERE nota_fiscal_id = p_id;
      DELETE FROM public.notas_fiscais WHERE id = p_id;

    WHEN 'orcamentos' THEN
      DELETE FROM public.orcamentos_itens WHERE orcamento_id = p_id;
      UPDATE public.orcamentos SET orcamento_pai_id = NULL WHERE orcamento_pai_id = p_id;
      DELETE FROM public.orcamentos WHERE id = p_id;

    WHEN 'clientes' THEN
      DELETE FROM public.clientes WHERE id = p_id;

    WHEN 'fornecedores' THEN
      DELETE FROM public.fornecedores WHERE id = p_id;

    WHEN 'produtos' THEN
      DELETE FROM public.produtos_fornecedores WHERE produto_id = p_id;
      DELETE FROM public.produto_composicoes WHERE produto_pai_id = p_id OR produto_filho_id = p_id;
      DELETE FROM public.produto_identificadores_legacy WHERE produto_id = p_id;
      DELETE FROM public.precos_especiais WHERE produto_id = p_id;
      DELETE FROM public.produtos WHERE id = p_id;

    WHEN 'funcionarios' THEN
      DELETE FROM public.funcionarios WHERE id = p_id;

    WHEN 'transportadoras' THEN
      DELETE FROM public.cliente_transportadoras WHERE transportadora_id = p_id;
      DELETE FROM public.transportadoras WHERE id = p_id;

    WHEN 'formas_pagamento' THEN
      DELETE FROM public.formas_pagamento WHERE id = p_id;

    WHEN 'grupos_economicos' THEN
      UPDATE public.clientes SET grupo_economico_id = NULL WHERE grupo_economico_id = p_id;
      DELETE FROM public.grupos_economicos WHERE id = p_id;

    WHEN 'cartoes_credito' THEN
      DELETE FROM public.cartao_faturas WHERE cartao_id = p_id;
      UPDATE public.financeiro_lancamentos SET cartao_id = NULL WHERE cartao_id = p_id;
      UPDATE public.notas_fiscais SET cartao_id = NULL WHERE cartao_id = p_id;
      DELETE FROM public.cartoes_credito WHERE id = p_id;

    WHEN 'bancos' THEN
      DELETE FROM public.contas_bancarias WHERE banco_id = p_id;
      DELETE FROM public.cartoes_credito WHERE banco_id = p_id;
      DELETE FROM public.bancos WHERE id = p_id;

    ELSE
      RAISE EXCEPTION 'Tabela % não suportada para exclusão definitiva.', p_table
        USING ERRCODE = '22023';
  END CASE;

  BEGIN
    INSERT INTO public.audit_log (user_id, acao, tabela, registro_id, payload)
    VALUES (v_user, 'hard_delete', p_table, p_id, jsonb_build_object('via','hard_delete_record'));
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_record(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hard_delete_record(text, uuid) TO authenticated;

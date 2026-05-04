
DO $cleanup$
DECLARE
  v_nf_id uuid;
  v_ov_id uuid;
BEGIN
  PERFORM set_config('app.hard_delete', 'on', true);

  DELETE FROM public.financeiro_baixas
    WHERE lancamento_id IN (SELECT id FROM public.financeiro_lancamentos WHERE status='cancelado');
  DELETE FROM public.financeiro_lancamentos WHERE status='cancelado';

  FOR v_ov_id IN SELECT id FROM public.ordens_venda
                 WHERE cotacao_id='0d67e92c-61cb-4385-a864-099ce5bca8f6' LOOP
    FOR v_nf_id IN SELECT id FROM public.notas_fiscais WHERE ordem_venda_id = v_ov_id LOOP
      DELETE FROM public.financeiro_baixas
        WHERE lancamento_id IN (SELECT id FROM public.financeiro_lancamentos WHERE nota_fiscal_id = v_nf_id);
      DELETE FROM public.financeiro_lancamentos WHERE nota_fiscal_id = v_nf_id;
      DELETE FROM public.notas_fiscais_itens WHERE nota_fiscal_id = v_nf_id;
      DELETE FROM public.nota_fiscal_eventos WHERE nota_fiscal_id = v_nf_id;
      DELETE FROM public.nota_fiscal_anexos WHERE nota_fiscal_id = v_nf_id;
      DELETE FROM public.notas_fiscais WHERE id = v_nf_id;
    END LOOP;
    DELETE FROM public.ordens_venda_itens WHERE ordem_venda_id = v_ov_id;
    DELETE FROM public.ordens_venda WHERE id = v_ov_id;
  END LOOP;

  DELETE FROM public.orcamentos_itens WHERE orcamento_id='0d67e92c-61cb-4385-a864-099ce5bca8f6';
  DELETE FROM public.orcamentos WHERE id='0d67e92c-61cb-4385-a864-099ce5bca8f6';
END
$cleanup$;

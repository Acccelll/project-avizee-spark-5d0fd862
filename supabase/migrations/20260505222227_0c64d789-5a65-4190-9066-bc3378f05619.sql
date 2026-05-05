
CREATE OR REPLACE FUNCTION public.consolidar_produto(p_origem uuid, p_destino uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sku_origem text;
  v_sku_destino text;
  v_nome_origem text;
  v_un_origem text;
BEGIN
  IF p_origem IS NULL OR p_destino IS NULL OR p_origem = p_destino THEN
    RAISE EXCEPTION 'consolidar_produto: origem/destino inválidos (%, %)', p_origem, p_destino;
  END IF;

  SELECT sku, nome, unidade_medida INTO v_sku_origem, v_nome_origem, v_un_origem
    FROM public.produtos WHERE id = p_origem;
  SELECT sku INTO v_sku_destino FROM public.produtos WHERE id = p_destino;
  IF v_sku_origem IS NULL OR v_sku_destino IS NULL THEN
    RAISE EXCEPTION 'consolidar_produto: produto inexistente (origem=%, destino=%)', p_origem, p_destino;
  END IF;

  -- snapshot
  INSERT INTO public.produto_migracao_backup (produto_id, snapshot)
  SELECT id, to_jsonb(p) FROM public.produtos p WHERE id = p_origem;

  -- alias documental (usa colunas reais da tabela)
  INSERT INTO public.produto_identificadores_legacy
    (produto_id, origem, codigo_legacy, descricao_legacy, unidade_legacy, match_tipo, ativo)
  VALUES
    (p_destino, 'migracao_v3', v_sku_origem, v_nome_origem, v_un_origem, 'sku_remap', true)
  ON CONFLICT DO NOTHING;

  -- remap FKs
  PERFORM public.remap_produto_fk(p_origem, p_destino);

  -- delete físico
  DELETE FROM public.produtos WHERE id = p_origem;

  INSERT INTO public.produto_migracao_log
    (sku_origem, sku_destino, produto_id_origem, produto_id_destino,
     acao, tabela_afetada, qtd_registros, status)
  VALUES (v_sku_origem, v_sku_destino, p_origem, p_destino,
          'excluir_origem', 'produtos', 1, 'aplicado');
END;
$$;

-- Limpa backups órfãos da tentativa anterior (não foram usados, produto continua existindo)
DELETE FROM public.produto_migracao_backup b
 WHERE EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = b.produto_id);


-- Função de consolidação completa: aplica staging + remapeia FKs + deleta duplicados
CREATE OR REPLACE FUNCTION public.executar_migracao_produtos(p_fase text DEFAULT 'dry_run')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_criados int := 0;
  v_atualizados int := 0;
  v_consolidados int := 0;
  v_abortados int := 0;
  v_pendentes int := 0;
  v_erros jsonb := '[]'::jsonb;
  r record;
  v_destino_id uuid;
  v_origem_id uuid;
  v_grupo_id uuid;
BEGIN
  IF p_fase NOT IN ('dry_run','aplicar_campos','consolidar','tudo') THEN
    RAISE EXCEPTION 'Fase inválida: %. Use dry_run | aplicar_campos | consolidar | tudo', p_fase;
  END IF;

  -- ─── FASE 1: Atualizar/criar produtos canônicos (campos não-fiscais) ──────
  IF p_fase IN ('aplicar_campos','tudo') THEN
    FOR r IN
      SELECT s.*
      FROM public.stg_produtos_atualizado s
      WHERE COALESCE(s.pendencia, false) = false
        AND s.sku_canonico IS NOT NULL
    LOOP
      -- Lookup grupo (cria 'OUTROS' se necessário)
      v_grupo_id := NULL;
      IF r.grupo_nome IS NOT NULL AND length(trim(r.grupo_nome)) > 0 THEN
        SELECT id INTO v_grupo_id FROM public.grupos_produto
         WHERE upper(trim(nome)) = upper(trim(r.grupo_nome)) LIMIT 1;
      END IF;

      SELECT id INTO v_destino_id FROM public.produtos
       WHERE upper(trim(sku)) = upper(trim(r.sku_canonico)) LIMIT 1;

      IF v_destino_id IS NULL THEN
        -- CRIAR
        INSERT INTO public.produtos (
          sku, nome, unidade_medida, preco_venda, preco_custo,
          estoque_atual, ativo, grupo_id
        ) VALUES (
          upper(trim(r.sku_canonico)),
          COALESCE(r.nome, r.sku_canonico),
          COALESCE(r.unidade, 'UN'),
          COALESCE(r.preco_venda, 0),
          COALESCE(r.preco_custo, 0),
          COALESCE(r.estoque, 0),
          COALESCE(r.status_ativo, true),
          v_grupo_id
        )
        RETURNING id INTO v_destino_id;
        v_criados := v_criados + 1;

        INSERT INTO public.produto_migracao_log
          (sku_origem, sku_destino, produto_id_destino, acao, tabela_afetada, qtd_registros, status)
        VALUES (NULL, r.sku_canonico, v_destino_id, 'criar', 'produtos', 1, 'ok');
      ELSE
        -- ATUALIZAR (apenas campos não-fiscais; preserva NCM/CFOP/CST/etc.)
        UPDATE public.produtos SET
          nome = COALESCE(NULLIF(r.nome,''), nome),
          unidade_medida = COALESCE(NULLIF(r.unidade,''), unidade_medida),
          preco_venda = COALESCE(r.preco_venda, preco_venda),
          preco_custo = COALESCE(r.preco_custo, preco_custo),
          ativo = COALESCE(r.status_ativo, ativo),
          grupo_id = COALESCE(v_grupo_id, grupo_id),
          updated_at = now()
        WHERE id = v_destino_id;
        v_atualizados := v_atualizados + 1;

        INSERT INTO public.produto_migracao_log
          (sku_destino, produto_id_destino, acao, tabela_afetada, qtd_registros, status)
        VALUES (r.sku_canonico, v_destino_id, 'atualizar', 'produtos', 1, 'ok');
      END IF;
    END LOOP;
  END IF;

  -- ─── FASE 2: Consolidar duplicados conforme mapa ─────────────────────────
  IF p_fase IN ('consolidar','tudo') THEN
    FOR r IN
      SELECT * FROM public.produto_migracao_mapa
       WHERE status = 'auto'
    LOOP
      v_origem_id := r.produto_id_origem;
      -- Resolve destino caso não tenha sido capturado ainda
      v_destino_id := r.produto_id_destino;
      IF v_destino_id IS NULL AND r.sku_destino IS NOT NULL THEN
        SELECT id INTO v_destino_id FROM public.produtos
         WHERE upper(trim(sku)) = upper(trim(r.sku_destino)) LIMIT 1;
      END IF;

      IF v_origem_id IS NULL OR v_destino_id IS NULL OR v_origem_id = v_destino_id THEN
        UPDATE public.produto_migracao_mapa
           SET status = 'pendente', motivo = COALESCE(motivo,'') || ' [destino não resolvido]'
         WHERE id = r.id;
        v_pendentes := v_pendentes + 1;
        CONTINUE;
      END IF;

      BEGIN
        PERFORM public.consolidar_produto(v_origem_id, v_destino_id);
        UPDATE public.produto_migracao_mapa SET status = 'aplicado' WHERE id = r.id;
        v_consolidados := v_consolidados + 1;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.produto_migracao_mapa
           SET status = 'abortado', motivo = COALESCE(motivo,'') || ' [erro: ' || SQLERRM || ']'
         WHERE id = r.id;
        v_abortados := v_abortados + 1;
        v_erros := v_erros || jsonb_build_object('origem', v_origem_id, 'destino', v_destino_id, 'erro', SQLERRM);
        INSERT INTO public.produto_migracao_log
          (produto_id_origem, produto_id_destino, acao, tabela_afetada, qtd_registros, status, erro)
        VALUES (v_origem_id, v_destino_id, 'consolidar', 'produtos', 0, 'erro', SQLERRM);
      END;
    END LOOP;
  END IF;

  -- ─── DRY-RUN: apenas conta o que seria feito ─────────────────────────────
  IF p_fase = 'dry_run' THEN
    SELECT count(*) INTO v_consolidados FROM public.produto_migracao_mapa WHERE status = 'auto';
    SELECT count(*) INTO v_pendentes FROM public.produto_migracao_mapa WHERE status = 'pendente';
    SELECT count(*) INTO v_atualizados
      FROM public.stg_produtos_atualizado s
      JOIN public.produtos p ON upper(trim(p.sku)) = upper(trim(s.sku_canonico))
      WHERE COALESCE(s.pendencia,false) = false;
    SELECT count(*) INTO v_criados
      FROM public.stg_produtos_atualizado s
      LEFT JOIN public.produtos p ON upper(trim(p.sku)) = upper(trim(s.sku_canonico))
      WHERE p.id IS NULL AND COALESCE(s.pendencia,false) = false AND s.sku_canonico IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'fase', p_fase,
    'criados', v_criados,
    'atualizados', v_atualizados,
    'consolidados', v_consolidados,
    'abortados', v_abortados,
    'pendentes', v_pendentes,
    'erros', v_erros,
    'executado_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.executar_migracao_produtos(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.executar_migracao_produtos(text) TO authenticated;

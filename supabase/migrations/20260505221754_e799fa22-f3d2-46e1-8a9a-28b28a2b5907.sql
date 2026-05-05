
CREATE OR REPLACE FUNCTION public.executar_migracao_produtos(p_fase text DEFAULT 'dry_run')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_destino_id uuid; v_origem_id uuid; v_grupo_id uuid;
  v_empresa_id uuid; v_ativo boolean;
  v_criados int := 0; v_atualizados int := 0;
  v_mant_ativos int := 0; v_mant_inativos int := 0;
  v_consolidados int := 0;
  v_abortados int := 0; v_pendentes int := 0;
  v_erros jsonb := '[]'::jsonb;
  v_igual text; v_sku text; v_status text;
BEGIN
  IF p_fase NOT IN ('dry_run','aplicar_nao_destrutivo','consolidar_e_excluir') THEN
    RAISE EXCEPTION 'Fase inválida: %', p_fase;
  END IF;

  SELECT empresa_id INTO v_empresa_id FROM public.produtos
   GROUP BY empresa_id ORDER BY count(*) DESC LIMIT 1;

  IF p_fase = 'dry_run' THEN
    TRUNCATE public.produto_migracao_mapa;
    DELETE FROM public.produto_migracao_log
     WHERE acao IN ('classificar','dry_run_resumo');

    UPDATE public.stg_produtos_atualizado SET classe = NULL, acao = NULL;

    FOR r IN SELECT ctid, * FROM public.stg_produtos_atualizado LOOP
      v_sku    := nullif(trim(coalesce(r.sku_canonico,'')),'');
      v_igual  := nullif(trim(coalesce(r.igual_sku,'')),'');
      v_status := lower(trim(coalesce(r.status,'true')));

      IF upper(coalesce(v_igual,'')) = 'OK' THEN
        IF v_status = 'true' THEN
          UPDATE public.stg_produtos_atualizado SET classe='OK_ativo',
                 acao = CASE WHEN v_sku IS NOT NULL AND EXISTS (SELECT 1 FROM produtos p WHERE upper(p.sku)=upper(v_sku))
                             THEN 'atualizar' ELSE 'criar' END
           WHERE ctid = r.ctid;
        ELSE
          UPDATE public.stg_produtos_atualizado SET classe='OK_inativo',
                 acao = CASE WHEN v_sku IS NOT NULL AND EXISTS (SELECT 1 FROM produtos p WHERE upper(p.sku)=upper(v_sku))
                             THEN 'manter_inativo' ELSE 'criar' END
           WHERE ctid = r.ctid;
        END IF;
        CONTINUE;
      END IF;

      IF v_status = 'excluir' THEN
        UPDATE public.stg_produtos_atualizado SET classe='status_excluir',
               acao = CASE WHEN v_sku IS NOT NULL AND EXISTS (SELECT 1 FROM produtos p WHERE upper(p.sku)=upper(v_sku))
                           THEN 'consolidar_e_excluir' ELSE 'pendente_manual' END
         WHERE ctid = r.ctid;
        CONTINUE;
      END IF;

      IF v_igual IS NOT NULL AND v_igual <> '-' AND upper(v_igual) <> 'OK' THEN
        UPDATE public.stg_produtos_atualizado SET classe='apontamento_canonico',
               acao = CASE
                 WHEN v_sku IS NULL THEN 'alias_pendente'
                 WHEN NOT EXISTS (SELECT 1 FROM produtos p WHERE upper(p.sku)=upper(v_sku)) THEN 'alias_pendente'
                 WHEN NOT EXISTS (SELECT 1 FROM produtos p WHERE upper(p.sku)=upper(v_igual)) THEN 'pendente_manual'
                 ELSE 'consolidar_e_excluir'
               END
         WHERE ctid = r.ctid;
        CONTINUE;
      END IF;

      UPDATE public.stg_produtos_atualizado SET classe='codigo_invalido_generico',
             acao = 'pendente_manual'
       WHERE ctid = r.ctid;
    END LOOP;

    -- popular mapa com DISTINCT ON (produto_id_origem) para evitar duplicatas
    INSERT INTO public.produto_migracao_mapa
      (sku_origem, produto_id_origem, sku_destino, produto_id_destino, motivo, status)
    SELECT DISTINCT ON (po.id)
      upper(s.sku_canonico), po.id, upper(s.igual_sku), pd.id,
      'classe=' || s.classe, 'auto'
    FROM public.stg_produtos_atualizado s
    JOIN public.produtos po ON upper(po.sku) = upper(s.sku_canonico)
    JOIN public.produtos pd ON upper(pd.sku) = upper(s.igual_sku)
    WHERE s.acao = 'consolidar_e_excluir' AND s.classe = 'apontamento_canonico'
      AND po.id <> pd.id;

    INSERT INTO public.produto_migracao_mapa
      (sku_origem, sku_destino, motivo, status)
    SELECT upper(coalesce(s.sku_canonico,'')), upper(coalesce(s.igual_sku,'')),
           'classe=' || coalesce(s.classe,'?') || ' / acao=' || coalesce(s.acao,'?'), 'pendente'
    FROM public.stg_produtos_atualizado s
    WHERE s.acao IN ('pendente_manual','alias_pendente');

    INSERT INTO public.produto_migracao_log (acao, tabela_afetada, qtd_registros, status)
    VALUES ('dry_run_resumo','stg_produtos_atualizado',
            (SELECT count(*) FROM stg_produtos_atualizado), 'ok');

    RETURN jsonb_build_object(
      'fase','dry_run',
      'total_linhas',(SELECT count(*) FROM stg_produtos_atualizado),
      'por_classe',(SELECT jsonb_object_agg(classe, c) FROM
        (SELECT coalesce(classe,'NULL') classe, count(*) c FROM stg_produtos_atualizado GROUP BY 1) t),
      'por_acao',(SELECT jsonb_object_agg(acao, c) FROM
        (SELECT coalesce(acao,'NULL') acao, count(*) c FROM stg_produtos_atualizado GROUP BY 1) t),
      'mapa_auto',(SELECT count(*) FROM produto_migracao_mapa WHERE status='auto'),
      'mapa_pendente',(SELECT count(*) FROM produto_migracao_mapa WHERE status='pendente'),
      'executado_em', now()
    );
  END IF;

  IF p_fase = 'aplicar_nao_destrutivo' THEN
    FOR r IN
      SELECT * FROM public.stg_produtos_atualizado
       WHERE classe IN ('OK_ativo','OK_inativo')
         AND nullif(trim(coalesce(sku_canonico,'')),'') IS NOT NULL
    LOOP
      v_grupo_id := NULL;
      IF r.grupo_nome IS NOT NULL AND length(trim(r.grupo_nome)) > 0 THEN
        SELECT id INTO v_grupo_id FROM public.grupos_produto
         WHERE upper(trim(nome)) = upper(trim(r.grupo_nome)) LIMIT 1;
      END IF;
      v_ativo := (r.classe = 'OK_ativo');

      SELECT id INTO v_destino_id FROM public.produtos
       WHERE upper(trim(sku)) = upper(trim(r.sku_canonico)) LIMIT 1;

      IF v_destino_id IS NULL THEN
        INSERT INTO public.produtos (sku, nome, unidade_medida, variacoes,
                                     preco_venda, preco_custo, estoque_atual,
                                     ativo, grupo_id, empresa_id)
        VALUES (
          upper(trim(r.sku_canonico)),
          coalesce(nullif(r.nome,''), r.sku_canonico),
          coalesce(nullif(r.un,''), 'UN'),
          nullif(r.variacoes,''),
          coalesce(r.preco_venda, 0), coalesce(r.preco_custo, 0),
          coalesce(r.estoque, 0), v_ativo, v_grupo_id, v_empresa_id
        ) RETURNING id INTO v_destino_id;
        v_criados := v_criados + 1;
      ELSE
        UPDATE public.produtos SET
          nome = coalesce(nullif(r.nome,''), nome),
          unidade_medida = coalesce(nullif(r.un,''), unidade_medida),
          variacoes = coalesce(nullif(r.variacoes,''), variacoes),
          preco_venda = coalesce(r.preco_venda, preco_venda),
          preco_custo = coalesce(r.preco_custo, preco_custo),
          ativo = v_ativo,
          grupo_id = coalesce(v_grupo_id, grupo_id),
          updated_at = now()
        WHERE id = v_destino_id;
        v_atualizados := v_atualizados + 1;
        IF v_ativo THEN v_mant_ativos := v_mant_ativos + 1;
        ELSE v_mant_inativos := v_mant_inativos + 1; END IF;
      END IF;
    END LOOP;
    RETURN jsonb_build_object('fase','aplicar_nao_destrutivo',
      'criados',v_criados,'atualizados',v_atualizados,
      'mantidos_ativos',v_mant_ativos,'mantidos_inativos',v_mant_inativos,
      'executado_em', now());
  END IF;

  IF p_fase = 'consolidar_e_excluir' THEN
    FOR r IN SELECT * FROM public.produto_migracao_mapa WHERE status='auto' LOOP
      v_origem_id := r.produto_id_origem;
      v_destino_id := r.produto_id_destino;
      IF v_origem_id IS NULL OR v_destino_id IS NULL OR v_origem_id = v_destino_id THEN
        UPDATE public.produto_migracao_mapa
           SET status='pendente', motivo = coalesce(motivo,'') || ' [destino não resolvido]'
         WHERE id = r.id;
        v_pendentes := v_pendentes + 1;
        CONTINUE;
      END IF;
      BEGIN
        PERFORM public.consolidar_produto(v_origem_id, v_destino_id);
        UPDATE public.produto_migracao_mapa SET status='aplicado' WHERE id = r.id;
        v_consolidados := v_consolidados + 1;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.produto_migracao_mapa
           SET status='abortado', motivo = coalesce(motivo,'') || ' [erro: ' || SQLERRM || ']'
         WHERE id = r.id;
        v_abortados := v_abortados + 1;
        v_erros := v_erros || jsonb_build_object('origem',v_origem_id,'destino',v_destino_id,'erro',SQLERRM);
      END;
    END LOOP;
    RETURN jsonb_build_object('fase','consolidar_e_excluir',
      'consolidados',v_consolidados,'abortados',v_abortados,'pendentes',v_pendentes,
      'erros',v_erros,'executado_em', now());
  END IF;

  RETURN jsonb_build_object('fase',p_fase,'status','noop');
END;
$$;

-- 1) Tabelas de auditoria
CREATE TABLE IF NOT EXISTS public.produto_migracao_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.produto_migracao_backup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin only" ON public.produto_migracao_backup;
CREATE POLICY "admin only" ON public.produto_migracao_backup FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.produto_migracao_mapa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_origem text,
  produto_id_origem uuid UNIQUE,
  sku_destino text,
  produto_id_destino uuid,
  motivo text,
  status text NOT NULL DEFAULT 'auto',
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.produto_migracao_mapa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin only" ON public.produto_migracao_mapa;
CREATE POLICY "admin only" ON public.produto_migracao_mapa FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.produto_migracao_log (
  id bigserial PRIMARY KEY,
  data_execucao timestamptz NOT NULL DEFAULT now(),
  sku_origem text, sku_destino text,
  produto_id_origem uuid, produto_id_destino uuid,
  acao text, tabela_afetada text,
  qtd_registros int, status text, erro text
);
ALTER TABLE public.produto_migracao_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin only" ON public.produto_migracao_log;
CREATE POLICY "admin only" ON public.produto_migracao_log FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2) Staging
DROP TABLE IF EXISTS public.stg_produtos_atualizado;
CREATE TABLE public.stg_produtos_atualizado (
  sku_canonico text, sku_origem text, nome text, un text, variacoes text,
  estoque numeric, preco_venda numeric, preco_custo numeric, status text,
  grupo_nome text, peso numeric, fornecedor_nome text, ref_fornecedor text, site_fornecedor text
);
ALTER TABLE public.stg_produtos_atualizado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin only" ON public.stg_produtos_atualizado FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3) Garantir grupo OUTROS
INSERT INTO public.grupos_produto (nome, ativo)
SELECT 'OUTROS', true WHERE NOT EXISTS (SELECT 1 FROM public.grupos_produto WHERE upper(nome)='OUTROS');

-- 4) Função de remapeamento de FKs
CREATE OR REPLACE FUNCTION public.remap_produto_fk(p_origem uuid, p_destino uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE n int;
BEGIN
  UPDATE estoque_movimentos SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','estoque_movimentos',n,'aplicado'); END IF;

  UPDATE notas_fiscais_itens SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','notas_fiscais_itens',n,'aplicado'); END IF;

  UPDATE compras_itens SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','compras_itens',n,'aplicado'); END IF;

  UPDATE cotacoes_compra_itens SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','cotacoes_compra_itens',n,'aplicado'); END IF;

  UPDATE fechamento_estoque_saldos SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','fechamento_estoque_saldos',n,'aplicado'); END IF;

  UPDATE nfe_distribuicao_itens SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','nfe_distribuicao_itens',n,'aplicado'); END IF;

  UPDATE orcamentos_itens SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','orcamentos_itens',n,'aplicado'); END IF;

  UPDATE ordens_venda_itens SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','ordens_venda_itens',n,'aplicado'); END IF;

  UPDATE pedidos_compra_itens SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','pedidos_compra_itens',n,'aplicado'); END IF;

  DELETE FROM precos_especiais a USING precos_especiais b
    WHERE a.produto_id=p_origem AND b.produto_id=p_destino AND a.cliente_id=b.cliente_id;
  UPDATE precos_especiais SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','precos_especiais',n,'aplicado'); END IF;

  DELETE FROM produtos_fornecedores a USING produtos_fornecedores b
    WHERE a.produto_id=p_origem AND b.produto_id=p_destino AND a.fornecedor_id=b.fornecedor_id;
  UPDATE produtos_fornecedores SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','produtos_fornecedores',n,'aplicado'); END IF;

  DELETE FROM produto_composicoes a USING produto_composicoes b
    WHERE a.produto_pai_id=p_origem AND b.produto_pai_id=p_destino AND a.produto_filho_id=b.produto_filho_id;
  UPDATE produto_composicoes SET produto_pai_id=p_destino WHERE produto_pai_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','produto_composicoes_pai',n,'aplicado'); END IF;

  DELETE FROM produto_composicoes a USING produto_composicoes b
    WHERE a.produto_filho_id=p_origem AND b.produto_filho_id=p_destino AND a.produto_pai_id=b.produto_pai_id;
  UPDATE produto_composicoes SET produto_filho_id=p_destino WHERE produto_filho_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','produto_composicoes_filho',n,'aplicado'); END IF;

  UPDATE produto_identificadores_legacy SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','produto_identificadores_legacy',n,'aplicado'); END IF;

  UPDATE recebimentos_compra_itens SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','recebimentos_compra_itens',n,'aplicado'); END IF;

  UPDATE remessa_itens SET produto_id=p_destino WHERE produto_id=p_origem;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 THEN INSERT INTO produto_migracao_log(produto_id_origem,produto_id_destino,acao,tabela_afetada,qtd_registros,status) VALUES (p_origem,p_destino,'remap','remessa_itens',n,'aplicado'); END IF;
END $fn$;
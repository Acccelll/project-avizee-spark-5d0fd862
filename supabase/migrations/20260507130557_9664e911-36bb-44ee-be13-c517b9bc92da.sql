CREATE OR REPLACE VIEW public.vw_estoque_posicao AS
SELECT
  p.id AS produto_id,
  p.nome AS produto_nome,
  p.sku,
  p.codigo_interno,
  p.unidade_medida,
  p.estoque_minimo,
  p.preco_custo,
  p.preco_venda,
  p.ativo,
  p.variacoes,
  COALESCE(ult.saldo_atual, p.estoque_atual, 0::numeric) AS estoque_atual,
  COALESCE(res.reservado, 0::numeric) AS estoque_reservado
FROM public.produtos p
LEFT JOIN LATERAL (
  SELECT m.saldo_atual
  FROM public.estoque_movimentos m
  WHERE m.produto_id = p.id
  ORDER BY m.created_at DESC
  LIMIT 1
) ult ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(
    CASE
      WHEN m2.tipo = 'reserva' THEN m2.quantidade
      WHEN m2.tipo = 'liberacao_reserva' THEN -m2.quantidade
      ELSE 0::numeric
    END
  ), 0::numeric) AS reservado
  FROM public.estoque_movimentos m2
  WHERE m2.produto_id = p.id
    AND m2.tipo IN ('reserva', 'liberacao_reserva')
) res ON true
WHERE p.ativo = true;

CREATE OR REPLACE VIEW public.vw_recebimentos_consolidado AS
WITH itens_agg AS (
  SELECT pci.pedido_compra_id,
    COALESCE(SUM(pci.quantidade), 0::numeric) AS qtd_pedida,
    COALESCE(SUM(pci.quantidade_recebida), 0::numeric) AS qtd_recebida
  FROM public.pedidos_compra_itens pci
  GROUP BY pci.pedido_compra_id
), rec_agg AS (
  SELECT rc.pedido_compra_id,
    COUNT(*) AS total_recebimentos,
    MAX(rc.data_recebimento) AS ultima_data_recebimento,
    BOOL_OR(rc.tem_divergencia) AS alguma_divergencia,
    MAX(rc.nota_fiscal_id::text) AS nota_fiscal_id_str,
    (ARRAY_AGG(rc.usuario_id ORDER BY rc.data_recebimento DESC NULLS LAST))[1] AS ultimo_usuario_id
  FROM public.recebimentos_compra rc
  GROUP BY rc.pedido_compra_id
), status_map AS (
  SELECT 'rascunho'::text AS pc, 'pedido_emitido'::text AS lg
  UNION ALL SELECT 'aguardando_aprovacao', 'pedido_emitido'
  UNION ALL SELECT 'aprovado', 'pedido_emitido'
  UNION ALL SELECT 'enviado_ao_fornecedor', 'aguardando_envio_fornecedor'
  UNION ALL SELECT 'aguardando_recebimento', 'em_transito'
  UNION ALL SELECT 'parcialmente_recebido', 'recebimento_parcial'
  UNION ALL SELECT 'recebido', 'recebido'
  UNION ALL SELECT 'cancelado', 'cancelado'
)
SELECT
  pc.id AS pedido_compra_id,
  pc.numero AS numero_compra,
  pc.fornecedor_id,
  f.nome_razao_social AS fornecedor,
  pc.data_entrega_prevista AS previsao_entrega,
  COALESCE(ra.ultima_data_recebimento, pc.data_entrega_real) AS data_recebimento,
  COALESCE(ia.qtd_pedida, 0::numeric) AS quantidade_pedida,
  COALESCE(ia.qtd_recebida, 0::numeric) AS quantidade_recebida,
  GREATEST(COALESCE(ia.qtd_pedida, 0::numeric) - COALESCE(ia.qtd_recebida, 0::numeric), 0::numeric) AS pendencia,
  public.get_recebimento_status_efetivo(
    COALESCE(sm.lg, 'pedido_emitido'::text),
    pc.data_entrega_prevista,
    COALESCE(ra.alguma_divergencia, false)
  ) AS status_logistico,
  ra.nota_fiscal_id_str AS nf_vinculada,
  COALESCE(ra.total_recebimentos, 0::bigint) > 0 AS tem_consolidacao_real,
  COALESCE(ra.alguma_divergencia, false) AS tem_divergencia,
  COALESCE(ra.total_recebimentos, 0::bigint) AS total_recebimentos,
  ra.ultimo_usuario_id AS responsavel_id,
  COALESCE(prof.nome, prof.email, '—') AS responsavel_nome
FROM public.pedidos_compra pc
LEFT JOIN public.fornecedores f ON f.id = pc.fornecedor_id
LEFT JOIN itens_agg ia ON ia.pedido_compra_id = pc.id
LEFT JOIN rec_agg ra ON ra.pedido_compra_id = pc.id
LEFT JOIN status_map sm ON sm.pc = pc.status
LEFT JOIN public.profiles prof ON prof.id = ra.ultimo_usuario_id
WHERE pc.ativo;
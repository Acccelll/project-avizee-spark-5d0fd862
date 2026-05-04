
-- ===========================================================================
-- RPC: kpis_financeiro
-- Agregados de financeiro_lancamentos para cards de KPI (Financeiro)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.kpis_financeiro(
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL,
  p_tipos     text[] DEFAULT NULL,
  p_status    text[] DEFAULT NULL,
  p_bancos    uuid[] DEFAULT NULL,
  p_origens   text[] DEFAULT NULL,
  p_formas    text[] DEFAULT NULL,
  p_cartoes   uuid[] DEFAULT NULL,
  p_search    text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH base AS (
  SELECT
    l.id,
    l.valor,
    l.data_vencimento,
    l.descricao,
    -- status efetivo: aberto vencido vira "vencido"
    CASE
      WHEN l.status = 'aberto' AND l.data_vencimento < CURRENT_DATE THEN 'vencido'
      ELSE l.status
    END AS effective_status
  FROM public.financeiro_lancamentos l
  WHERE l.ativo = true
    AND (p_date_from IS NULL OR l.data_vencimento >= p_date_from)
    AND (p_date_to   IS NULL OR l.data_vencimento <= p_date_to)
    AND (p_tipos   IS NULL OR cardinality(p_tipos)   = 0 OR l.tipo            = ANY(p_tipos))
    AND (p_bancos  IS NULL OR cardinality(p_bancos)  = 0 OR l.conta_bancaria_id = ANY(p_bancos))
    AND (p_origens IS NULL OR cardinality(p_origens) = 0 OR coalesce(l.origem_tipo,'manual') = ANY(p_origens))
    AND (p_formas  IS NULL OR cardinality(p_formas)  = 0 OR l.forma_pagamento = ANY(p_formas))
    AND (p_cartoes IS NULL OR cardinality(p_cartoes) = 0 OR l.cartao_id       = ANY(p_cartoes))
    AND (
      p_search IS NULL OR length(trim(p_search)) = 0
      OR l.descricao ILIKE '%' || p_search || '%'
    )
),
filtered AS (
  SELECT *
  FROM base
  WHERE p_status IS NULL OR cardinality(p_status) = 0 OR effective_status = ANY(p_status)
)
SELECT jsonb_build_object(
  'totalCount', (SELECT count(*) FROM filtered),
  'a_vencer',     (SELECT count(*) FROM filtered WHERE effective_status = 'aberto'  AND data_vencimento >  CURRENT_DATE),
  'vence_hoje',   (SELECT count(*) FROM filtered WHERE effective_status = 'aberto'  AND data_vencimento =  CURRENT_DATE),
  'vencido',      (SELECT count(*) FROM filtered WHERE effective_status = 'vencido'),
  'pago',         (SELECT count(*) FROM filtered WHERE effective_status = 'pago'),
  'parcial',      (SELECT count(*) FROM filtered WHERE effective_status = 'parcial'),
  'total_a_vencer', (SELECT coalesce(sum(valor),0) FROM filtered WHERE effective_status = 'aberto'),
  'total_vencido',  (SELECT coalesce(sum(valor),0) FROM filtered WHERE effective_status = 'vencido'),
  'total_pago',     (SELECT coalesce(sum(valor),0) FROM filtered WHERE effective_status = 'pago'),
  'total_parcial',  (SELECT coalesce(sum(valor),0) FROM filtered WHERE effective_status = 'parcial')
);
$$;

GRANT EXECUTE ON FUNCTION public.kpis_financeiro(date,date,text[],text[],uuid[],text[],text[],uuid[],text)
  TO authenticated;

-- ===========================================================================
-- RPC: kpis_fiscal
-- Agregados de notas_fiscais para cards de KPI (Fiscal)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.kpis_fiscal(
  p_date_from      date   DEFAULT NULL,
  p_date_to        date   DEFAULT NULL,
  p_tipos          text[] DEFAULT NULL,
  p_status         text[] DEFAULT NULL,
  p_fornecedores   uuid[] DEFAULT NULL,
  p_clientes       uuid[] DEFAULT NULL,
  p_modelos        text[] DEFAULT NULL,
  p_search         text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH base AS (
  SELECT n.id, n.status, n.tipo, n.valor_total, n.data_emissao
  FROM public.notas_fiscais n
  WHERE n.ativo = true
    AND (p_date_from IS NULL OR n.data_emissao >= p_date_from)
    AND (p_date_to   IS NULL OR n.data_emissao <= p_date_to)
    AND (p_tipos        IS NULL OR cardinality(p_tipos)        = 0 OR n.tipo              = ANY(p_tipos))
    AND (p_status       IS NULL OR cardinality(p_status)       = 0 OR n.status            = ANY(p_status))
    AND (p_fornecedores IS NULL OR cardinality(p_fornecedores) = 0 OR n.fornecedor_id     = ANY(p_fornecedores))
    AND (p_clientes     IS NULL OR cardinality(p_clientes)     = 0 OR n.cliente_id        = ANY(p_clientes))
    AND (p_modelos      IS NULL OR cardinality(p_modelos)      = 0 OR n.modelo_documento  = ANY(p_modelos))
    AND (
      p_search IS NULL OR length(trim(p_search)) = 0
      OR n.numero       ILIKE '%' || p_search || '%'
      OR n.chave_acesso ILIKE '%' || p_search || '%'
    )
)
SELECT jsonb_build_object(
  'totalCount',  (SELECT count(*) FROM base),
  'rascunho',    (SELECT count(*) FROM base WHERE status = 'rascunho'),
  'confirmada',  (SELECT count(*) FROM base WHERE status = 'confirmada'),
  'cancelada',   (SELECT count(*) FROM base WHERE status = 'cancelada'),
  'denegada',    (SELECT count(*) FROM base WHERE status = 'denegada'),
  'rejeitada',   (SELECT count(*) FROM base WHERE status = 'rejeitada'),
  'total_valor',          (SELECT coalesce(sum(valor_total),0) FROM base),
  'total_valor_confirmada',(SELECT coalesce(sum(valor_total),0) FROM base WHERE status = 'confirmada'),
  'total_entrada',(SELECT coalesce(sum(valor_total),0) FROM base WHERE tipo = 'entrada'),
  'total_saida',  (SELECT coalesce(sum(valor_total),0) FROM base WHERE tipo = 'saida')
);
$$;

GRANT EXECUTE ON FUNCTION public.kpis_fiscal(date,date,text[],text[],uuid[],uuid[],text[],text)
  TO authenticated;

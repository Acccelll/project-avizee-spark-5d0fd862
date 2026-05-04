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
  'pendente',    (SELECT count(*) FROM base WHERE status = 'pendente'),
  'confirmada',  (SELECT count(*) FROM base WHERE status = 'confirmada'),
  -- Status com efeito ativo no ERP (paridade com Fiscal.tsx KPIs)
  'confirmadas_efetivas', (SELECT count(*) FROM base WHERE status IN ('confirmada','autorizada','importada')),
  'cancelada',   (SELECT count(*) FROM base WHERE status = 'cancelada'),
  'denegada',    (SELECT count(*) FROM base WHERE status = 'denegada'),
  'rejeitada',   (SELECT count(*) FROM base WHERE status = 'rejeitada'),
  'total_valor',          (SELECT coalesce(sum(valor_total),0) FROM base),
  'total_valor_confirmada',(SELECT coalesce(sum(valor_total),0) FROM base WHERE status IN ('confirmada','autorizada','importada')),
  'total_entrada',(SELECT coalesce(sum(valor_total),0) FROM base WHERE tipo = 'entrada'),
  'total_saida',  (SELECT coalesce(sum(valor_total),0) FROM base WHERE tipo = 'saida')
);
$$;
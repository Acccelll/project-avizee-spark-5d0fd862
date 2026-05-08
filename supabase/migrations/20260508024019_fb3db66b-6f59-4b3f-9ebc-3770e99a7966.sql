-- Índices de apoio (usados pela listagem paginada e KPIs)
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_ativo_emissao
  ON public.notas_fiscais(ativo, data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_status
  ON public.notas_fiscais(status);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_status_sefaz
  ON public.notas_fiscais(status_sefaz);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_fornecedor
  ON public.notas_fiscais(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_cliente
  ON public.notas_fiscais(cliente_id);

CREATE OR REPLACE FUNCTION public.listar_notas_fiscais_ids(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_tipos text[] DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_status_sefaz text[] DEFAULT NULL,
  p_modelos text[] DEFAULT NULL,
  p_origens text[] DEFAULT NULL,
  p_fornecedores uuid[] DEFAULT NULL,
  p_clientes uuid[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_order_by text DEFAULT 'data_emissao',
  p_ascending boolean DEFAULT false,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_total int;
  v_ids uuid[];
  v_order_col text;
BEGIN
  v_order_col := CASE lower(coalesce(p_order_by, 'data_emissao'))
    WHEN 'data_emissao' THEN 'data_emissao'
    WHEN 'numero'       THEN 'numero'
    WHEN 'valor_total'  THEN 'valor_total'
    WHEN 'created_at'   THEN 'created_at'
    ELSE 'data_emissao'
  END;

  WITH base AS (
    SELECT n.id, n.data_emissao, n.numero, n.valor_total, n.created_at
    FROM public.notas_fiscais n
    LEFT JOIN public.fornecedores f ON f.id = n.fornecedor_id
    LEFT JOIN public.clientes     c ON c.id = n.cliente_id
    WHERE n.ativo = true
      AND (p_date_from IS NULL OR n.data_emissao >= p_date_from)
      AND (p_date_to   IS NULL OR n.data_emissao <= p_date_to)
      AND (p_tipos        IS NULL OR cardinality(p_tipos)        = 0 OR n.tipo                          = ANY(p_tipos))
      AND (p_status       IS NULL OR cardinality(p_status)       = 0 OR n.status                        = ANY(p_status))
      AND (p_status_sefaz IS NULL OR cardinality(p_status_sefaz) = 0 OR coalesce(n.status_sefaz,'nao_enviada') = ANY(p_status_sefaz))
      AND (p_modelos      IS NULL OR cardinality(p_modelos)      = 0 OR coalesce(n.modelo_documento,'55')      = ANY(p_modelos))
      AND (p_origens      IS NULL OR cardinality(p_origens)      = 0 OR coalesce(n.origem,'manual')            = ANY(p_origens))
      AND (p_fornecedores IS NULL OR cardinality(p_fornecedores) = 0 OR n.fornecedor_id                = ANY(p_fornecedores))
      AND (p_clientes     IS NULL OR cardinality(p_clientes)     = 0 OR n.cliente_id                   = ANY(p_clientes))
      AND (
        p_search IS NULL OR length(trim(p_search)) = 0
        OR n.numero            ILIKE '%' || p_search || '%'
        OR n.chave_acesso      ILIKE '%' || p_search || '%'
        OR f.nome_razao_social ILIKE '%' || p_search || '%'
        OR c.nome_razao_social ILIKE '%' || p_search || '%'
      )
  ),
  ordered AS (
    SELECT id, ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN NOT p_ascending AND v_order_col = 'data_emissao' THEN data_emissao END DESC NULLS LAST,
        CASE WHEN NOT p_ascending AND v_order_col = 'numero'       THEN numero       END DESC NULLS LAST,
        CASE WHEN NOT p_ascending AND v_order_col = 'valor_total'  THEN valor_total  END DESC NULLS LAST,
        CASE WHEN NOT p_ascending AND v_order_col = 'created_at'   THEN created_at   END DESC NULLS LAST,
        CASE WHEN p_ascending AND v_order_col = 'data_emissao' THEN data_emissao END ASC NULLS LAST,
        CASE WHEN p_ascending AND v_order_col = 'numero'       THEN numero       END ASC NULLS LAST,
        CASE WHEN p_ascending AND v_order_col = 'valor_total'  THEN valor_total  END ASC NULLS LAST,
        CASE WHEN p_ascending AND v_order_col = 'created_at'   THEN created_at   END ASC NULLS LAST,
        id
    ) AS rn
    FROM base
  )
  SELECT (SELECT count(*) FROM base), array_agg(o.id ORDER BY o.rn)
  INTO v_total, v_ids
  FROM ordered o
  WHERE o.rn > p_offset AND o.rn <= p_offset + p_limit;

  RETURN jsonb_build_object(
    'ids', coalesce(to_jsonb(v_ids), '[]'::jsonb),
    'total_count', coalesce(v_total, 0)
  );
END;
$$;
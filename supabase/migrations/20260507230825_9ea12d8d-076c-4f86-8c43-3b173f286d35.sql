CREATE OR REPLACE FUNCTION public.listar_financeiro_lancamentos_ids(
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL,
  p_tipos     text[] DEFAULT NULL,
  p_status    text[] DEFAULT NULL,
  p_bancos    uuid[] DEFAULT NULL,
  p_origens   text[] DEFAULT NULL,
  p_formas    text[] DEFAULT NULL,
  p_cartoes   uuid[] DEFAULT NULL,
  p_search    text   DEFAULT NULL,
  p_order_by  text   DEFAULT 'data_vencimento',
  p_ascending boolean DEFAULT false,
  p_offset    int    DEFAULT 0,
  p_limit     int    DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_ids uuid[];
  v_order_col text;
BEGIN
  -- Whitelist de colunas para ORDER BY (evita SQL injection via dynamic SQL)
  v_order_col := CASE lower(coalesce(p_order_by, 'data_vencimento'))
    WHEN 'data_vencimento' THEN 'data_vencimento'
    WHEN 'data_pagamento'  THEN 'data_pagamento'
    WHEN 'valor'           THEN 'valor'
    WHEN 'created_at'      THEN 'created_at'
    WHEN 'descricao'       THEN 'descricao'
    ELSE 'data_vencimento'
  END;

  -- CTE filtrada (mesma lógica de kpis_financeiro + busca cross-table)
  WITH base AS (
    SELECT
      l.id,
      l.data_vencimento,
      l.data_pagamento,
      l.valor,
      l.created_at,
      l.descricao,
      CASE
        WHEN l.status = 'aberto' AND l.data_vencimento < CURRENT_DATE THEN 'vencido'
        ELSE l.status
      END AS effective_status
    FROM public.financeiro_lancamentos l
    LEFT JOIN public.clientes     c  ON c.id  = l.cliente_id
    LEFT JOIN public.fornecedores f  ON f.id  = l.fornecedor_id
    LEFT JOIN public.contas_bancarias cb ON cb.id = l.conta_bancaria_id
    LEFT JOIN public.bancos       b  ON b.id  = cb.banco_id
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
        OR l.descricao         ILIKE '%' || p_search || '%'
        OR l.forma_pagamento   ILIKE '%' || p_search || '%'
        OR c.nome_razao_social ILIKE '%' || p_search || '%'
        OR f.nome_razao_social ILIKE '%' || p_search || '%'
        OR cb.descricao        ILIKE '%' || p_search || '%'
        OR b.nome              ILIKE '%' || p_search || '%'
      )
  ),
  filtered AS (
    SELECT *
    FROM base
    WHERE p_status IS NULL OR cardinality(p_status) = 0 OR effective_status = ANY(p_status)
  ),
  ordered AS (
    SELECT id, ROW_NUMBER() OVER (
      ORDER BY
        -- DESC dynamic
        CASE WHEN NOT p_ascending AND v_order_col = 'data_vencimento' THEN data_vencimento END DESC NULLS LAST,
        CASE WHEN NOT p_ascending AND v_order_col = 'data_pagamento'  THEN data_pagamento  END DESC NULLS LAST,
        CASE WHEN NOT p_ascending AND v_order_col = 'valor'           THEN valor           END DESC NULLS LAST,
        CASE WHEN NOT p_ascending AND v_order_col = 'created_at'      THEN created_at      END DESC NULLS LAST,
        CASE WHEN NOT p_ascending AND v_order_col = 'descricao'       THEN descricao       END DESC NULLS LAST,
        -- ASC dynamic
        CASE WHEN p_ascending AND v_order_col = 'data_vencimento' THEN data_vencimento END ASC NULLS LAST,
        CASE WHEN p_ascending AND v_order_col = 'data_pagamento'  THEN data_pagamento  END ASC NULLS LAST,
        CASE WHEN p_ascending AND v_order_col = 'valor'           THEN valor           END ASC NULLS LAST,
        CASE WHEN p_ascending AND v_order_col = 'created_at'      THEN created_at      END ASC NULLS LAST,
        CASE WHEN p_ascending AND v_order_col = 'descricao'       THEN descricao       END ASC NULLS LAST,
        id
    ) AS rn
    FROM filtered
  )
  SELECT
    (SELECT count(*) FROM filtered),
    array_agg(o.id ORDER BY o.rn)
  INTO v_total, v_ids
  FROM ordered o
  WHERE o.rn > p_offset AND o.rn <= p_offset + p_limit;

  RETURN jsonb_build_object(
    'ids', coalesce(to_jsonb(v_ids), '[]'::jsonb),
    'total_count', coalesce(v_total, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_financeiro_lancamentos_ids(
  date,date,text[],text[],uuid[],text[],text[],uuid[],text,text,boolean,int,int
) TO authenticated;

COMMENT ON FUNCTION public.listar_financeiro_lancamentos_ids IS
  'Paginação server-side do módulo Financeiro. Retorna ids + total_count para que o front faça o SELECT relacional com joins.';

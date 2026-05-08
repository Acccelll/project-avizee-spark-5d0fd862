CREATE OR REPLACE FUNCTION public.produtos_estoque_summary()
RETURNS TABLE(criticos integer, zerados integer, abaixo_minimo integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Conta global de produtos ativos com problema de estoque.
  -- SECURITY DEFINER porque retorna apenas agregados (sem vazar linhas).
  -- Mantemos os 3 contadores derivados para exibir individualmente nos KPIs.
  SELECT
    COUNT(*) FILTER (
      WHERE COALESCE(estoque_minimo, 0) > 0
        AND COALESCE(estoque_atual, 0) > 0
        AND COALESCE(estoque_atual, 0) <= COALESCE(estoque_minimo, 0)
    )::int AS criticos,
    COUNT(*) FILTER (WHERE COALESCE(estoque_atual, 0) <= 0)::int AS zerados,
    COUNT(*) FILTER (
      WHERE COALESCE(estoque_atual, 0) <= 0
         OR (
           COALESCE(estoque_minimo, 0) > 0
           AND COALESCE(estoque_atual, 0) <= COALESCE(estoque_minimo, 0)
         )
    )::int AS abaixo_minimo
  FROM public.produtos
  WHERE COALESCE(ativo, true) = true;
$$;

GRANT EXECUTE ON FUNCTION public.produtos_estoque_summary() TO authenticated;
COMMENT ON FUNCTION public.produtos_estoque_summary() IS
  'Retorna a contagem global de produtos ativos com problema de estoque (críticos/zerados/abaixo_minimo). Usada pelo KPI da tela /produtos para evitar leitura limitada à página corrente.';
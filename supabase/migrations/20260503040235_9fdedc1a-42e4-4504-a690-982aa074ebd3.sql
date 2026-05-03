-- 1) Drop backup obsoleto
DROP TABLE IF EXISTS public.financeiro_lancamentos_backup_20260428;

-- 2) RPC placeholder para geração de fatura de cartão (MVP)
CREATE OR REPLACE FUNCTION public.gerar_fatura_cartao(
  p_cartao_id uuid,
  p_competencia text  -- formato 'YYYY-MM'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cartao record;
  v_ano int;
  v_mes int;
  v_data_fechamento date;
  v_data_vencimento date;
  v_fatura_id uuid;
BEGIN
  IF p_competencia !~ '^\d{4}-\d{2}$' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Competência inválida (use YYYY-MM)');
  END IF;
  v_ano := substring(p_competencia, 1, 4)::int;
  v_mes := substring(p_competencia, 6, 2)::int;

  SELECT * INTO v_cartao FROM public.cartoes_credito WHERE id = p_cartao_id AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Cartão não encontrado ou inativo');
  END IF;

  v_data_fechamento := make_date(v_ano, v_mes, LEAST(v_cartao.dia_fechamento, 28));
  v_data_vencimento := v_data_fechamento + (v_cartao.dia_vencimento - v_cartao.dia_fechamento) * INTERVAL '1 day';
  IF v_data_vencimento <= v_data_fechamento THEN
    v_data_vencimento := v_data_vencimento + INTERVAL '1 month';
  END IF;

  -- Cria fatura zerada se não existir; agregação de lançamentos será fase futura
  INSERT INTO public.cartao_faturas (
    cartao_id, competencia, data_fechamento, data_vencimento, valor_total, status
  )
  VALUES (
    p_cartao_id, p_competencia, v_data_fechamento, v_data_vencimento::date, 0, 'aberta'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_fatura_id;

  IF v_fatura_id IS NULL THEN
    SELECT id INTO v_fatura_id FROM public.cartao_faturas
    WHERE cartao_id = p_cartao_id AND competencia = p_competencia LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'fatura_id', v_fatura_id,
    'data_fechamento', v_data_fechamento,
    'data_vencimento', v_data_vencimento::date,
    'aviso', 'MVP: agregação de lançamentos por cartão_id virá em fase posterior'
  );
END;
$$;

-- 3) Índices de performance para conciliação
CREATE INDEX IF NOT EXISTS idx_conciliacao_pares_lancamento ON public.conciliacao_pares(lancamento_id) WHERE lancamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conciliacao_pares_extrato ON public.conciliacao_pares(extrato_id);
CREATE INDEX IF NOT EXISTS idx_cartao_faturas_cartao_comp ON public.cartao_faturas(cartao_id, competencia);
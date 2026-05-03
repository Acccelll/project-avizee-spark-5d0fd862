-- Reescreve gerar_fatura_cartao para agregar lançamentos do cartão na competência
-- e materializar um financeiro_lancamentos "fatura consolidada" idempotente.
CREATE OR REPLACE FUNCTION public.gerar_fatura_cartao(p_cartao_id uuid, p_competencia text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cartao record;
  v_ano int;
  v_mes int;
  v_data_fechamento date;
  v_data_vencimento date;
  v_data_abertura date;
  v_fatura_id uuid;
  v_total numeric;
  v_lanc_fatura_id uuid;
  v_empresa_id uuid;
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
  IF v_cartao.dia_vencimento <= v_cartao.dia_fechamento THEN
    v_data_vencimento := (v_data_fechamento + interval '1 month')::date;
    v_data_vencimento := make_date(
      EXTRACT(YEAR FROM v_data_vencimento)::int,
      EXTRACT(MONTH FROM v_data_vencimento)::int,
      LEAST(v_cartao.dia_vencimento, 28)
    );
  ELSE
    v_data_vencimento := make_date(v_ano, v_mes, LEAST(v_cartao.dia_vencimento, 28));
  END IF;
  v_data_abertura := (date_trunc('month', v_data_fechamento) - interval '1 month' + (v_cartao.dia_fechamento - 1) * interval '1 day')::date;

  -- Resolve / cria fatura (idempotente)
  INSERT INTO public.cartao_faturas (
    cartao_id, competencia, data_abertura, data_fechamento, data_vencimento, valor_total, status
  )
  VALUES (p_cartao_id, p_competencia, v_data_abertura, v_data_fechamento, v_data_vencimento, 0, 'aberta')
  ON CONFLICT (cartao_id, competencia) DO NOTHING
  RETURNING id INTO v_fatura_id;

  IF v_fatura_id IS NULL THEN
    SELECT id INTO v_fatura_id FROM public.cartao_faturas
    WHERE cartao_id = p_cartao_id AND competencia = p_competencia LIMIT 1;
  END IF;

  -- Agrega despesas vinculadas a esta fatura (cartao_fatura_id)
  SELECT COALESCE(SUM(valor), 0) INTO v_total
  FROM public.financeiro_lancamentos
  WHERE cartao_fatura_id = v_fatura_id
    AND tipo = 'despesa'
    AND ativo = true
    AND origem_tipo <> 'cartao_fatura';

  -- Atualiza total da fatura
  UPDATE public.cartao_faturas
  SET valor_total = v_total,
      status = CASE WHEN v_total > 0 THEN 'fechada' ELSE status END,
      updated_at = now()
  WHERE id = v_fatura_id;

  -- Materializa um lançamento consolidado (idempotente por cartao_fatura_id + origem_tipo)
  SELECT id INTO v_lanc_fatura_id
  FROM public.financeiro_lancamentos
  WHERE cartao_fatura_id = v_fatura_id
    AND origem_tipo = 'cartao_fatura'
    AND ativo = true
  LIMIT 1;

  -- empresa_id padrão (primeira empresa ativa)
  SELECT empresa_id INTO v_empresa_id
  FROM public.financeiro_lancamentos
  WHERE empresa_id IS NOT NULL
  LIMIT 1;

  IF v_total > 0 THEN
    IF v_lanc_fatura_id IS NULL THEN
      INSERT INTO public.financeiro_lancamentos (
        tipo, descricao, valor, data_vencimento, status,
        cartao_id, cartao_fatura_id, origem_tipo, ativo, empresa_id, titulo
      ) VALUES (
        'despesa',
        'Fatura cartão ' || v_cartao.nome || ' - ' || p_competencia,
        v_total, v_data_vencimento, 'aberto',
        p_cartao_id, v_fatura_id, 'cartao_fatura', true, v_empresa_id,
        'Fatura ' || p_competencia
      );
    ELSE
      UPDATE public.financeiro_lancamentos
      SET valor = v_total,
          data_vencimento = v_data_vencimento,
          updated_at = now()
      WHERE id = v_lanc_fatura_id
        AND status = 'aberto';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'fatura_id', v_fatura_id,
    'valor_total', v_total,
    'data_fechamento', v_data_fechamento,
    'data_vencimento', v_data_vencimento,
    'lancamentos_agregados', (
      SELECT COUNT(*) FROM public.financeiro_lancamentos
      WHERE cartao_fatura_id = v_fatura_id AND origem_tipo <> 'cartao_fatura' AND ativo
    )
  );
END;
$function$;
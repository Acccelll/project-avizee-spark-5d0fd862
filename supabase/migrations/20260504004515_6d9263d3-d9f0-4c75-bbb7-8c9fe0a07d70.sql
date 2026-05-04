-- 1) financeiro_baixa_lotes (agrupador)
CREATE TABLE IF NOT EXISTS public.financeiro_baixa_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  data_pagamento date NOT NULL,
  conta_bancaria_id uuid REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT,
  forma_pagamento text,
  valor_total numeric(15,2) NOT NULL DEFAULT 0,
  cartao_fatura_id uuid REFERENCES public.cartao_faturas(id) ON DELETE SET NULL,
  observacoes text,
  usuario_id uuid,
  empresa_id uuid NOT NULL DEFAULT current_empresa_id(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_baixa_lote_tipo CHECK (tipo IN ('individual','lote','fatura_cartao','conciliacao'))
);

ALTER TABLE public.financeiro_baixa_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baixa_lotes_select" ON public.financeiro_baixa_lotes;
CREATE POLICY "baixa_lotes_select" ON public.financeiro_baixa_lotes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "baixa_lotes_insert" ON public.financeiro_baixa_lotes;
CREATE POLICY "baixa_lotes_insert" ON public.financeiro_baixa_lotes
  FOR INSERT TO authenticated WITH CHECK (true);

-- 2) financeiro_baixas: novas colunas
ALTER TABLE public.financeiro_baixas
  ADD COLUMN IF NOT EXISTS desconto numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS juros numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS multa numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abatimento numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_movimento_bancario numeric(15,2),
  ADD COLUMN IF NOT EXISTS grupo_baixa_id uuid REFERENCES public.financeiro_baixa_lotes(id) ON DELETE SET NULL;

UPDATE public.financeiro_baixas
   SET valor_movimento_bancario = valor_pago
 WHERE valor_movimento_bancario IS NULL;

CREATE INDEX IF NOT EXISTS idx_financeiro_baixas_grupo
  ON public.financeiro_baixas(grupo_baixa_id);

-- 3) RPC registrar_baixa_financeira v2 (substitui)
DROP FUNCTION IF EXISTS public.registrar_baixa_financeira(uuid, numeric, date, text, uuid, text);
CREATE OR REPLACE FUNCTION public.registrar_baixa_financeira(
  p_lancamento_id uuid,
  p_valor_pago numeric,
  p_data_baixa date,
  p_forma_pagamento text,
  p_conta_bancaria_id uuid,
  p_observacoes text DEFAULT NULL,
  p_desconto numeric DEFAULT 0,
  p_juros numeric DEFAULT 0,
  p_multa numeric DEFAULT 0,
  p_abatimento numeric DEFAULT 0,
  p_grupo_baixa_id uuid DEFAULT NULL,
  p_skip_caixa boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lanc record;
  v_baixa_id uuid;
  v_signal int;
  v_valor_movimento numeric;
  v_desc numeric := COALESCE(p_desconto,0);
  v_jur numeric := COALESCE(p_juros,0);
  v_mul numeric := COALESCE(p_multa,0);
  v_aba numeric := COALESCE(p_abatimento,0);
BEGIN
  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN
    RAISE EXCEPTION 'Valor da baixa deve ser maior que zero';
  END IF;
  IF p_conta_bancaria_id IS NULL THEN
    RAISE EXCEPTION 'Conta bancária é obrigatória';
  END IF;

  SELECT * INTO v_lanc FROM public.financeiro_lancamentos
   WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento % não encontrado', p_lancamento_id;
  END IF;
  IF v_lanc.status IN ('cancelado','pago') THEN
    RAISE EXCEPTION 'Lançamento % está % e não aceita baixa', p_lancamento_id, v_lanc.status;
  END IF;
  IF p_valor_pago > COALESCE(v_lanc.saldo_restante, v_lanc.valor) + 0.009 THEN
    RAISE EXCEPTION 'Valor pago (%) excede saldo restante (%)', p_valor_pago, v_lanc.saldo_restante;
  END IF;

  v_valor_movimento := p_valor_pago - v_desc + v_jur + v_mul - v_aba;

  INSERT INTO public.financeiro_baixas
    (lancamento_id, data_baixa, valor_pago, forma_pagamento, conta_bancaria_id,
     observacoes, desconto, juros, multa, abatimento,
     valor_movimento_bancario, grupo_baixa_id)
  VALUES
    (p_lancamento_id, p_data_baixa, p_valor_pago, p_forma_pagamento, p_conta_bancaria_id,
     p_observacoes, v_desc, v_jur, v_mul, v_aba,
     v_valor_movimento, p_grupo_baixa_id)
  RETURNING id INTO v_baixa_id;

  v_signal := CASE WHEN v_lanc.tipo = 'receber' THEN 1 ELSE -1 END;
  UPDATE public.contas_bancarias
     SET saldo_atual = COALESCE(saldo_atual, 0) + (v_signal * v_valor_movimento),
         updated_at = now()
   WHERE id = p_conta_bancaria_id;

  IF NOT p_skip_caixa THEN
    INSERT INTO public.caixa_movimentos
      (conta_bancaria_id, tipo, valor, descricao, forma_pagamento, saldo_atual)
    SELECT p_conta_bancaria_id,
           CASE WHEN v_lanc.tipo = 'receber' THEN 'entrada' ELSE 'saida' END,
           v_valor_movimento,
           'Baixa financeira: ' || COALESCE(v_lanc.descricao, v_lanc.id::text),
           p_forma_pagamento,
           (SELECT saldo_atual FROM public.contas_bancarias WHERE id = p_conta_bancaria_id);
  END IF;

  RETURN v_baixa_id;
END;
$$;

-- 4) RPC registrar_baixa_lote_financeira (oficial)
CREATE OR REPLACE FUNCTION public.registrar_baixa_lote_financeira(
  p_items jsonb,
  p_data_baixa date,
  p_forma_pagamento text,
  p_conta_bancaria_id uuid,
  p_observacoes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_item jsonb;
  v_grupo uuid;
  v_total numeric := 0;
  v_processados int := 0;
  v_ignorados int := 0;
  v_erros text[] := '{}';
  v_status text;
  v_lanc_id uuid;
  v_valor numeric;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Nenhum item informado';
  END IF;

  INSERT INTO public.financeiro_baixa_lotes
    (tipo, data_pagamento, conta_bancaria_id, forma_pagamento, valor_total, observacoes, usuario_id)
  VALUES ('lote', p_data_baixa, p_conta_bancaria_id, p_forma_pagamento, 0, p_observacoes, auth.uid())
  RETURNING id INTO v_grupo;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      v_lanc_id := (v_item->>'lancamento_id')::uuid;
      SELECT status INTO v_status FROM public.financeiro_lancamentos WHERE id = v_lanc_id;
      IF v_status IS NULL THEN
        v_erros := array_append(v_erros, 'Lançamento ' || v_lanc_id || ' não encontrado');
        CONTINUE;
      END IF;
      IF v_status IN ('pago','cancelado') THEN
        v_ignorados := v_ignorados + 1;
        CONTINUE;
      END IF;
      v_valor := (v_item->>'valor_pago')::numeric;
      PERFORM public.registrar_baixa_financeira(
        v_lanc_id,
        v_valor,
        COALESCE((v_item->>'data_baixa')::date, p_data_baixa),
        COALESCE(v_item->>'forma_pagamento', p_forma_pagamento),
        COALESCE((v_item->>'conta_bancaria_id')::uuid, p_conta_bancaria_id),
        COALESCE(v_item->>'observacoes', p_observacoes),
        COALESCE((v_item->>'desconto')::numeric, 0),
        COALESCE((v_item->>'juros')::numeric, 0),
        COALESCE((v_item->>'multa')::numeric, 0),
        COALESCE((v_item->>'abatimento')::numeric, 0),
        v_grupo,
        false
      );
      v_total := v_total + v_valor;
      v_processados := v_processados + 1;
    EXCEPTION WHEN OTHERS THEN
      v_erros := array_append(v_erros, SQLERRM);
    END;
  END LOOP;

  UPDATE public.financeiro_baixa_lotes SET valor_total = v_total WHERE id = v_grupo;

  RETURN jsonb_build_object(
    'grupo_id', v_grupo,
    'processados', v_processados,
    'ignorados', v_ignorados,
    'erros', to_jsonb(v_erros)
  );
END;
$$;

-- 5) Wrapper retro-compat para financeiro_processar_baixa_lote
CREATE OR REPLACE FUNCTION public.financeiro_processar_baixa_lote(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_first jsonb;
  v_data date;
  v_forma text;
  v_conta uuid;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', true, 'processados', 0, 'ignorados', 0, 'erros', to_jsonb('{}'::text[]));
  END IF;
  v_first := p_items->0;
  v_data := COALESCE((v_first->>'data_baixa')::date, CURRENT_DATE);
  v_forma := v_first->>'forma_pagamento';
  v_conta := (v_first->>'conta_bancaria_id')::uuid;
  RETURN public.registrar_baixa_lote_financeira(p_items, v_data, v_forma, v_conta, NULL);
END;
$$;

-- 6) baixar_fatura_cartao v2 (consolidada, 1 caixa_movimento)
DROP FUNCTION IF EXISTS public.baixar_fatura_cartao(uuid, uuid, date);
CREATE OR REPLACE FUNCTION public.baixar_fatura_cartao(
  p_fatura_id uuid,
  p_conta_bancaria_id uuid,
  p_data_baixa date DEFAULT CURRENT_DATE,
  p_forma_pagamento text DEFAULT 'boleto_dda',
  p_observacoes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_lanc record;
  v_grupo uuid;
  v_total numeric := 0;
  v_processados int := 0;
  v_user uuid := auth.uid();
  v_saldo numeric;
BEGIN
  IF NOT (public.has_role(v_user, 'admin'::app_role) OR public.has_role(v_user, 'financeiro'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para baixar fatura';
  END IF;
  IF p_conta_bancaria_id IS NULL THEN
    RAISE EXCEPTION 'Conta bancária é obrigatória';
  END IF;

  INSERT INTO public.financeiro_baixa_lotes
    (tipo, data_pagamento, conta_bancaria_id, forma_pagamento, valor_total, cartao_fatura_id, observacoes, usuario_id)
  VALUES ('fatura_cartao', p_data_baixa, p_conta_bancaria_id, p_forma_pagamento, 0, p_fatura_id, p_observacoes, v_user)
  RETURNING id INTO v_grupo;

  FOR v_lanc IN
    SELECT id, valor, valor_pago, saldo_restante
      FROM public.financeiro_lancamentos
     WHERE cartao_fatura_id = p_fatura_id
       AND ativo = true
       AND status IN ('aberto','parcial')
       FOR UPDATE
  LOOP
    v_saldo := COALESCE(v_lanc.saldo_restante, v_lanc.valor - COALESCE(v_lanc.valor_pago,0));
    IF v_saldo <= 0 THEN CONTINUE; END IF;
    PERFORM public.registrar_baixa_financeira(
      v_lanc.id, v_saldo, p_data_baixa, p_forma_pagamento,
      p_conta_bancaria_id,
      'Baixa via fatura ' || p_fatura_id::text,
      0, 0, 0, 0,
      v_grupo,
      true  -- skip caixa por item; caixa consolidado abaixo
    );
    v_total := v_total + v_saldo;
    v_processados := v_processados + 1;
  END LOOP;

  UPDATE public.financeiro_baixa_lotes SET valor_total = v_total WHERE id = v_grupo;

  IF v_total > 0 THEN
    INSERT INTO public.caixa_movimentos
      (conta_bancaria_id, tipo, valor, descricao, forma_pagamento, saldo_atual)
    SELECT p_conta_bancaria_id, 'saida', v_total,
           'Pagamento fatura cartão ' || p_fatura_id::text,
           p_forma_pagamento,
           (SELECT saldo_atual FROM public.contas_bancarias WHERE id = p_conta_bancaria_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.financeiro_lancamentos
     WHERE cartao_fatura_id = p_fatura_id AND ativo = true AND status IN ('aberto','parcial')
  ) THEN
    UPDATE public.cartao_faturas SET status = 'paga', updated_at = now() WHERE id = p_fatura_id;
  END IF;

  RETURN jsonb_build_object(
    'grupo_id', v_grupo,
    'processados', v_processados,
    'valor_total', v_total
  );
END;
$$;

-- 7) cartao_fatura_para_data: fechamento inclusivo (> em vez de >=)
CREATE OR REPLACE FUNCTION public.cartao_fatura_para_data(p_cartao_id uuid, p_data date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_cartao public.cartoes_credito;
  v_dia_lanc integer;
  v_competencia_data date;
  v_competencia text;
  v_data_fechamento date;
  v_data_vencimento date;
  v_data_abertura date;
  v_fatura_id uuid;
BEGIN
  SELECT * INTO v_cartao FROM public.cartoes_credito WHERE id = p_cartao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cartão % não encontrado', p_cartao_id; END IF;

  v_dia_lanc := EXTRACT(DAY FROM p_data)::integer;

  -- Fechamento inclusivo: compra NO dia de fechamento entra na fatura atual.
  IF v_dia_lanc > v_cartao.dia_fechamento THEN
    v_competencia_data := (date_trunc('month', p_data) + interval '1 month')::date;
  ELSE
    v_competencia_data := date_trunc('month', p_data)::date;
  END IF;

  v_competencia := to_char(v_competencia_data, 'YYYY-MM');

  v_data_fechamento := make_date(
    EXTRACT(YEAR FROM v_competencia_data)::int,
    EXTRACT(MONTH FROM v_competencia_data)::int,
    LEAST(v_cartao.dia_fechamento, EXTRACT(DAY FROM (date_trunc('month', v_competencia_data) + interval '1 month - 1 day'))::int)
  );

  IF v_cartao.dia_vencimento <= v_cartao.dia_fechamento THEN
    v_data_vencimento := make_date(
      EXTRACT(YEAR FROM (v_competencia_data + interval '1 month'))::int,
      EXTRACT(MONTH FROM (v_competencia_data + interval '1 month'))::int,
      LEAST(v_cartao.dia_vencimento, EXTRACT(DAY FROM (date_trunc('month', v_competencia_data + interval '2 month') - interval '1 day'))::int)
    );
  ELSE
    v_data_vencimento := make_date(
      EXTRACT(YEAR FROM v_competencia_data)::int,
      EXTRACT(MONTH FROM v_competencia_data)::int,
      LEAST(v_cartao.dia_vencimento, EXTRACT(DAY FROM (date_trunc('month', v_competencia_data) + interval '1 month - 1 day'))::int)
    );
  END IF;

  v_data_abertura := (date_trunc('month', v_competencia_data) - interval '1 month' + (v_cartao.dia_fechamento - 1) * interval '1 day')::date;

  INSERT INTO public.cartao_faturas (cartao_id, competencia, data_abertura, data_fechamento, data_vencimento, status)
  VALUES (p_cartao_id, v_competencia, v_data_abertura, v_data_fechamento, v_data_vencimento, 'aberta')
  ON CONFLICT (cartao_id, competencia) DO NOTHING
  RETURNING id INTO v_fatura_id;

  IF v_fatura_id IS NULL THEN
    SELECT id INTO v_fatura_id FROM public.cartao_faturas WHERE cartao_id = p_cartao_id AND competencia = v_competencia;
  END IF;

  RETURN v_fatura_id;
END;
$$;

-- 8) View de total da fatura (fonte de verdade leitura)
CREATE OR REPLACE VIEW public.vw_cartao_fatura_total AS
SELECT
  cartao_fatura_id,
  COALESCE(SUM(valor), 0) AS valor_total,
  COUNT(*) AS qtd_lancamentos
FROM public.financeiro_lancamentos
WHERE cartao_fatura_id IS NOT NULL
  AND ativo = true
  AND origem_tipo <> 'cartao_fatura'
GROUP BY cartao_fatura_id;

-- 9) estornar_baixa_financeira: usa valor_movimento_bancario quando disponível
CREATE OR REPLACE FUNCTION public.estornar_baixa_financeira(p_baixa_id uuid, p_motivo text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_baixa record;
  v_lanc record;
  v_signal int;
  v_valor numeric;
BEGIN
  SELECT * INTO v_baixa FROM public.financeiro_baixas WHERE id = p_baixa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Baixa % não encontrada', p_baixa_id; END IF;

  SELECT * INTO v_lanc FROM public.financeiro_lancamentos WHERE id = v_baixa.lancamento_id FOR UPDATE;

  v_valor := COALESCE(v_baixa.valor_movimento_bancario, v_baixa.valor_pago);

  IF v_baixa.conta_bancaria_id IS NOT NULL THEN
    v_signal := CASE WHEN v_lanc.tipo = 'receber' THEN -1 ELSE 1 END;
    UPDATE public.contas_bancarias
       SET saldo_atual = COALESCE(saldo_atual, 0) + (v_signal * v_valor),
           updated_at = now()
     WHERE id = v_baixa.conta_bancaria_id;

    INSERT INTO public.caixa_movimentos
      (conta_bancaria_id, tipo, valor, descricao, forma_pagamento, saldo_atual)
    SELECT v_baixa.conta_bancaria_id,
           CASE WHEN v_lanc.tipo = 'receber' THEN 'saida' ELSE 'entrada' END,
           v_valor,
           'Estorno baixa: ' || COALESCE(p_motivo, v_lanc.descricao, v_lanc.id::text),
           v_baixa.forma_pagamento,
           (SELECT saldo_atual FROM public.contas_bancarias WHERE id = v_baixa.conta_bancaria_id);
  END IF;

  DELETE FROM public.financeiro_baixas WHERE id = p_baixa_id;

  IF p_motivo IS NOT NULL THEN
    UPDATE public.financeiro_lancamentos
       SET motivo_estorno = p_motivo, updated_at = now()
     WHERE id = v_baixa.lancamento_id;
  END IF;
END;
$$;
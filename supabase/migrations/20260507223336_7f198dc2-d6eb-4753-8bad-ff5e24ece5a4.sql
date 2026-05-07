
-- ============================================================
-- 1) Conciliação: UNIQUE por (conta_bancaria_id, extrato_referencia)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_baixa_conta_extrato_ref
  ON public.financeiro_baixas (conta_bancaria_id, conciliacao_extrato_referencia)
  WHERE conciliacao_extrato_referencia IS NOT NULL
    AND estornada_em IS NULL;

-- ============================================================
-- 2) Advisory lock + validação extra em conciliar_baixa
-- ============================================================
CREATE OR REPLACE FUNCTION public.financeiro_conciliar_baixa(
  p_baixa_id uuid,
  p_status text,
  p_extrato_referencia text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta uuid;
  v_existe int;
BEGIN
  IF p_status NOT IN ('pendente','conciliado','divergente','desconciliado') THEN
    RAISE EXCEPTION 'Status de conciliação inválido: %', p_status USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('fin_conciliar_baixa:' || p_baixa_id::text));

  SELECT conta_bancaria_id INTO v_conta
    FROM public.financeiro_baixas WHERE id = p_baixa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Baixa % não encontrada', p_baixa_id;
  END IF;

  -- Garante que a referência de extrato não foi usada noutra baixa ativa
  IF p_extrato_referencia IS NOT NULL AND p_status = 'conciliado' THEN
    SELECT COUNT(*) INTO v_existe
      FROM public.financeiro_baixas
     WHERE conta_bancaria_id = v_conta
       AND conciliacao_extrato_referencia = p_extrato_referencia
       AND estornada_em IS NULL
       AND id <> p_baixa_id;
    IF v_existe > 0 THEN
      RAISE EXCEPTION 'Esta transação do extrato já foi conciliada com outra baixa.'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.financeiro_baixas
     SET conciliacao_status = p_status,
         conciliacao_extrato_referencia = COALESCE(p_extrato_referencia, conciliacao_extrato_referencia),
         conciliacao_data = CASE WHEN p_status = 'pendente' THEN NULL ELSE now() END,
         conciliacao_usuario = CASE WHEN p_status = 'pendente' THEN NULL ELSE auth.uid() END
   WHERE id = p_baixa_id;

  INSERT INTO public.financeiro_auditoria(evento, baixa_id, payload, usuario_id)
  VALUES (
    CASE WHEN p_status IN ('desconciliado','pendente') THEN 'desconciliacao' ELSE 'conciliacao' END,
    p_baixa_id,
    jsonb_build_object('status', p_status, 'extrato', p_extrato_referencia),
    auth.uid()
  );
END;
$$;

-- ============================================================
-- 3) Advisory lock em registrar_baixa_financeira
-- ============================================================
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

  -- Trava o lançamento contra baixas concorrentes
  PERFORM pg_advisory_xact_lock(hashtext('fin_baixa:' || p_lancamento_id::text));

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

-- ============================================================
-- 4) Advisory lock em estornar_baixa_financeira
-- ============================================================
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

  PERFORM pg_advisory_xact_lock(hashtext('fin_baixa:' || v_baixa.lancamento_id::text));

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

-- ============================================================
-- 5) Cancelamento — motivo obrigatório (ERRCODE explícito)
-- ============================================================
CREATE OR REPLACE FUNCTION public.financeiro_cancelar_lancamento(p_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_baixas_ativas int;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo do cancelamento é obrigatório (mínimo 5 caracteres).'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('fin_baixa:' || p_id::text));

  SELECT status INTO v_status FROM public.financeiro_lancamentos WHERE id = p_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Lançamento não encontrado: %', p_id;
  END IF;

  IF v_status IN ('cancelado','pago') THEN
    RAISE EXCEPTION 'Lançamento já está em status % e não pode ser cancelado.', v_status;
  END IF;

  SELECT COUNT(*) INTO v_baixas_ativas
  FROM public.financeiro_baixas
  WHERE lancamento_id = p_id AND estornada_em IS NULL;

  IF v_baixas_ativas > 0 THEN
    RAISE EXCEPTION 'Estorne as baixas ativas antes de cancelar este lançamento.';
  END IF;

  UPDATE public.financeiro_lancamentos
  SET status = 'cancelado',
      motivo_estorno = p_motivo,
      updated_at = now()
  WHERE id = p_id;
END;
$$;

-- ============================================================
-- 6) Tabela de persistência de extrato OFX
-- ============================================================
CREATE TABLE IF NOT EXISTS public.financeiro_extrato_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  conta_bancaria_id uuid NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE CASCADE,
  fitid text NOT NULL,
  data date NOT NULL,
  valor numeric(14,2) NOT NULL,
  descricao text,
  arquivo_hash text,
  status text NOT NULL DEFAULT 'pendente',
  baixa_id uuid REFERENCES public.financeiro_baixas(id) ON DELETE SET NULL,
  importado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_fin_extrato_status CHECK (status IN ('pendente','conciliado','ignorado'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_extrato_conta_fitid
  ON public.financeiro_extrato_importacoes (conta_bancaria_id, fitid);

CREATE INDEX IF NOT EXISTS idx_fin_extrato_conta_data
  ON public.financeiro_extrato_importacoes (conta_bancaria_id, data DESC);

-- Trigger empresa_id (mesma função usada nas demais tabelas)
DROP TRIGGER IF EXISTS trg_set_empresa_id_fin_extrato ON public.financeiro_extrato_importacoes;
CREATE TRIGGER trg_set_empresa_id_fin_extrato
  BEFORE INSERT ON public.financeiro_extrato_importacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_empresa_id_default();

-- updated_at
DROP TRIGGER IF EXISTS trg_fin_extrato_updated_at ON public.financeiro_extrato_importacoes;
CREATE TRIGGER trg_fin_extrato_updated_at
  BEFORE UPDATE ON public.financeiro_extrato_importacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.financeiro_extrato_importacoes ENABLE ROW LEVEL SECURITY;

-- Acesso: usuários da mesma empresa com permissão financeiro:* (mesma matriz das demais)
DROP POLICY IF EXISTS "fin_extrato_select" ON public.financeiro_extrato_importacoes;
CREATE POLICY "fin_extrato_select" ON public.financeiro_extrato_importacoes
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "fin_extrato_insert" ON public.financeiro_extrato_importacoes;
CREATE POLICY "fin_extrato_insert" ON public.financeiro_extrato_importacoes
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "fin_extrato_update" ON public.financeiro_extrato_importacoes;
CREATE POLICY "fin_extrato_update" ON public.financeiro_extrato_importacoes
  FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "fin_extrato_delete" ON public.financeiro_extrato_importacoes;
CREATE POLICY "fin_extrato_delete" ON public.financeiro_extrato_importacoes
  FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

COMMENT ON TABLE public.financeiro_extrato_importacoes IS
  'Transações OFX importadas para conciliação bancária. UNIQUE por (conta, fitid) garante idempotência.';

-- Marca a função legada como obsoleta (B-01)
COMMENT ON FUNCTION public.marcar_lancamentos_vencidos() IS
  'DEPRECATED: status "vencido" passou a ser derivado em runtime. Mantida apenas por compatibilidade com cron legado.';

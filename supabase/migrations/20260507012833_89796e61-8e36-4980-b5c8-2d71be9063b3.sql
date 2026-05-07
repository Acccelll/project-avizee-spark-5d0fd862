
-- =============================================================================
-- ONDA 6 / BLOCO 1 — Financeiro: críticos de segurança e integridade
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) cartao_faturas: adicionar empresa_id (nullable, trigger preenche) + RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cartao_faturas
  ADD COLUMN IF NOT EXISTS empresa_id uuid;

-- Backfill via current_empresa_id() — não há empresa_id em cartoes_credito.
UPDATE public.cartao_faturas
   SET empresa_id = public.current_empresa_id()
 WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cartao_faturas_empresa_id
  ON public.cartao_faturas (empresa_id);

DROP TRIGGER IF EXISTS trg_set_empresa_id_cartao_faturas ON public.cartao_faturas;
CREATE TRIGGER trg_set_empresa_id_cartao_faturas
  BEFORE INSERT ON public.cartao_faturas
  FOR EACH ROW EXECUTE FUNCTION public.set_empresa_id_default();

DROP POLICY IF EXISTS cartao_faturas_select_auth ON public.cartao_faturas;
DROP POLICY IF EXISTS cartao_faturas_write_financeiro ON public.cartao_faturas;
DROP POLICY IF EXISTS cartao_faturas_select ON public.cartao_faturas;
DROP POLICY IF EXISTS cartao_faturas_write ON public.cartao_faturas;

CREATE POLICY cartao_faturas_select
  ON public.cartao_faturas FOR SELECT
  USING (empresa_id IS NULL OR empresa_id = public.current_empresa_id() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY cartao_faturas_write
  ON public.cartao_faturas FOR ALL
  USING (
    (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'financeiro'::app_role))
    AND (empresa_id IS NULL OR empresa_id = public.current_empresa_id() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'financeiro'::app_role))
    AND (empresa_id IS NULL OR empresa_id = public.current_empresa_id() OR public.has_role(auth.uid(), 'admin'::app_role))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) budgets_mensais: SELECT tenant-aware
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.budgets_mensais
  ADD COLUMN IF NOT EXISTS empresa_id uuid;

UPDATE public.budgets_mensais
   SET empresa_id = public.current_empresa_id()
 WHERE empresa_id IS NULL;

DROP TRIGGER IF EXISTS trg_set_empresa_id_budgets_mensais ON public.budgets_mensais;
CREATE TRIGGER trg_set_empresa_id_budgets_mensais
  BEFORE INSERT ON public.budgets_mensais
  FOR EACH ROW EXECUTE FUNCTION public.set_empresa_id_default();

CREATE INDEX IF NOT EXISTS idx_budgets_mensais_empresa_id
  ON public.budgets_mensais (empresa_id);

DROP POLICY IF EXISTS bm_select ON public.budgets_mensais;
CREATE POLICY bm_select
  ON public.budgets_mensais FOR SELECT
  USING (empresa_id IS NULL OR empresa_id = public.current_empresa_id() OR public.has_role(auth.uid(), 'admin'::app_role));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) budgets_mensais: estender CHECK para incluir imposto e investimento
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.budgets_mensais
  DROP CONSTRAINT IF EXISTS chk_budgets_categoria;

ALTER TABLE public.budgets_mensais
  ADD CONSTRAINT chk_budgets_categoria
  CHECK (categoria = ANY (ARRAY[
    'receita','despesa','fopag','faturamento','cmv',
    'despesa_operacional','imposto','investimento'
  ]));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) conciliacao_pares: empresa_id + RLS estrito
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.conciliacao_pares
  ADD COLUMN IF NOT EXISTS empresa_id uuid;

UPDATE public.conciliacao_pares cp
   SET empresa_id = fl.empresa_id
  FROM public.financeiro_lancamentos fl
 WHERE cp.lancamento_id = fl.id
   AND cp.empresa_id IS NULL;

DROP TRIGGER IF EXISTS trg_set_empresa_id_conciliacao_pares ON public.conciliacao_pares;
CREATE TRIGGER trg_set_empresa_id_conciliacao_pares
  BEFORE INSERT ON public.conciliacao_pares
  FOR EACH ROW EXECUTE FUNCTION public.set_empresa_id_default();

CREATE INDEX IF NOT EXISTS idx_conciliacao_pares_empresa_id
  ON public.conciliacao_pares (empresa_id);

CREATE INDEX IF NOT EXISTS idx_conciliacao_pares_lancamento
  ON public.conciliacao_pares (lancamento_id);

DROP POLICY IF EXISTS cp_select ON public.conciliacao_pares;
DROP POLICY IF EXISTS cp_insert ON public.conciliacao_pares;
DROP POLICY IF EXISTS cp_delete ON public.conciliacao_pares;

CREATE POLICY cp_select
  ON public.conciliacao_pares FOR SELECT
  USING (empresa_id IS NULL OR empresa_id = public.current_empresa_id() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY cp_insert
  ON public.conciliacao_pares FOR INSERT
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'financeiro'::app_role))
    AND (empresa_id IS NULL OR empresa_id = public.current_empresa_id() OR public.has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY cp_delete
  ON public.conciliacao_pares FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) financeiro_baixas: anti double-conciliação
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uniq_baixa_conciliada_por_lanc
  ON public.financeiro_baixas (lancamento_id)
  WHERE conciliacao_status = 'conciliado' AND estornada_em IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) hard_delete_record: endurecer para financeiro_lancamentos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hard_delete_record(p_table text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_origem text;
  v_tem_baixa boolean;
BEGIN
  IF NOT public.has_role(v_user, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem executar exclusão definitiva.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.hard_delete', 'on', true);

  CASE p_table
    WHEN 'financeiro_lancamentos' THEN
      SELECT origem_tipo INTO v_origem
        FROM public.financeiro_lancamentos WHERE id = p_id;
      IF v_origem IS NULL THEN
        RAISE EXCEPTION 'Lançamento financeiro % não encontrado.', p_id
          USING ERRCODE = '22023';
      END IF;
      IF v_origem <> 'manual' THEN
        RAISE EXCEPTION 'Exclusão definitiva permitida apenas para lançamentos manuais (origem atual: %). Use cancelamento.', v_origem
          USING ERRCODE = '42501';
      END IF;
      SELECT EXISTS (SELECT 1 FROM public.financeiro_baixas WHERE lancamento_id = p_id)
        INTO v_tem_baixa;
      IF v_tem_baixa THEN
        RAISE EXCEPTION 'Lançamento possui histórico de baixas. Use cancelamento para preservar a auditoria.'
          USING ERRCODE = '42501';
      END IF;

      DELETE FROM public.conciliacao_pares WHERE lancamento_id = p_id;
      UPDATE public.nfe_distribuicao SET financeiro_lancamento_id = NULL WHERE financeiro_lancamento_id = p_id;
      UPDATE public.socios_retiradas SET financeiro_lancamento_id = NULL WHERE financeiro_lancamento_id = p_id;
      DELETE FROM public.financeiro_lancamentos WHERE documento_pai_id = p_id;
      DELETE FROM public.financeiro_lancamentos WHERE id = p_id;

    WHEN 'notas_fiscais' THEN
      DELETE FROM public.notas_fiscais_itens WHERE nota_fiscal_id = p_id;
      DELETE FROM public.nota_fiscal_eventos WHERE nota_fiscal_id = p_id;
      DELETE FROM public.nota_fiscal_anexos WHERE nota_fiscal_id = p_id;
      DELETE FROM public.eventos_fiscais WHERE nota_fiscal_id = p_id;
      DELETE FROM public.financeiro_baixas
        WHERE lancamento_id IN (SELECT id FROM public.financeiro_lancamentos WHERE nota_fiscal_id = p_id);
      DELETE FROM public.financeiro_lancamentos WHERE nota_fiscal_id = p_id;
      UPDATE public.remessas SET nota_fiscal_id = NULL WHERE nota_fiscal_id = p_id;
      UPDATE public.notas_fiscais SET nf_referenciada_id = NULL WHERE nf_referenciada_id = p_id;
      DELETE FROM public.recebimentos_compra WHERE nota_fiscal_id = p_id;
      DELETE FROM public.notas_fiscais WHERE id = p_id;

    WHEN 'orcamentos' THEN
      DELETE FROM public.orcamentos_itens WHERE orcamento_id = p_id;
      UPDATE public.orcamentos SET orcamento_pai_id = NULL WHERE orcamento_pai_id = p_id;
      DELETE FROM public.orcamentos WHERE id = p_id;

    WHEN 'clientes' THEN
      DELETE FROM public.clientes WHERE id = p_id;

    WHEN 'fornecedores' THEN
      DELETE FROM public.fornecedores WHERE id = p_id;

    WHEN 'produtos' THEN
      DELETE FROM public.produtos_fornecedores WHERE produto_id = p_id;
      DELETE FROM public.produto_composicoes WHERE produto_pai_id = p_id OR produto_filho_id = p_id;
      DELETE FROM public.produto_identificadores_legacy WHERE produto_id = p_id;
      DELETE FROM public.precos_especiais WHERE produto_id = p_id;
      DELETE FROM public.produtos WHERE id = p_id;

    WHEN 'funcionarios' THEN
      DELETE FROM public.funcionarios WHERE id = p_id;

    WHEN 'transportadoras' THEN
      DELETE FROM public.cliente_transportadoras WHERE transportadora_id = p_id;
      DELETE FROM public.transportadoras WHERE id = p_id;

    WHEN 'formas_pagamento' THEN
      DELETE FROM public.formas_pagamento WHERE id = p_id;

    WHEN 'grupos_economicos' THEN
      UPDATE public.clientes SET grupo_economico_id = NULL WHERE grupo_economico_id = p_id;
      DELETE FROM public.grupos_economicos WHERE id = p_id;

    WHEN 'cartoes_credito' THEN
      DELETE FROM public.cartao_faturas WHERE cartao_id = p_id;
      UPDATE public.financeiro_lancamentos SET cartao_id = NULL WHERE cartao_id = p_id;
      UPDATE public.notas_fiscais SET cartao_id = NULL WHERE cartao_id = p_id;
      DELETE FROM public.cartoes_credito WHERE id = p_id;

    WHEN 'bancos' THEN
      DELETE FROM public.contas_bancarias WHERE banco_id = p_id;
      DELETE FROM public.cartoes_credito WHERE banco_id = p_id;
      DELETE FROM public.bancos WHERE id = p_id;

    ELSE
      RAISE EXCEPTION 'Tabela % não suportada para exclusão definitiva.', p_table
        USING ERRCODE = '22023';
  END CASE;

  BEGIN
    INSERT INTO public.audit_log (user_id, acao, tabela, registro_id, payload)
    VALUES (v_user, 'hard_delete', p_table, p_id, jsonb_build_object('via','hard_delete_record'));
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;
END;
$$;

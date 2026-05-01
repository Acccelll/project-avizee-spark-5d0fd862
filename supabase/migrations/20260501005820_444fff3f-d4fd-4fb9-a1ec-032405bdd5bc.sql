
-- =========================================================================
-- 1) Vínculo Banco -> Fornecedor (opcional)
-- =========================================================================
ALTER TABLE public.bancos
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bancos_fornecedor_id ON public.bancos(fornecedor_id);

-- =========================================================================
-- 2) Cartões de Crédito
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.cartoes_credito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  banco_id uuid REFERENCES public.bancos(id) ON DELETE SET NULL,
  bandeira text,
  ultimos4 text,
  limite numeric(14,2),
  dia_fechamento integer NOT NULL,
  dia_vencimento integer NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_cartoes_ultimos4 CHECK (ultimos4 IS NULL OR ultimos4 ~ '^\d{4}$'),
  CONSTRAINT chk_cartoes_dia_fechamento CHECK (dia_fechamento BETWEEN 1 AND 31),
  CONSTRAINT chk_cartoes_dia_vencimento CHECK (dia_vencimento BETWEEN 1 AND 31)
);

CREATE INDEX IF NOT EXISTS idx_cartoes_credito_ativo ON public.cartoes_credito(ativo);
CREATE INDEX IF NOT EXISTS idx_cartoes_credito_banco ON public.cartoes_credito(banco_id);

ALTER TABLE public.cartoes_credito ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cartoes_credito_select_auth" ON public.cartoes_credito;
CREATE POLICY "cartoes_credito_select_auth" ON public.cartoes_credito
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cartoes_credito_write_financeiro" ON public.cartoes_credito;
CREATE POLICY "cartoes_credito_write_financeiro" ON public.cartoes_credito
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'financeiro'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'financeiro'::app_role));

CREATE TRIGGER trg_cartoes_credito_updated
  BEFORE UPDATE ON public.cartoes_credito
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 3) Faturas de Cartão
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.cartao_faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cartao_id uuid NOT NULL REFERENCES public.cartoes_credito(id) ON DELETE CASCADE,
  competencia text NOT NULL,
  data_abertura date,
  data_fechamento date NOT NULL,
  data_vencimento date NOT NULL,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aberta',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_cartao_faturas_competencia CHECK (competencia ~ '^\d{4}-\d{2}$'),
  CONSTRAINT chk_cartao_faturas_status CHECK (status IN ('aberta','fechada','paga','vencida')),
  CONSTRAINT uniq_cartao_faturas_cartao_comp UNIQUE (cartao_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_cartao_faturas_cartao ON public.cartao_faturas(cartao_id);
CREATE INDEX IF NOT EXISTS idx_cartao_faturas_status ON public.cartao_faturas(status);

ALTER TABLE public.cartao_faturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cartao_faturas_select_auth" ON public.cartao_faturas;
CREATE POLICY "cartao_faturas_select_auth" ON public.cartao_faturas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cartao_faturas_write_financeiro" ON public.cartao_faturas;
CREATE POLICY "cartao_faturas_write_financeiro" ON public.cartao_faturas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'financeiro'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'financeiro'::app_role));

CREATE TRIGGER trg_cartao_faturas_updated
  BEFORE UPDATE ON public.cartao_faturas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 4) financeiro_lancamentos: cartao_id + cartao_fatura_id + idempotência NFe
-- =========================================================================
ALTER TABLE public.financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS cartao_id uuid REFERENCES public.cartoes_credito(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cartao_fatura_id uuid REFERENCES public.cartao_faturas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_lanc_cartao ON public.financeiro_lancamentos(cartao_id);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_cartao_fatura ON public.financeiro_lancamentos(cartao_fatura_id);

-- Idempotência: uma NF + parcela = um único lançamento (parcial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fin_lanc_nfe_parcela
  ON public.financeiro_lancamentos (nota_fiscal_id, parcela_numero)
  WHERE nota_fiscal_id IS NOT NULL AND ativo = true;

-- =========================================================================
-- 5) Canonização de forma_pagamento
-- =========================================================================
UPDATE public.financeiro_lancamentos
SET forma_pagamento = 'boleto_dda'
WHERE forma_pagamento IS NOT NULL
  AND lower(trim(forma_pagamento)) IN ('boleto','dda','boleto/dda','boleto_dda');

UPDATE public.financeiro_lancamentos
SET forma_pagamento = 'cartao_credito'
WHERE forma_pagamento IS NOT NULL
  AND lower(trim(forma_pagamento)) IN ('cartao','cartão','cartao credito','cartao crédito','cartão credito','cartão crédito','cartao_credito','credit card');

UPDATE public.financeiro_lancamentos
SET forma_pagamento = 'pix'
WHERE forma_pagamento IS NOT NULL AND lower(trim(forma_pagamento)) IN ('pix');

UPDATE public.financeiro_lancamentos
SET forma_pagamento = 'debito_automatico'
WHERE forma_pagamento IS NOT NULL
  AND lower(trim(forma_pagamento)) IN ('debito automatico','débito automático','debito_automatico');

UPDATE public.financeiro_lancamentos
SET forma_pagamento = 'cobranca_automatica'
WHERE forma_pagamento IS NOT NULL
  AND lower(trim(forma_pagamento)) IN ('cobranca automatica','cobrança automática','cobranca_automatica');

-- =========================================================================
-- 6) Função: cartao_fatura_para_data (cria sob demanda)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.cartao_fatura_para_data(
  p_cartao_id uuid,
  p_data date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Se a data do lançamento >= dia de fechamento, vai para a fatura do MÊS SEGUINTE.
  IF v_dia_lanc >= v_cartao.dia_fechamento THEN
    v_competencia_data := (date_trunc('month', p_data) + interval '1 month')::date;
  ELSE
    v_competencia_data := date_trunc('month', p_data)::date;
  END IF;

  v_competencia := to_char(v_competencia_data, 'YYYY-MM');

  -- Datas
  v_data_fechamento := make_date(
    EXTRACT(YEAR FROM v_competencia_data)::int,
    EXTRACT(MONTH FROM v_competencia_data)::int,
    LEAST(v_cartao.dia_fechamento, EXTRACT(DAY FROM (date_trunc('month', v_competencia_data) + interval '1 month - 1 day'))::int)
  );

  -- Vencimento: se dia_vencimento <= dia_fechamento, vence no mês seguinte ao fechamento; senão no mesmo mês.
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

REVOKE ALL ON FUNCTION public.cartao_fatura_para_data(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.cartao_fatura_para_data(uuid, date) TO authenticated;

-- =========================================================================
-- 7) Função: gerar_financeiro_nfe_entrada (idempotente)
-- Espera os parâmetros de cobrança vindos do cliente (parser do XML).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.gerar_financeiro_nfe_entrada(
  p_nota_id uuid,
  p_duplicatas jsonb,           -- [{numero, vencimento (date), valor}]
  p_forma_pagamento text DEFAULT 'boleto_dda'
) RETURNS TABLE(lancamento_id uuid, parcela int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nota record;
  v_total int;
  v_dup jsonb;
  v_idx int := 0;
  v_id uuid;
BEGIN
  SELECT id, fornecedor_id, numero, chave_acesso
    INTO v_nota
    FROM public.nota_fiscal
   WHERE id = p_nota_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota fiscal % não encontrada', p_nota_id;
  END IF;

  IF p_duplicatas IS NULL OR jsonb_array_length(p_duplicatas) = 0 THEN
    RETURN;
  END IF;

  v_total := jsonb_array_length(p_duplicatas);

  FOR v_dup IN SELECT * FROM jsonb_array_elements(p_duplicatas) LOOP
    v_idx := v_idx + 1;
    BEGIN
      INSERT INTO public.financeiro_lancamentos (
        tipo, descricao, valor, data_vencimento, status,
        forma_pagamento, fornecedor_id, nota_fiscal_id,
        parcela_numero, parcela_total,
        origem_tipo, origem_tabela, origem_id, origem_descricao,
        ativo, data_emissao
      ) VALUES (
        'pagar',
        'NF-e ' || COALESCE(v_nota.numero, '?') || ' - parcela ' || v_idx || '/' || v_total,
        (v_dup->>'valor')::numeric,
        (v_dup->>'vencimento')::date,
        'aberto',
        COALESCE(p_forma_pagamento, 'boleto_dda'),
        v_nota.fornecedor_id,
        v_nota.id,
        v_idx,
        v_total,
        'nfe_entrada', 'nota_fiscal', v_nota.id,
        'NF-e ' || COALESCE(v_nota.numero,'') || COALESCE(' / chave ' || v_nota.chave_acesso, ''),
        true,
        CURRENT_DATE
      )
      RETURNING id INTO v_id;

      lancamento_id := v_id;
      parcela := v_idx;
      RETURN NEXT;
    EXCEPTION WHEN unique_violation THEN
      -- já existia (idempotente)
      CONTINUE;
    END;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_financeiro_nfe_entrada(uuid, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.gerar_financeiro_nfe_entrada(uuid, jsonb, text) TO authenticated;

-- =========================================================================
-- 8) Auditoria de duplicidades (apenas registro; remoção via RPC controlada)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.audit_dups_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_hash text NOT NULL,
  tipo text NOT NULL,
  fornecedor_id uuid,
  cliente_id uuid,
  valor numeric NOT NULL,
  data_vencimento date NOT NULL,
  parcela_numero integer,
  origem_ref text,
  ids uuid[] NOT NULL,
  ids_baixados uuid[] NOT NULL DEFAULT '{}',
  ids_a_remover uuid[] NOT NULL DEFAULT '{}',
  classificacao text NOT NULL,   -- 'clara' | 'manual_review'
  status text NOT NULL DEFAULT 'pendente', -- 'pendente' | 'removido' | 'mantido'
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  CONSTRAINT chk_audit_dups_class CHECK (classificacao IN ('clara','manual_review')),
  CONSTRAINT chk_audit_dups_status CHECK (status IN ('pendente','removido','mantido'))
);

CREATE INDEX IF NOT EXISTS idx_audit_dups_status ON public.audit_dups_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_audit_dups_class ON public.audit_dups_lancamentos(classificacao);

ALTER TABLE public.audit_dups_lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_dups_admin_only" ON public.audit_dups_lancamentos;
CREATE POLICY "audit_dups_admin_only" ON public.audit_dups_lancamentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));


-- 1) Notas fiscais: vínculo opcional com cartão e fatura
ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS cartao_id UUID REFERENCES public.cartoes_credito(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cartao_fatura_id UUID REFERENCES public.cartao_faturas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notas_fiscais_cartao ON public.notas_fiscais(cartao_id) WHERE cartao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_cartao_fatura ON public.notas_fiscais(cartao_fatura_id) WHERE cartao_fatura_id IS NOT NULL;

-- 2) Formas de pagamento: aceitar cartao_credito e cartao_debito
ALTER TABLE public.formas_pagamento DROP CONSTRAINT IF EXISTS chk_forma_pagamento_tipo;
ALTER TABLE public.formas_pagamento
  ADD CONSTRAINT chk_forma_pagamento_tipo CHECK (
    tipo = ANY (ARRAY['pix','boleto','cartao','cartao_credito','cartao_debito','dinheiro','transferencia','outro'])
  );

-- 3) RPC gerar_financeiro_nfe_entrada — assinatura nova com cartao opcional
DROP FUNCTION IF EXISTS public.gerar_financeiro_nfe_entrada(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.gerar_financeiro_nfe_entrada(uuid, jsonb, text, uuid);

CREATE OR REPLACE FUNCTION public.gerar_financeiro_nfe_entrada(
  p_nota_id uuid,
  p_duplicatas jsonb,
  p_forma_pagamento text DEFAULT 'boleto_dda',
  p_cartao_id uuid DEFAULT NULL
)
RETURNS TABLE(lancamento_id uuid, parcela integer, fatura_id uuid)
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
  v_fatura_id uuid;
  v_vcto date;
  v_forma text;
BEGIN
  SELECT id, fornecedor_id, numero, chave_acesso
    INTO v_nota
    FROM public.notas_fiscais
   WHERE id = p_nota_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota fiscal % nao encontrada', p_nota_id;
  END IF;

  IF p_duplicatas IS NULL OR jsonb_array_length(p_duplicatas) = 0 THEN
    RETURN;
  END IF;

  v_total := jsonb_array_length(p_duplicatas);
  v_forma := COALESCE(p_forma_pagamento, 'boleto_dda');
  IF p_cartao_id IS NOT NULL THEN
    v_forma := 'cartao_credito';
  END IF;

  FOR v_dup IN SELECT * FROM jsonb_array_elements(p_duplicatas) LOOP
    v_idx := v_idx + 1;
    v_vcto := (v_dup->>'vencimento')::date;
    v_fatura_id := NULL;

    IF p_cartao_id IS NOT NULL THEN
      v_fatura_id := public.cartao_fatura_para_data(p_cartao_id, v_vcto);
      SELECT data_vencimento INTO v_vcto FROM public.cartao_faturas WHERE id = v_fatura_id;
    END IF;

    BEGIN
      INSERT INTO public.financeiro_lancamentos (
        tipo, descricao, valor, data_vencimento, status,
        forma_pagamento, fornecedor_id, nota_fiscal_id,
        cartao_id, cartao_fatura_id,
        parcela_numero, parcela_total,
        origem_tipo, origem_tabela, origem_id, origem_descricao,
        ativo, data_emissao
      ) VALUES (
        'pagar',
        'NF-e ' || COALESCE(v_nota.numero,'?') || ' - parcela ' || v_idx || '/' || v_total,
        (v_dup->>'valor')::numeric,
        v_vcto,
        'aberto',
        v_forma,
        v_nota.fornecedor_id,
        v_nota.id,
        p_cartao_id,
        v_fatura_id,
        v_idx, v_total,
        'fiscal_nota', 'notas_fiscais', v_nota.id,
        'NF-e ' || COALESCE(v_nota.numero,'') || COALESCE(' / chave ' || v_nota.chave_acesso, ''),
        true,
        CURRENT_DATE
      ) RETURNING id INTO v_id;

      lancamento_id := v_id;
      parcela := v_idx;
      fatura_id := v_fatura_id;
      RETURN NEXT;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  -- Atualiza vínculo direto na NF (à vista: 1 parcela)
  IF p_cartao_id IS NOT NULL AND v_total = 1 THEN
    UPDATE public.notas_fiscais
       SET cartao_id = p_cartao_id,
           cartao_fatura_id = v_fatura_id
     WHERE id = p_nota_id;
  ELSIF p_cartao_id IS NOT NULL THEN
    UPDATE public.notas_fiscais SET cartao_id = p_cartao_id WHERE id = p_nota_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_financeiro_nfe_entrada(uuid, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_financeiro_nfe_entrada(uuid, jsonb, text, uuid) TO authenticated;

-- 4) Trigger: sincronizar valor_total da fatura
CREATE OR REPLACE FUNCTION public.trg_sync_cartao_fatura_total_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cartao_fatura_id IS NOT NULL THEN v_ids := array_append(v_ids, NEW.cartao_fatura_id); END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.cartao_fatura_id IS NOT NULL THEN v_ids := array_append(v_ids, OLD.cartao_fatura_id); END IF;
  ELSE -- UPDATE
    IF NEW.cartao_fatura_id IS NOT NULL THEN v_ids := array_append(v_ids, NEW.cartao_fatura_id); END IF;
    IF OLD.cartao_fatura_id IS NOT NULL AND OLD.cartao_fatura_id IS DISTINCT FROM NEW.cartao_fatura_id THEN
      v_ids := array_append(v_ids, OLD.cartao_fatura_id);
    END IF;
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    UPDATE public.cartao_faturas f
       SET valor_total = COALESCE((
            SELECT SUM(l.valor) FROM public.financeiro_lancamentos l
             WHERE l.cartao_fatura_id = v_id AND l.ativo = true
          ), 0)
     WHERE f.id = v_id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cartao_fatura_total ON public.financeiro_lancamentos;
CREATE TRIGGER trg_sync_cartao_fatura_total
AFTER INSERT OR UPDATE OF valor, cartao_fatura_id, ativo OR DELETE
ON public.financeiro_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_cartao_fatura_total_fn();

-- 5) RPC baixar fatura em lote
CREATE OR REPLACE FUNCTION public.baixar_fatura_cartao(
  p_fatura_id uuid,
  p_conta_bancaria_id uuid,
  p_data_baixa date DEFAULT CURRENT_DATE
)
RETURNS TABLE(lancamento_id uuid, baixa_id uuid, valor numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lanc record;
  v_baixa_id uuid;
  v_user uuid := auth.uid();
  v_saldo numeric;
BEGIN
  IF NOT (public.has_role(v_user, 'admin'::app_role) OR public.has_role(v_user, 'financeiro'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissao para baixar fatura';
  END IF;

  FOR v_lanc IN
    SELECT id, valor, valor_pago, saldo_restante, status
      FROM public.financeiro_lancamentos
     WHERE cartao_fatura_id = p_fatura_id
       AND ativo = true
       AND status IN ('aberto','parcial')
  LOOP
    v_saldo := COALESCE(v_lanc.saldo_restante, v_lanc.valor - COALESCE(v_lanc.valor_pago,0));
    IF v_saldo <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.financeiro_baixas (
      lancamento_id, valor, data_baixa, conta_bancaria_id, forma_pagamento, observacoes
    ) VALUES (
      v_lanc.id, v_saldo, p_data_baixa, p_conta_bancaria_id, 'fatura_cartao',
      'Baixa em lote via fatura ' || p_fatura_id::text
    ) RETURNING id INTO v_baixa_id;

    lancamento_id := v_lanc.id;
    baixa_id := v_baixa_id;
    valor := v_saldo;
    RETURN NEXT;
  END LOOP;

  -- Atualiza status da fatura
  IF NOT EXISTS (
    SELECT 1 FROM public.financeiro_lancamentos
     WHERE cartao_fatura_id = p_fatura_id AND ativo = true AND status IN ('aberto','parcial')
  ) THEN
    UPDATE public.cartao_faturas SET status = 'paga' WHERE id = p_fatura_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.baixar_fatura_cartao(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.baixar_fatura_cartao(uuid, uuid, date) TO authenticated;

-- 6) Backfill inicial dos valor_total das faturas existentes
UPDATE public.cartao_faturas f
   SET valor_total = COALESCE((
        SELECT SUM(l.valor) FROM public.financeiro_lancamentos l
         WHERE l.cartao_fatura_id = f.id AND l.ativo = true
      ), 0);

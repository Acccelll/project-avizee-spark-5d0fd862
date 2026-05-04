-- Estende chk_fin_lanc_origem_tipo para aceitar 'cartao_fatura'
-- (lançamento consolidado materializado por gerar_fatura_cartao)
ALTER TABLE public.financeiro_lancamentos DROP CONSTRAINT IF EXISTS chk_fin_lanc_origem_tipo;
ALTER TABLE public.financeiro_lancamentos
  ADD CONSTRAINT chk_fin_lanc_origem_tipo
  CHECK (origem_tipo = ANY (ARRAY[
    'manual','fiscal_nota','comercial','compras','parcelamento',
    'folha','sistemica','societario','cartao_fatura'
  ]));
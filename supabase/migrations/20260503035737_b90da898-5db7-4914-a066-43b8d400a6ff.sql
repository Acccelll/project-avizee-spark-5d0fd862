-- Vincular conta bancária a fornecedor (banco como fornecedor) — opcional
ALTER TABLE public.contas_bancarias
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contas_bancarias_fornecedor_id
  ON public.contas_bancarias(fornecedor_id) WHERE fornecedor_id IS NOT NULL;

-- Índice para acelerar render agrupado por parcela/documento pai
CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_pai_parcela
  ON public.financeiro_lancamentos(documento_pai_id, parcela_numero) WHERE documento_pai_id IS NOT NULL;
-- Fase 3 — Cadastros: reforçar integridade de contas_bancarias e índices
-- 1. banco_id passa a NOT NULL (todas as linhas atuais já possuem banco)
ALTER TABLE public.contas_bancarias
  ALTER COLUMN banco_id SET NOT NULL;

-- 2. Índice para acelerar lookup por fornecedor (vínculo opcional banco↔fornecedor)
CREATE INDEX IF NOT EXISTS idx_contas_bancarias_fornecedor_id
  ON public.contas_bancarias(fornecedor_id)
  WHERE fornecedor_id IS NOT NULL;

-- 3. Índice por banco_id para joins frequentes em conciliação/financeiro
CREATE INDEX IF NOT EXISTS idx_contas_bancarias_banco_id
  ON public.contas_bancarias(banco_id);
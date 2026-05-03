
-- 1) RLS: permitir financeiro criar contas bancárias
DROP POLICY IF EXISTS cb_insert ON public.contas_bancarias;
CREATE POLICY cb_insert ON public.contas_bancarias
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'financeiro'::app_role));

-- 2) Índices únicos para evitar duplicatas em notas_fiscais
CREATE UNIQUE INDEX IF NOT EXISTS uq_notas_fiscais_chave
  ON public.notas_fiscais (chave_acesso)
  WHERE chave_acesso IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notas_fiscais_num_serie_emit
  ON public.notas_fiscais (numero, COALESCE(serie,''), COALESCE(fornecedor_id::text, cliente_id::text, ''), tipo)
  WHERE status <> 'cancelada';

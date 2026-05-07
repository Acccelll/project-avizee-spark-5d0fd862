CREATE INDEX IF NOT EXISTS idx_notas_fiscais_empresa_status_data
  ON public.notas_fiscais (empresa_id, status, data_emissao DESC);

CREATE INDEX IF NOT EXISTS idx_notas_fiscais_status_sefaz_data
  ON public.notas_fiscais (status_sefaz, data_emissao DESC);

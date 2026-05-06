-- BK-01 / Onda 2: garantir unicidade de CPF em socios e funcionarios.
-- Usa índice único parcial para permitir múltiplos NULLs / strings vazias
-- (CPF é opcional em ambos os cadastros).

CREATE UNIQUE INDEX IF NOT EXISTS socios_cpf_unique_idx
  ON public.socios (cpf)
  WHERE cpf IS NOT NULL AND cpf <> '';

CREATE UNIQUE INDEX IF NOT EXISTS funcionarios_cpf_unique_idx
  ON public.funcionarios (cpf)
  WHERE cpf IS NOT NULL AND cpf <> '';
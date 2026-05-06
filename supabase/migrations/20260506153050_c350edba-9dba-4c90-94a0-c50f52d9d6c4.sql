ALTER TABLE public.transportadoras
  ADD COLUMN IF NOT EXISTS tipo_pessoa text NOT NULL DEFAULT 'PJ';

ALTER TABLE public.transportadoras
  DROP CONSTRAINT IF EXISTS chk_transportadoras_tipo_pessoa;

ALTER TABLE public.transportadoras
  ADD CONSTRAINT chk_transportadoras_tipo_pessoa
  CHECK (tipo_pessoa IN ('PF','PJ'));
ALTER TABLE public.produtos
  ALTER COLUMN codigo_interno SET NOT NULL;

ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_codigo_interno_unique UNIQUE (codigo_interno);

ALTER TABLE public.produtos
  ADD CONSTRAINT chk_produtos_codigo_interno_formato
  CHECK (codigo_interno ~ '^(PRD|INS)[0-9]{6}$');

CREATE INDEX IF NOT EXISTS idx_produtos_codigo_interno
  ON public.produtos (codigo_interno);
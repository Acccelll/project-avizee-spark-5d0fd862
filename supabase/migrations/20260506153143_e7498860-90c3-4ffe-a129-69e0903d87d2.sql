ALTER TABLE public.transportadoras
  DROP CONSTRAINT IF EXISTS chk_transportadoras_tipo_pessoa;

UPDATE public.transportadoras SET tipo_pessoa = 'J' WHERE tipo_pessoa = 'PJ';
UPDATE public.transportadoras SET tipo_pessoa = 'F' WHERE tipo_pessoa = 'PF';

ALTER TABLE public.transportadoras
  ALTER COLUMN tipo_pessoa SET DEFAULT 'J';

ALTER TABLE public.transportadoras
  ADD CONSTRAINT chk_transportadoras_tipo_pessoa
  CHECK (tipo_pessoa IN ('F','J'));
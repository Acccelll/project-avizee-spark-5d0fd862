-- Coluna para preservar valor anterior do codigo_interno (apenas quando ≠ sku)
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS codigo_interno_legado text;

-- Sequences atômicas
CREATE SEQUENCE IF NOT EXISTS public.seq_codigo_interno_produto START 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_codigo_interno_insumo  START 1;

-- RPC: próximo código interno
CREATE OR REPLACE FUNCTION public.proximo_codigo_interno(_tipo text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n bigint;
  _prefix text;
BEGIN
  IF _tipo = 'produto' THEN
    _prefix := 'PRD';
    _n := nextval('public.seq_codigo_interno_produto');
  ELSIF _tipo = 'insumo' THEN
    _prefix := 'INS';
    _n := nextval('public.seq_codigo_interno_insumo');
  ELSE
    RAISE EXCEPTION 'tipo_item inválido: %, esperado produto|insumo', _tipo;
  END IF;
  RETURN _prefix || lpad(_n::text, 6, '0');
END;
$$;

-- Trigger: gera codigo_interno automaticamente em INSERT quando vazio
CREATE OR REPLACE FUNCTION public.trg_produtos_codigo_interno_auto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo_interno IS NULL OR NEW.codigo_interno = '' OR NEW.codigo_interno = '-' THEN
    NEW.codigo_interno := public.proximo_codigo_interno(COALESCE(NEW.tipo_item, 'produto'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_produtos_codigo_interno_auto ON public.produtos;
CREATE TRIGGER trg_produtos_codigo_interno_auto
  BEFORE INSERT ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.trg_produtos_codigo_interno_auto();
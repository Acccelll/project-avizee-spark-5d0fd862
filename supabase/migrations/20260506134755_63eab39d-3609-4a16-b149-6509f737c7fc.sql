CREATE OR REPLACE FUNCTION public._tmp_variacoes_to_array(_raw text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _raw IS NULL OR btrim(_raw) = '' THEN NULL
    ELSE ARRAY(
      SELECT btrim(x)
      FROM unnest(string_to_array(regexp_replace(_raw, '(\d),(\d)', '\1.\2', 'g'), ',')) AS x
      WHERE btrim(x) <> ''
    )
  END
$$;

ALTER TABLE public.produtos
  ALTER COLUMN variacoes TYPE text[]
  USING public._tmp_variacoes_to_array(variacoes);

DROP FUNCTION public._tmp_variacoes_to_array(text);

COMMENT ON COLUMN public.produtos.variacoes IS 'Variações de tamanho/embalagem do produto (array de textos). Migrado de text CSV em 2026-05.';
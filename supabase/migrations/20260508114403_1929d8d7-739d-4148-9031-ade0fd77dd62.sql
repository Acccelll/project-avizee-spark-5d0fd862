-- Onda 9 C-03: backfill da disponibilidade dos slides em apresentacao_comentarios.
-- Antes (Onda 8.4.3) a presença de "indisponivel" era detectada por substring no
-- comentario_automatico ('indispon%'). Esta migration retroativa popula
-- tags_json.tags = ['indisponivel'] para registros antigos para que o frontend
-- possa remover o fallback substring frágil.

UPDATE public.apresentacao_comentarios
SET tags_json = jsonb_set(
  COALESCE(tags_json, '{}'::jsonb),
  '{tags}',
  to_jsonb(ARRAY['indisponivel'])
)
WHERE (
  tags_json IS NULL
  OR NOT (tags_json ? 'tags')
  OR jsonb_typeof(tags_json -> 'tags') <> 'array'
)
AND lower(coalesce(comentario_automatico, '')) LIKE '%indispon%';

-- Marca explicitamente disponíveis os demais (tags vazias) para que o frontend
-- não precise mais inferir nada por texto.
UPDATE public.apresentacao_comentarios
SET tags_json = jsonb_set(
  COALESCE(tags_json, '{}'::jsonb),
  '{tags}',
  '[]'::jsonb
)
WHERE tags_json IS NULL
  OR NOT (tags_json ? 'tags')
  OR jsonb_typeof(tags_json -> 'tags') <> 'array';
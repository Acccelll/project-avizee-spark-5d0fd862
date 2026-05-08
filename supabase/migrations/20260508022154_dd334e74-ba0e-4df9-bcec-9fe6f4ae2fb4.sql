-- Throttle server-side para chamadas SEFAZ DistDFe (item 2.5 do plano Onda 8)

CREATE TABLE IF NOT EXISTS public.sefaz_consulta_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj        text NOT NULL,
  action      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sefaz_consulta_log_cnpj_action_created
  ON public.sefaz_consulta_log (cnpj, action, created_at DESC);

ALTER TABLE public.sefaz_consulta_log ENABLE ROW LEVEL SECURITY;

-- Sem políticas explícitas para roles autenticadas/anônimas: somente
-- service_role (que ignora RLS) acessa a tabela. Edge functions usam SR.

-- RPC de gating + log atômico
CREATE OR REPLACE FUNCTION public.sefaz_consulta_pode_disparar(
  p_cnpj         text,
  p_action       text,
  p_janela_seg   int  DEFAULT 3600,
  p_max          int  DEFAULT 18
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count  int;
BEGIN
  IF p_cnpj IS NULL OR length(trim(p_cnpj)) = 0 THEN
    RAISE EXCEPTION 'cnpj obrigatório';
  END IF;
  IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
    RAISE EXCEPTION 'action obrigatório';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.sefaz_consulta_log
   WHERE cnpj = p_cnpj
     AND action = p_action
     AND created_at >= now() - (p_janela_seg || ' seconds')::interval;

  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.sefaz_consulta_log(cnpj, action) VALUES (p_cnpj, p_action);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.sefaz_consulta_pode_disparar(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sefaz_consulta_pode_disparar(text, text, int, int) TO service_role;
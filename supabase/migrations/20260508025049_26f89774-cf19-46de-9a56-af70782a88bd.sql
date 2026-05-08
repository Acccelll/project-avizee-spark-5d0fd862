-- Fila de retentativas para emissões SEFAZ com erro temporário/timeout
CREATE TABLE IF NOT EXISTS public.nfe_emissao_pendente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_fiscal_id uuid NOT NULL REFERENCES public.notas_fiscais(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  tentativas int NOT NULL DEFAULT 0,
  max_tentativas int NOT NULL DEFAULT 6,
  ultimo_erro text,
  status text NOT NULL DEFAULT 'pendente',
  proxima_tentativa timestamptz NOT NULL DEFAULT now(),
  protocolo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.nfe_emissao_pendente
  DROP CONSTRAINT IF EXISTS chk_nfe_emissao_pendente_status;
ALTER TABLE public.nfe_emissao_pendente
  ADD CONSTRAINT chk_nfe_emissao_pendente_status
  CHECK (status IN ('pendente','processando','sucesso','falhou_permanente'));

CREATE INDEX IF NOT EXISTS idx_nfe_emissao_pendente_proxima
  ON public.nfe_emissao_pendente(status, proxima_tentativa)
  WHERE status IN ('pendente','processando');
CREATE INDEX IF NOT EXISTS idx_nfe_emissao_pendente_nf
  ON public.nfe_emissao_pendente(nota_fiscal_id);

ALTER TABLE public.nfe_emissao_pendente ENABLE ROW LEVEL SECURITY;

-- Apenas SERVICE_ROLE (worker) acessa via RPCs SECURITY DEFINER abaixo. Sem
-- políticas client — leitura via RPC dedicada se necessário no futuro.

CREATE OR REPLACE FUNCTION public.nfe_emissao_pendente_listar_proximo_lote(
  p_limit int DEFAULT 5
)
RETURNS SETOF public.nfe_emissao_pendente
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM public.nfe_emissao_pendente
    WHERE status = 'pendente'
      AND proxima_tentativa <= now()
    ORDER BY proxima_tentativa ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.nfe_emissao_pendente p
     SET status = 'processando', updated_at = now()
    FROM cte
   WHERE p.id = cte.id
   RETURNING p.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.nfe_emissao_pendente_concluir(
  p_id uuid,
  p_sucesso boolean,
  p_erro text DEFAULT NULL,
  p_protocolo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.nfe_emissao_pendente;
  v_backoff_min int;
BEGIN
  SELECT * INTO v_row FROM public.nfe_emissao_pendente WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_sucesso THEN
    UPDATE public.nfe_emissao_pendente
       SET status = 'sucesso', protocolo = p_protocolo, ultimo_erro = NULL, updated_at = now()
     WHERE id = p_id;
  ELSE
    IF v_row.tentativas + 1 >= v_row.max_tentativas THEN
      UPDATE public.nfe_emissao_pendente
         SET status = 'falhou_permanente',
             tentativas = v_row.tentativas + 1,
             ultimo_erro = p_erro,
             updated_at = now()
       WHERE id = p_id;
    ELSE
      -- Backoff exponencial: 1, 2, 4, 8, 16, 32 minutos
      v_backoff_min := power(2, v_row.tentativas)::int;
      UPDATE public.nfe_emissao_pendente
         SET status = 'pendente',
             tentativas = v_row.tentativas + 1,
             ultimo_erro = p_erro,
             proxima_tentativa = now() + make_interval(mins => v_backoff_min),
             updated_at = now()
       WHERE id = p_id;
    END IF;
  END IF;
END;
$$;

-- Trigger para updated_at automático
DROP TRIGGER IF EXISTS trg_nfe_emissao_pendente_updated_at ON public.nfe_emissao_pendente;
CREATE TRIGGER trg_nfe_emissao_pendente_updated_at
BEFORE UPDATE ON public.nfe_emissao_pendente
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- M-04: Índice composto p/ kpis_fiscal (filtros por ativo+data+status)
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_kpi_compound
  ON public.notas_fiscais(ativo, data_emissao, status)
  WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_tipo
  ON public.notas_fiscais(tipo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_modelo_documento
  ON public.notas_fiscais(modelo_documento) WHERE ativo = true;
CREATE TABLE IF NOT EXISTS public.fiscal_telemetria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  funcao text NOT NULL,
  action text NOT NULL,
  sucesso boolean NOT NULL,
  latencia_ms integer,
  cstat text,
  xmotivo text,
  ambiente text,
  cnpj text,
  erro text,
  detalhes jsonb
);

CREATE INDEX IF NOT EXISTS idx_fiscal_telemetria_created_at ON public.fiscal_telemetria(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_telemetria_funcao_action ON public.fiscal_telemetria(funcao, action);

ALTER TABLE public.fiscal_telemetria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_telemetria admin select" ON public.fiscal_telemetria;
CREATE POLICY "fiscal_telemetria admin select"
ON public.fiscal_telemetria
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

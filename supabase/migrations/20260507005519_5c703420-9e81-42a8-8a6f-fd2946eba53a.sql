
-- ────────────────────────────────────────────────────────────────────────────
-- Onda 5 / Bloco 1 — Multi-tenant hardening (Logística & Recebimentos)
-- ────────────────────────────────────────────────────────────────────────────

-- 1) remessas.empresa_id
ALTER TABLE public.remessas ADD COLUMN IF NOT EXISTS empresa_id uuid;

UPDATE public.remessas r
SET empresa_id = COALESCE(
  (SELECT ov.empresa_id FROM public.ordens_venda ov WHERE ov.id = r.ordem_venda_id),
  (SELECT pc.empresa_id FROM public.pedidos_compra pc WHERE pc.id = r.pedido_compra_id),
  (SELECT c.empresa_id  FROM public.clientes c       WHERE c.id = r.cliente_id),
  public.current_empresa_id()
)
WHERE r.empresa_id IS NULL;

ALTER TABLE public.remessas
  ALTER COLUMN empresa_id SET NOT NULL,
  ALTER COLUMN empresa_id SET DEFAULT public.current_empresa_id();

CREATE INDEX IF NOT EXISTS idx_remessas_empresa ON public.remessas(empresa_id);

-- 2) remessa_eventos.empresa_id (segue a remessa)
ALTER TABLE public.remessa_eventos ADD COLUMN IF NOT EXISTS empresa_id uuid;

UPDATE public.remessa_eventos e
SET empresa_id = (SELECT r.empresa_id FROM public.remessas r WHERE r.id = e.remessa_id)
WHERE e.empresa_id IS NULL;

ALTER TABLE public.remessa_eventos
  ALTER COLUMN empresa_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_remessa_eventos_remessa_data
  ON public.remessa_eventos(remessa_id, data_hora DESC);

-- 3) recebimentos_compra(_itens).empresa_id
ALTER TABLE public.recebimentos_compra ADD COLUMN IF NOT EXISTS empresa_id uuid;

UPDATE public.recebimentos_compra rc
SET empresa_id = (SELECT pc.empresa_id FROM public.pedidos_compra pc WHERE pc.id = rc.pedido_compra_id)
WHERE rc.empresa_id IS NULL;

ALTER TABLE public.recebimentos_compra
  ALTER COLUMN empresa_id SET NOT NULL,
  ALTER COLUMN empresa_id SET DEFAULT public.current_empresa_id();

CREATE INDEX IF NOT EXISTS idx_recebimentos_compra_empresa ON public.recebimentos_compra(empresa_id);

ALTER TABLE public.recebimentos_compra_itens ADD COLUMN IF NOT EXISTS empresa_id uuid;

UPDATE public.recebimentos_compra_itens ri
SET empresa_id = (SELECT rc.empresa_id FROM public.recebimentos_compra rc WHERE rc.id = ri.recebimento_id)
WHERE ri.empresa_id IS NULL;

ALTER TABLE public.recebimentos_compra_itens
  ALTER COLUMN empresa_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recebimentos_compra_itens_empresa ON public.recebimentos_compra_itens(empresa_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Reescreve policies de remessas
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS remessas_select ON public.remessas;
DROP POLICY IF EXISTS remessas_insert ON public.remessas;
DROP POLICY IF EXISTS remessas_update ON public.remessas;
DROP POLICY IF EXISTS remessas_delete ON public.remessas;

CREATE POLICY remessas_select ON public.remessas
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      empresa_id = public.current_empresa_id()
      AND (
        has_role(auth.uid(), 'estoquista'::app_role)
        OR has_role(auth.uid(), 'vendedor'::app_role)
        OR has_role(auth.uid(), 'financeiro'::app_role)
      )
    )
  );

CREATE POLICY remessas_insert ON public.remessas
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.current_empresa_id()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'estoquista'::app_role)
      OR has_role(auth.uid(), 'vendedor'::app_role)
    )
  );

CREATE POLICY remessas_update ON public.remessas
  FOR UPDATE TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'estoquista'::app_role)
    )
  );

CREATE POLICY remessas_delete ON public.remessas
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Reescreve policies de remessa_eventos
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.remessa_eventos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='remessa_eventos'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.remessa_eventos', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY remessa_eventos_select ON public.remessa_eventos
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      empresa_id = public.current_empresa_id()
      AND (
        has_role(auth.uid(), 'estoquista'::app_role)
        OR has_role(auth.uid(), 'vendedor'::app_role)
        OR has_role(auth.uid(), 'financeiro'::app_role)
      )
    )
  );

CREATE POLICY remessa_eventos_insert ON public.remessa_eventos
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.current_empresa_id()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'estoquista'::app_role)
      OR has_role(auth.uid(), 'vendedor'::app_role)
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 6) Endurece SELECT de recebimentos_compra(_itens)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS recebimentos_compra_select_auth ON public.recebimentos_compra;
DROP POLICY IF EXISTS recebimentos_compra_itens_select_auth ON public.recebimentos_compra_itens;

CREATE POLICY recebimentos_compra_select ON public.recebimentos_compra
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR empresa_id = public.current_empresa_id()
  );

CREATE POLICY recebimentos_compra_itens_select ON public.recebimentos_compra_itens
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR empresa_id = public.current_empresa_id()
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 7) Trigger: bloqueia UPDATE direto saindo para estados com efeito de estoque
--    Forçando uso das RPCs marcar_remessa_entregue / cancelar_remessa.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_remessa_protege_status_critico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status_transporte IS DISTINCT FROM OLD.status_transporte
     AND NEW.status_transporte IN ('entregue', 'cancelado')
     AND COALESCE(current_setting('app.allow_remessa_status_critico', true), '') <> 'on'
  THEN
    RAISE EXCEPTION 'Transição para % deve usar a RPC oficial (marcar_remessa_entregue / cancelar_remessa).',
      NEW.status_transporte
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_remessa_protege_status_critico ON public.remessas;
CREATE TRIGGER trg_remessa_protege_status_critico
  BEFORE UPDATE ON public.remessas
  FOR EACH ROW EXECUTE FUNCTION public.fn_remessa_protege_status_critico();

-- Atualiza marcar_remessa_entregue / cancelar_remessa para destravar a guarda dentro da RPC
CREATE OR REPLACE FUNCTION public.marcar_remessa_entregue(p_remessa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.allow_remessa_status_critico', 'on', true);
  UPDATE public.remessas
     SET status_transporte = 'entregue',
         data_entrega_real = COALESCE(data_entrega_real, CURRENT_DATE)
   WHERE id = p_remessa_id;
END
$$;

CREATE OR REPLACE FUNCTION public.cancelar_remessa(p_remessa_id uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.allow_remessa_status_critico', 'on', true);
  UPDATE public.remessas
     SET status_transporte = 'cancelado',
         motivo_cancelamento = COALESCE(p_motivo, motivo_cancelamento)
   WHERE id = p_remessa_id;
END
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8) Defesa em profundidade: quantidade > 0 em estoque_movimentos
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_estoque_movimentos_quantidade_positiva'
  ) THEN
    ALTER TABLE public.estoque_movimentos
      ADD CONSTRAINT chk_estoque_movimentos_quantidade_positiva
      CHECK (quantidade > 0) NOT VALID;
  END IF;
END $$;

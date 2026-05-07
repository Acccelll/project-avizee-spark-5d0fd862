
-- =====================================================================
-- Onda 5 / C-02: garantir saldo_atual corrido em estoque_movimentos
-- Adiciona trigger BEFORE INSERT que calcula saldo_anterior/saldo_atual
-- caso o caller não os tenha preenchido (ex.: INSERT direto via service).
-- RPCs existentes que já calculam saldo continuam compatíveis (no-op).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_estoque_movimentos_saldo_corrido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_anterior NUMERIC;
  v_delta NUMERIC;
BEGIN
  -- Se o caller já preencheu saldo_anterior E saldo_atual, respeitar.
  IF NEW.saldo_anterior IS NOT NULL AND NEW.saldo_atual IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Lock por produto para serializar concorrência.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.produto_id::text));

  -- Buscar o saldo do último movimento (ou estoque_atual do produto como fallback).
  SELECT saldo_atual INTO v_saldo_anterior
  FROM public.estoque_movimentos
  WHERE produto_id = NEW.produto_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_saldo_anterior IS NULL THEN
    SELECT COALESCE(estoque_atual, 0) INTO v_saldo_anterior
    FROM public.produtos WHERE id = NEW.produto_id;
    v_saldo_anterior := COALESCE(v_saldo_anterior, 0);
  END IF;

  -- Calcular delta a partir do tipo (quantidade é sempre não-negativa).
  v_delta := CASE NEW.tipo
    WHEN 'entrada' THEN COALESCE(NEW.quantidade, 0)
    WHEN 'estorno' THEN COALESCE(NEW.quantidade, 0)
    WHEN 'liberacao_reserva' THEN COALESCE(NEW.quantidade, 0)
    WHEN 'saida' THEN -COALESCE(NEW.quantidade, 0)
    WHEN 'perda_avaria' THEN -COALESCE(NEW.quantidade, 0)
    WHEN 'reserva' THEN -COALESCE(NEW.quantidade, 0)
    WHEN 'ajuste' THEN COALESCE(NEW.quantidade, 0)        -- RPC já grava quantidade como delta com sinal
    WHEN 'inventario' THEN COALESCE(NEW.quantidade, 0)
    WHEN 'transferencia' THEN 0
    ELSE 0
  END;

  NEW.saldo_anterior := COALESCE(NEW.saldo_anterior, v_saldo_anterior);
  NEW.saldo_atual := COALESCE(NEW.saldo_atual, v_saldo_anterior + v_delta);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estoque_movimentos_saldo_corrido ON public.estoque_movimentos;
CREATE TRIGGER trg_estoque_movimentos_saldo_corrido
  BEFORE INSERT ON public.estoque_movimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_estoque_movimentos_saldo_corrido();

-- Backfill: recomputar saldo_atual cronologicamente onde possa estar inconsistente
-- (apenas linhas com saldo_atual NULL — preserva histórico já calculado).
WITH ordenado AS (
  SELECT id,
         produto_id,
         tipo,
         quantidade,
         created_at,
         SUM(
           CASE tipo
             WHEN 'entrada' THEN COALESCE(quantidade, 0)
             WHEN 'estorno' THEN COALESCE(quantidade, 0)
             WHEN 'liberacao_reserva' THEN COALESCE(quantidade, 0)
             WHEN 'saida' THEN -COALESCE(quantidade, 0)
             WHEN 'perda_avaria' THEN -COALESCE(quantidade, 0)
             WHEN 'reserva' THEN -COALESCE(quantidade, 0)
             WHEN 'ajuste' THEN COALESCE(quantidade, 0)
             WHEN 'inventario' THEN COALESCE(quantidade, 0)
             ELSE 0
           END
         ) OVER (PARTITION BY produto_id ORDER BY created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo_calc
  FROM public.estoque_movimentos
)
UPDATE public.estoque_movimentos m
SET saldo_atual = o.saldo_calc
FROM ordenado o
WHERE m.id = o.id AND m.saldo_atual IS NULL;

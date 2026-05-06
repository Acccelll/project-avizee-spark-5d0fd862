CREATE OR REPLACE FUNCTION public.salvar_pedido_operacional(
  p_id uuid,
  p_patch jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'p_id obrigatório';
  END IF;

  UPDATE ordens_venda SET
    status = COALESCE(NULLIF(p_patch->>'status',''), status),
    po_number = COALESCE(p_patch->>'po_number', po_number),
    data_po_cliente = COALESCE(NULLIF(p_patch->>'data_po_cliente','')::date, data_po_cliente),
    data_prometida_despacho = COALESCE(NULLIF(p_patch->>'data_prometida_despacho','')::date, data_prometida_despacho),
    prazo_despacho_dias = COALESCE((p_patch->>'prazo_despacho_dias')::int, prazo_despacho_dias),
    observacoes = COALESCE(p_patch->>'observacoes', observacoes),
    updated_at = now()
  WHERE id = p_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_pedido_operacional(uuid, jsonb) TO authenticated;
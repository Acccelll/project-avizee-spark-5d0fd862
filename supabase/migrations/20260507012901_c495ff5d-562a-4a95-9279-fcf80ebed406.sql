
CREATE OR REPLACE FUNCTION public.financeiro_conciliar_lote(
  p_conta_bancaria_id uuid,
  p_data_conciliacao timestamptz,
  p_pares jsonb,
  p_observacoes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_conc_id uuid;
  v_par jsonb;
  v_total int := 0;
BEGIN
  IF NOT (public.has_role(v_user, 'admin'::app_role) OR public.has_role(v_user, 'financeiro'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado: requer perfil admin ou financeiro.'
      USING ERRCODE = '42501';
  END IF;

  IF p_pares IS NULL OR jsonb_array_length(p_pares) = 0 THEN
    RAISE EXCEPTION 'Nenhum par informado para conciliação.';
  END IF;

  v_total := jsonb_array_length(p_pares);

  INSERT INTO public.conciliacao_bancaria (
    conta_bancaria_id, data_conciliacao, total_pares, observacoes, usuario_id
  ) VALUES (
    p_conta_bancaria_id, p_data_conciliacao, v_total, p_observacoes, v_user
  ) RETURNING id INTO v_conc_id;

  FOR v_par IN SELECT * FROM jsonb_array_elements(p_pares) LOOP
    INSERT INTO public.conciliacao_pares (
      conciliacao_id, lancamento_id, extrato_id, valor_extrato, valor_lancamento
    ) VALUES (
      v_conc_id,
      (v_par->>'lancamento_id')::uuid,
      v_par->>'extrato_id',
      NULLIF(v_par->>'valor_extrato','')::numeric,
      NULLIF(v_par->>'valor_lancamento','')::numeric
    );
  END LOOP;

  RETURN v_conc_id;
END;
$$;

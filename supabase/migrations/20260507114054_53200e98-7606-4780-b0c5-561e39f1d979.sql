-- Captura de comentário do cliente na resposta pública do orçamento.
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS cliente_resposta_comentario text,
  ADD COLUMN IF NOT EXISTS cliente_resposta_em timestamptz;

-- Estende RPC pública para aceitar comentário (obrigatório em rejeição) e
-- persistir junto à mudança de status. Mantém grants e validações.
CREATE OR REPLACE FUNCTION public.acao_cliente_orcamento(
  p_token uuid,
  p_acao text,
  p_comentario text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orc public.orcamentos%ROWTYPE;
  v_now timestamptz := now();
  v_comentario text := NULLIF(btrim(coalesce(p_comentario, '')), '');
BEGIN
  IF p_acao NOT IN ('aprovado','rejeitado') THEN
    RAISE EXCEPTION 'Ação inválida: %', p_acao USING ERRCODE = '22023';
  END IF;

  IF p_acao = 'rejeitado' AND (v_comentario IS NULL OR length(v_comentario) < 3) THEN
    RAISE EXCEPTION 'Comentário obrigatório (mín. 3 caracteres) para solicitar revisão'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_orc
  FROM public.orcamentos
  WHERE public_token = p_token
    AND COALESCE(ativo, true) = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_orc.status <> 'pendente' THEN
    RAISE EXCEPTION 'Orçamento no status "%" não permite esta ação', v_orc.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_orc.validade IS NOT NULL AND v_orc.validade < CURRENT_DATE THEN
    RAISE EXCEPTION 'Orçamento expirado' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.orcamentos
     SET status = p_acao,
         cliente_resposta_comentario = v_comentario,
         cliente_resposta_em = v_now,
         updated_at = v_now
   WHERE id = v_orc.id;

  INSERT INTO public.auditoria_logs (tabela, acao, registro_id, usuario_id, dados_anteriores, dados_novos)
  VALUES (
    'orcamentos',
    'cliente_publico_' || p_acao,
    v_orc.id,
    NULL,
    jsonb_build_object('status', v_orc.status),
    jsonb_build_object(
      'status', p_acao,
      'origem', 'cliente_publico',
      'comentario', v_comentario
    )
  );

  RETURN jsonb_build_object(
    'id', v_orc.id,
    'status', p_acao,
    'numero', v_orc.numero,
    'vendedor_id', v_orc.vendedor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.acao_cliente_orcamento(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.acao_cliente_orcamento(uuid, text, text) TO anon, authenticated;
-- Mantém também a assinatura antiga executável (compat) — apenas redireciona.
REVOKE ALL ON FUNCTION public.acao_cliente_orcamento(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.acao_cliente_orcamento(uuid, text) TO anon, authenticated;

-- DB-02: restringe acesso direto a recebimentos_compra / recebimentos_compra_itens.
-- A escrita continua disponível via RPCs SECURITY DEFINER (receber_compra, estornar_recebimento_compra).

DROP POLICY IF EXISTS auth_full_recebimentos ON public.recebimentos_compra;
DROP POLICY IF EXISTS auth_full_recebimentos_itens ON public.recebimentos_compra_itens;

CREATE POLICY recebimentos_compra_select_auth
  ON public.recebimentos_compra
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY recebimentos_compra_itens_select_auth
  ON public.recebimentos_compra_itens
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE intencionalmente sem policy: only SECURITY DEFINER RPCs.

import { Outlet } from "react-router-dom";
import { useNfeEntradaToast } from "@/hooks/useNfeEntradaToast";
import { useAutoCienciaDistDFe } from "@/hooks/useAutoCienciaDistDFe";

/**
 * Shell condicional do módulo Fiscal.
 *
 * Monta os hooks de domínio fiscal (toast de NF-e novas + auto-ciência DistDF-e)
 * apenas quando o usuário está dentro de uma rota `/fiscal/*`. Antes, esses
 * hooks rodavam no `AppLayout` para todos os usuários autenticados, gerando
 * queries Supabase desnecessárias para perfis sem permissão fiscal.
 *
 * O guard de permissão (`PermissionRoute resource="faturamento_fiscal"`) continua
 * em cada rota individual; este shell apenas escopa os efeitos colaterais.
 */
export function FiscalShell() {
  useNfeEntradaToast();
  useAutoCienciaDistDFe();
  return <Outlet />;
}

export default FiscalShell;

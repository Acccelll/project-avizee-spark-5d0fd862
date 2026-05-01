import { useCallback, useEffect, useState } from "react";
import type { FinanceiroAuxiliaresState } from "@/pages/financeiro/types";
import { fetchFinanceiroAuxiliares } from "@/services/financeiro/auxiliares";

const INITIAL_STATE: FinanceiroAuxiliaresState = {
  contasBancarias: [],
  contasContabeis: [],
  cartoes: [],
};

export function useFinanceiroAuxiliares() {
  const [state, setState] = useState<FinanceiroAuxiliaresState>(INITIAL_STATE);

  const loadAuxiliares = useCallback(async () => {
    const next = await fetchFinanceiroAuxiliares();
    setState(next);
  }, []);

  useEffect(() => {
    loadAuxiliares();
  }, [loadAuxiliares]);

  return {
    ...state,
    loadAuxiliares,
  };
}

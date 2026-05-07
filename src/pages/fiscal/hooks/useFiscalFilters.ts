import { useMemo, useState, useCallback } from "react";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import {
  getFiscalInternalStatus,
  getFiscalSefazStatus,
} from "@/lib/fiscalStatus";

const modeloLabels: Record<string, string> = {
  "55": "NF-e",
  "65": "NFC-e",
  "57": "CT-e",
  "67": "CT-e OS",
  nfse: "NFS-e",
  outro: "Outro",
};

const origemLabels: Record<string, string> = {
  manual: "Manual",
  pedido: "Pedido",
  importacao_xml: "Importação XML",
};

export interface NotaFiscalFilterInput {
  tipo: string;
  id?: string;
  data_emissao?: string | null;
  modelo_documento: string | null;
  status: string;
  status_sefaz: string | null;
  origem: string | null;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  fornecedores?: { nome_razao_social: string } | null;
  clientes?: { nome_razao_social: string } | null;
  ordens_venda?: { numero: string } | null;
}

export interface UseFiscalFiltersOptions {
  /** Filtro vindo da URL via ?tipo=entrada/saida */
  tipoFromUrl?: string | null;
  /** Filtro vindo da URL via ?status=rascunho,pendente */
  statusFromUrl?: string[];
  /** Default do filtro mês de emissão (YYYY-MM). Use null/'' para desligar default. */
  defaultEmissaoMes?: string | null;
  /** IDs de notas cujo vencimento financeiro intersecta o mês selecionado.
   * Quando `vencimentoMes` está setado, este set é aplicado. */
  vencimentoNotaIds?: Set<string> | null;
  /** Quando informado, `emissaoMes` é controlado externamente (Fiscal.tsx
   *  precisa ler o valor antes de montar a query server-side). */
  emissaoMesControlled?: { value: string; onChange: (v: string) => void };
}

/**
 * Agrupa todo o estado e a lógica de filtragem da grid de Notas Fiscais.
 * Extraído de `Fiscal.tsx` na Fase 3-final do roadmap fiscal.
 */
export function useFiscalFilters<T extends NotaFiscalFilterInput>(
  data: T[],
  options: UseFiscalFiltersOptions = {},
) {
  const { tipoFromUrl = null, statusFromUrl = [], defaultEmissaoMes = null, vencimentoNotaIds = null, emissaoMesControlled } = options;

  const [consultaSearch, setConsultaSearch] = useState("");
  const [tipoFilters, setTipoFilters] = useState<string[]>([]);
  const [modeloFilters, setModeloFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [origemFilters, setOrigemFilters] = useState<string[]>([]);
  const [statusSefazFilters, setStatusSefazFilters] = useState<string[]>([]);
  const [emissaoMesInternal, setEmissaoMesInternal] = useState<string>(defaultEmissaoMes ?? "");
  const emissaoMes = emissaoMesControlled ? emissaoMesControlled.value : emissaoMesInternal;
  const setEmissaoMes = emissaoMesControlled ? emissaoMesControlled.onChange : setEmissaoMesInternal;
  const [vencimentoMes, setVencimentoMes] = useState<string>("");

  const filteredData = useMemo(() => {
    const query = consultaSearch.trim().toLowerCase();
    return data.filter((n) => {
      if (tipoFromUrl && n.tipo !== tipoFromUrl) return false;
      if (tipoFilters.length > 0 && !tipoFilters.includes(n.tipo)) return false;
      if (
        modeloFilters.length > 0 &&
        !modeloFilters.includes(n.modelo_documento || "55")
      )
        return false;
      if (statusFilters.length > 0 && !statusFilters.includes(n.status))
        return false;
      if (statusFromUrl.length > 0 && !statusFromUrl.includes(n.status))
        return false;
      if (
        origemFilters.length > 0 &&
        !origemFilters.includes(n.origem || "manual")
      )
        return false;
      if (
        statusSefazFilters.length > 0 &&
        !statusSefazFilters.includes(n.status_sefaz || "nao_enviada")
      )
        return false;
      if (emissaoMes && (n.data_emissao || "").slice(0, 7) !== emissaoMes) return false;
      if (vencimentoMes && vencimentoNotaIds && n.id && !vencimentoNotaIds.has(n.id)) return false;
      if (vencimentoMes && !vencimentoNotaIds) return false;
      if (!query) return true;
      const parceiro =
        n.tipo === "entrada"
          ? n.fornecedores?.nome_razao_social
          : n.clientes?.nome_razao_social;
      const haystack = [
        n.numero,
        n.serie,
        n.chave_acesso,
        parceiro,
        n.ordens_venda?.numero,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [
    consultaSearch,
    data,
    tipoFromUrl,
    modeloFilters,
    statusFilters,
    tipoFilters,
    origemFilters,
    statusSefazFilters,
    statusFromUrl,
    emissaoMes,
    vencimentoMes,
    vencimentoNotaIds,
  ]);

  const activeFilterChips = useMemo(() => {
    const chips: FilterChip[] = [];
    if (emissaoMes) {
      chips.push({ key: "emissao_mes", label: "Emissão", value: [emissaoMes], displayValue: emissaoMes });
    }
    if (vencimentoMes) {
      chips.push({ key: "vencimento_mes", label: "Vencimento", value: [vencimentoMes], displayValue: vencimentoMes });
    }
    tipoFilters.forEach((f) =>
      chips.push({
        key: "tipo",
        label: "Tipo",
        value: [f],
        displayValue: f === "entrada" ? "Entrada" : "Saída",
      }),
    );
    modeloFilters.forEach((f) =>
      chips.push({
        key: "modelo",
        label: "Modelo",
        value: [f],
        displayValue: modeloLabels[f] || f,
      }),
    );
    statusFilters.forEach((f) =>
      chips.push({
        key: "status",
        label: "Status ERP",
        value: [f],
        displayValue: getFiscalInternalStatus(f).label,
      }),
    );
    origemFilters.forEach((f) =>
      chips.push({
        key: "origem",
        label: "Origem",
        value: [f],
        displayValue: origemLabels[f] || f,
      }),
    );
    statusSefazFilters.forEach((f) =>
      chips.push({
        key: "status_sefaz",
        label: "Status SEFAZ",
        value: [f],
        displayValue: getFiscalSefazStatus(f).label,
      }),
    );
    return chips;
  }, [
    tipoFilters,
    modeloFilters,
    statusFilters,
    origemFilters,
    statusSefazFilters,
    emissaoMes,
    vencimentoMes,
  ]);

  const removeFilter = useCallback((key: string, value?: string) => {
    if (!value) return;
    if (key === "emissao_mes") setEmissaoMes("");
    if (key === "vencimento_mes") setVencimentoMes("");
    if (key === "tipo") setTipoFilters((prev) => prev.filter((v) => v !== value));
    if (key === "modelo")
      setModeloFilters((prev) => prev.filter((v) => v !== value));
    if (key === "status")
      setStatusFilters((prev) => prev.filter((v) => v !== value));
    if (key === "origem")
      setOrigemFilters((prev) => prev.filter((v) => v !== value));
    if (key === "status_sefaz")
      setStatusSefazFilters((prev) => prev.filter((v) => v !== value));
  }, []);

  const clearAll = useCallback(() => {
    setConsultaSearch("");
    setTipoFilters([]);
    setModeloFilters([]);
    setStatusFilters([]);
    setOrigemFilters([]);
    setStatusSefazFilters([]);
    setEmissaoMes("");
    setVencimentoMes("");
  }, []);

  return {
    // valores
    filteredData,
    activeFilterChips,
    // estados de filtro (controlados)
    consultaSearch,
    tipoFilters,
    modeloFilters,
    statusFilters,
    origemFilters,
    statusSefazFilters,
    // setters
    setConsultaSearch,
    setTipoFilters,
    setModeloFilters,
    setStatusFilters,
    setOrigemFilters,
    setStatusSefazFilters,
    // novos filtros de mês
    emissaoMes,
    setEmissaoMes,
    vencimentoMes,
    setVencimentoMes,
    // helpers
    removeFilter,
    clearAll,
  };
}
import { useMemo } from "react";
import { useUrlListState } from "@/hooks/useUrlListState";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { type MultiSelectOption } from "@/components/ui/MultiSelect";
import { formatDate } from "@/lib/format";
import type { CotacaoCompra, CotacaoSummary } from "./cotacaoCompraTypes";

export function useCotacaoCompraFilters(
  data: CotacaoCompra[],
  statusLabels: Record<string, string>,
  options?: {
    summaries?: Record<string, CotacaoSummary>;
    fornecedorLabel?: (id: string) => string | undefined;
  },
) {
  const { value: filterState, set: setFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      status: { type: "stringArray" },
      fornecedor: { type: "stringArray" },
      dataInicio: { type: "string", aliases: ["data_inicio"] },
      dataFim: { type: "string", aliases: ["data_fim"] },
      validade: { type: "string" },
    },
  });
  const searchTerm = filterState.q;
  const statusFilters = filterState.status;
  const fornecedorFilters = filterState.fornecedor;
  const dataInicio = filterState.dataInicio;
  const dataFim = filterState.dataFim;
  const validadeFilter = filterState.validade;

  const setSearchTerm = (v: string) => setFilters({ q: v });
  const setStatusFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(statusFilters) : fn;
    setFilters({ status: next });
  };
  const setFornecedorFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(fornecedorFilters) : fn;
    setFilters({ fornecedor: next });
  };
  const setDataInicio = (v: string) => setFilters({ dataInicio: v });
  const setDataFim = (v: string) => setFilters({ dataFim: v });
  const setValidadeFilter = (v: string) => setFilters({ validade: v });

  const filteredData = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7d = new Date(today);
    in7d.setDate(in7d.getDate() + 7);
    return data.filter((c) => {
      if (statusFilters.length > 0 && !statusFilters.includes(c.status)) return false;
      if (fornecedorFilters.length > 0) {
        // Cotação não tem fornecedor direto: usamos os fornecedores das propostas
        // (enriquecimento `summaries[id].fornecedor_ids`).
        const ids = options?.summaries?.[c.id]?.fornecedor_ids ?? [];
        if (!fornecedorFilters.some((f) => ids.includes(f))) return false;
      }
      if (dataInicio && c.data_cotacao < dataInicio) return false;
      if (dataFim && c.data_cotacao > dataFim) return false;
      if (validadeFilter) {
        if (validadeFilter === "sem_validade") {
          if (c.data_validade) return false;
        } else if (validadeFilter === "vencidas") {
          if (!c.data_validade) return false;
          if (new Date(c.data_validade) >= today) return false;
        } else if (validadeFilter === "vencendo") {
          if (!c.data_validade) return false;
          const v = new Date(c.data_validade);
          if (v < today || v > in7d) return false;
        }
      }
      if (normalizedSearch) {
        const q = normalizedSearch;
        const produtosText = options?.summaries?.[c.id]?.produtos_text ?? "";
        if (
          !c.numero.toLowerCase().includes(q) &&
          !(c.observacoes || "").toLowerCase().includes(q) &&
          !produtosText.includes(q)
        )
          return false;
      }
      return true;
    });
  }, [data, statusFilters, fornecedorFilters, dataInicio, dataFim, searchTerm, options?.summaries]);

  const activeFilters = useMemo<FilterChip[]>(() => {
    const chips = statusFilters.map((s) => ({
      key: "status",
      label: "Status",
      value: [s],
      displayValue: statusLabels[s] || s,
    }));
    fornecedorFilters.forEach((f) => {
      chips.push({
        key: "fornecedor",
        label: "Fornecedor",
        value: [f],
        displayValue: options?.fornecedorLabel?.(f) ?? f,
      });
    });
    if (dataInicio) {
      chips.push({
        key: "dataInicio",
        label: "Cotação desde",
        value: [dataInicio],
        displayValue: formatDate(dataInicio),
      });
    }
    if (dataFim) {
      chips.push({
        key: "dataFim",
        label: "Cotação até",
        value: [dataFim],
        displayValue: formatDate(dataFim),
      });
    }
    if (validadeFilter) {
      const labelMap: Record<string, string> = {
        vencidas: "Vencidas",
        vencendo: "Vencendo (≤7d)",
        sem_validade: "Sem validade",
      };
      chips.push({
        key: "validade",
        label: "Validade",
        value: [validadeFilter],
        displayValue: labelMap[validadeFilter] ?? validadeFilter,
      });
    }
    return chips;
  }, [statusFilters, statusLabels, fornecedorFilters, dataInicio, dataFim, validadeFilter, options]);

  const handleRemoveFilter = (key: string, value?: string) => {
    if (key === "status") setStatusFilters((prev) => prev.filter((v) => v !== value));
    if (key === "fornecedor") setFornecedorFilters((prev) => prev.filter((v) => v !== value));
    if (key === "dataInicio") setDataInicio("");
    if (key === "dataFim") setDataFim("");
    if (key === "validade") setValidadeFilter("");
  };

  const statusOptions: MultiSelectOption[] = Object.entries(statusLabels).map(
    ([value, label]) => ({ value, label })
  );

  return {
    searchTerm,
    setSearchTerm,
    statusFilters,
    setStatusFilters,
    fornecedorFilters,
    setFornecedorFilters,
    dataInicio,
    setDataInicio,
    dataFim,
    setDataFim,
    validadeFilter,
    setValidadeFilter,
    filteredData,
    activeFilters,
    handleRemoveFilter,
    statusOptions,
  };
}

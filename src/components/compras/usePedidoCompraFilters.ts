import { useMemo } from "react";
import { useUrlListState } from "@/hooks/useUrlListState";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { type MultiSelectOption } from "@/components/ui/MultiSelect";
import { formatDate } from "@/lib/format";
import type { PedidoCompra, FornecedorOptionRow } from "./pedidoCompraTypes";
import { canonicalPedidoStatus } from "./comprasStatus";

export const recebimentoFilterOptions: MultiSelectOption[] = [
  { label: "Aguardando Recebimento", value: "aguardando" },
  { label: "Parcialmente Recebido", value: "parcial" },
  { label: "Recebido", value: "recebido" },
];

function getRecebimentoFilter(status: string): string {
  const normalized = canonicalPedidoStatus(status);
  if (normalized === "recebido") return "recebido";
  if (normalized === "parcialmente_recebido") return "parcial";
  if (["aguardando_recebimento", "enviado_ao_fornecedor", "aprovado"].includes(normalized)) return "aguardando";
  return "";
}

export interface PedidoCompraFiltersState {
  searchTerm: string;
  statusFilters: string[];
  fornecedorFilters: string[];
  recebimentoFilters: string[];
  dataInicio: string;
  dataFim: string;
}

export function usePedidoCompraFilters(
  pedidos: PedidoCompra[],
  fornecedoresAtivos: FornecedorOptionRow[],
  statusLabels: Record<string, string>,
) {
  // Filtros serializados como CSV via `useUrlListState`. Aliases preservam
  // compatibilidade com links antigos (`data_inicio`/`data_fim`).
  const { value: filterState, set: setFilters, clear: clearFilters } = useUrlListState({
    schema: {
      q: { type: "string" },
      status: { type: "stringArray" },
      fornecedor: { type: "stringArray" },
      recebimento: { type: "stringArray" },
      dataInicio: { type: "string", aliases: ["data_inicio"] },
      dataFim: { type: "string", aliases: ["data_fim"] },
    },
  });
  const searchTerm = filterState.q;
  const statusFilters = filterState.status;
  const fornecedorFilters = filterState.fornecedor;
  const recebimentoFilters = filterState.recebimento;
  const dataInicio = filterState.dataInicio;
  const dataFim = filterState.dataFim;

  const setSearchTerm = (v: string) => setFilters({ q: v });
  const setStatusFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(statusFilters) : fn;
    setFilters({ status: next });
  };
  const setFornecedorFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(fornecedorFilters) : fn;
    setFilters({ fornecedor: next });
  };
  const setRecebimentoFilters = (fn: string[] | ((prev: string[]) => string[])) => {
    const next = typeof fn === "function" ? fn(recebimentoFilters) : fn;
    setFilters({ recebimento: next });
  };
  const setDataInicio = (v: string) => setFilters({ dataInicio: v });
  const setDataFim = (v: string) => setFilters({ dataFim: v });

  const pedidoNumero = (p: Pick<PedidoCompra, "id" | "numero">) => p.numero || `PC-${p.id}`;

  const filteredData = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (statusFilters.length > 0 && !statusFilters.includes(p.status)) return false;
      if (fornecedorFilters.length > 0 && !fornecedorFilters.includes(String(p.fornecedor_id || ""))) return false;
      if (recebimentoFilters.length > 0) {
        const rf = getRecebimentoFilter(p.status);
        if (!recebimentoFilters.includes(rf)) return false;
      }
      if (dataInicio && p.data_pedido < dataInicio) return false;
      if (dataFim && p.data_pedido > dataFim) return false;
      if (!query) return true;
      return [
        pedidoNumero(p),
        p.fornecedores?.nome_razao_social,
        p.observacoes,
        p.condicao_pagamento,
      ].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [pedidos, searchTerm, statusFilters, fornecedorFilters, recebimentoFilters, dataInicio, dataFim]);

  const activeFilters = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    statusFilters.forEach((f) => chips.push({ key: "status", label: "Status", value: [f], displayValue: statusLabels[f] || f }));
    fornecedorFilters.forEach((f) => {
      const forn = fornecedoresAtivos.find((x) => String(x.id) === f);
      chips.push({ key: "fornecedor", label: "Fornecedor", value: [f], displayValue: forn?.nome_razao_social || f });
    });
    recebimentoFilters.forEach((f) => {
      const opt = recebimentoFilterOptions.find((x) => x.value === f);
      chips.push({ key: "recebimento", label: "Recebimento", value: [f], displayValue: opt?.label || f });
    });
    if (dataInicio) chips.push({ key: "dataInicio", label: "Pedido desde", value: [dataInicio], displayValue: formatDate(dataInicio) });
    if (dataFim) chips.push({ key: "dataFim", label: "Pedido até", value: [dataFim], displayValue: formatDate(dataFim) });
    return chips;
  }, [statusFilters, fornecedorFilters, recebimentoFilters, dataInicio, dataFim, fornecedoresAtivos, statusLabels]);

  const handleRemoveFilter = (key: string, value?: string) => {
    if (key === "status") setStatusFilters((prev) => prev.filter((v) => v !== value));
    if (key === "fornecedor") setFornecedorFilters((prev) => prev.filter((v) => v !== value));
    if (key === "recebimento") setRecebimentoFilters((prev) => prev.filter((v) => v !== value));
    if (key === "dataInicio") setDataInicio("");
    if (key === "dataFim") setDataFim("");
  };

  const handleClearAllFilters = () => {
    clearFilters();
  };

  return {
    searchTerm,
    setSearchTerm,
    statusFilters,
    setStatusFilters,
    fornecedorFilters,
    setFornecedorFilters,
    recebimentoFilters,
    setRecebimentoFilters,
    dataInicio,
    setDataInicio,
    dataFim,
    setDataFim,
    filteredData,
    activeFilters,
    handleRemoveFilter,
    handleClearAllFilters,
  };
}

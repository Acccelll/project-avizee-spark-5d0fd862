import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import type { MultiSelectOption } from "@/components/ui/MultiSelect";
import { periodToFinancialRange, monthToRange } from "@/lib/periodFilter";
import type { Period } from "@/components/filters/periodTypes";
import type { ContaBancaria, Lancamento } from "@/types/domain";
import type { CartaoCredito } from "@/services/cartoesCredito.service";
import {
  FORMA_PAGAMENTO_OPTIONS,
  FORMA_PAGAMENTO_LABELS,
  normalizeFormaPagamento,
  type FormaPagamentoCanonica,
} from "@/lib/financeiro";

const validPeriods: readonly Period[] = ["7d", "15d", "30d", "90d", "year", "hoje", "todos", "vencidos"];

const isPeriod = (value: string | null): value is Period =>
  value !== null && validPeriods.includes(value as Period);

const origemLabelMap: Record<string, string> = {
  manual: "Manual",
  societario: "Sócio (Pró-labore/Bônus)",
  nota_fiscal: "Nota Fiscal",
  fiscal_nota: "Nota Fiscal",
  nfe_entrada: "NF-e de Entrada",
  folha_pagamento: "Folha de pagamento",
  pedido_compra: "Pedido de compra",
};

interface Params {
  data: Lancamento[];
  contasBancarias: ContaBancaria[];
  cartoes?: CartaoCredito[];
  getLancamentoStatus: (l: Lancamento) => string;
}

export function useFinanceiroFiltros({ data, contasBancarias, cartoes = [], getLancamentoStatus }: Params) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tipoParam = searchParams.get("tipo");
  const statusParam = searchParams.get("status");
  const bancoParam = searchParams.get("banco");
  const origemParam = searchParams.get("origem");
  const formaParam = searchParams.get("forma");
  const cartaoParam = searchParams.get("cartao");
  const periodParam = searchParams.get("period");
  const mesParam = searchParams.get("mes");

  const [statusFilters, setStatusFilters] = useState<string[]>(
    statusParam ? statusParam.split(",") : [],
  );
  const [tipoFilters, setTipoFilters] = useState<string[]>(tipoParam ? [tipoParam] : []);
  const [bancoFilters, setBancoFilters] = useState<string[]>(
    bancoParam ? bancoParam.split(",") : [],
  );
  const [origemFilters, setOrigemFilters] = useState<string[]>(
    origemParam ? origemParam.split(",") : [],
  );
  const [formaPagamentoFilters, setFormaPagamentoFilters] = useState<string[]>(
    formaParam ? formaParam.split(",") : [],
  );
  const [cartaoFilters, setCartaoFilters] = useState<string[]>(
    cartaoParam ? cartaoParam.split(",") : [],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") ?? "");
  const [period, setPeriod] = useState<Period>(isPeriod(periodParam) ? periodParam : "30d");
  const [mes, setMes] = useState<string | null>(mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : null);

  useEffect(() => {
    if (tipoParam) setTipoFilters([tipoParam]);
  }, [tipoParam]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (searchTerm) next.set("search", searchTerm);
        else next.delete("search");
        if (statusFilters.length) next.set("status", statusFilters.join(","));
        else next.delete("status");
        if (tipoFilters.length) next.set("tipo", tipoFilters.join(","));
        else next.delete("tipo");
        if (bancoFilters.length) next.set("banco", bancoFilters.join(","));
        else next.delete("banco");
        if (origemFilters.length) next.set("origem", origemFilters.join(","));
        else next.delete("origem");
        if (formaPagamentoFilters.length) next.set("forma", formaPagamentoFilters.join(","));
        else next.delete("forma");
        if (cartaoFilters.length) next.set("cartao", cartaoFilters.join(","));
        else next.delete("cartao");
        if (period !== "30d") next.set("period", period);
        else next.delete("period");
        if (mes) next.set("mes", mes);
        else next.delete("mes");
        return next;
      },
      { replace: true },
    );
  }, [searchTerm, statusFilters, tipoFilters, bancoFilters, origemFilters, formaPagamentoFilters, cartaoFilters, period, mes, setSearchParams]);

  const filteredData = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const monthRange = monthToRange(mes);
    const { dateFrom, dateTo } = monthRange
      ? { dateFrom: monthRange.from, dateTo: monthRange.to }
      : periodToFinancialRange(period);
    const isOverdueFilter = !monthRange && period === "vencidos";

    return data.filter((l) => {
      const effectiveStatus = getLancamentoStatus(l);
      if (!monthRange && period === "todos") {
        // sem filtro de período
      } else if (isOverdueFilter) {
        if (effectiveStatus !== "vencido") return false;
      } else {
        if (l.data_vencimento < dateFrom) return false;
        if (dateTo && l.data_vencimento > dateTo) return false;
      }

      if (statusFilters.length > 0 && !statusFilters.includes(effectiveStatus)) return false;
      if (tipoFilters.length > 0 && !tipoFilters.includes(l.tipo)) return false;
      if (bancoFilters.length > 0 && !bancoFilters.includes(l.conta_bancaria_id || "")) return false;
      if (origemFilters.length > 0 && !origemFilters.includes(l.origem_tipo || "manual")) return false;
      if (formaPagamentoFilters.length > 0) {
        const canon = normalizeFormaPagamento(l.forma_pagamento) ?? "outros";
        if (!formaPagamentoFilters.includes(canon)) return false;
      }
      if (cartaoFilters.length > 0) {
        const cid = (l as Lancamento & { cartao_id?: string | null }).cartao_id;
        if (!cid || !cartaoFilters.includes(cid)) return false;
      }

      if (query) {
        const haystack = [
          l.descricao,
          l.clientes?.nome_razao_social,
          l.fornecedores?.nome_razao_social,
          l.forma_pagamento,
          l.banco,
          l.contas_bancarias?.descricao,
          l.contas_bancarias?.bancos?.nome,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [data, statusFilters, tipoFilters, bancoFilters, origemFilters, formaPagamentoFilters, cartaoFilters, searchTerm, period, mes, getLancamentoStatus]);

  const activeFilters = useMemo(() => {
    const chips: FilterChip[] = [];

    tipoFilters.forEach((filter) =>
      chips.push({
        key: "tipo",
        label: "Tipo",
        value: [filter],
        displayValue: filter === "receber" ? "A Receber" : "A Pagar",
      }),
    );

    statusFilters.forEach((filter) =>
      chips.push({
        key: "status",
        label: "Status",
        value: [filter],
        displayValue: filter.charAt(0).toUpperCase() + filter.slice(1),
      }),
    );

    bancoFilters.forEach((filter) => {
      const banco = contasBancarias.find((item) => item.id === filter);
      chips.push({
        key: "banco",
        label: "Banco",
        value: [filter],
        displayValue: banco ? `${banco.bancos?.nome} - ${banco.descricao}` : filter,
      });
    });

    origemFilters.forEach((filter) =>
      chips.push({
        key: "origem",
        label: "Origem",
        value: [filter],
        displayValue: origemLabelMap[filter] ?? filter,
      }),
    );

    formaPagamentoFilters.forEach((filter) =>
      chips.push({
        key: "forma",
        label: "Forma de pagamento",
        value: [filter],
        displayValue: FORMA_PAGAMENTO_LABELS[filter as FormaPagamentoCanonica] ?? filter,
      }),
    );

    cartaoFilters.forEach((filter) => {
      const cartao = cartoes.find((c) => c.id === filter);
      chips.push({
        key: "cartao",
        label: "Cartão",
        value: [filter],
        displayValue: cartao ? cartao.nome : filter,
      });
    });

    return chips;
  }, [tipoFilters, statusFilters, bancoFilters, origemFilters, formaPagamentoFilters, cartaoFilters, contasBancarias, cartoes]);

  const handleRemoveFilter = (key: string, value?: string) => {
    if (key === "tipo") setTipoFilters((prev) => prev.filter((v) => v !== value));
    if (key === "status") setStatusFilters((prev) => prev.filter((v) => v !== value));
    if (key === "banco") setBancoFilters((prev) => prev.filter((v) => v !== value));
    if (key === "origem") setOrigemFilters((prev) => prev.filter((v) => v !== value));
    if (key === "forma") setFormaPagamentoFilters((prev) => prev.filter((v) => v !== value));
    if (key === "cartao") setCartaoFilters((prev) => prev.filter((v) => v !== value));
  };

  const tipoOpts: MultiSelectOption[] = [
    { label: "A Receber", value: "receber" },
    { label: "A Pagar", value: "pagar" },
  ];
  const bancoOpts: MultiSelectOption[] = contasBancarias.map((item) => ({
    label: `${item.bancos?.nome} - ${item.descricao}`,
    value: item.id,
  }));
  const origemOpts: MultiSelectOption[] = [
    { label: "Manual", value: "manual" },
    { label: "Sócio (Pró-labore/Bônus)", value: "societario" },
    { label: "Nota Fiscal", value: "nota_fiscal" },
    { label: "NF-e de Entrada", value: "nfe_entrada" },
    { label: "Folha de pagamento", value: "folha_pagamento" },
    { label: "Pedido de compra", value: "pedido_compra" },
  ];
  const formaPagamentoOpts: MultiSelectOption[] = FORMA_PAGAMENTO_OPTIONS.map((o) => ({
    label: o.label,
    value: o.value,
  }));
  const cartaoOpts: MultiSelectOption[] = cartoes.map((c) => ({
    label: c.nome + (c.bancos?.nome ? ` · ${c.bancos.nome}` : ""),
    value: c.id,
  }));

  return {
    selectedIds,
    setSelectedIds,
    searchTerm,
    setSearchTerm,
    statusFilters,
    setStatusFilters,
    tipoFilters,
    setTipoFilters,
    bancoFilters,
    setBancoFilters,
    origemFilters,
    setOrigemFilters,
    formaPagamentoFilters,
    setFormaPagamentoFilters,
    cartaoFilters,
    setCartaoFilters,
    period,
    setPeriod,
    mes,
    setMes,
    filteredData,
    activeFilters,
    handleRemoveFilter,
    tipoOpts,
    bancoOpts,
    origemOpts,
    formaPagamentoOpts,
    cartaoOpts,
  };
}

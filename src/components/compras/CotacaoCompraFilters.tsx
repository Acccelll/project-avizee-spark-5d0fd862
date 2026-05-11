import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { Input } from "@/components/ui/input";
import { FILTER_W_MD, FILTER_W_LG, FILTER_W_DATE } from "@/components/list/filterTokens";

interface CotacaoCompraFiltersProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  activeFilters: FilterChip[];
  onRemoveFilter: (key: string, value?: string) => void;
  onClearAll: () => void;
  count: number;
  statusOptions: MultiSelectOption[];
  statusFilters: string[];
  onStatusChange: (v: string[]) => void;
  fornecedorOptions: MultiSelectOption[];
  fornecedorFilters: string[];
  onFornecedorChange: (v: string[]) => void;
  dataInicio: string;
  onDataInicioChange: (v: string) => void;
  dataFim: string;
  onDataFimChange: (v: string) => void;
  validadeFilter: string;
  onValidadeChange: (v: string) => void;
}

export function CotacaoCompraFilters({
  searchTerm,
  onSearchChange,
  activeFilters,
  onRemoveFilter,
  onClearAll,
  count,
  statusOptions,
  statusFilters,
  onStatusChange,
  fornecedorOptions,
  fornecedorFilters,
  onFornecedorChange,
  dataInicio,
  onDataInicioChange,
  dataFim,
  onDataFimChange,
  validadeFilter,
  onValidadeChange,
}: CotacaoCompraFiltersProps) {
  return (
    <AdvancedFilterBar
      searchValue={searchTerm}
      onSearchChange={onSearchChange}
      searchPlaceholder="Buscar por número, observações ou produto..."
      activeFilters={activeFilters}
      onRemoveFilter={onRemoveFilter}
      onClearAll={onClearAll}
      count={count}
      hideCount
    >
      <MultiSelect
        options={statusOptions}
        selected={statusFilters}
        onChange={onStatusChange}
        placeholder="Status"
        className={FILTER_W_MD}
      />
      <MultiSelect
        options={fornecedorOptions}
        selected={fornecedorFilters}
        onChange={onFornecedorChange}
        placeholder="Fornecedor"
        className={FILTER_W_LG}
      />
      <MultiSelect
        options={[
          { value: "vencidas", label: "Vencidas" },
          { value: "vencendo", label: "Vencendo (≤7d)" },
          { value: "sem_validade", label: "Sem validade" },
        ]}
        selected={validadeFilter ? [validadeFilter] : []}
        onChange={(v) => onValidadeChange(v[v.length - 1] ?? "")}
        placeholder="Validade"
        className={FILTER_W_MD}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Abertura:</span>
        <Input
          type="date"
          value={dataInicio}
          onChange={(e) => onDataInicioChange(e.target.value)}
          className={`h-9 text-xs ${FILTER_W_DATE}`}
          title="Período de abertura — desde"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Input
          type="date"
          value={dataFim}
          onChange={(e) => onDataFimChange(e.target.value)}
          className={`h-9 text-xs ${FILTER_W_DATE}`}
          title="Período de abertura — até"
        />
      </div>
    </AdvancedFilterBar>
  );
}

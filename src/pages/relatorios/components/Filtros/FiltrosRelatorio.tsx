/**
 * FiltrosRelatorio — composite filter row rendered below the period filter.
 *
 * Handles: cliente multi-select, fornecedor multi-select, grupo multi-select,
 * status select, sort-grouping select, tipos multi-select, DRE competência.
 *
 * All state lives in the parent; this component is fully controlled.
 */

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { AsyncMultiSelect } from "@/components/ui/AsyncMultiSelect";
import {
  loadClienteOptions,
  loadClienteLabels,
  loadFornecedorOptions,
  loadFornecedorLabels,
} from "../../hooks/useRelatoriosFiltrosData";
import { Input } from "@/components/ui/input";
import type { ReportFiltersDef } from "@/config/relatoriosConfig";
import type { ClienteRef, FornecedorRef, GrupoProdutoRef } from "../../hooks/useRelatoriosFiltrosData";

export type Agrupamento = "padrao" | "valor_desc" | "status" | "vencimento";
export type DreCompetencia = "mes" | "trimestre" | "ano" | "personalizado";
export type DreModo = "competencia" | "caixa";

export interface FiltrosRelatorioState {
  clienteIds: string[];
  fornecedorIds: string[];
  grupoIds: string[];
  statusFiltro: string;
  agrupamento: Agrupamento;
  tipos: string[];
  dreCompetencia: DreCompetencia;
  dreMes: string;
  dreModo: DreModo;
}

export interface FiltrosRelatorioProps {
  filters: ReportFiltersDef;
  state: FiltrosRelatorioState;
  clientes: ClienteRef[];
  fornecedores: FornecedorRef[];
  grupos: GrupoProdutoRef[];
  semantics?: {
    statusMeaning?: string;
    typeMeaning?: string;
    highlightFilters?: Array<'periodo' | 'status' | 'tipo' | 'clientes' | 'fornecedores' | 'grupos'>;
    listLimitHints?: { clientes?: number; fornecedores?: number; grupos?: number };
  };
  /**
   * When true, hides the generic "Agrupamento" sort selector. Used by DRE,
   * which has a fixed structural ordering (header/subtotal/dedução/resultado)
   * that user-driven sort would break.
   */
  hideAgrupamento?: boolean;
  onChange: (partial: Partial<FiltrosRelatorioState>) => void;
}

export function FiltrosRelatorio({
  filters,
  state,
  clientes,
  fornecedores,
  grupos,
  semantics,
  hideAgrupamento = false,
  onChange,
}: FiltrosRelatorioProps) {
  const hints = semantics?.listLimitHints;
  const highlightFilters = semantics?.highlightFilters ?? [];
  const highlightClass = "ring-1 ring-primary/20 bg-primary/5 rounded-md px-2 py-1.5";

  return (
    <>
      <div className="flex flex-wrap gap-3 items-start">
        {filters.showClientes && (
          <div className={`space-y-1 ${highlightFilters.includes('clientes') ? highlightClass : ''}`}>
            <Label className="text-xs">Clientes</Label>
            <AsyncMultiSelect
              selected={state.clienteIds}
              onChange={(v) => onChange({ clienteIds: v })}
              loadOptions={loadClienteOptions}
              loadSelectedLabels={loadClienteLabels}
              placeholder="Buscar clientes..."
              emptyText="Digite ao menos 2 letras."
              className="w-[250px]"
            />
            {hints?.clientes ? <p className="text-[11px] text-muted-foreground">Lista limitada aos {hints.clientes} primeiros clientes ativos. Use busca para localizar.</p> : null}
          </div>
        )}

        {filters.showFornecedores && (
          <div className={`space-y-1 ${highlightFilters.includes('fornecedores') ? highlightClass : ''}`}>
            <Label className="text-xs">Fornecedores</Label>
            <AsyncMultiSelect
              selected={state.fornecedorIds}
              onChange={(v) => onChange({ fornecedorIds: v })}
              loadOptions={loadFornecedorOptions}
              loadSelectedLabels={loadFornecedorLabels}
              placeholder="Buscar fornecedores..."
              emptyText="Digite ao menos 2 letras."
              className="w-[250px]"
            />
            {hints?.fornecedores ? <p className="text-[11px] text-muted-foreground">Lista limitada aos {hints.fornecedores} primeiros fornecedores ativos.</p> : null}
          </div>
        )}

        {filters.showGrupos && (
          <div className={`space-y-1 ${highlightFilters.includes('grupos') ? highlightClass : ''}`}>
            <Label className="text-xs">Grupos de Produto</Label>
            <MultiSelect
              options={grupos.map((g) => ({ label: g.nome, value: g.id }))}
              selected={state.grupoIds}
              onChange={(v) => onChange({ grupoIds: v })}
              placeholder="Selecionar grupos"
              className="w-[220px]"
            />
            {hints?.grupos ? <p className="text-[11px] text-muted-foreground">A listagem pode ser parcial para manter performance.</p> : null}
          </div>
        )}

        {filters.showStatus && (
          <div className={`space-y-1 ${highlightFilters.includes('status') ? highlightClass : ''}`}>
            <Label className="text-xs">Status</Label>
            <Select value={state.statusFiltro} onValueChange={(v) => onChange({ statusFiltro: v })}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                {(filters.statusOptions ?? [{ value: 'todos', label: 'Todos' }]).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {semantics?.statusMeaning ? <p className="text-[11px] text-muted-foreground max-w-[240px]">{semantics.statusMeaning}</p> : null}
          </div>
        )}

        {!hideAgrupamento && (
          <div className="space-y-1">
            <Label className="text-xs">Agrupamento</Label>
            <Select value={state.agrupamento} onValueChange={(v) => onChange({ agrupamento: v as Agrupamento })}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="padrao">Padrão do relatório</SelectItem>
                <SelectItem value="valor_desc">Maior valor primeiro</SelectItem>
                <SelectItem value="status">Por status</SelectItem>
                <SelectItem value="vencimento">Por vencimento/data</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {filters.showTipos && (
          <div className={`space-y-1 ${highlightFilters.includes('tipo') ? highlightClass : ''}`}>
            <Label className="text-xs">Tipos</Label>
            <MultiSelect
              options={[
                { label: "A Receber", value: "receber" },
                { label: "A Pagar", value: "pagar" },
              ]}
              selected={state.tipos}
              onChange={(v) => onChange({ tipos: v })}
              placeholder="Todos"
              className="w-[180px]"
            />
            {semantics?.typeMeaning ? <p className="text-[11px] text-muted-foreground max-w-[220px]">{semantics.typeMeaning}</p> : null}
          </div>
        )}
      </div>

      {filters.showDreCompetencia && (
        <div className="flex flex-wrap gap-3 items-end mt-3 pt-3 border-t">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Regime</Label>
            <Select
              value={state.dreModo}
              onValueChange={(v) => onChange({ dreModo: v as DreModo })}
            >
              <SelectTrigger className="h-9 w-[210px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="competencia">Competência (emissão)</SelectItem>
                <SelectItem value="caixa">Caixa (pagamento)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground max-w-[220px]">
              {state.dreModo === 'caixa'
                ? 'Considera apenas valores efetivamente recebidos/pagos no período.'
                : 'Considera valores reconhecidos no período pela emissão/competência.'}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Competência</Label>
            <Select
              value={state.dreCompetencia}
              onValueChange={(v) => onChange({ dreCompetencia: v as DreCompetencia })}
            >
              <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mes">Mês específico</SelectItem>
                <SelectItem value="trimestre">Trimestre atual</SelectItem>
                <SelectItem value="ano">Ano atual</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {state.dreCompetencia === "mes" && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">Mês/Ano</Label>
              <Input
                type="month"
                value={state.dreMes}
                onChange={(e) => onChange({ dreMes: e.target.value })}
                className="h-9 w-[160px]"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

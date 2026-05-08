import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Eye,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  PackageOpen,
  Columns3,
  Filter,
  RotateCcw,
  Download,
  Trash2,
  FileSpreadsheet,
  FileText,
  FileDown,
  ListFilter,
  ChevronsDownUp,
  MoreVertical,
  Pencil,
  Copy,
  ChevronsUpDown as ExpandIcon,
  Settings2,
} from 'lucide-react';
import { buildExportFilename } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { TableSkeleton } from '@/components/ui/content-skeletons';
import { EmptyState } from '@/components/ui/empty-state';
import { NoResultsState } from '@/components/ui/NoResultsState';
import { MobileCardList, type MobileCardField } from '@/components/ui/MobileCardList';
import { useDataTablePrefs } from '@/hooks/useDataTablePrefs';
import { useDataTableExport } from '@/hooks/useDataTableExport';
import type { PermissionKey } from '@/lib/permissions';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  hidden?: boolean;
  /** Mark as primary field shown in mobile card title */
  mobilePrimary?: boolean;
  /** Mark as secondary/detail field shown in mobile card body */
  mobileCard?: boolean;
  /**
   * Optional accessor for sorting when the column is calculated/rendered
   * and `item[key]` is undefined or not the value to compare.
   * Example: `sortValue: (item) => item.cliente?.nome ?? ''`.
   */
  sortValue?: (item: T) => string | number | null | undefined;
  /**
   * Quando `true` e o DataTable estiver em modo `serverPagination`, a coluna
   * permanece clicável para ordenação — o callback `onServerSort` recebe a
   * chave/direção e a página deve repassar para `useSupabaseCrud` (orderBy/ascending).
   * Demais colunas perdem o ícone de sort no modo server-paged.
   */
  serverSortable?: boolean;
}

type FilterOperator = 'contains' | 'equals' | 'gt' | 'between';
interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  valueTo?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  moduleKey?: string;
  onRowClick?: (item: T) => void;
  onView?: (item: T) => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  onDuplicate?: (item: T) => void;
  loading?: boolean;
  pageSize?: number;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /**
   * Indica que filtros estão ativos. Quando true e a lista está vazia,
   * o DataTable renderiza `<NoResultsState>` (com ação "Limpar filtros")
   * em vez do `<EmptyState>` genérico.
   */
  hasActiveFilters?: boolean;
  /** Contagem de filtros ativos exibida no chip do `NoResultsState`. */
  activeFiltersCount?: number;
  /** Callback para limpar todos os filtros. Habilita o botão "Limpar filtros". */
  onClearFilters?: () => void;
  /** Termo de busca atual (mostrado na descrição do `NoResultsState`). */
  searchTerm?: string;
  showColumnToggle?: boolean;
  /**
   * Show the legacy internal "Advanced filters" popover.
   * Off by default — pages should use `AdvancedFilterBar` instead to keep a
   * single source of truth for filter state.
   */
  showInternalFilters?: boolean;
  onBatchDelete?: (ids: string[]) => void;
  onBatchStatusChange?: (ids: string[], status: string) => void;
  batchStatusActions?: Array<{ label: string; value: string; icon?: React.ComponentType<{ className?: string }> }>;
  renderInlineDetails?: (item: T) => React.ReactNode;
  deleteBehavior?: 'soft' | 'hard';
  /**
   * Row count threshold above which virtualization is enabled.
   * Below this threshold, rows render normally without virtualization.
   * @default 50
   */
  virtualizeThreshold?: number;
  /**
   * Maximum height (px) of the table body when virtualization is active.
   * @default 600
   */
  maxHeight?: number;
  /**
   * Permissão necessária para exportar via menu do DataTable.
   * Default: "relatorios:exportar". Páginas podem sobrescrever
   * (ex.: "financeiro:exportar"). Ver mem://produto/contrato-de-status.
   */
  exportPermission?: PermissionKey;
  /**
   * Marca a coluna usada como "identifier" (CNPJ, SKU, código) no card mobile.
   * Renderizada em fonte mono cinza abaixo do título primário.
   */
  mobileIdentifierKey?: string;
  /**
   * Ações inline rápidas (📞 Wpp ✉ 👁) renderizadas no rodapé do card mobile.
   * Recebe o item e retorna ReactNode (idealmente <ContactInlineActions />).
   */
  mobileInlineActions?: (item: T) => React.ReactNode;
  /**
   * Ação primária mobile — botão grande full-width renderizado no rodapé do card,
   * acima dos `mobileInlineActions`. Use para a próxima ação esperada do fluxo
   * (Aprovar / Gerar Pedido / Faturar / Enviar). Retorne `null` para ocultar.
   */
  mobilePrimaryAction?: (item: T) => React.ReactNode;
  /**
   * Coluna a ser extraída e renderizada como pill de status no canto
   * superior direito do card mobile (em vez de aparecer como detail-field).
   * Tipicamente uma coluna que renderiza `<StatusBadge />`.
   */
  mobileStatusKey?: string;
  /**
   * Função opcional que retorna a cor de acento (faixa lateral) para a linha
   * com base no item. Permite indicar status/saúde do registro com baixa
   * carga visual, sem ocupar uma coluna. Use tokens semânticos do DS.
   *
   * @example
   * rowAccent={(p) => p.estoque < p.estoque_minimo ? 'destructive' : null}
   */
  rowAccent?: (item: T) => 'success' | 'warning' | 'destructive' | 'info' | 'primary' | null | undefined;
  /**
   * Botões contextuais de domínio renderizados dentro da coluna única "Ações"
   * (ao lado de Visualizar). Use para ações primárias do fluxo, como
   * "Baixar" (Lançamentos), "Aprovar"/"Gerar Pedido" (Orçamentos),
   * "Receber" (Logística). Evita criar uma segunda coluna chamada "Ações".
   */
  rowExtraActions?: (item: T) => React.ReactNode;
  /**
   * Coluna usada para ordenação inicial. Quando ausente, o DataTable
   * tenta ordenar por `nome` ASC se a coluna existir (padrão do ERP);
   * caso contrário, mantém a ordem original.
   * Para Produtos, definir explicitamente como `sku`.
   */
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  /**
   * Quando presente, ativa modo "server pagination":
   *  - `data` é renderizado direto (sem slice/sort/filter local).
   *  - Footer usa `totalCount` real e botões ‹ › chamam `setPage`.
   *  - Filtros internos (popover legacy) ficam desabilitados.
   *  - Sort fica restrito a colunas marcadas `serverSortable`, via `onServerSort`.
   */
  serverPagination?: {
    page: number;
    setPage: (page: number) => void;
    totalCount: number | null;
    hasMore: boolean;
  };
  /** Callback de ordenação server-side. Recebe a chave (ou null para limpar) e a direção. */
  onServerSort?: (key: string | null, dir: 'asc' | 'desc' | null) => void;
  /** Estado controlado de ordenação server-side (chave atual). */
  serverSortKey?: string | null;
  /** Estado controlado de ordenação server-side (direção atual). */
  serverSortDir?: 'asc' | 'desc' | null;
}

type SortDirection = 'asc' | 'desc' | null;

const getStorageKey = (moduleKey: string, suffix: string) => `datatable:${moduleKey}:${suffix}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  moduleKey,
  onRowClick,
  onView,
  onEdit,
  onDelete,
  onDuplicate,
  loading,
  pageSize = 25,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  emptyTitle = 'Nenhum registro encontrado',
  emptyDescription = 'Tente ajustar os filtros ou adicione um novo registro.',
  showColumnToggle = false,
  showInternalFilters = false,
  onBatchDelete,
  onBatchStatusChange,
  batchStatusActions,
  renderInlineDetails,
  deleteBehavior = 'hard',
  virtualizeThreshold = 50,
  maxHeight = 600,
  hasActiveFilters = false,
  activeFiltersCount = 0,
  onClearFilters,
  searchTerm,
  exportPermission = 'relatorios:exportar',
  mobileIdentifierKey,
  mobileInlineActions,
  mobilePrimaryAction,
  mobileStatusKey,
  rowAccent,
  rowExtraActions,
  defaultSortKey,
  defaultSortDir = 'asc',
  serverPagination,
  onServerSort,
  serverSortKey,
  serverSortDir,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const [deleteItem, setDeleteItem] = useState<T | null>(null);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(() => localStorage.getItem('datatable:skip-delete-confirm') === '1');
  // Estado local do checkbox dentro do dialog: só é persistido em localStorage no Confirmar.
  const [pendingSkipPref, setPendingSkipPref] = useState(false);
  // Ordem inicial: prop explícita > coluna `nome` (se existir) > nenhuma.
  const initialSortKey = useMemo<string | null>(() => {
    if (defaultSortKey && columns.some((c) => c.key === defaultSortKey)) return defaultSortKey;
    if (columns.some((c) => c.key === 'nome')) return 'nome';
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot inicial; mudanças posteriores em columns não devem alterar a ordenação corrente
  }, []);
  const [sortKey, setSortKey] = useState<string | null>(initialSortKey);
  const [sortDir, setSortDir] = useState<SortDirection>(initialSortKey ? defaultSortDir : null);
  const [currentPage, setCurrentPage] = useState(0);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [savedFilters, setSavedFilters] = useState<Array<{ name: string; rules: FilterRule[] }>>([]);
  const [filterName, setFilterName] = useState('');
  const [rules, setRules] = useState<FilterRule[]>([]);

  // Persistência unificada (Supabase + localStorage migração) via hook.
  const initialHiddenKeys = useMemo(
    () => columns.filter((c) => c.hidden).map((c) => c.key),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot do schema de colunas no primeiro render; mudanças posteriores em columns.hidden não devem sobrescrever a preferência do usuário
    [],
  );
  const {
    hiddenKeys: hiddenKeysArr,
    viewMode,
    setHiddenKeys: persistHiddenKeys,
    setViewMode: persistViewMode,
  } = useDataTablePrefs(moduleKey, initialHiddenKeys);
  const hiddenKeys = useMemo(() => new Set(hiddenKeysArr), [hiddenKeysArr]);
  const hasActions = !!(onView || onEdit || onDelete || onDuplicate || renderInlineDetails);

  // Scroll-shadow + scroll-position: detect horizontal overflow in the table container
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrollX, setHasScrollX] = useState(false);
  const [scrolledX, setScrolledX] = useState(false);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const check = () => setHasScrollX(el.scrollWidth > el.clientWidth);
    const onScroll = () => setScrolledX(el.scrollLeft > 0);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      // el is captured from the closure above and is guaranteed non-null here
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Hidratação dos resquícios legados (filter rules + saved filters) mantida em
  // localStorage por enquanto — fluxos de filtro interno são opt-in e raramente
  // usados; preferências de coluna/viewMode já vivem em `useDataTablePrefs`.
  useEffect(() => {
    if (!moduleKey) return;
    const ruleRaw = localStorage.getItem(getStorageKey(moduleKey, 'filters'));
    const savedRaw = localStorage.getItem(getStorageKey(moduleKey, 'saved-filters'));
    if (ruleRaw) setRules(JSON.parse(ruleRaw));
    if (savedRaw) setSavedFilters(JSON.parse(savedRaw));
  }, [moduleKey]);

  useEffect(() => {
    if (!moduleKey) return;
    localStorage.setItem(getStorageKey(moduleKey, 'filters'), JSON.stringify(rules));
  }, [rules, moduleKey]);

  useEffect(() => {
    if (!moduleKey) return;
    localStorage.setItem(getStorageKey(moduleKey, 'saved-filters'), JSON.stringify(savedFilters));
  }, [savedFilters, moduleKey]);

  const visibleColumns = columns.filter((c) => !hiddenKeys.has(c.key));
  const primaryColumn = visibleColumns[0] || { key: 'id', label: 'ID' };
  const secondaryColumns = visibleColumns.slice(1);

  // Dev-only: avisa quando uma DataTable provavelmente tem coluna de status
  // (ex.: `ativo`, `status`, `situacao`) mas o consumidor não passou
  // `mobileStatusKey` — em mobile o status vira detail-field cinza em vez
  // de pill. Ver mem://produto/mobile-overview.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (mobileStatusKey) return;
    const STATUS_HINTS = /^(status|situacao|criticidade|ativo|tipo)$/i;
    const candidate = columns.find((c) => STATUS_HINTS.test(c.key));
    if (candidate && columns.length >= 4) {
      // eslint-disable-next-line no-console
      console.warn(
        `[DataTable:${moduleKey ?? "?"}] Coluna "${candidate.key}" parece status mas mobileStatusKey não foi definido — em mobile o badge não vai destacar.`,
      );
    }
    // só checa uma vez por moduleKey
    // eslint-disable-next-line react-hooks/exhaustive-deps -- aviso DEV-only por módulo; columns/mobileStatusKey usados via closure intencionalmente
  }, [moduleKey]);

  const toggleColumnVisibility = (key: string) => {
    const next = new Set(hiddenKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    void persistHiddenKeys([...next]);
  };

  const applyRule = (item: T, rule: FilterRule) => {
    const raw = item[rule.field];
    if (raw === undefined || raw === null) return false;
    const text = String(raw).toLowerCase();
    const value = rule.value.toLowerCase();
    if (rule.operator === 'contains') return text.includes(value);
    if (rule.operator === 'equals') return text === value;
    if (rule.operator === 'gt') return Number(raw) > Number(rule.value);
    if (rule.operator === 'between') return Number(raw) >= Number(rule.value) && Number(raw) <= Number(rule.valueTo || rule.value);
    return true;
  };

  const filteredData = useMemo(() => {
    if (!rules.length) return data;
    return data.filter((item) => rules.every((rule) => applyRule(item, rule)));
  }, [data, rules]);

  const handleSort = (key: string) => {
    if (serverPagination) {
      // Em modo server-paged, delega 100% ao consumidor.
      const col = columns.find((c) => c.key === key);
      if (!col?.serverSortable) return;
      if (serverSortKey === key) {
        if (serverSortDir === 'asc') onServerSort?.(key, 'desc');
        else if (serverSortDir === 'desc') onServerSort?.(null, null);
        else onServerSort?.(key, 'asc');
      } else {
        onServerSort?.(key, 'asc');
      }
      return;
    }
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') { setSortKey(null); setSortDir(null); }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setCurrentPage(0);
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return filteredData;
    const col = columns.find((c) => c.key === sortKey);
    const accessor = (item: T): string | number | null | undefined => {
      if (col?.sortValue) return col.sortValue(item);
      return item[sortKey];
    };
    return [...filteredData].sort((a, b) => {
      const aVal = accessor(a);
      const bVal = accessor(b);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir, columns]);

  const totalRowsForPaging = serverPagination
    ? (serverPagination.totalCount ?? data.length)
    : sortedData.length;
  const totalPages = serverPagination
    ? Math.max(1, Math.ceil(totalRowsForPaging / pageSize))
    : Math.max(1, Math.ceil(sortedData.length / pageSize));

  // Reset page when filters/data shrink the list past the current page.
  useEffect(() => {
    if (currentPage > 0 && currentPage > totalPages - 1) {
      setCurrentPage(0);
    }
  }, [totalPages, currentPage]);

  // Em server-paged, `data` já é a página corrente vinda do hook.
  const pageData = serverPagination
    ? data
    : sortedData.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const pagedData = serverPagination
    ? data
    : viewMode === 'infinite' ? sortedData.slice(0, visibleCount) : pageData;

  // Página efetiva (controlada pelo consumidor em server-paged).
  const effectivePage = serverPagination ? serverPagination.page : currentPage;
  const goToPage = (next: number) => {
    if (serverPagination) serverPagination.setPage(next);
    else setCurrentPage(next);
  };

  const toggleSelect = useCallback((id: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]);
  }, [selectedIds, onSelectionChange]);

  const toggleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    const pageIds = pagedData.map((item) => item.id).filter(Boolean);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));
    onSelectionChange(allSelected ? selectedIds.filter((id) => !pageIds.includes(id)) : [...new Set([...selectedIds, ...pageIds])]);
  }, [pagedData, selectedIds, onSelectionChange]);

  const toggleExpanded = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Exportação CSV/XLSX/PDF delegada ao hook compartilhado.
  const { exportData } = useDataTableExport({
    rows: sortedData,
    columns: visibleColumns.map((c) => ({ key: c.key, label: c.label })),
    titulo: moduleKey || 'dados',
    permission: exportPermission,
  });

  const deleteActionLabel = deleteBehavior === 'soft' ? 'Inativar' : 'Excluir permanentemente';
  const deleteDialogTitle = deleteBehavior === 'soft' ? 'Inativar registro' : 'Excluir registro';
  const deleteDialogDescription = deleteBehavior === 'soft'
    ? `Esta ação inativará ${deleteItem?.nome || deleteItem?.numero || 'o registro selecionado'}.`
    : `Esta ação removerá ${deleteItem?.nome || deleteItem?.numero || 'o registro selecionado'} permanentemente.`;

  // Em grids desktop só exibimos a ação primária "Visualizar".
  // Edit / Duplicar / Excluir continuam disponíveis pelas props, mas devem ser
  // expostos dentro do drawer (cabeçalho do ViewDrawerV2). Caso a tela não
  // implemente onView, caímos no edit como fallback de compatibilidade.
  const renderActions = (item: T) => {
    const primaryAction = onView ?? onEdit;
    const extras = rowExtraActions?.(item);
    const hasOverflow = !!(onEdit || onDuplicate || onDelete);
    return (
      <div className="flex items-center gap-1 flex-nowrap">
        {renderInlineDetails && (
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Expandir detalhes" onClick={(e) => { e.stopPropagation(); toggleExpanded(item.id); }}>
              <ExpandIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger><TooltipContent>Detalhes inline</TooltipContent></Tooltip>
        )}
        {primaryAction && (
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Visualizar registro" onClick={(e) => { e.stopPropagation(); primaryAction(item); }}>
              <Eye className="h-4 w-4" />
            </Button>
          </TooltipTrigger><TooltipContent>Visualizar</TooltipContent></Tooltip>
        )}
        {extras && <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>{extras}</div>}
        {hasOverflow && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {onEdit && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(item); }}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(item); }}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicar
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (skipDeleteConfirm) { onDelete(item); return; }
                      setDeleteItem(item);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> {deleteActionLabel}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  // Mobile card action menu
  const renderMobileActions = (item: T) => {
    const hasMenu = onView || onEdit || onDuplicate || onDelete;
    if (!hasMenu) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Ações" onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {onView && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(item); }}>
              <Eye className="mr-2 h-4 w-4" /> Visualizar
            </DropdownMenuItem>
          )}
          {onEdit && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(item); }}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
          )}
          {onDuplicate && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(item); }}>
              <Copy className="mr-2 h-4 w-4" /> Duplicar
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  if (skipDeleteConfirm) {
                    onDelete(item);
                    return;
                  }
                  setDeleteItem(item);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> {deleteActionLabel}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // Mobile card layout — delega ao componente compartilhado MobileCardList,
  // mapeando `mobilePrimary`/`mobileCard` (DataTable) para `primary` (MobileCardList).
  const renderMobileCards = () => {
    const primaryCol = visibleColumns.find((c) => c.mobilePrimary) ?? visibleColumns[0];
    const identifierCol = mobileIdentifierKey
      ? visibleColumns.find((c) => c.key === mobileIdentifierKey)
      : undefined;
    const statusCol = mobileStatusKey
      ? visibleColumns.find((c) => c.key === mobileStatusKey)
      : undefined;
    const cardCols = visibleColumns.filter(
      (c) =>
        c.mobileCard &&
        c.key !== primaryCol?.key &&
        c.key !== identifierCol?.key &&
        c.key !== statusCol?.key,
    );
    const fallbackCols = visibleColumns
      .filter(
        (c) =>
          c.key !== primaryCol?.key &&
          c.key !== identifierCol?.key &&
          c.key !== statusCol?.key,
      )
      .slice(0, 3);
    const detailCols = cardCols.length > 0 ? cardCols : fallbackCols;

    const fields: MobileCardField<T>[] = [
      ...(primaryCol
        ? [{ key: primaryCol.key, label: primaryCol.label, primary: true, render: primaryCol.render } as MobileCardField<T>]
        : []),
      ...(identifierCol
        ? [{ key: identifierCol.key, label: identifierCol.label, identifier: true, render: identifierCol.render } as MobileCardField<T>]
        : []),
      ...detailCols.map((col) => ({ key: col.key, label: col.label, render: col.render }) as MobileCardField<T>),
    ];

    return (
      <MobileCardList<T>
        items={pagedData}
        fields={fields}
        onItemClick={onRowClick ?? onView ?? onEdit}
        actionsInline={mobileInlineActions}
        primaryAction={mobilePrimaryAction}
        statusBadge={
          statusCol
            ? (item) =>
                statusCol.render
                  ? statusCol.render(item)
                  : String((item as Record<string, unknown>)[statusCol.key] ?? "")
            : undefined
        }
        actions={(item) => (
          <div className="flex items-center gap-1">
            {selectable && (
              <Checkbox
                checked={selectedIds.includes(item.id)}
                onCheckedChange={() => toggleSelect(item.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label="Selecionar item"
              />
            )}
            {renderMobileActions(item)}
          </div>
        )}
      />
    );
  };

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (serverPagination) {
      const col = columns.find((c) => c.key === colKey);
      if (!col?.serverSortable) return null;
      if (serverSortKey !== colKey) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
      return serverSortDir === 'asc'
        ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
        : <ChevronDown className="h-3.5 w-3.5 text-primary" />;
    }
    if (sortKey !== colKey) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
    return sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-primary" />;
  };

  const addRule = () => setRules((prev) => [...prev, { id: crypto.randomUUID(), field: columns[0]?.key || 'id', operator: 'contains', value: '' }]);
  const updateRule = (id: string, patch: Partial<FilterRule>) => setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const deleteRule = (id: string) => setRules((prev) => prev.filter((r) => r.id !== id));

  return (
    <>
      {/* Toolbar — desktop only */}
      <div className="mb-2 hidden flex-wrap items-center gap-2 justify-between md:flex">
        <div className="flex flex-wrap items-center gap-2">
          {showInternalFilters && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><Filter className="h-3.5 w-3.5" />Filtros</Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-3" align="start">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Filtros avançados</p>
                  {rules.map((rule) => (
                    <div key={rule.id} className="grid grid-cols-12 gap-1">
                      <Select value={rule.field} onValueChange={(v) => updateRule(rule.id, { field: v })}>
                        <SelectTrigger className="col-span-4 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{columns.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={rule.operator} onValueChange={(v: FilterOperator) => updateRule(rule.id, { operator: v })}>
                        <SelectTrigger className="col-span-3 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contains">Contém</SelectItem>
                          <SelectItem value="equals">É</SelectItem>
                          <SelectItem value="gt">Maior que</SelectItem>
                          <SelectItem value="between">Entre</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input className="col-span-3 h-8" value={rule.value} onChange={(e) => updateRule(rule.id, { value: e.target.value })} placeholder="valor" />
                      <Button variant="ghost" size="icon" className="col-span-2 h-8" aria-label="Remover regra de filtro" onClick={() => deleteRule(rule.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={addRule}><ListFilter className="h-3.5 w-3.5 mr-1" />Adicionar regra</Button>
                    <Button variant="ghost" size="sm" onClick={() => setRules([])}><RotateCcw className="h-3.5 w-3.5 mr-1" />Limpar</Button>
                  </div>
                  <div className="flex gap-2 pt-2 border-t">
                    <Input value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="Salvar este filtro" className="h-8" />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!filterName.trim() || !rules.length) return;
                        setSavedFilters((prev) => [...prev, { name: filterName.trim(), rules }]);
                        setFilterName('');
                        toast.success('Filtro salvo com sucesso');
                      }}
                    >Salvar</Button>
                  </div>
                  {savedFilters.length > 0 && (
                    <div className="space-y-1">
                      {savedFilters.map((f) => (
                        <button key={f.name} className="w-full text-left text-xs rounded px-2 py-1 hover:bg-accent" onClick={() => setRules(f.rules)}>{f.name}</button>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}

        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showColumnToggle ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><Columns3 className="h-3.5 w-3.5" />Colunas</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Colunas visíveis</p>
                <div className="space-y-1">
                  {columns.map((col) => (
                    <label key={col.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer">
                      <Checkbox checked={!hiddenKeys.has(col.key)} onCheckedChange={() => toggleColumnVisibility(col.key)} />
                      {col.label}
                    </label>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => void persistHiddenKeys(columns.filter((c) => c.hidden).map((c) => c.key))}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />Restaurar padrão
                </Button>
                <div className="mt-2 pt-2 border-t">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Modo de exibição</p>
                  <div className="space-y-1">
                    {(['pagination', 'infinite'] as const).map((m) => (
                      <label key={m} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer">
                        <input
                          type="radio"
                          name="datatable-view-mode"
                          value={m}
                          checked={viewMode === m}
                          onChange={() => void persistViewMode(m)}
                          className="accent-primary"
                        />
                        {m === 'pagination' ? 'Paginação' : 'Scroll infinito'}
                      </label>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Modo de exibição" title="Modo de exibição">
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Modo de exibição</p>
                <div className="space-y-1">
                  {(['pagination', 'infinite'] as const).map((m) => (
                    <label key={m} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer">
                      <input
                        type="radio"
                        name="datatable-view-mode"
                        value={m}
                        checked={viewMode === m}
                        onChange={() => void persistViewMode(m)}
                        className="accent-primary"
                      />
                      {m === 'pagination' ? 'Paginação' : 'Scroll infinito'}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><Download className="h-3.5 w-3.5" />Exportar</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-2">
              <Button variant="ghost" className="w-full justify-start" onClick={() => exportData('csv')}><FileDown className="mr-2 h-4 w-4" />CSV</Button>
              <Button variant="ghost" className="w-full justify-start" onClick={() => exportData('xlsx')}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button>
              <Button variant="ghost" className="w-full justify-start" onClick={() => exportData('pdf')}><FileText className="mr-2 h-4 w-4" />PDF</Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {selectable && selectedIds.length > 0 && (
        <div className="mb-2 flex items-center justify-between rounded-lg border bg-primary/5 px-3 py-2">
          <span className="text-sm">{selectedIds.length} selecionado(s)</span>
          <div className="flex gap-2">
            {onBatchStatusChange && (
              <>
                {(batchStatusActions?.length ? batchStatusActions : [{ label: 'Alterar status', value: 'confirmado' }]).map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button key={action.value} size="sm" variant="outline" onClick={() => onBatchStatusChange(selectedIds, action.value)}>
                      {Icon ? <Icon className="mr-1 h-4 w-4" /> : null}
                      {action.label}
                    </Button>
                  );
                })}
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => exportData('csv')}>Exportar</Button>
            {(onBatchDelete || onDelete) && <Button size="sm" variant="destructive" onClick={() => { if (onBatchDelete) onBatchDelete(selectedIds); else toast.info('Implemente onBatchDelete para exclusão em lote.'); }}>{deleteActionLabel}</Button>}
          </div>
        </div>
      )}

      {/* Mobile: card list */}
      {isMobile ? (
        loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl border bg-card animate-pulse" />
            ))}
          </div>
        ) : sortedData.length === 0 ? (
          hasActiveFilters ? (
            <NoResultsState
              activeFiltersCount={activeFiltersCount}
              searchTerm={searchTerm}
              onClearFilters={onClearFilters}
            />
          ) : (
            <EmptyState title={emptyTitle} description={emptyDescription} />
          )
        ) : (
          <>
            {renderMobileCards()}
            <div className="mt-3 flex items-center justify-between px-1 py-2">
              <span className="text-xs text-muted-foreground">
                {serverPagination
                  ? `${effectivePage * pageSize + 1}\u2013${Math.min((effectivePage + 1) * pageSize, totalRowsForPaging)} de ${totalRowsForPaging}`
                  : viewMode === 'infinite'
                  ? `${Math.min(visibleCount, sortedData.length)} de ${sortedData.length}`
                  : `${currentPage * pageSize + 1}\u2013${Math.min((currentPage + 1) * pageSize, sortedData.length)} de ${sortedData.length}`}
              </span>
              {serverPagination ? (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Página anterior" disabled={effectivePage === 0} onClick={() => goToPage(effectivePage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Próxima página" disabled={!serverPagination.hasMore && effectivePage >= totalPages - 1} onClick={() => goToPage(effectivePage + 1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              ) : viewMode === 'infinite' ? (
                <Button variant="ghost" size="sm" disabled={visibleCount >= sortedData.length} onClick={() => setVisibleCount((v) => v + pageSize)}>
                  <ChevronsDownUp className="h-4 w-4 mr-1" />Carregar mais
                </Button>
              ) : (
                <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Página anterior" disabled={currentPage === 0} onClick={() => setCurrentPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Próxima página" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
              )}
            </div>
          </>
        )
      ) : (
        /* Desktop: full table */
        <div className="data-table">
          {loading ? (
            <TableSkeleton rows={6} cols={Math.max(visibleColumns.length, 4)} />
          ) : sortedData.length === 0 ? (
            hasActiveFilters ? (
              <NoResultsState
                activeFiltersCount={activeFiltersCount}
                searchTerm={searchTerm}
                onClearFilters={onClearFilters}
              />
            ) : (
              <EmptyState title={emptyTitle} description={emptyDescription} />
            )
          ) : (
            <>
              {/* "Deslize →" hint — shown only while the table has horizontal overflow and hasn't been scrolled yet */}
              {hasScrollX && !scrolledX && (
                <div className="mb-1 flex items-center justify-end gap-1 text-xs text-muted-foreground/70 md:hidden" aria-hidden="true">
                  <span>Deslize</span>
                  <span className="animate-bounce-x">→</span>
                </div>
              )}
              <div
                ref={tableContainerRef}
                className={cn(
                  'overflow-x-auto',
                  hasScrollX && !scrolledX && 'shadow-[inset_-12px_0_10px_-10px_rgba(0,0,0,0.12)]',
                  hasScrollX && scrolledX && 'shadow-[inset_12px_0_10px_-10px_rgba(0,0,0,0.12),inset_-12px_0_10px_-10px_rgba(0,0,0,0.12)]',
                )}
              >
                <table className="w-full">
                  <thead className={cn(
                    (maxHeight || pagedData.length > 25) && 'sticky top-0 z-10',
                  )}>
                    <tr className="border-b bg-muted/70 backdrop-blur">
                      {hasActions && <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações</th>}
                      {selectable && <th className="w-10 px-3 py-2.5"><Checkbox checked={pagedData.length > 0 && pagedData.every((item) => selectedIds.includes(item.id))} onCheckedChange={toggleSelectAll} /></th>}
                       {visibleColumns.map((col) => {
                         const sortableHere = serverPagination
                           ? !!col.serverSortable
                           : col.sortable !== false;
                         return (
                           <th key={col.key} className={cn('px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground', sortableHere && 'cursor-pointer hover:text-foreground transition-colors')} onClick={() => sortableHere && handleSort(col.key)}>
                             <div className="flex items-center gap-1.5">{col.label}{sortableHere && <SortIcon colKey={col.key} />}</div>
                           </th>
                         );
                       })}
                    </tr>
                  </thead>
                  <VirtualizedOrPlainTbody
                    data={pagedData}
                    useVirtual={pagedData.length > virtualizeThreshold && !hasScrollX}
                    maxHeight={maxHeight}
                    renderRow={(item, idx) => (
                      <>
                        {(() => {
                          const accent = rowAccent?.(item);
                          const accentClass =
                            accent === 'success' ? 'shadow-[inset_3px_0_0_0_hsl(var(--success))]'
                            : accent === 'warning' ? 'shadow-[inset_3px_0_0_0_hsl(var(--warning))]'
                            : accent === 'destructive' ? 'shadow-[inset_3px_0_0_0_hsl(var(--destructive))]'
                            : accent === 'info' ? 'shadow-[inset_3px_0_0_0_hsl(var(--info))]'
                            : accent === 'primary' ? 'shadow-[inset_3px_0_0_0_hsl(var(--primary))]'
                            : '';
                          return (
                            <tr
                              key={item.id ?? `row-${idx}`}
                              onClick={() => onRowClick?.(item)}
                              onDoubleClick={onView ? () => onView(item) : undefined}
                              className={cn(
                                'border-b transition-colors last:border-b-0 hover:bg-muted/30 leading-snug',
                                selectable && selectedIds.includes(item.id) && 'bg-primary/5',
                                accentClass,
                              )}
                            >
                              {hasActions && <td className="px-2 py-2.5">{renderActions(item)}</td>}
                              {selectable && <td className="w-10 px-3 py-2.5"><Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={() => toggleSelect(item.id)} onClick={(e) => e.stopPropagation()} /></td>}
                              {visibleColumns.map((col) => <td key={col.key} className="px-4 py-2.5 text-sm whitespace-nowrap">{col.render ? col.render(item) : item[col.key]}</td>)}
                            </tr>
                          );
                        })()}
                        {renderInlineDetails && expandedRows.has(item.id) && (
                          <tr key={`detail-${item.id ?? `row-${idx}`}`} className="border-b bg-muted/20"><td colSpan={visibleColumns.length + (hasActions ? 1 : 0) + (selectable ? 1 : 0)} className="px-4 py-3">{renderInlineDetails(item)}</td></tr>
                        )}
                      </>
                    )}
                  />
                </table>
              </div>

              <div className="flex items-center justify-between border-t px-4 py-3">
                <span className="text-xs text-muted-foreground">
                  {serverPagination
                    ? `${effectivePage * pageSize + 1}\u2013${Math.min((effectivePage + 1) * pageSize, totalRowsForPaging)} de ${totalRowsForPaging} registros`
                    : viewMode === 'infinite'
                    ? `${Math.min(visibleCount, sortedData.length)} de ${sortedData.length} registros`
                    : `${currentPage * pageSize + 1}\u2013${Math.min((currentPage + 1) * pageSize, sortedData.length)} de ${sortedData.length}`}
                </span>
                {serverPagination ? (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Página anterior" disabled={effectivePage === 0} onClick={() => goToPage(effectivePage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Próxima página" disabled={!serverPagination.hasMore && effectivePage >= totalPages - 1} onClick={() => goToPage(effectivePage + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                ) : viewMode === 'infinite' ? (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" disabled={visibleCount >= sortedData.length} onClick={() => setVisibleCount((v) => v + pageSize)}><ChevronsDownUp className="h-4 w-4 mr-1" />Carregar mais</Button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Página anterior" disabled={currentPage === 0} onClick={() => setCurrentPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Próxima página" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => { setDeleteItem(null); setPendingSkipPref(false); }}
        title={deleteDialogTitle}
        description={deleteDialogDescription}
        onConfirm={() => {
          if (deleteItem && onDelete) {
            // Persiste a preferência só se confirmar.
            if (pendingSkipPref) {
              setSkipDeleteConfirm(true);
              localStorage.setItem('datatable:skip-delete-confirm', '1');
            }
            onDelete(deleteItem);
            setDeleteItem(null);
            setPendingSkipPref(false);
          }
        }}
      >
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={pendingSkipPref} onCheckedChange={(v) => setPendingSkipPref(!!v)} />
          Não perguntar novamente
        </label>
      </ConfirmDialog>
    </>
  );
}

// ── Virtualized or plain tbody ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function VirtualizedOrPlainTbody<T extends Record<string, any>>({
  data,
  useVirtual,
  maxHeight,
  renderRow,
}: {
  data: T[];
  useVirtual: boolean;
  maxHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
}) {
  const parentRef = useRef<HTMLTableSectionElement>(null);
  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
    enabled: useVirtual,
  });

  if (!useVirtual) {
    return <tbody>{data.map((item, idx) => renderRow(item, idx))}</tbody>;
  }

  return (
    <tbody
      ref={parentRef}
      style={{ display: 'block', maxHeight: `${maxHeight}px`, overflowY: 'auto' }}
    >
      <tr style={{ height: `${virtualizer.getTotalSize()}px`, display: 'block' }} aria-hidden="true" />
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const item = data[virtualRow.index];
        return (
          <tr
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <td style={{ display: 'contents' }}>
              {renderRow(item, virtualRow.index)}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

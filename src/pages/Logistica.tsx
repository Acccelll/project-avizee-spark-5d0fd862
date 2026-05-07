import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { ScrollableTabsList } from "@/components/ui/scrollable-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Tables } from "@/integrations/supabase/types";
import { StatusBadge } from "@/components/StatusBadge";
import { SummaryCard } from "@/components/SummaryCard";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { ViewDrawerV2 } from "@/components/ViewDrawerV2";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { useCan } from "@/hooks/useCan";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { toast } from "sonner";
import { formatNumber, formatDate } from "@/lib/format";
import { format } from "date-fns";
import { EntregaDrawer } from "@/components/logistica/EntregaDrawer";
import { RecebimentoDrawer } from "@/components/logistica/RecebimentoDrawer";
import { RegistrarRecebimentoDialog } from "@/components/compras/RegistrarRecebimentoDialog";
import { TrackingModal } from "@/pages/logistica/components/TrackingModal";
import { EtiquetaSimplesPreviewDialog } from "@/components/logistica/EtiquetaSimplesPreviewDialog";
import { statusRemessa } from "@/lib/statusSchema";
import { useEntregas } from "@/pages/logistica/hooks/useEntregas";
import type { Entrega } from "@/pages/logistica/hooks/useEntregas";
import { useRecebimentos } from "@/pages/logistica/hooks/useRecebimentos";
import type { Recebimento } from "@/pages/logistica/hooks/useRecebimentos";
import { useTransicionarRemessa, type RemessaTransition } from "@/pages/logistica/hooks/useTransicionarRemessa";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  trackAndPersistEventos,
  updateStatusTransporte,
  findRemessaByOvAndTracking,
  listEventos as listRemessaEventos,
  addEvento as addRemessaEvento,
  listRemessaIdsByOv,
} from "@/services/logistica/remessas.service";
import {
  listClientesAtivos,
  listTransportadorasAtivas,
  listPedidosCompraAtivos,
  listNotasFiscaisAtivas,
} from "@/services/logistica/lookups.service";
import { notifyError } from "@/utils/errorMessages";
import {
  ENTREGA_STATUS_ORDER,
  ENTREGA_STATUS_META,
  ENTREGA_TERMINAL,
  RECEBIMENTO_STATUS_META,
  RECEBIMENTO_TERMINAL,
  getEntregaStatusCfg,
  getRecebimentoStatusCfg,
  getRecebimentoSourceMeta,
} from "@/pages/logistica/logisticaStatus";
import {
  Eye, AlertTriangle, Truck, Package, CheckCheck, ExternalLink, Loader2,
  Edit, Trash2, Plus, MapPin, Package as PackageIcon, Search, Clock, Timer,
  ChevronDown, History, FileDown, Printer,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  listLatestEtiquetasByRemessas,
  baixarEtiqueta as baixarEtiquetaPdf,
  imprimirEtiquetasA4,
  type RemessaEtiqueta,
} from "@/services/logistica/prepostagem.service";

// ─── Remessa types ───
type Remessa = Tables<"remessas">;
type RemessaEvento = Tables<"remessa_eventos">;

// statusRemessa now includes postado, coletado and cancelado — use directly
const remessaStatusMap: Record<string, { label: string; color: string }> = { ...statusRemessa };
const MULTI_REMESSA_STATUS_MESSAGE =
  "Este pedido possui múltiplas remessas. Atualize status por remessa na aba Remessas.";

function isAtrasadoEntrega(e: Entrega): boolean {
  if (!e.previsao_entrega || ENTREGA_TERMINAL.has(e.status_logistico)) return false;
  return new Date(e.previsao_entrega + "T00:00:00") < new Date();
}
function isAtrasadoRecebimento(r: Recebimento): boolean {
  if (!r.previsao_entrega || RECEBIMENTO_TERMINAL.has(r.status_logistico)) return false;
  return new Date(r.previsao_entrega + "T00:00:00") < new Date();
}

const entregaStatusMultiOptions: MultiSelectOption[] = Object.entries(ENTREGA_STATUS_META).map(([k, v]) => ({ value: k, label: v.label }));
const recebimentoStatusMultiOptions: MultiSelectOption[] = Object.entries(RECEBIMENTO_STATUS_META).map(([k, v]) => ({ value: k, label: v.label }));
const prazoOptions: MultiSelectOption[] = [{ label: "Atrasadas", value: "atrasado" }, { label: "No prazo", value: "ok" }];
const prazoOptionsReceb: MultiSelectOption[] = [{ label: "Atrasados", value: "atrasado" }, { label: "No prazo", value: "ok" }];

export default function Logistica() {
  const navigate = useNavigate();
  const { can } = useCan();
  const { pushView } = useRelationalNavigation();
  const canEdit = can("logistica:editar");
  const [searchParams] = useSearchParams();

  // ─── Entregas / Recebimentos via hooks ───
  const { data: entregas = [], isLoading: entregasLoading } = useEntregas();
  const { data: recebimentos = [], isLoading: recebimentosLoading } = useRecebimentos();
  const loading = entregasLoading || recebimentosLoading;
  const transicionarRemessa = useTransicionarRemessa();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [selectedEntrega, setSelectedEntrega] = useState<Entrega | null>(null);
  const [selectedRecebimento, setSelectedRecebimento] = useState<Recebimento | null>(null);
  const [updatingEntregaId, setUpdatingEntregaId] = useState<string | null>(null);
  const [recebimentoDialogPedido, setRecebimentoDialogPedido] = useState<Recebimento | null>(null);
  const [trackingTarget, setTrackingTarget] = useState<{ codigo: string; remessaId: string } | null>(null);
  const queryClient = useQueryClient();

  // Derived lists for filters (computed from hook data)
  const transportadorasList = useMemo(
    () => [...new Set(entregas.map((e) => e.transportadora).filter((t) => t !== "—"))].sort(),
    [entregas],
  );
  const fornecedoresList = useMemo(
    () => [...new Set(recebimentos.map((r) => r.fornecedor).filter((f) => f !== "—"))].sort(),
    [recebimentos],
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [transportadoraFilters, setTransportadoraFilters] = useState<string[]>([]);
  const [prazoFilters, setPrazoFilters] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [activeTab, setActiveTab] = useState<string>("entregas");

  // Drill-down from Dashboard: ?tab=remessas&atrasadas=1 → switch tab + apply filter.
  useEffect(() => {
    const tab = searchParams.get("tab");
    const atrasadas = searchParams.get("atrasadas");
    if (tab) setActiveTab(tab);
    if (atrasadas === "1") {
      setPrazoFilters((prev) => (prev.includes("atrasado") ? prev : ["atrasado"]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drill-down one-shot via query string; setters do useState são estáveis
  }, [searchParams]);

  const [searchTermReceb, setSearchTermReceb] = useState("");
  const [statusFiltersReceb, setStatusFiltersReceb] = useState<string[]>([]);
  const [fornecedorFilters, setFornecedorFilters] = useState<string[]>([]);
  const [prazoFiltersReceb, setPrazoFiltersReceb] = useState<string[]>([]);
  const [dataInicioReceb, setDataInicioReceb] = useState("");
  const [dataFimReceb, setDataFimReceb] = useState("");

  // ─── Remessas CRUD state (still using useSupabaseCrud for full CRUD) ───
  const { data: remessasData, loading: remessasLoading, update: updateRemessa, remove: removeRemessa } = useSupabaseCrud<Remessa>({ table: "remessas" });
  const [remDrawerOpen, setRemDrawerOpen] = useState(false);
  const [remSelected, setRemSelected] = useState<Remessa | null>(null);
  const [remSearchTerm, setRemSearchTerm] = useState("");
  const [remStatusFilters, setRemStatusFilters] = useState<string[]>([]);
  const [remTranspFilters, setRemTranspFilters] = useState<string[]>([]);
  const [etiquetasMap, setEtiquetasMap] = useState<Record<string, RemessaEtiqueta>>({});
  const [printingBatch, setPrintingBatch] = useState(false);
  const [selectedRemessaIds, setSelectedRemessaIds] = useState<string[]>([]);
  const [etiquetaSimplesIds, setEtiquetaSimplesIds] = useState<string[] | null>(null);

  const [clientes, setClientes] = useState<Array<{ id: string; nome_razao_social: string }>>([]);
  const [transportadorasLookup, setTransportadorasLookup] = useState<Array<{ id: string; nome_razao_social: string }>>([]);
  const [pedidosCompra, setPedidosCompra] = useState<Array<{ id: string; numero: string | null }>>([]);
  const [notasFiscais, setNotasFiscais] = useState<Array<{ id: string; numero: string | null; tipo: string | null }>>([]);
  const [eventos, setEventos] = useState<RemessaEvento[]>([]);
  const [eventoForm, setEventoForm] = useState({ descricao: "", local: "" });
  const [savingEvento, setSavingEvento] = useState(false);
  const [isMockTracking, setIsMockTracking] = useState(false);

  // ─── Load lookup tables for remessa form ───
  useEffect(() => {
    void listClientesAtivos().then(setClientes).catch(() => setClientes([]));
    void listTransportadorasAtivas().then(setTransportadorasLookup).catch(() => setTransportadorasLookup([]));
    void listPedidosCompraAtivos().then(setPedidosCompra).catch(() => setPedidosCompra([]));
    void listNotasFiscaisAtivas().then(setNotasFiscais).catch(() => setNotasFiscais([]));
  }, []);

  // Load events when remessa drawer opens
  useEffect(() => {
    if (remSelected && remDrawerOpen) {
      void listRemessaEventos(remSelected.id)
        .then(setEventos)
        .catch(() => setEventos([]));
    }
  }, [remSelected, remDrawerOpen]);

  // Carrega o status de etiqueta Correios para todas as remessas visíveis (batch).
  useEffect(() => {
    const ids = (remessasData ?? []).map((r) => r.id);
    if (ids.length === 0) {
      setEtiquetasMap({});
      return;
    }
    void listLatestEtiquetasByRemessas(ids)
      .then(setEtiquetasMap)
      .catch(() => setEtiquetasMap({}));
  }, [remessasData]);

  // ─── Derived maps ───
  const clienteMapLookup = useMemo(() => Object.fromEntries(clientes.map(c => [c.id, c.nome_razao_social])), [clientes]);
  const transpMapLookup = useMemo(() => Object.fromEntries(transportadorasLookup.map(t => [t.id, t.nome_razao_social])), [transportadorasLookup]);

  // ─── KPIs ───
  const entregasKpis = useMemo(() => {
    const total = entregas.length;
    const emTransporte = entregas.filter((e) => e.status_logistico === "em_transporte").length;
    const atrasadas = entregas.filter(isAtrasadoEntrega).length;
    const entregues = entregas.filter((e) => e.status_logistico === "entregue").length;

    // Percentual de entregas no prazo (entregues que não estavam atrasadas no momento da entrega)
    const entreguesNoPrazo = entregas.filter(
      (e) => e.status_logistico === "entregue" && !isAtrasadoEntrega(e),
    ).length;
    const percentualNoPrazo = entregues > 0 ? Math.round((entreguesNoPrazo / entregues) * 100) : null;

    // Tempo médio de entrega em dias — usa data REAL de entrega
    // (vw_entregas_consolidadas.data_entrega_max). KPI fica null quando
    // não há dado real para evitar números enganosos.
    const entregasComDias = entregas.filter(
      (e) =>
        e.status_logistico === "entregue" &&
        e.data_expedicao &&
        e.data_entrega,
    );
    const tempoMedioDias =
      entregasComDias.length > 0
        ? Math.round(
            entregasComDias.reduce((sum, e) => {
              const dias =
                (new Date(e.data_entrega!).getTime() -
                  new Date(e.data_expedicao!).getTime()) /
                (1000 * 60 * 60 * 24);
              return sum + Math.max(0, dias);
            }, 0) / entregasComDias.length,
          )
        : null;

    return { total, emTransporte, atrasadas, entregues, percentualNoPrazo, tempoMedioDias };
  }, [entregas]);

  const recebimentosKpis = useMemo(() => {
    const total = recebimentos.length;
    const emTransito = recebimentos.filter((r) => r.status_logistico === "em_transito").length;
    const atrasados = recebimentos.filter(isAtrasadoRecebimento).length;
    const recebidos = recebimentos.filter((r) => r.status_logistico === "recebido").length;
    return { total, emTransito, atrasados, recebidos };
  }, [recebimentos]);

  // ─── Filtered entregas ───
  const filteredEntregas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return entregas.filter((e) => {
      if (statusFilters.length > 0 && !statusFilters.includes(e.status_logistico)) return false;
      if (transportadoraFilters.length > 0 && !transportadoraFilters.includes(e.transportadora)) return false;
      if (prazoFilters.length > 0) { const ps = isAtrasadoEntrega(e) ? "atrasado" : "ok"; if (!prazoFilters.includes(ps)) return false; }
      if (dataInicio && e.previsao_entrega && e.previsao_entrega < dataInicio) return false;
      if (dataFim && e.previsao_entrega && e.previsao_entrega > dataFim) return false;
      if (!q) return true;
      return [e.numero_pedido, e.cliente, e.transportadora, e.codigo_rastreio].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [entregas, searchTerm, statusFilters, transportadoraFilters, prazoFilters, dataInicio, dataFim]);

  // ─── Filtered recebimentos ───
  const filteredRecebimentos = useMemo(() => {
    const q = searchTermReceb.trim().toLowerCase();
    return recebimentos.filter((r) => {
      if (statusFiltersReceb.length > 0 && !statusFiltersReceb.includes(r.status_logistico)) return false;
      if (fornecedorFilters.length > 0 && !fornecedorFilters.includes(r.fornecedor)) return false;
      if (prazoFiltersReceb.length > 0) { const ps = isAtrasadoRecebimento(r) ? "atrasado" : "ok"; if (!prazoFiltersReceb.includes(ps)) return false; }
      if (dataInicioReceb && r.previsao_entrega && r.previsao_entrega < dataInicioReceb) return false;
      if (dataFimReceb && r.previsao_entrega && r.previsao_entrega > dataFimReceb) return false;
      if (!q) return true;
      return [r.numero_compra, r.fornecedor].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [recebimentos, searchTermReceb, statusFiltersReceb, fornecedorFilters, prazoFiltersReceb, dataInicioReceb, dataFimReceb]);

  // ─── Filtered remessas ───
  const filteredRemessas = useMemo(() => {
    const q = remSearchTerm.trim().toLowerCase();
    return remessasData.filter((r) => {
      if (remStatusFilters.length > 0 && !remStatusFilters.includes(r.status_transporte ?? "")) return false;
      if (remTranspFilters.length > 0 && !remTranspFilters.includes(r.transportadora_id ?? "")) return false;
      if (!q) return true;
      return [r.codigo_rastreio, clienteMapLookup[r.cliente_id ?? ""], transpMapLookup[r.transportadora_id ?? ""]]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [remessasData, remSearchTerm, clienteMapLookup, transpMapLookup, remStatusFilters, remTranspFilters]);

  // ─── Entrega filter chips ───
  const activeEntregaFilters = useMemo(() => {
    const chips: FilterChip[] = [];
    statusFilters.forEach((f) => chips.push({ key: "status", label: "Status", value: [f], displayValue: ENTREGA_STATUS_META[f]?.label || f }));
    transportadoraFilters.forEach((f) => chips.push({ key: "transportadora", label: "Transportadora", value: [f], displayValue: f }));
    prazoFilters.forEach((f) => chips.push({ key: "prazo", label: "Prazo", value: [f], displayValue: prazoOptions.find((o) => o.value === f)?.label || f }));
    if (dataInicio) chips.push({ key: "dataInicio", label: "Prev. desde", value: [dataInicio], displayValue: formatDate(dataInicio) });
    if (dataFim) chips.push({ key: "dataFim", label: "Prev. até", value: [dataFim], displayValue: formatDate(dataFim) });
    return chips;
  }, [statusFilters, transportadoraFilters, prazoFilters, dataInicio, dataFim]);

  const activeRecebimentoFilters = useMemo(() => {
    const chips: FilterChip[] = [];
    statusFiltersReceb.forEach((f) => chips.push({ key: "status", label: "Status", value: [f], displayValue: RECEBIMENTO_STATUS_META[f]?.label || f }));
    fornecedorFilters.forEach((f) => chips.push({ key: "fornecedor", label: "Fornecedor", value: [f], displayValue: f }));
    prazoFiltersReceb.forEach((f) => chips.push({ key: "prazo", label: "Prazo", value: [f], displayValue: prazoOptionsReceb.find((o) => o.value === f)?.label || f }));
    if (dataInicioReceb) chips.push({ key: "dataInicio", label: "Prev. desde", value: [dataInicioReceb], displayValue: formatDate(dataInicioReceb) });
    if (dataFimReceb) chips.push({ key: "dataFim", label: "Prev. até", value: [dataFimReceb], displayValue: formatDate(dataFimReceb) });
    return chips;
  }, [statusFiltersReceb, fornecedorFilters, prazoFiltersReceb, dataInicioReceb, dataFimReceb]);

  const remActiveFilters = useMemo(() => {
    const chips: FilterChip[] = [];
    remStatusFilters.forEach(f => chips.push({ key: "status", label: "Status", value: [f], displayValue: remessaStatusMap[f]?.label || f }));
    remTranspFilters.forEach(f => {
      const t = transportadorasLookup.find(x => x.id === f);
      chips.push({ key: "transportadora", label: "Transportadora", value: [f], displayValue: t?.nome_razao_social || f });
    });
    return chips;
  }, [remStatusFilters, remTranspFilters, transportadorasLookup]);

  // ─── Filter remove handlers ───
  const handleRemoveEntregaFilter = (key: string, value?: string) => {
    if (key === "status") setStatusFilters((p) => p.filter((v) => v !== value));
    if (key === "transportadora") setTransportadoraFilters((p) => p.filter((v) => v !== value));
    if (key === "prazo") setPrazoFilters((p) => p.filter((v) => v !== value));
    if (key === "dataInicio") setDataInicio("");
    if (key === "dataFim") setDataFim("");
  };
  const handleRemoveRecebimentoFilter = (key: string, value?: string) => {
    if (key === "status") setStatusFiltersReceb((p) => p.filter((v) => v !== value));
    if (key === "fornecedor") setFornecedorFilters((p) => p.filter((v) => v !== value));
    if (key === "prazo") setPrazoFiltersReceb((p) => p.filter((v) => v !== value));
    if (key === "dataInicio") setDataInicioReceb("");
    if (key === "dataFim") setDataFimReceb("");
  };
  const handleRemoveRemFilter = (key: string, value?: string) => {
    if (key === "status") setRemStatusFilters(prev => prev.filter(v => v !== value));
    if (key === "transportadora") setRemTranspFilters(prev => prev.filter(v => v !== value));
  };

  // ─── Status updates (invalidate query for fresh data after update) ───
  const updateEntregaStatus = async (entrega: Entrega, status: string) => {
    if (!canEdit) return;
    if (status === entrega.status_logistico) return;
    if (ENTREGA_TERMINAL.has(entrega.status_logistico)) {
      toast.warning("Entrega em estado terminal. Atualize pela remessa se necessário.");
      return;
    }
    if (ENTREGA_STATUS_META[status]?.sensivel) {
      const ok = await confirm({
        title: "Confirmar mudança de status",
        description: `Alterar entrega para "${ENTREGA_STATUS_META[status]?.label ?? status}"? Status sensíveis afetam a visão consolidada.`,
        confirmLabel: "Confirmar",
      });
      if (!ok) return;
    }
    setUpdatingEntregaId(entrega.id);
    let remessaIds: string[];
    try {
      remessaIds = await listRemessaIdsByOv(entrega.id);
    } catch (err) {
      notifyError(err);
      setUpdatingEntregaId(null);
      return;
    }
    if (remessaIds.length === 0) { toast.warning("Nenhuma remessa encontrada para o pedido."); setUpdatingEntregaId(null); return; }
    if (remessaIds.length > 1) {
      toast.warning(MULTI_REMESSA_STATUS_MESSAGE);
      setUpdatingEntregaId(null);
      return;
    }
    try {
      await transicionarRemessa.mutateAsync({
        remessaId: remessaIds[0],
        novoStatus: status as RemessaTransition,
      });
    } catch (err) {
      notifyError(err);
    } finally {
      setUpdatingEntregaId(null);
    }
  };

  /**
   * Abre o diálogo oficial de Compras (RegistrarRecebimentoDialog) para
   * registrar quantitativamente o recebimento via RPC `registrar_recebimento_compra`.
   * Isso elimina a divergência anterior em que a Logística apenas carimbava
   * `data_entrega_real` no pedido sem criar `recebimentos_compra`.
   */
  const abrirRegistrarRecebimento = (recebimento: Recebimento) => {
    if (!canEdit) return;
    setRecebimentoDialogPedido(recebimento);
  };

  /**
   * Abre o TrackingModal para uma entrega.  Como `Entrega` é uma visão
   * consolidada por OV, buscamos a remessa ativa associada para alimentar
   * `remessa_id` (necessário para persistir eventos vindos dos Correios).
   */
  const abrirRastreioEntrega = async (entrega: Entrega) => {
    if (!entrega.codigo_rastreio) {
      toast.warning("Entrega sem código de rastreio");
      return;
    }
    try {
      const ref = await findRemessaByOvAndTracking(entrega.id, entrega.codigo_rastreio);
      setTrackingTarget({ codigo: entrega.codigo_rastreio, remessaId: ref?.id ?? "" });
    } catch (err) {
      notifyError(err);
    }
  };

  const openViewRemessa = (r: Remessa) => { setRemSelected(r); setRemDrawerOpen(true); };

  const handleAddEvento = async () => {
    if (!remSelected || !eventoForm.descricao.trim()) { toast.error("Descrição obrigatória"); return; }
    setSavingEvento(true);
    try {
      await addRemessaEvento({
        remessaId: remSelected.id,
        descricao: eventoForm.descricao,
        local: eventoForm.local || null,
      });
      toast.success("Evento adicionado");
      setEventoForm({ descricao: "", local: "" });
      const refreshed = await listRemessaEventos(remSelected.id);
      setEventos(refreshed);
    } catch (err: unknown) {
      notifyError(err);
    } finally { setSavingEvento(false); }
  };

  const handleRemessaStatusChange = async (remessa: Remessa, newStatus: string) => {
    try {
      // Usa o hook canônico: para status com efeito em estoque
      // (em_transito, entregue, cancelado) chama as RPCs do banco;
      // para os demais faz update direto. Mantém a UX consistente.
      await transicionarRemessa.mutateAsync({
        remessaId: remessa.id,
        novoStatus: newStatus as RemessaTransition,
      });
      if (remSelected?.id === remessa.id) {
        setRemSelected({ ...remessa, status_transporte: newStatus });
      }
    } catch (err: unknown) { notifyError(err); }
  };

  const handleRastrear = async (remessa: Remessa) => {
    if (!remessa.codigo_rastreio) { toast.error("Sem código de rastreio"); return; }
    setIsMockTracking(false);
    try {
      toast.info("Consultando rastreio...");
      const { novos, isMock, eventos: evs } = await trackAndPersistEventos(
        remessa.codigo_rastreio,
        remessa.id,
      );
      setIsMockTracking(isMock);

      if (isMock) {
        toast.warning("Dados simulados — credenciais dos Correios não configuradas.");
        setEventos(evs as unknown as RemessaEvento[]);
        return;
      }

      toast.success(`${novos} novo(s) evento(s) incluído(s)`);
      const updatedEvents = await listRemessaEventos(remessa.id);
      setEventos(updatedEvents);
    } catch (err: unknown) {
      notifyError(err);
    }
  };

  const [bulkTracking, setBulkTracking] = useState(false);
  const handleBulkRastrear = async () => {
    const rastreiaveis = (remessasData as Remessa[]).filter(
      (r) => r.codigo_rastreio && !["entregue", "cancelado", "devolvido"].includes(r.status_transporte || "")
    );
    if (rastreiaveis.length === 0) { toast.info("Nenhuma remessa com rastreio pendente"); return; }
    setBulkTracking(true);
    const toastId = toast.loading(`Atualizando rastreios (0/${rastreiaveis.length})…`);
    let done = 0, ok = 0;
    const limit = 4;
    const queue = [...rastreiaveis];
    async function worker() {
      while (queue.length) {
        const r = queue.shift()!;
        try {
          await trackAndPersistEventos(r.codigo_rastreio!, r.id);
          ok++;
        } catch { /* skip */ }
        done++;
        toast.loading(`Atualizando rastreios (${done}/${rastreiaveis.length})…`, { id: toastId });
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, rastreiaveis.length) }, worker));
    setBulkTracking(false);
    toast.success(`${ok} remessa(s) atualizada(s)`, { id: toastId });
    queryClient.invalidateQueries({ queryKey: ["remessas"] });
  };

  const transportadoraOptions: MultiSelectOption[] = transportadorasList.map((t) => ({ label: t, value: t }));
  const fornecedorOptions: MultiSelectOption[] = fornecedoresList.map((f) => ({ label: f, value: f }));
  const remStatusOptions: MultiSelectOption[] = Object.entries(remessaStatusMap).map(([k, v]) => ({ label: v.label, value: k }));
  const remTranspOptions: MultiSelectOption[] = transportadorasLookup.map(t => ({ label: t.nome_razao_social, value: t.id }));

  // ─── Columns ───
  const entregaColumns = [
    { key: "numero_pedido", label: "Pedido", sortable: true, mobilePrimary: true, render: (item: Entrega) => (
      <div className="inline-flex flex-col items-start gap-0.5">
        <span className="font-mono text-xs font-semibold text-primary">{item.numero_pedido}</span>
        {item.exibicao_remessas === "multipla" && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
            {item.remessas_count} remessas
          </Badge>
        )}
      </div>
    ) },
    { key: "cliente", label: "Cliente", sortable: true, render: (item: Entrega) => <span className="font-medium text-sm">{item.cliente}</span> },
    { key: "transportadora", label: "Transportadora", render: (item: Entrega) => item.transportadora === "—" ? <span className="text-muted-foreground text-xs">—</span> : <span className="text-sm">{item.transportadora}</span> },
    { key: "status_logistico", label: "Status", sortable: true, render: (item: Entrega) => {
      const cfg = getEntregaStatusCfg(item.status_logistico);
      const atrasado = isAtrasadoEntrega(item);
      return (<span className="inline-flex flex-col items-start gap-0.5"><StatusBadge status={cfg.badgeStatus} label={cfg.label} />{atrasado && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-destructive/10 text-destructive border-destructive/20 gap-1"><AlertTriangle className="h-2.5 w-2.5" />Atrasada</Badge>}{item.exibicao_remessas === "multipla" && <span className="text-[10px] text-muted-foreground">status reflete última remessa</span>}</span>);
    }},
    { key: "previsao_entrega", label: "Prev. Entrega", render: (item: Entrega) => {
      if (!item.previsao_entrega) return <span className="text-muted-foreground text-xs">—</span>;
      const atrasado = isAtrasadoEntrega(item);
      return <span className={`text-xs ${atrasado ? "text-destructive font-medium" : ""}`}>{formatDate(item.previsao_entrega)}</span>;
    }},
    { key: "data_expedicao", label: "Expedição", render: (item: Entrega) => item.data_expedicao ? <span className="text-xs">{formatDate(item.data_expedicao)}</span> : <span className="text-muted-foreground text-xs">—</span> },
    { key: "cidade_uf", label: "Cidade/UF", hidden: true, render: (item: Entrega) => <span className="text-xs">{item.cidade_uf}</span> },
    { key: "volumes", label: "Volumes", hidden: true, render: (item: Entrega) => <span className="text-xs">{formatNumber(item.volumes || 0)}</span> },
    { key: "peso_total", label: "Peso", hidden: true, render: (item: Entrega) => <span className="text-xs">{formatNumber(item.peso_total || 0)} kg</span> },
    { key: "previsao_envio", label: "Prev. Envio", hidden: true, render: (item: Entrega) => item.previsao_envio ? <span className="text-xs">{formatDate(item.previsao_envio)}</span> : <span className="text-muted-foreground text-xs">—</span> },
    { key: "codigo_rastreio", label: "Rastreio", hidden: true, render: (item: Entrega) => item.codigo_rastreio ? <span className="font-mono text-xs">{item.codigo_rastreio}</span> : <span className="text-muted-foreground text-xs">—</span> },
    { key: "status_select", label: "Atualizar status", sortable: false, hidden: !canEdit, render: (item: Entrega) => (
      canEdit ? (
        <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <Select value={item.status_logistico} onValueChange={(value) => updateEntregaStatus(item, value)}>
            <SelectTrigger className="h-8 w-[180px] text-xs" disabled={item.exibicao_remessas === "multipla" || updatingEntregaId === item.id || ENTREGA_TERMINAL.has(item.status_logistico)}><SelectValue /></SelectTrigger>
            <SelectContent>{ENTREGA_STATUS_ORDER.map((s) => <SelectItem key={s} value={s} disabled={ENTREGA_TERMINAL.has(item.status_logistico) || (item.exibicao_remessas === "multipla" && s !== item.status_logistico)}>{ENTREGA_STATUS_META[s]?.label || s.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
          {item.exibicao_remessas === "multipla" && (
            <span className="text-[10px] text-muted-foreground">via Remessas</span>
          )}
        </div>
      ) : null
    )},
  ];

  const recebimentosColumns = [
    { key: "numero_compra", label: "Compra", sortable: true, mobilePrimary: true, render: (item: Recebimento) => <span className="font-mono text-xs font-semibold text-primary">{item.numero_compra}</span> },
    { key: "fornecedor", label: "Fornecedor", render: (item: Recebimento) => <span className="font-medium text-sm">{item.fornecedor}</span> },
    { key: "status_logistico", label: "Status", sortable: true, render: (item: Recebimento) => {
      const cfg = getRecebimentoStatusCfg(item.status_logistico);
      const atrasado = isAtrasadoRecebimento(item);
      return (<span className="inline-flex flex-col items-start gap-0.5"><StatusBadge status={cfg.badgeStatus} label={cfg.label} />{atrasado && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-destructive/10 text-destructive border-destructive/20 gap-1"><AlertTriangle className="h-2.5 w-2.5" />Atrasado</Badge>}</span>);
    }},
    { key: "previsao_entrega", label: "Prev. Entrega", render: (item: Recebimento) => {
      if (!item.previsao_entrega) return <span className="text-muted-foreground text-xs">—</span>;
      const atrasado = isAtrasadoRecebimento(item);
      return <span className={`text-xs ${atrasado ? "text-destructive font-medium" : ""}`}>{formatDate(item.previsao_entrega)}</span>;
    }},
    { key: "data_recebimento", label: "Recebido em", render: (item: Recebimento) => item.data_recebimento ? <span className="text-xs">{formatDate(item.data_recebimento)}</span> : <span className="text-muted-foreground text-xs">—</span> },
    { key: "quantidade_pedida", label: "Qtd. Pedida", render: (item: Recebimento) => <span className="text-xs">{formatNumber(item.quantidade_pedida)}</span> },
    { key: "quantidade_recebida", label: "Qtd. Recebida", render: (item: Recebimento) => (
      <div className="inline-flex flex-col items-start gap-0.5">
        <span className="text-xs">{formatNumber(item.quantidade_recebida)}</span>
        <span className={`text-[10px] ${getRecebimentoSourceMeta(item.recebimento_real).className}`}>
          {getRecebimentoSourceMeta(item.recebimento_real).label}
        </span>
        {!item.recebimento_real && item.status_logistico === "recebimento_parcial" && (
          <span className="text-[10px] text-muted-foreground">parcial não consolidado</span>
        )}
      </div>
    ) },
    { key: "pendencia", label: "Pendência", render: (item: Recebimento) => item.pendencia > 0 ? (
      <div className="inline-flex flex-col items-start gap-0.5">
        <span className="text-xs text-warning font-medium">{formatNumber(item.pendencia)}</span>
        {!item.recebimento_real && item.status_logistico === "recebimento_parcial" && (
          <span className="text-[10px] text-muted-foreground">depende do módulo Compras</span>
        )}
      </div>
    ) : <span className="text-xs text-muted-foreground">—</span> },
  ];

  const remessaColumns = [
    { key: "codigo_rastreio", label: "Rastreio", mobilePrimary: true, render: (r: Remessa) => <span className="font-mono text-xs">{r.codigo_rastreio || "—"}</span> },
    { key: "cliente_id", label: "Cliente", render: (r: Remessa) => clienteMapLookup[r.cliente_id ?? ""] ?? "—" },
    { key: "transportadora_id", label: "Transportadora", render: (r: Remessa) => transpMapLookup[r.transportadora_id ?? ""] ?? "—" },
    { key: "data_postagem", label: "Postagem", render: (r: Remessa) => r.data_postagem ? format(new Date(r.data_postagem + "T00:00:00"), "dd/MM/yyyy") : "—" },
    { key: "status_transporte", label: "Status", render: (r: Remessa) => {
      const s = r.status_transporte ?? "";
      // E8: passar a chave canônica do status; StatusBadge resolve cor via STATUS_VARIANT_MAP.
      return <StatusBadge status={s} label={remessaStatusMap[s]?.label} />;
    }},
    { key: "etiqueta", label: "Etiqueta", render: (r: Remessa) => {
      const et = etiquetasMap[r.id];
      if (!et) return <span className="text-muted-foreground text-xs">—</span>;
      const labelMap: Record<string, string> = { emitida: "Emitida", pendente: "Pendente", erro: "Erro", cancelada: "Cancelada" };
      const colorMap: Record<string, string> = { emitida: "success", pendente: "warning", erro: "destructive", cancelada: "muted" };
      return (
        <div className="inline-flex items-center gap-1.5">
          <StatusBadge status={colorMap[et.status] ?? "muted"} label={labelMap[et.status] ?? et.status} />
          {et.status === "emitida" && et.pdf_path && (
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Baixar PDF da etiqueta" onClick={async (e) => {
              e.stopPropagation();
              try {
                const url = await baixarEtiquetaPdf(et.pdf_path!);
                window.open(url, "_blank", "noopener,noreferrer");
              } catch (err) {
                console.error("[etiqueta] baixar falhou", err);
              }
            }}>
              <FileDown className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      );
    }},
    { key: "rastrear", label: "Rastrear", render: (r: Remessa) => r.codigo_rastreio ? (
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setTrackingTarget({ codigo: r.codigo_rastreio!, remessaId: r.id })}>
        <Search className="h-3.5 w-3.5" />Rastrear
      </Button>
    ) : <span className="text-muted-foreground text-xs">—</span> },
    { key: "etiqueta_simples", label: "Etiqueta simples", render: (r: Remessa) => (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        title="Gerar etiqueta simples (A4) para impressão"
        onClick={(e) => { e.stopPropagation(); setEtiquetaSimplesIds([r.id]); }}
      >
        <Printer className="h-3.5 w-3.5" />Etiqueta
      </Button>
    )},
  ];

  const remSummaryItems = remSelected ? [
    { label: "Status", value: remessaStatusMap[remSelected.status_transporte ?? ""]?.label ?? remSelected.status_transporte ?? "—" },
    { label: "Volumes", value: String(remSelected.volumes ?? 1) },
    { label: "Peso", value: remSelected.peso ? `${remSelected.peso} kg` : "—" },
    { label: "Frete", value: remSelected.valor_frete ? `R$ ${Number(remSelected.valor_frete).toFixed(2)}` : "—" },
  ] : [];

  return (
    <><ModulePage
        title="Logística"
        subtitle="Central de acompanhamento logístico, entregas, recebimentos e remessas."
        addLabel={canEdit ? "Nova Remessa" : undefined}
        onAdd={canEdit ? () => navigate("/remessas/new") : undefined}
        headerActions={canEdit ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleBulkRastrear} disabled={bulkTracking} data-help-id="logistica.bulkRastrear">
            {bulkTracking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Atualizar Rastreios
          </Button>
        ) : undefined}
      >
        {!canEdit && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
            Seu acesso em Logística está em modo de visualização.
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <ScrollableTabsList className="mb-4" data-help-id="logistica.tabs">
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="entregas">Entregas</TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>Visão consolidada por pedido de venda (derivada de remessas).</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="recebimentos">Recebimentos</TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>Acompanhamento logístico dos pedidos de compra. Consolidação oficial em Compras.</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="remessas">Remessas</TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>Operação real de envio (uma OV pode gerar várias remessas).</TooltipContent>
            </Tooltip>
          </ScrollableTabsList>

          {/* ── Tab: Entregas ── */}
          <TabsContent value="entregas">
            <div className="mb-4 rounded-md border border-info/30/40 bg-info/5 px-3 py-2 text-xs text-muted-foreground">
              Entregas é uma visão consolidada por pedido. Quando houver múltiplas remessas, o status exibido reflete somente a última atualização — gerencie com precisão na aba <strong>Remessas</strong>.
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <SummaryCard title="Total de Entregas" value={formatNumber(entregasKpis.total)} icon={Package} variationType="neutral" variation="operações ativas" />
              <SummaryCard title="Em Transporte" value={formatNumber(entregasKpis.emTransporte)} icon={Truck} variationType="positive" variation="a caminho do cliente" />
              <SummaryCard title="Atrasadas" value={formatNumber(entregasKpis.atrasadas)} icon={AlertTriangle} variationType={entregasKpis.atrasadas > 0 ? "negative" : "neutral"} variation="fora do prazo" />
              <SummaryCard title="Entregues" value={formatNumber(entregasKpis.entregues)} icon={CheckCheck} variationType="positive" variation="concluídas" />
            </div>
            {/* Métricas secundárias: visíveis sempre em desktop; collapsible em mobile para reduzir scroll. */}
            <Collapsible defaultOpen={false} className="mb-6 md:!block">
              <CollapsibleTrigger className="md:hidden flex items-center justify-between w-full px-3 py-2 rounded-md border bg-card text-xs font-medium text-muted-foreground mb-2 [&[data-state=open]>svg]:rotate-180">
                <span>Mais métricas (% no prazo, tempo médio, pendentes)</span>
                <ChevronDown className="h-4 w-4 transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent forceMount className="data-[state=closed]:hidden md:!block md:data-[state=closed]:!block">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <SummaryCard
                  title="% Entregas no Prazo"
                value={entregasKpis.percentualNoPrazo !== null ? `${entregasKpis.percentualNoPrazo}%` : "—"}
                icon={CheckCheck}
                variationType={
                  entregasKpis.percentualNoPrazo === null
                    ? "neutral"
                    : entregasKpis.percentualNoPrazo >= 90
                    ? "positive"
                    : entregasKpis.percentualNoPrazo >= 70
                    ? "neutral"
                    : "negative"
                }
                variation="das entregas concluídas"
              />
              <SummaryCard
                title="Tempo Médio de Entrega"
                value={entregasKpis.tempoMedioDias !== null ? `${entregasKpis.tempoMedioDias} dias` : "—"}
                icon={Timer}
                variationType="neutral"
                variation="expedição → entrega prevista"
              />
              <SummaryCard
                title="Pendentes de Expedição"
                value={formatNumber(
                  entregas.filter((e) =>
                    ["aguardando_separacao", "em_separacao", "separado", "aguardando_expedicao"].includes(
                      e.status_logistico,
                    ),
                  ).length,
                )}
                icon={Clock}
                variationType="neutral"
                variation="aguardando saída"
              />
              </div>
              </CollapsibleContent>
            </Collapsible>
            <AdvancedFilterBar searchValue={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por pedido, cliente, transportadora ou rastreio..." activeFilters={activeEntregaFilters} onRemoveFilter={handleRemoveEntregaFilter} onClearAll={() => { setStatusFilters([]); setTransportadoraFilters([]); setPrazoFilters([]); setDataInicio(""); setDataFim(""); }} count={filteredEntregas.length}>
              <MultiSelect options={entregaStatusMultiOptions} selected={statusFilters} onChange={setStatusFilters} placeholder="Status" className="w-[180px]" />
              <MultiSelect options={transportadoraOptions} selected={transportadoraFilters} onChange={setTransportadoraFilters} placeholder="Transportadora" className="w-[200px]" />
              <MultiSelect options={prazoOptions} selected={prazoFilters} onChange={setPrazoFilters} placeholder="Prazo" className="w-[160px]" />
              <div className="flex items-center gap-2">
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-9 w-[140px] text-xs" title="Prev. entrega desde" />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-9 w-[140px] text-xs" title="Prev. entrega até" />
              </div>
            </AdvancedFilterBar>
            <div data-help-id="logistica.tabela">
            <DataTable
              columns={entregaColumns}
              data={filteredEntregas}
              loading={loading}
              moduleKey="logistica-entregas"
              showColumnToggle
              onView={(e) => setSelectedEntrega(e as Entrega)}
              rowExtraActions={(item: Entrega) => (
                <>
                  <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-muted-foreground" onClick={(e) => { e.stopPropagation(); pushView("ordem_venda", item.id); }} title="Ver pedido">
                    <ExternalLink className="h-3.5 w-3.5" />Pedido
                  </Button>
                  {item.codigo_rastreio && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={(e) => { e.stopPropagation(); abrirRastreioEntrega(item); }} title="Rastrear">
                      <Search className="h-3.5 w-3.5" />Rastrear
                    </Button>
                  )}
                </>
              )}
              mobileStatusKey="status_logistico"
              mobileIdentifierKey="cliente"
              mobilePrimaryAction={(item) => {
                if (!item.codigo_rastreio) return null;
                return (
                  <Button size="lg" variant="default" className="h-11 w-full gap-2 text-sm" onClick={(e) => { e.stopPropagation(); abrirRastreioEntrega(item); }}>
                    <Search className="w-4 h-4" /> Rastrear entrega
                  </Button>
                );
              }}
              emptyTitle="Nenhuma entrega encontrada"
              emptyDescription="Tente ajustar os filtros de status ou período."
            />
            </div>
          </TabsContent>

          {/* ── Tab: Recebimentos ── */}
          <TabsContent value="recebimentos">
            <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
              Recebimentos nesta tela são de acompanhamento logístico. A consolidação quantitativa oficial continua no módulo <strong>Compras</strong>.
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <SummaryCard title="Total de Recebimentos" value={formatNumber(recebimentosKpis.total)} icon={Package} variationType="neutral" variation="pedidos de compra" />
              <SummaryCard title="Em Trânsito" value={formatNumber(recebimentosKpis.emTransito)} icon={Truck} variationType="positive" variation="a caminho do armazém" />
              <SummaryCard title="Atrasados" value={formatNumber(recebimentosKpis.atrasados)} icon={AlertTriangle} variationType={recebimentosKpis.atrasados > 0 ? "negative" : "neutral"} variation="fora do prazo" />
              <SummaryCard title="Recebidos" value={formatNumber(recebimentosKpis.recebidos)} icon={CheckCheck} variationType="positive" variation="concluídos" />
            </div>
            <AdvancedFilterBar searchValue={searchTermReceb} onSearchChange={setSearchTermReceb} searchPlaceholder="Buscar por número da compra ou fornecedor..." activeFilters={activeRecebimentoFilters} onRemoveFilter={handleRemoveRecebimentoFilter} onClearAll={() => { setStatusFiltersReceb([]); setFornecedorFilters([]); setPrazoFiltersReceb([]); setDataInicioReceb(""); setDataFimReceb(""); }} count={filteredRecebimentos.length}>
              <MultiSelect options={recebimentoStatusMultiOptions} selected={statusFiltersReceb} onChange={setStatusFiltersReceb} placeholder="Status" className="w-[180px]" />
              <MultiSelect options={fornecedorOptions} selected={fornecedorFilters} onChange={setFornecedorFilters} placeholder="Fornecedor" className="w-[200px]" />
              <MultiSelect options={prazoOptionsReceb} selected={prazoFiltersReceb} onChange={setPrazoFiltersReceb} placeholder="Prazo" className="w-[160px]" />
              <div className="flex items-center gap-2">
                <Input type="date" value={dataInicioReceb} onChange={(e) => setDataInicioReceb(e.target.value)} className="h-9 w-[140px] text-xs" title="Prev. entrega desde" />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="date" value={dataFimReceb} onChange={(e) => setDataFimReceb(e.target.value)} className="h-9 w-[140px] text-xs" title="Prev. entrega até" />
              </div>
            </AdvancedFilterBar>
            <DataTable
              columns={recebimentosColumns}
              data={filteredRecebimentos}
              loading={loading}
              moduleKey="logistica-recebimentos"
              showColumnToggle
              onView={(r) => setSelectedRecebimento(r as Recebimento)}
              rowExtraActions={(item: Recebimento) => (
                <>
                  <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-muted-foreground" onClick={(e) => { e.stopPropagation(); pushView("pedido_compra", item.id); }} title="Ver compra">
                    <ExternalLink className="h-3.5 w-3.5" />Compra
                  </Button>
                  {canEdit && item.status_logistico !== "recebido" && (
                    <Button variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={(e) => { e.stopPropagation(); abrirRegistrarRecebimento(item); }}>
                      <CheckCheck className="h-3.5 w-3.5" />Receber
                    </Button>
                  )}
                </>
              )}
              mobileStatusKey="status_logistico"
              mobileIdentifierKey="fornecedor"
              mobilePrimaryAction={(item) => {
                if (!canEdit || item.status_logistico === "recebido") return null;
                return (
                  <Button size="lg" variant="default" className="h-11 w-full gap-2 text-sm" onClick={(e) => { e.stopPropagation(); abrirRegistrarRecebimento(item); }}>
                    <CheckCheck className="w-4 h-4" /> Registrar recebimento
                  </Button>
                );
              }}
              emptyTitle="Nenhum recebimento encontrado"
              emptyDescription="Tente ajustar os filtros de status ou período."
            />
          </TabsContent>

          {/* ── Tab: Remessas ── */}
          <TabsContent value="remessas">
            <AdvancedFilterBar searchValue={remSearchTerm} onSearchChange={setRemSearchTerm} searchPlaceholder="Buscar por rastreio, cliente ou transportadora..." activeFilters={remActiveFilters} onRemoveFilter={handleRemoveRemFilter} onClearAll={() => { setRemStatusFilters([]); setRemTranspFilters([]); }} count={filteredRemessas.length}>
              <MultiSelect options={remStatusOptions} selected={remStatusFilters} onChange={setRemStatusFilters} placeholder="Status" className="w-[180px]" />
              <MultiSelect options={remTranspOptions} selected={remTranspFilters} onChange={setRemTranspFilters} placeholder="Transportadoras" className="w-[220px]" />
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedRemessaIds.length === 0}
                  onClick={() => setEtiquetaSimplesIds(selectedRemessaIds)}
                  title="Gerar etiqueta simples (A4) das remessas selecionadas"
                >
                  <Printer className="h-3.5 w-3.5 mr-1.5" />
                  Etiquetas simples{selectedRemessaIds.length > 0 ? ` (${selectedRemessaIds.length})` : ""}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={printingBatch}
                onClick={async () => {
                  const paths = filteredRemessas
                    .map((r) => etiquetasMap[r.id])
                    .filter((e) => e?.status === "emitida" && e.pdf_path)
                    .map((e) => e!.pdf_path!) as string[];
                  if (paths.length === 0) {
                    toast.error("Nenhuma etiqueta emitida nas remessas filtradas.");
                    return;
                  }
                  setPrintingBatch(true);
                  try {
                    const blob = await imprimirEtiquetasA4(paths);
                    const url = URL.createObjectURL(blob);
                    const win = window.open(url, "_blank", "noopener");
                    if (!win) {
                      // Fallback: download
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `etiquetas-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`;
                      a.click();
                    }
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    toast.success(`${paths.length} etiqueta(s) prontas para impressão (4 por A4).`);
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setPrintingBatch(false);
                  }
                }}
              >
                {printingBatch ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Printer className="h-3.5 w-3.5 mr-1.5" />}
                Imprimir etiquetas (4/A4)
              </Button>
            </AdvancedFilterBar>
            <DataTable
              columns={remessaColumns}
              data={filteredRemessas}
              loading={remessasLoading}
              onView={openViewRemessa}
              onEdit={(r) => navigate(`/remessas/${r.id}`)}
              selectable={canEdit}
              selectedIds={selectedRemessaIds}
              onSelectionChange={setSelectedRemessaIds}
              moduleKey="logistica-remessas"
              mobileStatusKey="status_transporte"
              mobileIdentifierKey="cliente_id"
              mobilePrimaryAction={(r) => {
                if (!r.codigo_rastreio) return null;
                return (
                  <Button size="lg" variant="default" className="h-11 w-full gap-2 text-sm" onClick={(e) => { e.stopPropagation(); setTrackingTarget({ codigo: r.codigo_rastreio!, remessaId: r.id }); }}>
                    <Search className="w-4 h-4" /> Rastrear Correios
                  </Button>
                );
              }}
              emptyTitle="Nenhuma remessa encontrada"
              emptyDescription="Tente ajustar os filtros ou crie uma nova remessa."
            />
          </TabsContent>
        </Tabs>
      </ModulePage>

      {/* Entrega Drawer */}
      <EntregaDrawer open={!!selectedEntrega} onClose={() => setSelectedEntrega(null)} entrega={selectedEntrega} />

      {/* Recebimento Drawer */}
      <RecebimentoDrawer
        open={!!selectedRecebimento}
        onClose={() => setSelectedRecebimento(null)}
        recebimento={selectedRecebimento}
        onRegistrarRecebimento={(r) => setRecebimentoDialogPedido(r)}
      />

      {/* Diálogo oficial de registro de recebimento (Compras) */}
      <RegistrarRecebimentoDialog
        open={!!recebimentoDialogPedido}
        onClose={() => setRecebimentoDialogPedido(null)}
        pedidoId={recebimentoDialogPedido?.id ?? ""}
        pedidoNumero={recebimentoDialogPedido?.numero_compra ?? ""}
        onSuccess={() => {
          setRecebimentoDialogPedido(null);
          queryClient.invalidateQueries({ queryKey: ["recebimentos"] });
          queryClient.invalidateQueries({ queryKey: ["recebimentos-compra"] });
          queryClient.invalidateQueries({ queryKey: ["estoque-posicao"] });
        }}
      />

      {/* Modal de rastreio Correios */}
      <TrackingModal
        open={!!trackingTarget}
        onClose={() => setTrackingTarget(null)}
        codigoRastreio={trackingTarget?.codigo ?? null}
        remessaId={trackingTarget?.remessaId}
      />

      {/* Pré-visualização da Etiqueta Simples (A4 4-up) */}
      <EtiquetaSimplesPreviewDialog
        open={!!etiquetaSimplesIds}
        remessaIds={etiquetaSimplesIds ?? []}
        onClose={() => setEtiquetaSimplesIds(null)}
      />

      {confirmDialog}

      {/* Remessa Detail Drawer */}
      <ViewDrawerV2
        open={remDrawerOpen}
        onClose={() => setRemDrawerOpen(false)}
        title={remSelected?.codigo_rastreio ? `Remessa ${remSelected.codigo_rastreio}` : "Detalhes da Remessa"}
        actions={remSelected ? <>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Editar remessa" onClick={() => { setRemDrawerOpen(false); navigate(`/remessas/${remSelected.id}`); }}><Edit className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Editar</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Etiqueta simples" onClick={() => setEtiquetaSimplesIds([remSelected.id])}><Printer className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Etiqueta simples</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Excluir remessa" onClick={() => { setRemDrawerOpen(false); removeRemessa(remSelected.id); }}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Excluir</TooltipContent></Tooltip>
        </> : undefined}
        summary={remSelected ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {remSummaryItems.map((s, i) => (
              <div key={i} className="rounded-lg border bg-card p-3 text-center space-y-1 min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className="font-semibold text-sm truncate" title={s.value}>{s.value}</p>
              </div>
            ))}
          </div>
        ) : undefined}
        tabs={[
          {
            value: "dados", label: "Dados",
            content: remSelected ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {[
                    { label: "Transportadora", value: transpMapLookup[remSelected.transportadora_id || ""] },
                    { label: "Cliente", value: clienteMapLookup[remSelected.cliente_id || ""] },
                    { label: "Serviço", value: remSelected.servico },
                    { label: "Código de Rastreio", value: remSelected.codigo_rastreio, mono: true },
                    { label: "Data Postagem", value: remSelected.data_postagem ? format(new Date(remSelected.data_postagem + "T00:00:00"), "dd/MM/yyyy") : null },
                    { label: "Previsão Entrega", value: remSelected.previsao_entrega ? format(new Date(remSelected.previsao_entrega + "T00:00:00"), "dd/MM/yyyy") : null },
                    { label: "Peso", value: remSelected.peso ? `${remSelected.peso} kg` : null },
                    { label: "Volumes", value: remSelected.volumes?.toString() },
                    { label: "Valor Frete", value: remSelected.valor_frete ? `R$ ${Number(remSelected.valor_frete).toFixed(2)}` : null },
                   { label: "Ped. Compra", value: pedidosCompra.find(pc => pc.id === remSelected.pedido_compra_id)?.numero },
                    { label: "Nota Fiscal", value: notasFiscais.find(nf => nf.id === remSelected.nota_fiscal_id)?.numero },
                  ].map((f, i) => (
                    <div key={i}>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{f.label}</p>
                      <p className={`text-sm ${f.mono ? "font-mono" : ""}`}>{f.value || "—"}</p>
                    </div>
                  ))}
                </div>
                {remSelected.observacoes && (
                  <div className="border-t pt-3">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Observações</p>
                    <p className="text-sm text-muted-foreground">{remSelected.observacoes}</p>
                  </div>
                )}
              </div>
            ) : null,
          },
          {
            value: "eventos", label: "Eventos",
            content: remSelected ? (
              <div className="space-y-4">
                {isMockTracking && (
                  <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground"><strong>Dados simulados</strong> — credenciais dos Correios não configuradas.</p>
                  </div>
                )}
                <div className="rounded-lg border bg-card p-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Novo Evento</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input placeholder="Descrição do evento *" value={eventoForm.descricao} onChange={e => setEventoForm({ ...eventoForm, descricao: e.target.value })} className="max-sm:h-11" />
                    <Input placeholder="Local (opcional)" value={eventoForm.local} onChange={e => setEventoForm({ ...eventoForm, local: e.target.value })} className="max-sm:h-11" />
                  </div>
                  <Button size="sm" onClick={handleAddEvento} disabled={savingEvento} className="max-sm:h-11 max-sm:w-full"><Plus className="h-3.5 w-3.5 mr-1" />{savingEvento ? "Salvando..." : "Adicionar"}</Button>
                </div>
                {eventos.length === 0 ? (
                  <EmptyState
                    icon={History}
                    title="Nenhum evento registrado"
                    description="Adicione o primeiro evento de rastreamento usando o formulário acima."
                    className="py-6"
                  />
                ) : (
                  <div className="space-y-0">
                    {eventos.map((ev, i) => (
                      <div key={ev.id} className="flex gap-3 pb-4">
                        <div className="flex flex-col items-center">
                          <div className={`h-3 w-3 rounded-full border-2 ${i === 0 ? "border-primary bg-primary" : "border-muted-foreground/40 bg-background"}`} />
                          {i < eventos.length - 1 && <div className="flex-1 w-px bg-border" />}
                        </div>
                        <div className="flex-1 -mt-0.5">
                          <p className="text-sm font-medium">{ev.descricao}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>{format(new Date(ev.data_hora), "dd/MM/yyyy HH:mm")}</span>
                            {ev.local && <><MapPin className="h-3 w-3" /><span>{ev.local}</span></>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null,
          },
        ]}
        footer={remSelected ? (
          <div className="flex gap-2 flex-wrap">
            {remSelected.codigo_rastreio && (
              <Button size="sm" variant="outline" onClick={() => handleRastrear(remSelected)}><Search className="h-4 w-4 mr-1" /> Rastrear Correios</Button>
            )}
            {remSelected.status_transporte !== "entregue" && (
              <>
                {remSelected.status_transporte === "pendente" && <Button size="sm" onClick={() => handleRemessaStatusChange(remSelected, "postado")}><Truck className="h-4 w-4 mr-1" /> Marcar como Postado</Button>}
                {remSelected.status_transporte === "postado" && <Button size="sm" onClick={() => handleRemessaStatusChange(remSelected, "em_transito")}><Truck className="h-4 w-4 mr-1" /> Em Trânsito</Button>}
                {(remSelected.status_transporte === "em_transito" || remSelected.status_transporte === "postado") && <Button size="sm" variant="outline" onClick={() => handleRemessaStatusChange(remSelected, "entregue")}><PackageIcon className="h-4 w-4 mr-1" /> Entregue</Button>}
                {remSelected.status_transporte !== "devolvido" && <Button size="sm" variant="destructive" onClick={() => handleRemessaStatusChange(remSelected, "devolvido")}>Devolvido</Button>}
              </>
            )}
          </div>
        ) : undefined}
      />
    </>
  );
}

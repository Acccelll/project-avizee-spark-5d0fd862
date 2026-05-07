import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ModulePage } from "@/components/ModulePage";
import { SummaryCard } from "@/components/SummaryCard";
import { DataTable } from "@/components/DataTable";
import { AdvancedFilterBar } from "@/components/AdvancedFilterBar";
import type { FilterChip } from "@/components/AdvancedFilterBar";
import { FormModal } from "@/components/FormModal";
import { StatusBadge } from "@/components/StatusBadge";
import { createLancamento } from "@/services/financeiro";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, Wallet, AlertTriangle,
  Plus, Upload, BarChart2, List, Building2, FileDown,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { exportarParaExcel } from "@/services/export.service";
import type { Lancamento, ContaBancaria } from "@/types/domain";
import { notifyError } from "@/utils/errorMessages";
import { displayDescricao } from "@/lib/displayLancamento";
import { getEffectiveStatus as libGetEffectiveStatus } from "@/lib/financeiro";
import { useIsMobile } from "@/hooks/use-mobile";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PeriodFilter, type PeriodValue } from "@/components/filters/PeriodFilter";
import { financialPeriods, type Period } from "@/components/filters/periodTypes";
import { periodToFinancialRange } from "@/lib/periodFilter";
import { useQueryClient } from "@tanstack/react-query";
import { useFluxoCaixaData } from "@/hooks/useFluxoCaixaData";

type Periodicidade = "diaria" | "semanal" | "mensal";

interface LancamentoForm {
  tipo: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  status: string;
  forma_pagamento: string;
  conta_bancaria_id: string;
  observacoes: string;
}

/**
 * Builds a fresh empty form so `data_vencimento` reflects the current
 * day at form-open time (avoids "stale today" in long sessions).
 */
const buildEmptyForm = (): LancamentoForm => ({
  tipo: "receber", descricao: "", valor: 0,
  data_vencimento: new Date().toISOString().slice(0, 10),
  status: "aberto", forma_pagamento: "", conta_bancaria_id: "", observacoes: "",
});

const emptyForm: LancamentoForm = buildEmptyForm();

const tipoOpts: MultiSelectOption[] = [
  { value: "receber", label: "A Receber" },
  { value: "pagar", label: "A Pagar" },
];

const statusOpts: MultiSelectOption[] = [
  { value: "aberto", label: "Aberto" },
  { value: "pago", label: "Pago" },
  { value: "vencido", label: "Vencido" },
  { value: "cancelado", label: "Cancelado" },
];

/**
 * Wrapper local que adapta a função pura `lib/financeiro.getEffectiveStatus`
 * para a assinatura antiga (Lancamento, Date). Mantém "parcial" e "cancelado"
 * como estados terminais e deriva "vencido" para títulos em aberto.
 */
const getEffectiveStatus = (l: Lancamento, hoje: Date): string =>
  libGetEffectiveStatus(l.status ?? "aberto", l.data_vencimento ?? "", hoje);

const FluxoCaixa = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [painelExpanded, setPainelExpanded] = useState<string | null>(null);
  const qc = useQueryClient();

  const defaultDataInicio = () => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; };
  const defaultDataFim = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return d.toISOString().split("T")[0]; };

  const [periodicidade, setPeriodicidade] = useState<Periodicidade>((searchParams.get("periodicidade") as Periodicidade) ?? "diaria");
  const [filterBanco, setFilterBanco] = useState(searchParams.get("banco") ?? "todos");
  const [viewMode, setViewMode] = useState<"painel" | "movimentos">((searchParams.get("view") as "painel" | "movimentos") ?? "painel");
  const [dataInicio, setDataInicio] = useState(searchParams.get("data_inicio") ?? defaultDataInicio());
  const [dataFim, setDataFim] = useState(searchParams.get("data_fim") ?? defaultDataFim());

  // React Query: invalidação cross-módulo automática (ver _invalidationKeys.ts → 'fluxo-caixa').
  const { data: fluxoData, isLoading: loading } = useFluxoCaixaData(dataInicio, dataFim);
  const lancamentos = fluxoData?.lancamentos ?? [];
  const contasBancarias = fluxoData?.contasBancarias ?? [];
  const baixas = fluxoData?.baixas ?? [];

  // Period filter (canonical) — drives dataInicio/dataFim. Defaults to "30d".
  const [periodValue, setPeriodValue] = useState<PeriodValue>(() => {
    if (searchParams.get("data_inicio") || searchParams.get("data_fim")) {
      return { preset: null, from: searchParams.get("data_inicio"), to: searchParams.get("data_fim") };
    }
    return { preset: "30d" as Period };
  });

  const handlePeriodChange = useCallback((next: PeriodValue) => {
    setPeriodValue(next);
    if (next.preset) {
      const range = periodToFinancialRange(next.preset);
      setDataInicio(range.dateFrom);
      if (range.dateTo) setDataFim(range.dateTo);
    } else if (next.from || next.to) {
      if (next.from) setDataInicio(next.from);
      if (next.to) setDataFim(next.to);
    }
  }, []);

  // Movements filters
  const [movSearch, setMovSearch] = useState(searchParams.get("search") ?? "");
  const [movTipoFilters, setMovTipoFilters] = useState<string[]>(
    searchParams.get("tipo") ? searchParams.get("tipo")!.split(",") : [],
  );
  const [movStatusFilters, setMovStatusFilters] = useState<string[]>(
    searchParams.get("status") ? searchParams.get("status")!.split(",") : [],
  );

  // Lançamento manual
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<LancamentoForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // CSV Import
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<Array<Record<string, string>>>([]);
  const [csvFile, setCsvFile] = useState<string>("");
  const [csvImporting, setCsvImporting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Sync filters → URL
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("data_inicio", dataInicio);
      next.set("data_fim", dataFim);
      if (periodicidade !== "diaria") next.set("periodicidade", periodicidade); else next.delete("periodicidade");
      if (filterBanco !== "todos") next.set("banco", filterBanco); else next.delete("banco");
      if (viewMode !== "painel") next.set("view", viewMode); else next.delete("view");
      if (movSearch) next.set("search", movSearch); else next.delete("search");
      if (movTipoFilters.length) next.set("tipo", movTipoFilters.join(",")); else next.delete("tipo");
      if (movStatusFilters.length) next.set("status", movStatusFilters.join(",")); else next.delete("status");
      return next;
    }, { replace: true });
  }, [dataInicio, dataFim, periodicidade, filterBanco, viewMode, movSearch, movTipoFilters, movStatusFilters]); // eslint-disable-line react-hooks/exhaustive-deps -- setSearchParams é estável (react-router); evitar incluí-lo previne loop de update

  const reload = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["fluxo-caixa"] });
  }, [qc]);

  // ─── Analytical (painel) ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filterBanco === "todos") return lancamentos;
    return lancamentos.filter(l => l.conta_bancaria_id === filterBanco);
  }, [lancamentos, filterBanco]);

  // Baixas filtradas por banco (eixo Realizado por data_baixa, não por vencimento).
  const filteredBaixas = useMemo(() => {
    if (filterBanco === "todos") return baixas;
    return baixas.filter(b => b.conta_bancaria_id === filterBanco);
  }, [baixas, filterBanco]);

  const grouped = useMemo(() => {
    const groups: Record<string, { prevReceber: number; prevPagar: number; realReceber: number; realPagar: number; items: Lancamento[]; sortKey: string }> = {};

    const getKey = (dateStr: string): { display: string; sort: string } => {
      const d = new Date(dateStr + "T00:00:00");
      if (periodicidade === "diaria") {
        const iso = d.toISOString().split("T")[0];
        return { display: iso, sort: iso };
      }
      if (periodicidade === "semanal") {
        const start = new Date(d);
        start.setDate(d.getDate() - d.getDay());
        const sort = start.toISOString().split("T")[0];
        return { display: `Sem ${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`, sort };
      }
      const sort = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { display: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }), sort };
    };

    // Previsto: lançamentos agrupados por data_vencimento.
    filtered.forEach(l => {
      const { display, sort } = getKey(l.data_vencimento);
      if (!groups[display]) groups[display] = { prevReceber: 0, prevPagar: 0, realReceber: 0, realPagar: 0, items: [], sortKey: sort };
      const g = groups[display];
      g.items.push(l);
      const val = Number(l.valor || 0);
      if (l.tipo === "receber") g.prevReceber += val;
      else g.prevPagar += val;
    });
    // Realizado: baixas ativas agrupadas por data_baixa.
    filteredBaixas.forEach(b => {
      const { display, sort } = getKey(b.data_baixa);
      if (!groups[display]) groups[display] = { prevReceber: 0, prevPagar: 0, realReceber: 0, realPagar: 0, items: [], sortKey: sort };
      const g = groups[display];
      if (b.tipo === "receber") g.realReceber += b.valor_pago;
      else g.realPagar += b.valor_pago;
    });

    return Object.entries(groups)
      .sort(([, a], [, b]) => a.sortKey.localeCompare(b.sortKey))
      .map(([key, g]) => [key, g] as [string, typeof g]);
  }, [filtered, filteredBaixas, periodicidade]);

  const totals = useMemo(() => {
    let prevReceber = 0, prevPagar = 0, realReceber = 0, realPagar = 0;
    filtered.forEach(l => {
      const val = Number(l.valor || 0);
      if (l.tipo === "receber") prevReceber += val;
      else prevPagar += val;
    });
    filteredBaixas.forEach(b => {
      if (b.tipo === "receber") realReceber += b.valor_pago;
      else realPagar += b.valor_pago;
    });
    return { prevReceber, prevPagar, realReceber, realPagar, saldoPrevisto: prevReceber - prevPagar, saldoRealizado: realReceber - realPagar };
  }, [filtered, filteredBaixas]);

  const chartData = useMemo(() => {
    let saldoAcumPrev = 0;
    let saldoAcumReal = 0;
    return grouped.map(([key, g]) => {
      saldoAcumPrev += (g.prevReceber - g.prevPagar);
      saldoAcumReal += (g.realReceber - g.realPagar);
      return { name: key, previsto: saldoAcumPrev, realizado: saldoAcumReal };
    });
  }, [grouped]);

  const hasNegativeRisk = chartData.some(d => d.previsto < 0);

  // ─── Movements DataTable ──────────────────────────────────────────────────
  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const hojeStr = hoje.toISOString().split("T")[0];

  const movFiltered = useMemo(() => {
    let result = filtered;
    if (movTipoFilters.length) result = result.filter(l => movTipoFilters.includes(l.tipo));
    if (movStatusFilters.length) result = result.filter(l => movStatusFilters.includes(getEffectiveStatus(l, hoje)));
    if (movSearch.trim()) {
      const q = movSearch.trim().toLowerCase();
      result = result.filter(l =>
        l.descricao?.toLowerCase().includes(q) ||
        l.contas_bancarias?.descricao?.toLowerCase().includes(q) ||
        l.contas_bancarias?.bancos?.nome?.toLowerCase().includes(q) ||
        l.forma_pagamento?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [filtered, movTipoFilters, movStatusFilters, movSearch, hoje]);

  const movActiveFilters: FilterChip[] = [
    ...movTipoFilters.map(v => ({ key: "tipo", label: "Tipo", value: v, displayValue: v === "receber" ? "A Receber" : "A Pagar" })),
    ...movStatusFilters.map(v => ({ key: "status", label: "Status", value: v, displayValue: statusOpts.find(o => o.value === v)?.label ?? v })),
  ];

  const handleRemoveMov = (key: string, value?: string) => {
    if (key === "tipo") setMovTipoFilters(p => p.filter(x => x !== value));
    if (key === "status") setMovStatusFilters(p => p.filter(x => x !== value));
  };

  const movColumns = [
    {
      key: "data_vencimento", label: "Vencimento", sortable: true,
      render: (l: Lancamento) => {
        const es = getEffectiveStatus(l, hoje);
        const isOverdue = es === "vencido";
        const isToday = l.data_vencimento === hojeStr;
        const [y, m, d] = l.data_vencimento.split("-").map(Number);
        const venc = new Date(y, m - 1, d);
        return (
          <div className="space-y-0.5">
            <span className={`text-sm ${isOverdue ? "text-destructive font-semibold" : isToday ? "text-warning font-semibold" : ""}`}>
              {venc.toLocaleDateString("pt-BR")}
            </span>
            {isToday && !isOverdue && <span className="text-[10px] text-warning font-medium block">Vence hoje</span>}
          </div>
        );
      },
    },
    {
      key: "tipo", label: "Tipo", sortable: true,
      render: (l: Lancamento) => (
        <Badge variant="outline" className={l.tipo === "receber"
          ? "border-success/40 text-success bg-success/5 whitespace-nowrap"
          : "border-destructive/40 text-destructive bg-destructive/5 whitespace-nowrap"}>
          {l.tipo === "receber" ? "Receber" : "Pagar"}
        </Badge>
      ),
    },
    {
      key: "descricao", label: "Descrição", sortable: true,
      mobilePrimary: true,
      render: (l: Lancamento) => <span className="text-sm">{displayDescricao(l)}</span>,
    },
    {
      key: "valor", label: "Valor", sortable: true,
      render: (l: Lancamento) => (
        <span className={`font-semibold font-mono text-sm ${l.tipo === "receber" ? "text-success" : "text-destructive"}`}>
          {l.tipo === "receber" ? "+" : "-"}{formatCurrency(Number(l.valor))}
        </span>
      ),
    },
    {
      key: "status", label: "Status", sortable: true,
      render: (l: Lancamento) => <StatusBadge status={getEffectiveStatus(l, hoje)} />,
    },
    {
      key: "origem", label: "Origem", hidden: true,
      render: (l: Lancamento) => {
        if (l.nota_fiscal_id) return <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5 whitespace-nowrap">NF Fiscal</Badge>;
        if (l.documento_pai_id) return <Badge variant="outline" className="text-xs whitespace-nowrap">Parcelamento</Badge>;
        return <Badge variant="outline" className="text-xs text-muted-foreground whitespace-nowrap">Manual</Badge>;
      },
    },
    {
      key: "forma_pagamento", label: "Forma Pgto", hidden: true,
      render: (l: Lancamento) => l.forma_pagamento
        ? <span className="text-xs">{l.forma_pagamento}</span>
        : <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      key: "conta_bancaria", label: "Banco/Conta", hidden: true,
      render: (l: Lancamento) => {
        if (!l.contas_bancarias) return <span className="text-muted-foreground text-xs">—</span>;
        return <span className="text-xs">{l.contas_bancarias.bancos?.nome} — {l.contas_bancarias.descricao}</span>;
      },
    },
  ];

  // ─── Lançamento manual ────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descricao || !form.valor) { toast.error("Descrição e valor são obrigatórios"); return; }
    if (!form.data_vencimento) { toast.error("Data de vencimento é obrigatória"); return; }
    if (form.status === "pago" && !form.conta_bancaria_id) {
      toast.error("Conta bancária é obrigatória para lançamentos pagos"); return;
    }
    setSaving(true);
    try {
      await createLancamento({
        tipo: form.tipo, descricao: form.descricao,
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento,
        status: form.status,
        forma_pagamento: form.forma_pagamento || null,
        conta_bancaria_id: form.conta_bancaria_id || null,
        observacoes: form.observacoes || null,
      });
      toast.success("Lançamento registrado com sucesso");
      setModalOpen(false);
      setForm(buildEmptyForm());
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[fluxo_caixa]", msg);
      notifyError(err);
    }
    setSaving(false);
  };

  // ─── CSV import ───────────────────────────────────────────────────────────
  const parseCsv = (text: string) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(";").map(h => h.trim().toLowerCase().replace(/[""]/g, ""));
    return lines.slice(1).map(line => {
      const vals = line.split(";").map(v => v.trim().replace(/[""]/g, ""));
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
    }).filter(r => Object.values(r).some(v => v));
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvRows(parseCsv(text));
    };
    reader.readAsText(file, "utf-8");
  };

  const handleCsvImport = async () => {
    if (!csvRows.length) { toast.error("Nenhum registro encontrado no arquivo"); return; }
    setCsvImporting(true);
    let ok = 0, fail = 0;
    for (const row of csvRows) {
      const data = row["data"] || row["data_vencimento"] || row["date"] || "";
      const descricao = row["descricao"] || row["description"] || row["historico"] || "";
      const rawValor = (row["valor"] || row["value"] || row["amount"] || "0").replace(",", ".");
      const valor = parseFloat(rawValor);
      const tipo = (row["tipo"] || row["type"] || "").toLowerCase().includes("pagar") ? "pagar" : "receber";

      if (!data || !descricao || isNaN(valor) || valor <= 0) { fail++; continue; }

      try {
        await createLancamento({
          tipo, descricao, valor,
          data_vencimento: data, status: "aberto",
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setCsvImporting(false);
    if (ok > 0) toast.success(`${ok} lançamento(s) importado(s) com sucesso${fail > 0 ? ` (${fail} ignorado(s))` : ""}`);
    else toast.error("Nenhum registro pôde ser importado. Verifique o formato do arquivo.");
    if (ok > 0) { setCsvOpen(false); setCsvRows([]); setCsvFile(""); await reload(); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <><ModulePage
        title="Fluxo de Caixa"
        subtitle={`Comportamento do caixa de ${new Date(dataInicio + "T00:00:00").toLocaleDateString("pt-BR")} a ${new Date(dataFim + "T00:00:00").toLocaleDateString("pt-BR")}`}
        headerActions={
          <>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setCsvOpen(true)}>
              <Upload className="w-3.5 h-3.5" /> Importar CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={async () => {
              const rows = movFiltered.map((l) => ({
                Tipo: l.tipo === "receber" ? "A Receber" : "A Pagar",
                Descrição: l.descricao,
                Vencimento: l.data_vencimento,
                "Valor (R$)": Number(l.valor),
                Status: getEffectiveStatus(l, hoje),
                "Forma Pgto": l.forma_pagamento ?? "",
                Banco: l.contas_bancarias ? `${l.contas_bancarias.bancos?.nome ?? ""} - ${l.contas_bancarias.descricao}` : "",
              }));
              await exportarParaExcel({ titulo: "Fluxo de Caixa", rows });
            }}>
              <FileDown className="w-3.5 h-3.5" /> Exportar
            </Button>
            <Button size="sm" className="gap-2" onClick={() => { setForm(buildEmptyForm()); setModalOpen(true); }}>
              <Plus className="w-3.5 h-3.5" /> Lançar
            </Button>
          </>
        }
      >
        {/* ── Period + bank filters ── */}
        <div className="flex flex-wrap items-end gap-3 sm:gap-4 mb-6 p-3 sm:p-4 bg-card rounded-xl border">
          <div className="space-y-1 w-full md:w-auto">
            <Label className="text-xs text-muted-foreground font-medium">Período</Label>
            <PeriodFilter
              value={periodValue}
              onChange={handlePeriodChange}
              options={financialPeriods}
              mode="both"
              direction="future"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-medium">Agrupamento</Label>
            <div className="flex gap-1">
              {(["diaria", "semanal", "mensal"] as Periodicidade[]).map(p => (
                <Button key={p} size="sm" variant={periodicidade === p ? "default" : "outline"} className="h-9 min-h-[36px]" onClick={() => setPeriodicidade(p)}>
                  {p === "diaria" ? "Diária" : p === "semanal" ? "Semanal" : "Mensal"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1 w-full md:w-auto">
            <Label className="text-xs text-muted-foreground font-medium">Conta / Banco</Label>
            <Select value={filterBanco} onValueChange={setFilterBanco}>
              <SelectTrigger className="w-full md:w-[200px] h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Consolidado</SelectItem>
                {contasBancarias.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.bancos?.nome} — {c.descricao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            title="Entradas Previstas"
            value={formatCurrency(totals.prevReceber)}
            subtitle={`Realizado: ${formatCurrency(totals.realReceber)}`}
            icon={TrendingUp} variant="success"
          />
          <SummaryCard
            title="Saídas Previstas"
            value={formatCurrency(totals.prevPagar)}
            subtitle={`Realizado: ${formatCurrency(totals.realPagar)}`}
            icon={TrendingDown} variant="danger"
          />
          <SummaryCard
            title="Saldo Previsto"
            value={formatCurrency(totals.saldoPrevisto)}
            icon={Wallet}
            variant={totals.saldoPrevisto >= 0 ? "success" : "danger"}
          />
          <SummaryCard
            title="Saldo Realizado"
            value={formatCurrency(totals.saldoRealizado)}
            icon={Wallet}
            variant={totals.saldoRealizado >= 0 ? "info" : "danger"}
          />
        </div>

        {/* ── Risk alert ── */}
        {hasNegativeRisk && (
          <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-2 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-medium">
              Atenção: o saldo previsto ficará negativo em algum período. Considere antecipar recebíveis ou postergar pagamentos.
            </span>
          </div>
        )}

        {/* ── View mode toggle ── */}
        <div className="flex gap-1 mb-4">
          <Button size="sm" variant={viewMode === "painel" ? "default" : "outline"} className="gap-2" onClick={() => setViewMode("painel")}>
            <BarChart2 className="w-3.5 h-3.5" /> Painel
          </Button>
          <Button size="sm" variant={viewMode === "movimentos" ? "default" : "outline"} className="gap-2" onClick={() => setViewMode("movimentos")}>
            <List className="w-3.5 h-3.5" /> Movimentos ({movFiltered.length})
          </Button>
        </div>

        {viewMode === "painel" ? (
          <>
            {/* ── Chart ── */}
            {chartData.length > 0 && (
              <Card className="mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Saldo Acumulado — Previsto vs Realizado</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Area type="monotone" dataKey="previsto" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} name="Previsto" />
                        <Area type="monotone" dataKey="realizado" stroke="hsl(var(--success))" fill="hsl(var(--success) / 0.15)" strokeWidth={2} name="Realizado" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Grouped flow table ── */}
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : grouped.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">Nenhum lançamento encontrado no período selecionado.</div>
            ) : (
              <>
              {/* Desktop: tabela 7 colunas */}
              <div className="hidden md:block bg-card rounded-xl border overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-semibold">Período</th>
                      <th className="text-right p-3 font-semibold text-success">Entradas Prev.</th>
                      <th className="text-right p-3 font-semibold text-success/80">Entradas Real.</th>
                      <th className="text-right p-3 font-semibold text-destructive">Saídas Prev.</th>
                      <th className="text-right p-3 font-semibold text-destructive/80">Saídas Real.</th>
                      <th className="text-right p-3 font-semibold">Saldo Previsto</th>
                      <th className="text-right p-3 font-semibold">Saldo Realizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let saldoAcumPrev = 0;
                      let saldoAcumReal = 0;
                      return grouped.map(([key, g]) => {
                        saldoAcumPrev += (g.prevReceber - g.prevPagar);
                        saldoAcumReal += (g.realReceber - g.realPagar);
                        return (
                          <tr key={key} className="border-b hover:bg-muted/10">
                            <td className="p-3 font-medium">
                              {key}
                            </td>
                            <td className="p-3 text-right mono text-success">{formatCurrency(g.prevReceber)}</td>
                            <td className="p-3 text-right mono text-success/70">{formatCurrency(g.realReceber)}</td>
                            <td className="p-3 text-right mono text-destructive">{formatCurrency(g.prevPagar)}</td>
                            <td className="p-3 text-right mono text-destructive/70">{formatCurrency(g.realPagar)}</td>
                            <td className={`p-3 text-right mono font-semibold ${saldoAcumPrev >= 0 ? "text-success" : "text-destructive"}`}>
                              {formatCurrency(saldoAcumPrev)}
                            </td>
                            <td className={`p-3 text-right mono font-semibold ${saldoAcumReal >= 0 ? "text-success" : "text-destructive"}`}>
                              {formatCurrency(saldoAcumReal)}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 font-bold">
                      <td className="p-3">TOTAL</td>
                      <td className="p-3 text-right mono text-success">{formatCurrency(totals.prevReceber)}</td>
                      <td className="p-3 text-right mono text-success/70">{formatCurrency(totals.realReceber)}</td>
                      <td className="p-3 text-right mono text-destructive">{formatCurrency(totals.prevPagar)}</td>
                      <td className="p-3 text-right mono text-destructive/70">{formatCurrency(totals.realPagar)}</td>
                      <td className={`p-3 text-right mono ${totals.saldoPrevisto >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(totals.saldoPrevisto)}</td>
                      <td className={`p-3 text-right mono ${totals.saldoRealizado >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(totals.saldoRealizado)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {/* Mobile: cards expandíveis por período */}
              <div className="md:hidden space-y-2 mb-6">
                {(() => {
                  let saldoAcumPrev = 0;
                  let saldoAcumReal = 0;
                  return grouped.map(([key, g]) => {
                    saldoAcumPrev += (g.prevReceber - g.prevPagar);
                    saldoAcumReal += (g.realReceber - g.realPagar);
                    const isExpanded = painelExpanded === key;
                    const acumPrev = saldoAcumPrev;
                    const acumReal = saldoAcumReal;
                    return (
                      <div
                        key={key}
                        className="rounded-lg border bg-card overflow-hidden"
                      >
                        <button
                          type="button"
                          className="w-full flex items-center justify-between gap-3 px-3 py-3 min-h-11 text-left hover:bg-muted/30 transition-colors"
                          onClick={() => setPainelExpanded(isExpanded ? null : key)}
                          aria-expanded={isExpanded}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate">{key}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {g.items.length} lançamento{g.items.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={cn(
                              "text-base font-bold font-mono",
                              acumPrev >= 0 ? "text-success" : "text-destructive",
                            )}>
                              {formatCurrency(acumPrev)}
                            </span>
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 border-t bg-muted/10 space-y-2">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Entradas Prev.</p>
                                <p className="font-mono font-semibold text-success">{formatCurrency(g.prevReceber)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Entradas Real.</p>
                                <p className="font-mono text-success/80">{formatCurrency(g.realReceber)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Saídas Prev.</p>
                                <p className="font-mono font-semibold text-destructive">{formatCurrency(g.prevPagar)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Saídas Real.</p>
                                <p className="font-mono text-destructive/80">{formatCurrency(g.realPagar)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Saldo Previsto</p>
                                <p className={cn("font-mono font-bold", acumPrev >= 0 ? "text-success" : "text-destructive")}>
                                  {formatCurrency(acumPrev)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Saldo Realizado</p>
                                <p className={cn("font-mono font-bold", acumReal >= 0 ? "text-success" : "text-destructive")}>
                                  {formatCurrency(acumReal)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
                <div className="rounded-lg border-2 border-primary/30 bg-primary/5 px-3 py-3">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Total no período</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Saldo Previsto</p>
                      <p className={cn("font-mono font-bold text-base", totals.saldoPrevisto >= 0 ? "text-success" : "text-destructive")}>
                        {formatCurrency(totals.saldoPrevisto)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Saldo Realizado</p>
                      <p className={cn("font-mono font-bold text-base", totals.saldoRealizado >= 0 ? "text-success" : "text-destructive")}>
                        {formatCurrency(totals.saldoRealizado)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              </>
            )}
          </>
        ) : (
          /* ── Movements tab with DataTable + column toggle ── */
          <>
            <AdvancedFilterBar
              searchValue={movSearch}
              onSearchChange={setMovSearch}
              searchPlaceholder="Buscar por descrição, conta ou forma de pagamento..."
              activeFilters={movActiveFilters}
              onRemoveFilter={handleRemoveMov}
              onClearAll={() => { setMovTipoFilters([]); setMovStatusFilters([]); }}
              count={movFiltered.length}
            >
              <MultiSelect options={tipoOpts} selected={movTipoFilters} onChange={setMovTipoFilters} placeholder="Tipo" className="w-[150px]" />
              <MultiSelect options={statusOpts} selected={movStatusFilters} onChange={setMovStatusFilters} placeholder="Status" className="w-[160px]" />
            </AdvancedFilterBar>

            <DataTable
              columns={movColumns}
              data={movFiltered}
              loading={loading}
              moduleKey="fluxo-caixa-movimentos"
              showColumnToggle={true}
              emptyTitle="Nenhum movimento encontrado"
              emptyDescription="Ajuste os filtros ou registre novos lançamentos."
              mobileStatusKey="status"
              mobileIdentifierKey="data_vencimento"
            />
          </>
        )}

        {/* ── Bank accounts ── */}
        {contasBancarias.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Contas Bancárias
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {contasBancarias.map(c => (
                <div
                  key={c.id}
                  className={`stat-card cursor-pointer transition-all ${filterBanco === c.id ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setFilterBanco(filterBanco === c.id ? "todos" : c.id)}
                >
                  <p className="text-xs text-muted-foreground font-medium">{c.bancos?.nome}</p>
                  <p className="text-sm font-medium mt-0.5">{c.descricao}</p>
                  <p className={`text-lg font-bold mono mt-1 ${Number(c.saldo_atual) >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(Number(c.saldo_atual || 0))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </ModulePage>

      {/* ── Lançamento manual modal ── */}
      <FormModal open={modalOpen} onClose={() => setModalOpen(false)} title="Lançamento Manual" size="md">
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-2 text-warning text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Lançamento manual</strong> — intervenção direta no fluxo de caixa. Certifique-se de que o registro é necessário e os valores estão corretos antes de salvar.
          </span>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo <span className="text-destructive">*</span></Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receber">A Receber (entrada)</SelectItem>
                  <SelectItem value="pagar">A Pagar (saída)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status <span className="text-destructive">*</span></Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberto">Aberto (a vencer)</SelectItem>
                  <SelectItem value="pago">Pago / Baixado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição <span className="text-destructive">*</span></Label>
            <Input
              value={form.descricao}
              onChange={e => setForm({ ...form, descricao: e.target.value })}
              placeholder="Ex: Pagamento de fornecedor, recebimento de cliente..."
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor (R$) <span className="text-destructive">*</span></Label>
              <Input
                type="number" min="0.01" step="0.01"
                value={form.valor || ""}
                onChange={e => setForm({ ...form, valor: parseFloat(e.target.value) || 0 })}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Vencimento <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.data_vencimento} onChange={e => setForm({ ...form, data_vencimento: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <Select value={form.forma_pagamento || "__none__"} onValueChange={v => setForm({ ...form, forma_pagamento: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Não informado</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="boleto_dda">Boleto/DDA</SelectItem>
                  <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                  <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Conta Bancária{form.status === "pago" && <span className="text-destructive"> *</span>}</Label>
              <Select value={form.conta_bancaria_id || "__none__"} onValueChange={v => setForm({ ...form, conta_bancaria_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar conta..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Não vinculado</SelectItem>
                  {contasBancarias.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.bancos?.nome} — {c.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={form.observacoes}
              onChange={e => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Informações adicionais sobre o lançamento..."
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Registrar Lançamento
            </Button>
          </div>
        </form>
      </FormModal>

      {/* ── CSV Import modal ── */}
      <FormModal open={csvOpen} onClose={() => { setCsvOpen(false); setCsvRows([]); setCsvFile(""); }} title="Importar Lançamentos via CSV" size="lg">
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary space-y-1">
            <p className="font-semibold flex items-center gap-1.5"><FileDown className="w-3.5 h-3.5" /> Formato esperado (separado por ponto-e-vírgula)</p>
            <p className="font-mono">data;descricao;valor;tipo</p>
            <p className="text-muted-foreground">Exemplo: <span className="font-mono">2024-01-15;Venda produto X;1500.00;receber</span></p>
            <p className="text-muted-foreground">O campo <strong>tipo</strong> deve ser <strong>receber</strong> ou <strong>pagar</strong>. Todos os lançamentos serão criados com status <strong>aberto</strong>.</p>
          </div>

          <div>
            <Label className="mb-2 block">Arquivo CSV</Label>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => csvInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{csvFile || "Clique ou arraste um arquivo .csv"}</p>
              <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
            </div>
          </div>

          {csvRows.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">{csvRows.length} registro(s) detectado(s) — prévia:</p>
              <div className="max-h-48 overflow-y-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>{Object.keys(csvRows[0]).map(h => <th key={h} className="p-2 text-left font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t">
                        {Object.values(row).map((v, j) => <td key={j} className="p-2">{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvRows.length > 10 && <p className="text-xs text-muted-foreground p-2">... e mais {csvRows.length - 10} registro(s)</p>}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setCsvOpen(false); setCsvRows([]); setCsvFile(""); }}>Cancelar</Button>
            <Button disabled={!csvRows.length || csvImporting} onClick={handleCsvImport} className="gap-2">
              {csvImporting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Importar {csvRows.length > 0 ? `${csvRows.length} registro(s)` : ""}
            </Button>
          </div>
        </div>
      </FormModal>
    </>
  );
};

export default FluxoCaixa;

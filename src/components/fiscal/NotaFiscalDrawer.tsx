import { ViewDrawerV2, ViewField, ViewSection, DrawerStickyFooter } from "@/components/ViewDrawerV2";
import { useDrawerData } from "@/hooks/useDrawerData";
import { useActionLock } from "@/hooks/useActionLock";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { PermanentDeleteDialog } from "@/components/PermanentDeleteDialog";
import { useState } from "react";
import { getNotaFiscalPermissions } from "@/lib/drawerPermissions";
import { EditarPagamentoNotaModal } from "@/components/fiscal/EditarPagamentoNotaModal";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { DrawerStatusBanner, type DrawerStatusTone } from "@/components/ui/DrawerStatusBanner";
import { DetailEmpty } from "@/components/ui/DetailStates";
import { Skeleton } from "@/components/ui/skeleton";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TimelineList } from "@/components/ui/TimelineList";
import {
  fetchNotaFiscalDetalhes,
  getNotaFiscalAnexoSignedUrl,
} from "@/services/fiscal.service";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Edit, CheckCircle, XCircle, ArrowLeftRight, FileText,
  Package, DollarSign, AlertCircle, Copy, Clock, Download, File, MoreVertical,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import {
  canConfirmFiscal,
  canDevolverFiscal,
  canEstornarFiscal,
  getFiscalInternalStatus,
  getFiscalSefazStatus,
} from "@/lib/fiscalStatus";
import { FiscalInternalStatusBadge, FiscalSefazStatusBadge } from "@/components/fiscal/FiscalStatusBadges";
import type { NotaFiscal as NotaFiscalDomain } from "@/types/domain";

// ── Constants ─────────────────────────────────────────────────────────────────

const modeloLabels: Record<string, string> = {
  "55": "NF-e", "65": "NFC-e", "57": "CT-e", "67": "CT-e OS", nfse: "NFS-e", outro: "Outro",
};


// ── Types ──────────────────────────────────────────────────────────────────────

/** Re-export canônico — Fase 3 do roadmap fiscal. */
export type NotaFiscal = NotaFiscalDomain;

// ── Drawer-local types ─────────────────────────────────────────────────────────

interface NFItem {
  id: string;
  quantidade: number;
  valor_unitario: number;
  cst?: string | null;
  cfop?: string | null;
  conta_contabil_id?: string | null;
  produtos?: { id: string; nome: string; sku: string } | null;
  contas_contabeis?: { codigo: string; descricao: string } | null;
}

interface LancamentoFiscal {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  status: string;
  forma_pagamento: string | null;
  parcela_numero: number | null;
  parcela_total: number | null;
}

interface MovimentoEstoque {
  id: string;
  tipo: string;
  quantidade: number;
  saldo_atual: number | null;
  produtos?: { id: string; nome: string; sku: string } | null;
}

interface EventoFiscal {
  id: string;
  tipo_evento: string;
  descricao?: string | null;
  data_evento: string;
  status_anterior?: string | null;
  status_novo?: string | null;
}

interface AnexoFiscal {
  id: string;
  nome_arquivo?: string | null;
  tipo_arquivo?: string | null;
  tamanho?: number | null;
  caminho_storage?: string | null;
  created_at?: string | null;
}

interface NotaFiscalDrawerProps {
  open: boolean;
  onClose: () => void;
  selected: NotaFiscal | null;
  onEdit: (nf: NotaFiscal) => void;
  onDelete: (id: string) => void;
  onConfirmar: (nf: NotaFiscal) => void;
  onEstornar: (nf: NotaFiscal) => void;
  onDevolucao: (nf: NotaFiscal) => void;
  onDanfe: (nf: NotaFiscal) => void;
  /** Chamado após exclusão permanente bem-sucedida (admin). */
  onPermanentlyDeleted?: () => void;
  /** Chamado quando o drawer precisa que a lista pai recarregue (sem fechar). */
  onRefresh?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function NotaFiscalDrawer({
  open, onClose, selected,
  onEdit, onDelete, onConfirmar, onEstornar, onDevolucao, onDanfe,
  onPermanentlyDeleted, onRefresh,
}: NotaFiscalDrawerProps) {
  const selectedId = selected?.id ?? null;

  const { data: extraData, loading: loadingExtra } = useDrawerData<{
    items: NFItem[];
    lancamentos: LancamentoFiscal[];
    movimentos: MovimentoEstoque[];
    eventos: EventoFiscal[];
    anexos: AnexoFiscal[];
  }>(open, selectedId, async (id) => {
    const r = await fetchNotaFiscalDetalhes(id);
    return {
      items: r.items as unknown as NFItem[],
      lancamentos: r.lancamentos as LancamentoFiscal[],
      movimentos: r.movimentos as unknown as MovimentoEstoque[],
      eventos: r.eventos as EventoFiscal[],
      anexos: r.anexos as AnexoFiscal[],
    };
  });

  const items = extraData?.items ?? [];
  const lancamentos = extraData?.lancamentos ?? [];
  const movimentos = extraData?.movimentos ?? [];
  const eventos = extraData?.eventos ?? [];
  const anexos = extraData?.anexos ?? [];

  const { pending: editPending, run: runEdit } = useActionLock();
  const { pending: deletePending, run: runDelete } = useActionLock();
  const { pending: confirmarPending, run: runConfirmar } = useActionLock();
  const { pending: estornarPending, run: runEstornar } = useActionLock();
  const { pending: devolucaoPending, run: runDevolucao } = useActionLock();
  const isMobile = useIsMobile();
  const { isAdmin } = useIsAdmin();
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const [editarPagamentoOpen, setEditarPagamentoOpen] = useState(false);

  if (!open || !selected) return null;

  // ── Derived values ───────────────────────────────────────────────────────────

  const parceiro =
    selected.tipo === "entrada" && selected.tipo_operacao === "devolucao" && selected.clientes?.nome_razao_social
      ? selected.clientes.nome_razao_social
      : selected.tipo === "entrada"
      ? selected.fornecedores?.nome_razao_social || "—"
      : selected.clientes?.nome_razao_social || "—";

  const parceiroId =
    selected.tipo === "entrada" && selected.tipo_operacao === "devolucao" && selected.cliente_id
      ? selected.cliente_id
      : selected.tipo === "entrada" ? selected.fornecedor_id : selected.cliente_id;
  const parceiroType =
    selected.tipo === "entrada" && selected.tipo_operacao === "devolucao" && selected.cliente_id
      ? "cliente"
      : selected.tipo === "entrada" ? "fornecedor" : "cliente";

  const totalProdutos = items.reduce(
    (s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0,
  );
  const totalImpostos =
    Number(selected.icms_valor || 0) +
    Number(selected.ipi_valor || 0) +
    Number(selected.pis_valor || 0) +
    Number(selected.cofins_valor || 0) +
    Number(selected.icms_st_valor || 0);

  const modelo = modeloLabels[selected.modelo_documento || "55"] || selected.modelo_documento;
  const temChaveAcesso = !!selected.chave_acesso;
  const condicaoLabel =
    selected.condicao_pagamento === "a_vista" ? "À Vista" :
    selected.condicao_pagamento === "a_prazo" ? "A Prazo" :
    selected.condicao_pagamento || "—";

  const internalStatus = getFiscalInternalStatus(selected.status);
  const sefazStatus = getFiscalSefazStatus(selected.status_sefaz || "nao_enviada");
  const statusTone: DrawerStatusTone =
    selected.status === "confirmada" ? "info" :
    selected.status === "pendente" ? "warning" :
    ["cancelada", "cancelada_sefaz", "rejeitada"].includes(selected.status) ? "destructive" :
    selected.status === "autorizada" ? "success" : "neutral";

  const perms = getNotaFiscalPermissions(selected);
  // Override fiscal-specific rules (devolução só p/ saída normal)
  const canConfirmar = canConfirmFiscal(selected.status);
  const canEstornar = canEstornarFiscal(selected.status);
  const canDevolucao = canDevolverFiscal(selected.status, selected.tipo, selected.tipo_operacao);
  void perms;

  const copyChave = () => {
    navigator.clipboard.writeText(selected.chave_acesso);
    toast.success("Chave de acesso copiada!");
  };

  // ── Summary strip ─────────────────────────────────────────────────────────────

  const summary = (
    <DrawerSummaryGrid cols={4}>
      <DrawerSummaryCard label="Modelo" value={modelo} />
      <DrawerSummaryCard label="Produtos" value={formatCurrency(totalProdutos)} />
      <DrawerSummaryCard label="Impostos" value={formatCurrency(totalImpostos)} />
      <DrawerSummaryCard label="Total NF" value={formatCurrency(Number(selected.valor_total))} tone="primary" />
    </DrawerSummaryGrid>
  );

  // ── Tabs ──────────────────────────────────────────────────────────────────────

  const tabResumo = (
    <div className="space-y-5">
      <DrawerStatusBanner
        tone={statusTone}
        icon={AlertCircle}
        title={`Status ERP: ${internalStatus.label}`}
        description={internalStatus.description}
      />
      <DrawerStatusBanner
        tone={selected.status_sefaz === "rejeitada" ? "destructive" : selected.status_sefaz === "autorizada" ? "success" : "neutral"}
        icon={AlertCircle}
        title={`Status SEFAZ: ${sefazStatus.label}`}
        description={sefazStatus.description}
      />

      <ViewSection title="Identificação">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Tipo">
            <Badge
              variant="outline"
              className={
                selected.tipo === "entrada"
                  ? "border-primary/40 text-primary"
                  : "border-warning/40 text-warning"
              }
            >
              {selected.tipo === "entrada" ? "Entrada" : "Saída"}
            </Badge>
          </ViewField>
          <ViewField label="Modelo">
            <span className="font-mono font-medium">{modelo}</span>
          </ViewField>
          <ViewField label="Número / Série">
            <span className="font-mono font-medium">
              {selected.numero} / {selected.serie || "1"}
            </span>
          </ViewField>
          <ViewField label="Data de Emissão">{formatDate(selected.data_emissao)}</ViewField>
          <ViewField label="Status ERP"><FiscalInternalStatusBadge status={selected.status} /></ViewField>
          <ViewField label="Status SEFAZ"><FiscalSefazStatusBadge status={selected.status_sefaz || "nao_enviada"} /></ViewField>
          {(selected.tipo_operacao || "normal") !== "normal" && (
            <ViewField label="Operação">
              <span className="font-medium capitalize text-warning">{selected.tipo_operacao}</span>
            </ViewField>
          )}
        </div>
      </ViewSection>

      <ViewSection title="Parceiro">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label={
            selected.tipo === "entrada" && selected.tipo_operacao === "devolucao" && selected.cliente_id
              ? "Cliente (Devolução)"
              : selected.tipo === "entrada" ? "Fornecedor" : "Cliente"
          }>
            {parceiroId ? (
              <RelationalLink type={parceiroType as "fornecedor" | "cliente"} id={parceiroId}>
                {parceiro}
              </RelationalLink>
            ) : (
              parceiro
            )}
          </ViewField>
          {selected.ordem_venda_id && selected.ordens_venda && (
            <ViewField label="Pedido Vinculado">
              <RelationalLink type="ordem_venda" id={selected.ordem_venda_id}>
                <span className="font-mono">{selected.ordens_venda.numero}</span>
              </RelationalLink>
            </ViewField>
          )}
        </div>
      </ViewSection>

      <ViewSection title="Pagamento">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Condição">{condicaoLabel}</ViewField>
          <ViewField label="Forma">
            <span className="capitalize">{selected.forma_pagamento || "—"}</span>
          </ViewField>
          <ViewField label="Gera Financeiro">
            <span className={selected.gera_financeiro !== false ? "text-success font-medium" : "text-muted-foreground"}>
              {selected.gera_financeiro !== false ? "Sim" : "Não"}
            </span>
          </ViewField>
          <ViewField label="Mov. Estoque">
            <span className={selected.movimenta_estoque !== false ? "text-success font-medium" : "text-muted-foreground"}>
              {selected.movimenta_estoque !== false ? "Sim" : "Não"}
            </span>
          </ViewField>
        </div>
        {!["cancelada", "cancelada_sefaz", "inativada"].includes(selected.status) && (
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setEditarPagamentoOpen(true)}>
              <Edit className="h-3.5 w-3.5 mr-1.5" />
              Editar pagamento
            </Button>
          </div>
        )}
      </ViewSection>

      {selected.observacoes && (
        <ViewSection title="Observações">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selected.observacoes}</p>
        </ViewSection>
      )}
    </div>
  );

  const tabItens = (
    <div className="space-y-4">
      {items.length > 0 ? (
        <>
          {/* Mobile: lista de cards verticais */}
          <div className="md:hidden space-y-2">
            {items.map((i, idx) => (
              <div key={idx} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {i.produtos?.id ? (
                      <RelationalLink type="produto" id={i.produtos.id}>
                        <span className="font-medium text-sm truncate block">{i.produtos?.nome || "—"}</span>
                      </RelationalLink>
                    ) : (
                      <span className="font-medium text-sm truncate block">{i.produtos?.nome || "—"}</span>
                    )}
                  </div>
                  <span className="font-mono font-bold text-sm shrink-0">
                    {formatCurrency(Number(i.quantidade) * Number(i.valor_unitario))}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {i.quantidade} × {formatCurrency(i.valor_unitario)}
                </div>
                {(i.cst || i.cfop || i.contas_contabeis) && (
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
                    {i.cst && <Badge variant="outline" className="text-[10px]">CST {i.cst}</Badge>}
                    {i.cfop && <Badge variant="outline" className="text-[10px]">CFOP {i.cfop}</Badge>}
                    {i.contas_contabeis && (
                      <Badge variant="outline" className="text-[10px] truncate max-w-[180px]">
                        {i.contas_contabeis.codigo}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Desktop: tabela */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Produto</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Qtd</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Unit.</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Total</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">CST</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">CFOP</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Conta Contábil</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i, idx) => (
                  <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      {i.produtos?.id ? (
                        <RelationalLink type="produto" id={i.produtos.id}>
                          <span className="truncate max-w-[120px] block">{i.produtos?.nome || "—"}</span>
                        </RelationalLink>
                      ) : (
                        i.produtos?.nome || "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{i.quantidade}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                      {formatCurrency(i.valor_unitario)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-medium">
                      {formatCurrency(Number(i.quantidade) * Number(i.valor_unitario))}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{i.cst || "—"}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{i.cfop || "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {i.contas_contabeis ? `${i.contas_contabeis.codigo} – ${i.contas_contabeis.descricao}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg bg-muted/30 border p-3 flex justify-between items-center text-sm">
            <span className="text-muted-foreground">
              {items.length} item(ns) · Subtotal Produtos
            </span>
            <span className="font-mono font-bold">{formatCurrency(totalProdutos)}</span>
          </div>
        </>
      ) : (
        <DetailEmpty icon={Package} title="Nenhum item registrado" className="py-8" />
      )}
    </div>
  );

  const tabFiscal = (
    <div className="space-y-5">
      <ViewSection title="Identificação Fiscal">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Modelo / Tipo">{modelo}</ViewField>
          <ViewField label="Número">
            <span className="font-mono font-medium">{selected.numero}</span>
          </ViewField>
          <ViewField label="Série">
            <span className="font-mono">{selected.serie || "1"}</span>
          </ViewField>
          <ViewField label="Data de Emissão">{formatDate(selected.data_emissao)}</ViewField>
          <ViewField label="Status ERP">
            <FiscalInternalStatusBadge status={selected.status} />
          </ViewField>
          <ViewField label="Status SEFAZ">
            <FiscalSefazStatusBadge status={selected.status_sefaz || "nao_enviada"} />
          </ViewField>
          <ViewField label="Operação">
            <span className="capitalize">{selected.tipo === "entrada" ? "Entrada" : "Saída"}</span>
          </ViewField>
        </div>

        <div className="mt-3 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Chave de Acesso
          </span>
          {temChaveAcesso ? (
            <div className="flex items-start gap-2 bg-muted/30 rounded-lg p-3">
              <p className="font-mono text-xs break-all flex-1 leading-relaxed select-all">
                {selected.chave_acesso}
              </p>
              <button
                type="button"
                onClick={copyChave}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                title="Copiar chave de acesso"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-1">Chave de acesso não informada</p>
          )}
        </div>
      </ViewSection>

      <ViewSection title="Tributos">
        <div className="rounded-lg bg-accent/30 border p-4 space-y-2">
          {[
            { label: "Subtotal Produtos", val: totalProdutos },
            { label: "Frete", val: Number(selected.frete_valor || 0) },
            { label: "ICMS", val: Number(selected.icms_valor || 0) },
            { label: "IPI", val: Number(selected.ipi_valor || 0) },
            { label: "PIS", val: Number(selected.pis_valor || 0) },
            { label: "COFINS", val: Number(selected.cofins_valor || 0) },
            { label: "ICMS-ST", val: Number(selected.icms_st_valor || 0) },
            { label: "Outras Despesas", val: Number(selected.outras_despesas || 0) },
          ].map(({ label, val }) =>
            val > 0 ? (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono">{formatCurrency(val)}</span>
              </div>
            ) : null,
          )}
          {Number(selected.desconto_valor || 0) > 0 && (
            <div className="flex justify-between text-sm text-destructive">
              <span>Desconto</span>
              <span className="font-mono">−{formatCurrency(Number(selected.desconto_valor))}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t pt-2 mt-1">
            <span>Total da NF</span>
            <span className="font-mono text-base text-primary">
              {formatCurrency(Number(selected.valor_total))}
            </span>
          </div>
        </div>
      </ViewSection>
    </div>
  );

  const handleDownloadAnexo = async (anexo: AnexoFiscal) => {
    if (!anexo.caminho_storage) { toast.error("Caminho do arquivo não disponível."); return; }
    try {
      const url = await getNotaFiscalAnexoSignedUrl(anexo.caminho_storage);
      window.open(url, "_blank");
    } catch (err: unknown) {
      notifyError(err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const tabArquivos = (
    <div className="space-y-5">
      <ViewSection title="DANFE / Visualização">
        <div className="rounded-lg border p-4 flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">DANFE</p>
              <p className="text-xs text-muted-foreground">
                Documento Auxiliar da Nota Fiscal Eletrônica
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => onDanfe(selected)}
          >
            <FileText className="h-3.5 w-3.5" /> Visualizar
          </Button>
        </div>
      </ViewSection>

      {/* Real attachments from nota_fiscal_anexos */}
      <ViewSection title="Anexos">
        {loadingExtra ? (
          <div className="space-y-2 py-1" aria-busy="true" aria-label="Carregando anexos">
            <Skeleton tone="card" className="h-12 w-full" />
            <Skeleton tone="card" className="h-12 w-full" />
          </div>
        ) : anexos.length === 0 ? (
          <DetailEmpty
            icon={File}
            title="Nenhum anexo vinculado a esta nota fiscal"
            className="py-6"
          />
        ) : (
          <div className="space-y-2">
            {anexos.map((anexo) => (
              <div key={anexo.id} className="rounded-lg border p-3 flex items-center justify-between bg-muted/10 hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <File className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{anexo.nome_arquivo || "Arquivo"}</p>
                    <p className="text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] mr-1.5">{anexo.tipo_arquivo?.toUpperCase()}</Badge>
                      {formatFileSize(anexo.tamanho)}
                      {anexo.created_at && ` · ${formatDate(anexo.created_at)}`}
                    </p>
                  </div>
                </div>
                {anexo.caminho_storage && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Baixar ${anexo.nome_arquivo || "arquivo"}`} onClick={() => handleDownloadAnexo(anexo)} title="Baixar">
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </ViewSection>

      <ViewSection title="XML / Chave de Acesso">
        {temChaveAcesso ? (
          <div className="space-y-3">
            <div className="rounded-lg border bg-success/5 border-success/20 p-3 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success shrink-0" />
              <p className="text-xs text-success font-medium">
                Chave de acesso disponível — documento identificado como NF-e eletrônica
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Chave (44 dígitos)
              </span>
              <div className="flex items-start gap-2 bg-muted/30 rounded-lg p-3">
                <p className="font-mono text-xs break-all flex-1 leading-relaxed select-all">
                  {selected.chave_acesso}
                </p>
                <button
                  type="button"
                  onClick={copyChave}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  title="Copiar"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/20 p-4 flex items-center gap-3 text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="text-xs">
              Chave de acesso não informada. XML eletrônico não vinculado a este documento.
            </p>
          </div>
        )}
      </ViewSection>
    </div>
  );

  const tipoEventoLabels: Record<string, string> = {
    criacao: "Criação", edicao: "Edição", confirmacao: "Confirmação",
    importacao_xml: "Importação XML", tentativa_envio: "Tentativa de Envio",
    autorizacao: "Autorização", rejeicao: "Rejeição",
    cancelamento_rascunho: "Cancelamento de Rascunho",
    cancelamento_autorizada: "Cancelamento de Autorizada",
    estorno: "Estorno", download_xml: "Download XML",
    download_pdf: "Download PDF", envio_email: "Envio por E-mail",
  };

  const tabEventos = (
    <div className="space-y-4">
      {loadingExtra ? (
        <div className="space-y-2 py-1" aria-busy="true" aria-label="Carregando eventos">
          <Skeleton tone="card" className="h-10 w-full" />
          <Skeleton tone="card" className="h-10 w-3/4" />
          <Skeleton tone="card" className="h-10 w-2/3" />
        </div>
      ) : eventos.length === 0 ? (
        <DetailEmpty
          icon={Clock}
          title="Nenhum evento registrado"
          message="Eventos são gerados ao confirmar, estornar ou cancelar a NF."
          className="py-6"
        />
      ) : (
        <TimelineList
          items={eventos.map((ev) => ({
            id: ev.id,
            title: tipoEventoLabels[ev.tipo_evento] || ev.tipo_evento,
            description: ev.descricao || undefined,
            date: ev.data_evento,
            type: ev.status_novo ? `${ev.status_anterior || "—"} → ${ev.status_novo}` : undefined,
          }))}
          emptyMessage="Nenhum evento registrado"
        />
      )}
    </div>
  );

  const tabVinculos = (
    <div className="space-y-5">
      <ViewSection title="Origem / Documento">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label={
            selected.tipo === "entrada" && selected.tipo_operacao === "devolucao" && selected.cliente_id
              ? "Cliente (Devolução)"
              : selected.tipo === "entrada" ? "Fornecedor" : "Cliente"
          }>
            {parceiroId ? (
              <RelationalLink type={parceiroType as "fornecedor" | "cliente"} id={parceiroId}>
                {parceiro}
              </RelationalLink>
            ) : (
              parceiro
            )}
          </ViewField>
          {selected.ordem_venda_id && selected.ordens_venda && (
            <ViewField label="Pedido de Origem">
              <RelationalLink type="ordem_venda" id={selected.ordem_venda_id}>
                <span className="font-mono">{selected.ordens_venda.numero}</span>
              </RelationalLink>
            </ViewField>
          )}
          {selected.nf_referenciada_id && (
            <ViewField label="NF Referenciada">
              <RelationalLink type="nota_fiscal" id={selected.nf_referenciada_id}>
                Ver NF de origem
              </RelationalLink>
            </ViewField>
          )}
        </div>
      </ViewSection>

      <ViewSection title="Impacto Financeiro">
        {loadingExtra ? (
          <div className="space-y-2 py-1" aria-busy="true" aria-label="Carregando lançamentos">
            <Skeleton tone="card" className="h-9 w-full" />
            <Skeleton tone="card" className="h-9 w-full" />
          </div>
        ) : lancamentos.length === 0 ? (
          <DetailEmpty
            icon={DollarSign}
            title={
              selected.gera_financeiro === false
                ? "NF não gera lançamentos financeiros"
                : selected.status === "pendente"
                ? "Lançamentos serão gerados na confirmação"
                : "Nenhum lançamento vinculado a esta NF"
            }
            message={
              selected.gera_financeiro === false
                ? "Configuração de geração financeira está desmarcada."
                : undefined
            }
            className="py-6"
          />
        ) : (
          <div className="space-y-2">
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Descrição</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Valor</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Vencimento</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map((l, idx) => (
                    <tr key={l.id ?? `lanc-${idx}`} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-3 py-2 truncate max-w-[140px]">{l.descricao || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono font-medium">
                        {formatCurrency(Number(l.valor))}
                      </td>
                      <td className="px-3 py-2">
                        {l.data_vencimento ? formatDate(l.data_vencimento) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs capitalize">{l.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground text-right">
              {lancamentos.length} lançamento(s) · total:{" "}
              <span className="font-mono font-semibold">
                {formatCurrency(lancamentos.reduce((s, l) => s + Number(l.valor || 0), 0))}
              </span>
            </p>
          </div>
        )}
      </ViewSection>

      {selected.movimenta_estoque !== false && (
        <ViewSection title="Impacto em Estoque">
          {loadingExtra ? (
            <div className="space-y-2 py-1" aria-busy="true" aria-label="Carregando movimentos de estoque">
              <Skeleton tone="card" className="h-9 w-full" />
              <Skeleton tone="card" className="h-9 w-full" />
            </div>
          ) : movimentos.length === 0 ? (
            <DetailEmpty
              icon={Package}
              title={
                selected.status === "pendente"
                  ? "Movimentos serão gerados na confirmação"
                  : "Nenhum movimento de estoque vinculado a esta NF"
              }
              className="py-6"
            />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Produto</th>
                    <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Tipo</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Qtd</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((m, idx) => (
                    <tr key={m.id ?? `mov-${idx}`} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-3 py-2 truncate max-w-[120px]">
                        {m.produtos?.id ? (
                          <RelationalLink type="produto" id={m.produtos.id}>
                            {m.produtos?.nome || "—"}
                          </RelationalLink>
                        ) : (
                          m.produtos?.nome || "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            m.tipo === "entrada"
                              ? "text-success border-success/30"
                              : "text-destructive border-destructive/30",
                          )}
                        >
                          {m.tipo === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{m.quantidade}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {m.saldo_atual}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ViewSection>
      )}

      {items.some((i) => i.contas_contabeis) && (
        <ViewSection title="Contas Contábeis">
          <div className="space-y-1">
            {items
              .filter((i) => i.contas_contabeis)
              .map((i, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate">
                    {i.produtos?.nome || `Item ${idx + 1}`}
                  </span>
                  <span className="font-mono text-xs">
                    {i.contas_contabeis.codigo} – {i.contas_contabeis.descricao}
                  </span>
                </div>
              ))}
          </div>
        </ViewSection>
      )}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
    <ViewDrawerV2
      open={open}
      onClose={onClose}
      variant="operational"
      title={`NF ${selected.numero} · Série ${selected.serie || "1"}`}
      subtitle={
        <span>
          <span className="font-medium">{parceiro}</span>
          {selected.data_emissao ? ` · ${formatDate(selected.data_emissao)}` : ""}
          {(selected.tipo_operacao || "normal") !== "normal" && (
            <span className="ml-1 text-warning font-medium capitalize">
              · {selected.tipo_operacao}
            </span>
          )}
        </span>
      }
      badge={
        <div className="flex items-center gap-2">
          <FiscalInternalStatusBadge status={selected.status} />
          <FiscalSefazStatusBadge status={selected.status_sefaz || "nao_enviada"} />
        </div>
      }
      summary={summary}
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" aria-label="Editar nota fiscal" disabled={editPending} onClick={() => runEdit(() => { onEdit(selected); onClose(); })}>
            <Edit className="h-3.5 w-3.5" /> Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10"
            aria-label="Inativar rascunho fiscal"
            disabled={deletePending || !["pendente", "rascunho"].includes(selected.status)}
            title={selected.status === "pendente" || selected.status === "rascunho" ? "Inativar rascunho no ERP" : "Inativação permitida somente para rascunho/pendente"}
            onClick={() => runDelete(() => { onDelete(selected.id); onClose(); })}
          >
            <XCircle className="h-3.5 w-3.5" /> Inativar
          </Button>
          {isAdmin && selected.status === "rascunho" && (selected.status_sefaz || "nao_enviada") === "nao_enviada" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10"
              aria-label="Excluir nota fiscal permanentemente"
              title="Exclusão definitiva — permitida apenas em rascunhos não enviados à SEFAZ. NFs canceladas devem ser preservadas por exigência fiscal."
              onClick={() => setPermDeleteOpen(true)}
            >
              <XCircle className="h-3.5 w-3.5" /> Excluir definitivamente
            </Button>
          )}
        </>
      }
      tabs={[
        { value: "resumo", label: "Resumo", content: tabResumo },
        { value: "itens", label: `Itens (${items.length})`, content: tabItens },
        ...(isMobile
          ? [
              {
                value: "mais",
                label: "Mais",
                content: (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Fiscal</h3>
                      {tabFiscal}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Arquivos</h3>
                      {tabArquivos}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Eventos ({eventos.length})</h3>
                      {tabEventos}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Vínculos</h3>
                      {tabVinculos}
                    </div>
                  </div>
                ),
              },
            ]
          : [
              { value: "fiscal", label: "Fiscal", content: tabFiscal },
              { value: "arquivos", label: "Arquivos", content: tabArquivos },
              { value: "eventos", label: `Eventos (${eventos.length})`, content: tabEventos },
              { value: "vinculos", label: "Vínculos", content: tabVinculos },
            ]),
      ]}
      footer={
        isMobile ? (
          <DrawerStickyFooter
            right={
              <div className="flex items-center gap-2 w-full">
                {canConfirmar ? (
                  <Button
                    size="sm"
                    className="flex-1 min-h-11 gap-2"
                    disabled={confirmarPending}
                    onClick={() => runConfirmar(() => { onConfirmar(selected); onClose(); })}
                  >
                    <CheckCircle className="h-4 w-4" /> Confirmar NF
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 min-h-11 gap-2"
                    onClick={() => onDanfe(selected)}
                  >
                    <FileText className="h-4 w-4" /> DANFE
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11 min-w-11 px-3"
                      aria-label="Mais ações"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" className="w-56">
                    {canConfirmar && (
                      <DropdownMenuItem onClick={() => onDanfe(selected)}>
                        <FileText className="h-4 w-4 mr-2" /> DANFE
                      </DropdownMenuItem>
                    )}
                    {canDevolucao && (
                      <DropdownMenuItem onClick={() => runDevolucao(() => { onDevolucao(selected); onClose(); })}>
                        <ArrowLeftRight className="h-4 w-4 mr-2" /> Devolução
                      </DropdownMenuItem>
                    )}
                    {canEstornar && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={estornarPending}
                          onClick={() => runEstornar(() => { onEstornar(selected); onClose(); })}
                        >
                          <XCircle className="h-4 w-4 mr-2" /> Estornar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
          />
        ) : (
        <DrawerStickyFooter
          left={
            canEstornar && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive border-destructive/30 hover:text-destructive"
                disabled={estornarPending}
                title="Estorno operacional: reverte estoque, financeiro e vínculo de faturamento"
                onClick={() => runEstornar(() => { onEstornar(selected); onClose(); })}
              >
                <XCircle className="h-4 w-4" /> Estornar
              </Button>
            )
          }
          right={
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => onDanfe(selected)}>
                <FileText className="h-4 w-4" /> DANFE
              </Button>
              {canDevolucao && (
                <Button variant="outline" size="sm" className="gap-2" disabled={devolucaoPending} title="Gerar NF de devolução vinculada à nota de origem" onClick={() => runDevolucao(() => { onDevolucao(selected); onClose(); })}>
                  <ArrowLeftRight className="h-4 w-4" /> Devolução
                </Button>
              )}
              {canConfirmar && (
                <Button size="sm" className="gap-2" disabled={confirmarPending} title="Confirmação operacional: cria impactos reais em estoque e financeiro" onClick={() => runConfirmar(() => { onConfirmar(selected); onClose(); })}>
                  <CheckCircle className="h-4 w-4" /> Confirmar NF
                </Button>
              )}
            </>
          }
        />
        )
      }
    />
    {selected && (
      <PermanentDeleteDialog
        open={permDeleteOpen}
        onClose={() => setPermDeleteOpen(false)}
        table="notas_fiscais"
        id={selected.id}
        entityLabel={selected.tipo === "entrada" ? "nota fiscal de entrada" : "nota fiscal de saída"}
        recordName={`NF ${selected.numero}${selected.serie ? ` · Série ${selected.serie}` : ""}`}
        warning={
          (lancamentos.length > 0 || movimentos.length > 0 || eventos.length > 0)
            ? `Esta NF possui ${lancamentos.length} lançamento(s) financeiro(s), ${movimentos.length} movimento(s) de estoque e ${eventos.length} evento(s) fiscal(is) vinculados. A exclusão será bloqueada pelo banco se houver referências ativas — nesse caso, mantenha a NF apenas inativa.`
            : undefined
        }
        onDeleted={() => {
          onPermanentlyDeleted?.();
          onClose();
        }}
      />
    )}
    {selected && (
      <EditarPagamentoNotaModal
        open={editarPagamentoOpen}
        onClose={() => setEditarPagamentoOpen(false)}
        nota={selected}
        onSaved={() => {
          onRefresh?.();
        }}
      />
    )}
    </>
  );
}


import { useState } from "react";
import { ViewDrawerV2, DrawerStickyFooter } from "@/components/ViewDrawerV2";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { DrawerStatusBanner } from "@/components/ui/DrawerStatusBanner";
import { DetailEmpty } from "@/components/ui/DetailStates";
import { ViewField, ViewSection } from "@/components/ui/ViewField";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { useActionLock } from "@/hooks/useActionLock";
import { getPedidoCompraPermissions, isVencido } from "@/lib/drawerPermissions";
import { canonicalPedidoStatus, pedidoCanReceive, pedidoRecebimentoLabel } from "./comprasStatus";
import { RegistrarRecebimentoDialog } from "./RegistrarRecebimentoDialog";
import { EstornarRecebimentoDialog } from "./EstornarRecebimentoDialog";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LogisticaRastreioSection } from "@/components/logistica/LogisticaRastreioSection";
import { AuditTimelineMini } from "@/components/views/AuditTimelineMini";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Edit,
  Trash2,
  PackageCheck,
  SendHorizontal,
  AlertCircle,
  Calendar,
  Building2,
  FileText,
  Boxes,
  ArrowDownToLine,
  Receipt,
  CheckCircle2,
  Clock,
  Truck,
  XCircle,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { PedidoCompra, pedidoNumero } from "./pedidoCompraTypes";
import type {
  PedidoItemRow,
  EstoqueMovimentoRow,
  FinanceiroLancRow,
} from "@/hooks/usePedidosCompra";

interface PedidoCompraDrawerProps {
  open: boolean;
  onClose: () => void;
  selected: PedidoCompra;
  viewItems: PedidoItemRow[];
  viewEstoque: EstoqueMovimentoRow[];
  viewFinanceiro: FinanceiroLancRow[];
  viewCotacao: { numero: string; status: string; data_cotacao: string } | null;
  onEdit: () => void;
  onDelete: () => void;
  onSend: (p: PedidoCompra) => void;
  onReceive: (p: PedidoCompra) => void;
  onCancel: (p: PedidoCompra, motivo: string) => void;
  onSolicitarAprovacao?: (p: PedidoCompra) => void;
  onAprovar?: (p: PedidoCompra) => void;
  onRejeitar?: (p: PedidoCompra, motivo: string) => void;
  onAfterRecebimentoChange?: () => void;
  isAdmin?: boolean;
  statusLabels: Record<string, string>;
}

export function PedidoCompraDrawer({
  open,
  onClose,
  selected,
  viewItems,
  viewEstoque,
  viewFinanceiro,
  viewCotacao,
  onEdit,
  onDelete,
  onSend,
  onReceive,
  onCancel,
  onSolicitarAprovacao,
  onAprovar,
  onRejeitar,
  onAfterRecebimentoChange,
  isAdmin,
  statusLabels,
}: PedidoCompraDrawerProps) {
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [receberOpen, setReceberOpen] = useState(false);
  const [estornoOpen, setEstornoOpen] = useState(false);
  const navigate = useNavigate();
  const pedidoStatus = canonicalPedidoStatus(selected.status);

  const { pending: sendPending, run: runSend } = useActionLock();
  const { pending: receivePending, run: runReceive } = useActionLock();
  const { pending: cancelPending, run: runCancel } = useActionLock();
  const { pending: solicitarPending, run: runSolicitar } = useActionLock();
  const { pending: aprovarPending, run: runAprovar } = useActionLock();
  const { pending: rejeitarPending, run: runRejeitar } = useActionLock();

  if (!open || !selected) return null;

  const isOverdue =
    !["recebido", "cancelado"].includes(pedidoStatus) &&
    isVencido(selected.data_entrega_prevista);

  const recebimentoStatus = (() => {
    if (pedidoStatus === "recebido") return { label: "Recebido", color: "success" };
    if (pedidoStatus === "parcialmente_recebido") return { label: "Recebimento Parcial", color: "warning" };
    if (pedidoStatus === "aguardando_recebimento") return { label: "Aguardando Recebimento", color: "warning" };
    if (pedidoStatus === "aguardando_aprovacao") return { label: "Aguardando Aprovação", color: "warning" };
    if (pedidoStatus === "aprovado") return { label: "Aprovado — aguardando envio", color: "info" };
    if (pedidoStatus === "enviado_ao_fornecedor") return { label: "Enviado ao Fornecedor", color: "info" };
    if (pedidoStatus === "rejeitado") return { label: "Rejeitado", color: "destructive" };
    if (pedidoStatus === "cancelado") return { label: "Cancelado", color: "destructive" };
    return { label: "Pendente", color: "secondary" };
  })();


  const estoquePorProduto: Record<string, number> = viewEstoque.reduce<Record<string, number>>(
    (acc, m) => {
      const key = String(m.produto_id);
      acc[key] = (acc[key] || 0) + Number(m.quantidade || 0);
      return acc;
    },
    {},
  );

  const totalOrdenado = viewItems.reduce((s, i) => s + Number(i.quantidade || 0), 0);
  const totalRecebido = viewEstoque.reduce((s, m) => s + Number(m.quantidade || 0), 0);
  const pctRecebimento =
    totalOrdenado > 0 ? Math.min(100, Math.round((totalRecebido / totalOrdenado) * 100)) : 0;

  const tabResumo = (
    <div className="space-y-5">
      {isOverdue && (
        <DrawerStatusBanner
          tone="destructive"
          icon={AlertCircle}
          title="Pedido em atraso"
          description={`Entrega prevista em ${formatDate(selected.data_entrega_prevista)} — recebimento pendente.`}
        />
      )}

      <ViewSection title="Pedido">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Nº">
            <span className="font-mono font-medium">{pedidoNumero(selected)}</span>
          </ViewField>
          <ViewField label="Status">
            <StatusBadge status={selected.status} label={statusLabels[selected.status] || selected.status} />
          </ViewField>
          <ViewField label="Data Pedido">{formatDate(selected.data_pedido)}</ViewField>
          <ViewField label="Valor Total">
            <span className="font-semibold font-mono text-primary">
              {formatCurrency(Number(selected.valor_total || 0))}
            </span>
          </ViewField>
        </div>
      </ViewSection>

      <ViewSection title="Fornecedor">
        <ViewField label="Fornecedor">
          {selected.fornecedor_id ? (
            <RelationalLink type="fornecedor" id={String(selected.fornecedor_id)}>
              {selected.fornecedores?.nome_razao_social || "—"}
            </RelationalLink>
          ) : (
            <span className="text-muted-foreground">Não informado</span>
          )}
        </ViewField>
      </ViewSection>

      {selected.cotacao_compra_id && (
        <ViewSection title="Cotação de Origem">
          <ViewField label="Cotação">
            {viewCotacao ? (
              <RelationalLink to="/cotacoes-compra">{viewCotacao.numero}</RelationalLink>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">{selected.cotacao_compra_id}</span>
            )}
          </ViewField>
          {viewCotacao?.status && (
            <ViewField label="Status da Cotação">
              <StatusBadge status={viewCotacao.status} />
            </ViewField>
          )}
        </ViewSection>
      )}

      {selected.observacoes && (
        <ViewSection title="Observações">
          <p className="text-sm text-muted-foreground italic">{selected.observacoes}</p>
        </ViewSection>
      )}
    </div>
  );

  const tabItens = (
    <div className="space-y-3">
      {viewItems.length > 0 ? (
        <>
          {/* Mobile: cards verticais */}
          <div className="md:hidden space-y-2">
            {viewItems.map((i) => {
              const produtos = i.produtos;
              const qtdRec = estoquePorProduto[String(i.produto_id)] || 0;
              const qtdPend = Math.max(0, Number(i.quantidade) - qtdRec);
              return (
                <div key={String(i.id)} className="rounded-lg border bg-card p-3 space-y-2">
                  <div>
                    <p className="font-medium text-sm">{produtos?.nome ?? "—"}</p>
                    {produtos?.codigo_interno && (
                      <p className="text-[10px] font-mono text-muted-foreground">{produtos.codigo_interno}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Qtd</p>
                      <p className="font-mono">{String(i.quantidade)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Vlr. Unit.</p>
                      <p className="font-mono">{formatCurrency(Number(i.valor_unitario))}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                      <p className="font-mono font-semibold">{formatCurrency(Number(i.valor_total))}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-success uppercase">Recebido</p>
                      <p className="font-mono text-success">{qtdRec > 0 ? qtdRec : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-warning uppercase">Pendente</p>
                      <p className="font-mono text-warning">{qtdPend > 0 ? qtdPend : "—"}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop: tabela */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Produto</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground hidden sm:table-cell">
                    Código
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Qtd</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Vlr. Unit.</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Total</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground text-success">Rec.</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground text-warning">Pend.</th>
                </tr>
              </thead>
              <tbody>
                {viewItems.map((i) => {
                  const produtos = i.produtos;
                  const qtdRec = estoquePorProduto[String(i.produto_id)] || 0;
                  const qtdPend = Math.max(0, Number(i.quantidade) - qtdRec);
                  return (
                    <tr key={String(i.id)} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{produtos?.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground font-mono hidden sm:table-cell">
                        {produtos?.codigo_interno ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{String(i.quantidade)}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground text-xs">
                        {formatCurrency(Number(i.valor_unitario))}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium">
                        {formatCurrency(Number(i.valor_total))}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-success font-medium">
                        {qtdRec > 0 ? qtdRec : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-warning font-medium">
                        {qtdPend > 0 ? qtdPend : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t">
                  <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right">
                    Total dos Itens
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-primary">
                    {formatCurrency(viewItems.reduce((s, i) => s + Number(i.valor_total || 0), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {Number(selected.frete_valor) > 0 && (
            <div className="flex justify-between items-center rounded-lg bg-accent/20 px-3 py-2 text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" /> Frete
              </span>
              <span className="font-mono">{formatCurrency(Number(selected.frete_valor))}</span>
            </div>
          )}
        </>
      ) : (
        <DetailEmpty icon={FileText} title="Nenhum item cadastrado" className="py-8" />
      )}
    </div>
  );

  const tabRecebimento = (
    <div className="space-y-5">
      <div className="rounded-lg border p-4">
        <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Situação de Recebimento</p>
        <div className="flex items-center gap-3">
          {pedidoStatus === "recebido" && <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
          {pedidoStatus === "parcialmente_recebido" && (
            <ArrowDownToLine className="h-5 w-5 text-warning shrink-0" />
          )}
          {["aguardando_recebimento", "enviado_ao_fornecedor", "aprovado"].includes(pedidoStatus) && (
            <Clock className="h-5 w-5 text-warning shrink-0" />
          )}
          {pedidoStatus === "rascunho" && <FileText className="h-5 w-5 text-muted-foreground shrink-0" />}
          {pedidoStatus === "cancelado" && (
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{pedidoRecebimentoLabel(pedidoStatus)}</p>
            <p className="text-xs text-muted-foreground">{statusLabels[selected.status] || selected.status}</p>
          </div>
          {pctRecebimento > 0 && (
            <span
              className={`text-sm font-bold font-mono shrink-0 ${pctRecebimento === 100 ? "text-success" : "text-warning"}`}
            >
              {pctRecebimento}%
            </span>
          )}
        </div>
        {pctRecebimento > 0 && <Progress value={pctRecebimento} className="h-1.5 mt-3" />}
      </div>

      {viewItems.length > 0 && (
        <ViewSection title="Progresso por Item">
          <div className="space-y-3">
            {viewItems.map((i) => {
              const qtdRec = estoquePorProduto[String(i.produto_id)] || 0;
              const qtdPend = Math.max(0, Number(i.quantidade) - qtdRec);
              const pct =
                Number(i.quantidade) > 0
                  ? Math.min(100, Math.round((qtdRec / Number(i.quantidade)) * 100))
                  : 0;
              const produtos = i.produtos;
              return (
                <div key={String(i.id)} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium truncate max-w-[200px]">{produtos?.nome ?? "—"}</span>
                    <span className="font-mono text-muted-foreground shrink-0 ml-2 flex items-center gap-1">
                      <span className="text-success font-medium">{qtdRec}</span>
                      <span>/</span>
                      <span>{String(i.quantidade)}</span>
                      {qtdPend > 0 && <span className="text-warning ml-1">({qtdPend} pend.)</span>}
                    </span>
                  </div>
                  <Progress value={pct} className="h-1" />
                </div>
              );
            })}
          </div>
        </ViewSection>
      )}

      {(selected.data_entrega_prevista || selected.data_entrega_real) && (
        <ViewSection title="Datas de Entrega">
          <div className="grid grid-cols-2 gap-4">
            {selected.data_entrega_prevista && (
              <ViewField label="Entrega Prevista">
                <span className={`flex items-center gap-1 ${isOverdue ? "text-destructive font-medium" : ""}`}>
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(selected.data_entrega_prevista)}
                </span>
              </ViewField>
            )}
            {selected.data_entrega_real && (
              <ViewField label="Entrega Real">
                <span className="flex items-center gap-1 text-success font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {formatDate(selected.data_entrega_real)}
                </span>
              </ViewField>
            )}
          </div>
        </ViewSection>
      )}

      {viewEstoque.length > 0 ? (
        <ViewSection title="Movimentações de Estoque">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Produto</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Qtd</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Saldo Ant.</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Saldo Atu.</th>
                </tr>
              </thead>
              <tbody>
                {viewEstoque.map((m, idx) => {
                  const produtos = m.produtos;
                  return (
                    <tr key={m.id ?? `${m.produto_id ?? "x"}-${idx}`} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{produtos?.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-success font-semibold">
                        +{String(m.quantidade)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {String(m.saldo_anterior ?? "—")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium">{String(m.saldo_atual ?? "—")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-success" />
            {viewEstoque.length} moviment{viewEstoque.length === 1 ? "ação registrada" : "ações registradas"}
          </p>
        </ViewSection>
      ) : (
        <DetailEmpty
          icon={Boxes}
          title={
            ["recebido", "parcialmente_recebido"].includes(pedidoStatus)
              ? "Movimentações de estoque não encontradas"
              : "Nenhum recebimento registrado ainda"
          }
          className="py-8"
        />
      )}

      <ViewSection title="Logística / Rastreamento">
        <LogisticaRastreioSection pedidoCompraId={selected.id} />
      </ViewSection>

      {viewFinanceiro.length > 0 && (
        <ViewSection title="Lançamentos Financeiros gerados">
          <div className="space-y-2">
            {viewFinanceiro.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-md bg-accent/20 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{l.descricao ?? "—"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Venc. {formatDate(l.data_vencimento)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusBadge status={String(l.status ?? "")} />
                  <span className="font-mono font-medium text-xs">{formatCurrency(Number(l.valor ?? 0))}</span>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 gap-1.5 text-xs"
            onClick={() => navigate(`/financeiro?pedido_compra_id=${selected.id}`)}
          >
            <ExternalLink className="h-3 w-3" /> Abrir no Financeiro
          </Button>
        </ViewSection>
      )}
    </div>
  );

  const tabCondicoes = (
    <div className="space-y-5">
      <ViewSection title="Pagamento">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Cond. Pagamento">
            {selected.condicao_pagamento || <span className="text-muted-foreground">Não informado</span>}
          </ViewField>
          <ViewField label="Frete">
            <span className="font-mono">
              {selected.frete_valor ? formatCurrency(Number(selected.frete_valor)) : "—"}
            </span>
          </ViewField>
        </div>
      </ViewSection>

      <ViewSection title="Entregas">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Data do Pedido">{formatDate(selected.data_pedido)}</ViewField>
          {selected.data_entrega_prevista && (
            <ViewField label="Entrega Prevista">
              <span className={isOverdue ? "text-destructive font-medium" : ""}>
                {formatDate(selected.data_entrega_prevista)}
              </span>
            </ViewField>
          )}
          {selected.data_entrega_real && (
            <ViewField label="Entrega Real">
              <span className="text-success font-medium">{formatDate(selected.data_entrega_real)}</span>
            </ViewField>
          )}
        </div>
      </ViewSection>

      <ViewSection title="Totais">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Produtos</span>
            <span className="font-mono">
              {formatCurrency(viewItems.reduce((s, i) => s + Number(i.valor_total || 0), 0))}
            </span>
          </div>
          {Number(selected.frete_valor) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Frete</span>
              <span className="font-mono">{formatCurrency(Number(selected.frete_valor))}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold border-t pt-2">
            <span>Total</span>
            <span className="font-mono text-primary">
              {formatCurrency(Number(selected.valor_total || 0))}
            </span>
          </div>
        </div>
      </ViewSection>

      {selected.observacoes && (
        <ViewSection title="Observações">
          <p className="text-sm text-muted-foreground italic">{selected.observacoes}</p>
        </ViewSection>
      )}
    </div>
  );

  const tabVinculos = (
    <div className="space-y-5">
      <ViewSection title="Fornecedor">
        <ViewField label="Fornecedor">
          {selected.fornecedor_id ? (
            <RelationalLink type="fornecedor" id={String(selected.fornecedor_id)}>
              <Building2 className="h-3.5 w-3.5" />
              {selected.fornecedores?.nome_razao_social || "—"}
            </RelationalLink>
          ) : (
            <span className="text-muted-foreground">Não vinculado</span>
          )}
        </ViewField>
      </ViewSection>

      <ViewSection title="Cotação de Origem">
        {selected.cotacao_compra_id ? (
          <ViewField label="Cotação">
            {viewCotacao ? (
              <RelationalLink to="/cotacoes-compra">
                <Receipt className="h-3.5 w-3.5" />
                {viewCotacao.numero}
              </RelationalLink>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">{selected.cotacao_compra_id}</span>
            )}
          </ViewField>
        ) : (
          <p className="text-sm text-muted-foreground">Pedido criado sem cotação de origem.</p>
        )}
      </ViewSection>

      <ViewSection title="Financeiro">
        {viewFinanceiro.length > 0 ? (
          <div className="space-y-2">
            {viewFinanceiro.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-md bg-accent/20 px-3 py-2 text-sm"
              >
                <span className="truncate text-xs">{l.descricao ?? "—"}</span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusBadge status={String(l.status ?? "")} />
                  <span className="font-mono font-medium">{formatCurrency(Number(l.valor ?? 0))}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {["recebido", "parcialmente_recebido"].includes(pedidoStatus)
              ? "Lançamento financeiro não encontrado para este pedido."
              : "Lançamento gerado automaticamente ao registrar o recebimento."}
          </p>
        )}
      </ViewSection>

      <ViewSection title="Estoque">
        {viewEstoque.length > 0 ? (
          <p className="text-sm text-success flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            {viewEstoque.length} entrada{viewEstoque.length !== 1 ? "s" : ""} de estoque registrada
            {viewEstoque.length !== 1 ? "s" : ""}.
          </p>
        ) : (
          <DetailEmpty
            icon={Boxes}
            title="Nenhuma movimentação de estoque registrada"
            className="py-6"
          />
        )}
      </ViewSection>

      <ViewSection title="Histórico de auditoria">
        <AuditTimelineMini tabela="pedidos_compra" registroId={String(selected.id)} />
      </ViewSection>
    </div>
  );

  const perms = getPedidoCompraPermissions({ status: selected.status, ativo: true }, !!isAdmin);
  // Mantém regras locais detalhadas (status com mais variações que helper genérico)
  const canReceive = pedidoCanReceive(pedidoStatus);
  const canSend = pedidoStatus === "aprovado";
  const canCancel = ["rascunho", "aprovado", "enviado_ao_fornecedor", "aguardando_recebimento"].includes(pedidoStatus);
  const canSolicitarAprovacao = pedidoStatus === "rascunho" && !!onSolicitarAprovacao;
  const canApproveReject = pedidoStatus === "aguardando_aprovacao" && !!isAdmin;
  const canEstornar = ["recebido", "parcialmente_recebido"].includes(pedidoStatus) && !!isAdmin;
  void perms;
  void onReceive; // retido por retrocompatibilidade — recebimento agora é via diálogo abaixo
  void receivePending;

  const drawerFooter =
    canReceive || canSend || canCancel || canSolicitarAprovacao || canApproveReject || canEstornar ? (
      <DrawerStickyFooter
        className="max-sm:flex-col"
        left={
          canCancel && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive max-sm:h-11 max-sm:w-full"
              disabled={cancelPending}
              onClick={() => setCancelConfirmOpen(true)}
            >
              <XCircle className="w-4 h-4" /> Cancelar pedido
            </Button>
          )
        }
        right={
          <>
            {canSolicitarAprovacao && (
              <Button variant="outline" size="sm" className="gap-2 max-sm:h-11 max-sm:w-full" disabled={solicitarPending} onClick={() => runSolicitar(() => onSolicitarAprovacao!(selected))}>
                <Clock className="w-4 h-4" /> Solicitar aprovação
              </Button>
            )}
            {canApproveReject && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive border-destructive/30 hover:text-destructive max-sm:h-11 max-sm:w-full"
                  disabled={rejeitarPending}
                  onClick={() => { setRejectMotivo(""); setRejectOpen(true); }}
                >
                  <XCircle className="w-4 h-4" /> Rejeitar
                </Button>
                <Button size="sm" className="gap-2 max-sm:h-11 max-sm:w-full" disabled={aprovarPending} onClick={() => runAprovar(() => onAprovar!(selected))}>
                  <CheckCircle2 className="w-4 h-4" /> Aprovar
                </Button>
              </>
            )}
            {canSend && (
              <Button variant="outline" size="sm" className="gap-2 max-sm:h-11 max-sm:w-full" disabled={sendPending} onClick={() => runSend(() => onSend(selected))}>
                <SendHorizontal className="w-4 h-4" /> Marcar como Enviado
              </Button>
            )}
            {canEstornar && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-warning border-warning/30 hover:bg-warning/10 hover:text-warning max-sm:h-11 max-sm:w-full"
                onClick={() => setEstornoOpen(true)}
              >
                <RotateCcw className="w-4 h-4" /> Estornar recebimento
              </Button>
            )}
            {canReceive && (
              <Button size="sm" className="gap-2 max-sm:h-11 max-sm:w-full" disabled={receivePending} onClick={() => setReceberOpen(true)}>
                <PackageCheck className="w-4 h-4" /> Registrar Recebimento
              </Button>
            )}
          </>
        }
      />
    ) : undefined;

  return (
    <>
      <ViewDrawerV2
      open={open}
      onClose={onClose}
      variant="operational"
      title={pedidoNumero(selected)}
      subtitle={`${selected.fornecedores?.nome_razao_social || "Fornecedor não informado"} · ${formatDate(selected.data_pedido)}`}
      badge={<StatusBadge status={selected.status} label={statusLabels[selected.status] || selected.status} />}
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" aria-label="Editar pedido" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5" /> Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10"
            aria-label="Excluir pedido"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        </>
      }
      summary={
        <DrawerSummaryGrid cols={4}>
          <DrawerSummaryCard
            label="Itens"
            value={String(viewItems.length)}
            align="center"
          />
          <DrawerSummaryCard
            label="Recebimento"
            value={pctRecebimento > 0 ? `${pctRecebimento}%` : recebimentoStatus.label}
            tone={
              pctRecebimento === 100 ? "success"
              : pctRecebimento > 0 ? "warning"
              : recebimentoStatus.color === "destructive" ? "destructive"
              : "neutral"
            }
            align="center"
          />
          <DrawerSummaryCard
            label="Total"
            value={formatCurrency(Number(selected.valor_total || 0))}
            tone="primary"
            align="center"
          />
          <DrawerSummaryCard
            label="Cotação"
            value={viewCotacao ? viewCotacao.numero : selected.cotacao_compra_id ? "—" : "Avulso"}
            align="center"
          />
        </DrawerSummaryGrid>
      }
      tabs={[
        { value: "resumo", label: "Resumo", content: tabResumo },
        { value: "itens", label: `Itens (${viewItems.length})`, content: tabItens },
        { value: "recebimento", label: "Recebimento", content: tabRecebimento },
        { value: "condicoes", label: "Condições", content: tabCondicoes },
        { value: "vinculos", label: "Vínculos", content: tabVinculos },
      ]}
      footer={drawerFooter}
      />
      <ConfirmDialog
        open={cancelConfirmOpen}
        onClose={() => { setCancelConfirmOpen(false); setCancelMotivo(""); }}
        onConfirm={() => {
          if (!cancelMotivo.trim()) return;
          const motivo = cancelMotivo.trim();
          setCancelConfirmOpen(false);
          setCancelMotivo("");
          runCancel(() => onCancel(selected, motivo));
        }}
        title="Cancelar pedido de compra"
        description={`Informe o motivo do cancelamento do pedido ${pedidoNumero(selected)}. Pedidos com NF de entrada ou recebimento já realizado precisam ser estornados antes.`}
        confirmLabel="Cancelar pedido"
        confirmVariant="destructive"
        confirmDisabled={!cancelMotivo.trim()}
      >
        <textarea
          value={cancelMotivo}
          onChange={(e) => setCancelMotivo(e.target.value)}
          className="w-full min-h-20 rounded-md border border-input bg-background p-2 text-sm"
          placeholder="Ex: pedido duplicado / fornecedor cancelou"
        />
      </ConfirmDialog>
      <ConfirmDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={() => {
          if (!rejectMotivo.trim()) return;
          setRejectOpen(false);
          runRejeitar(() => onRejeitar?.(selected, rejectMotivo.trim()));
        }}
        title="Rejeitar pedido"
        description={`Informe o motivo da rejeição do pedido ${pedidoNumero(selected)}:`}
        confirmLabel="Rejeitar"
        confirmVariant="destructive"
        confirmDisabled={!rejectMotivo.trim()}
      >
        <textarea
          value={rejectMotivo}
          onChange={(e) => setRejectMotivo(e.target.value)}
          className="w-full min-h-20 rounded-md border border-input bg-background p-2 text-sm"
          placeholder="Ex: valor acima do orçamento aprovado"
        />
      </ConfirmDialog>
      <RegistrarRecebimentoDialog
        open={receberOpen}
        onClose={() => setReceberOpen(false)}
        pedidoId={String(selected.id)}
        pedidoNumero={pedidoNumero(selected)}
        onSuccess={() => { onAfterRecebimentoChange?.(); }}
      />
      <EstornarRecebimentoDialog
        open={estornoOpen}
        onClose={() => setEstornoOpen(false)}
        pedidoId={String(selected.id)}
        pedidoNumero={pedidoNumero(selected)}
        onSuccess={() => { onAfterRecebimentoChange?.(); }}
      />
    </>
  );
}

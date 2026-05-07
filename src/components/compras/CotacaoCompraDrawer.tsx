/**
 * CotacaoCompraDrawer — drawer wrapper com estado orquestrado pelo parent.
 *
 * Subcomponentes extraídos:
 * - CotacaoCompraHeaderSummary (stepper + stats)
 * - CotacaoCompraItensTable
 * - CotacaoCompraPropostasPanel (comparativo + propostas por item)
 */
import { useMemo, useState } from "react";
import { ViewDrawerV2, DrawerStickyFooter } from "@/components/ViewDrawerV2";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useActionLock } from "@/hooks/useActionLock";
import { formatCurrency } from "@/lib/format";
import {
  ShoppingCart, Edit, Trash2, Clock, Ban,
  ClipboardList, AlertCircle, Info,
  ThumbsUp, ThumbsDown, Send, ChevronRight, Trophy,
} from "lucide-react";
import {
  type CotacaoCompra,
  type CotacaoItem,
  type Proposta,
  cotacaoCanEdit,
  cotacaoCanGeneratePedido,
  statusLabels,
} from "./cotacaoCompraTypes";
import { CotacaoCompraHeaderSummary } from "./CotacaoCompraHeader";
import { CotacaoCompraItensTable } from "./CotacaoCompraItensTable";
import { CotacaoCompraPropostasPanel } from "./CotacaoCompraPropostasPanel";
import { formatDate } from "@/lib/format";

interface DrawerStats {
  uniqueSuppliers: number;
  bestTotal: number;
  selectedPropostas: Proposta[];
  selectedSupplierName: string | null;
  allItemsHaveSelected: boolean;
}

interface FornecedorOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface CotacaoCompraDrawerProps {
  open: boolean;
  onClose: () => void;
  selected: CotacaoCompra | null;
  viewItems: CotacaoItem[];
  viewPropostas: Proposta[];
  drawerStats: DrawerStats;
  fornecedorOptions: FornecedorOption[];
  addingProposal: string | null;
  setAddingProposal: (id: string | null) => void;
  proposalForm: { fornecedor_id: string; preco_unitario: number; prazo_entrega_dias: string; observacoes: string };
  setProposalForm: (f: { fornecedor_id: string; preco_unitario: number; prazo_entrega_dias: string; observacoes: string }) => void;
  onEdit: (c: CotacaoCompra) => void;
  onDeleteOpen: () => void;
  onSelectProposal: (propostaId: string, itemId: string) => void;
  onDeleteProposal: (propostaId: string) => void;
  onAddProposal: (itemId: string) => void;
  onSendForApproval: () => void;
  onApprove: () => void;
  onReject: (motivo: string) => void;
  onCancel: (motivo: string) => void;
  onGerarPedido: () => void;
  onNavigatePedidos: () => void;
}

export function CotacaoCompraDrawer({
  open, onClose, selected, viewItems, viewPropostas, drawerStats,
  fornecedorOptions, addingProposal, setAddingProposal, proposalForm, setProposalForm,
  onEdit, onDeleteOpen, onSelectProposal, onDeleteProposal, onAddProposal,
  onSendForApproval, onApprove, onReject, onCancel, onGerarPedido, onNavigatePedidos,
}: CotacaoCompraDrawerProps) {
  const { pending: editPending, run: runEdit } = useActionLock();
  const { pending: sendPending, run: runSend } = useActionLock();
  const { pending: approvePending, run: runApprove } = useActionLock();
  const { pending: rejectPending, run: runReject } = useActionLock();
  const { pending: gerarPending, run: runGerar } = useActionLock();
  const { pending: cancelPending, run: runCancel } = useActionLock();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [gerarOpen, setGerarOpen] = useState(false);

  // Memoize the approved-total to avoid recomputing the reduce on every render of the Decisão tab.
  const totalAprovado = useMemo(() => {
    return drawerStats.selectedPropostas.reduce((sum, p) => {
      const item = viewItems.find((i) => i.id === p.item_id);
      return sum + (item ? Number(p.preco_unitario) * item.quantidade : 0);
    }, 0);
  }, [drawerStats.selectedPropostas, viewItems]);
  return (
    <>
    <ViewDrawerV2
      open={open}
      onClose={onClose}
      variant="operational"
      title={selected?.numero ?? "Cotação de Compra"}
      badge={selected ? <StatusBadge status={selected.status} label={statusLabels[selected.status] || selected.status} /> : undefined}
      actions={
        selected ? (
          <>
            {/* Block edit/delete once the quotation is in a terminal state */}
            {!["convertida", "cancelada"].includes(selected.status) && (
              <Button variant="outline" size="sm" className="gap-1.5" aria-label="Editar cotação" disabled={editPending} onClick={() => runEdit(() => { onEdit(selected); onClose(); })}>
                <Edit className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
            {!["convertida", "cancelada"].includes(selected.status) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10"
                aria-label="Excluir cotação"
                onClick={onDeleteOpen}
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            )}
          </>
        ) : undefined
      }
      summary={
        selected ? (
          <div className="space-y-3">
            <CotacaoCompraHeaderSummary selected={selected} viewItems={viewItems} viewPropostas={viewPropostas} drawerStats={drawerStats} />
            {selected.status === "aprovada" && drawerStats.allItemsHaveSelected && cotacaoCanGeneratePedido(selected.status) && (
              <div className="md:hidden sticky top-0 z-10 -mx-1">
                <Button
                  size="lg"
                  className="w-full h-12 gap-2 shadow-md"
                  disabled={gerarPending}
                  onClick={() => setGerarOpen(true)}
                >
                  <ShoppingCart className="h-4 w-4" /> Gerar Pedido de Compra
                  <ChevronRight className="h-4 w-4 ml-auto" />
                </Button>
              </div>
            )}
          </div>
        ) : undefined
      }
      defaultTab={viewPropostas.length > 0 ? "propostas" : "resumo"}
      tabs={
        selected
          ? [
              /* Resumo */
              {
                value: "resumo",
                label: "Resumo",
                content: (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Data da Cotação</p>
                        <p className="text-sm mt-0.5">{formatDate(selected.data_cotacao)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Validade</p>
                        <p className="text-sm mt-0.5">{selected.data_validade ? formatDate(selected.data_validade) : "—"}</p>
                      </div>
                    </div>
                    {selected.observacoes && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Observações</p>
                        <p className="text-sm text-muted-foreground mt-1 italic">{selected.observacoes}</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      {viewItems.length === 0 && (
                        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> Nenhum item cadastrado nesta cotação.
                        </div>
                      )}
                      {viewItems.length > 0 && viewPropostas.length === 0 && (
                        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> Nenhuma proposta recebida. Acesse a aba Propostas para adicionar.
                        </div>
                      )}
                      {viewItems.length > 0 && viewPropostas.length > 0 && !drawerStats.allItemsHaveSelected &&
                        cotacaoCanEdit(selected.status) && (
                        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> Aguardando seleção de fornecedor para todos os itens.
                        </div>
                      )}
                      {drawerStats.selectedSupplierName && (
                        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/20 px-3 py-2 text-xs text-success dark:text-success">
                          <Trophy className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                          Fornecedor selecionado: <strong className="ml-1">{drawerStats.selectedSupplierName}</strong>
                        </div>
                      )}
                      {selected.status === "convertida" && (
                        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                          <ClipboardList className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> Esta cotação foi convertida em Pedido de Compra.
                        </div>
                      )}
                    </div>
                  </div>
                ),
              },
              /* Itens */
              {
                value: "itens",
                label: `Itens (${viewItems.length})`,
                content: <CotacaoCompraItensTable items={viewItems} />,
              },
              /* Propostas */
              {
                value: "propostas",
                label: `Propostas (${drawerStats.uniqueSuppliers} forn.)`,
                content: (
                  <CotacaoCompraPropostasPanel
                    selected={selected} viewItems={viewItems} viewPropostas={viewPropostas}
                    uniqueSuppliers={drawerStats.uniqueSuppliers} fornecedorOptions={fornecedorOptions}
                    addingProposal={addingProposal} setAddingProposal={setAddingProposal}
                    proposalForm={proposalForm} setProposalForm={setProposalForm}
                    onSelectProposal={onSelectProposal} onDeleteProposal={onDeleteProposal} onAddProposal={onAddProposal}
                  />
                ),
              },
              /* Decisão */
              {
                value: "decisao",
                label: "Decisão",
                content: (
                  <div className="space-y-4">
                    {selected.status === "rejeitada" && (
                      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        <ThumbsDown className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div><p className="font-semibold">Cotação rejeitada</p><p className="text-xs mt-0.5 opacity-80">Esta cotação foi reprovada e não pode ser convertida em pedido.</p></div>
                      </div>
                    )}
                    {selected.status === "aguardando_aprovacao" && (
                      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
                        <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div><p className="font-semibold">Aguardando aprovação</p><p className="text-xs mt-0.5 opacity-80">A cotação está em análise. Use os botões abaixo para aprovar ou reprovar.</p></div>
                      </div>
                    )}
                    {selected.status === "aprovada" && (
                      <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/20 px-4 py-3 text-sm text-success dark:text-success">
                        <ThumbsUp className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div><p className="font-semibold">Cotação aprovada</p><p className="text-xs mt-0.5 opacity-80">Pronta para conversão em Pedido de Compra.</p></div>
                      </div>
                    )}
                    {selected.status === "convertida" && (
                      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
                        <ClipboardList className="h-4 w-4 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">Convertida em Pedido de Compra</p>
                          <button className="text-xs underline font-semibold hover:opacity-70 mt-0.5" onClick={onNavigatePedidos}>Ver pedidos de compra →</button>
                        </div>
                      </div>
                    )}

                    {drawerStats.selectedPropostas.length > 0 ? (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-2 flex items-center gap-1">
                          <Trophy className="h-3 w-3" /> {drawerStats.selectedPropostas.length === 1 ? "Fornecedor Selecionado" : "Fornecedores Selecionados"}
                        </p>
                        <div className="rounded-lg border overflow-hidden">
                          {/* Mobile: cards verticais */}
                          <div className="md:hidden divide-y">
                            {drawerStats.selectedPropostas.map((p) => {
                              const item = viewItems.find((i) => i.id === p.item_id);
                              return (
                                <div key={p.id} className="p-3 space-y-1">
                                  <p className="font-medium text-sm">{item?.produtos?.nome || "—"}</p>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground truncate">{p.fornecedores?.nome_razao_social || "—"}</span>
                                    <span className="font-mono text-sm font-semibold shrink-0">{item ? formatCurrency(Number(p.preco_unitario) * item.quantidade) : "—"}</span>
                                  </div>
                                </div>
                              );
                            })}
                            <div className="bg-muted/30 p-3 flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-muted-foreground">Total aprovado</span>
                              <span className="font-mono text-base font-bold text-primary">{formatCurrency(totalAprovado)}</span>
                            </div>
                          </div>
                          {/* Desktop: tabela */}
                          <div className="hidden md:block">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/50 border-b">
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">Produto</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">Fornecedor</th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-muted-foreground uppercase">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drawerStats.selectedPropostas.map((p) => {
                                const item = viewItems.find((i) => i.id === p.item_id);
                                return (
                                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/20">
                                    <td className="px-3 py-2 text-xs max-w-[120px]"><span className="truncate block">{item?.produtos?.nome || "—"}</span></td>
                                    <td className="px-3 py-2 text-xs font-medium max-w-[130px]"><span className="truncate block">{p.fornecedores?.nome_razao_social || "—"}</span></td>
                                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{item ? formatCurrency(Number(p.preco_unitario) * item.quantidade) : "—"}</td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-muted/30 border-t">
                                <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Total aprovado</td>
                                <td className="px-3 py-2 text-right font-mono text-sm font-bold text-primary">
                                  {formatCurrency(totalAprovado)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-3 text-xs text-warning">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        Nenhum fornecedor selecionado. Acesse a aba Propostas para selecionar as melhores condições.
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">Situação do Processo</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Itens com proposta selecionada</span>
                          <span className={`font-mono font-semibold ${drawerStats.allItemsHaveSelected ? "text-success dark:text-success" : ""}`}>
                            {drawerStats.selectedPropostas.length} / {viewItems.length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Status atual</span>
                          <StatusBadge status={selected.status} label={statusLabels[selected.status] || selected.status} />
                        </div>
                        {drawerStats.selectedSupplierName && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Fornecedor vencedor</span>
                            <span className="font-medium text-xs text-right max-w-[160px] truncate">{drawerStats.selectedSupplierName}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {!["aprovada", "convertida", "rejeitada", "cancelada"].includes(selected.status) && drawerStats.allItemsHaveSelected && (
                      <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/20 px-3 py-2 text-xs text-success dark:text-success">
                        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        Todos os itens têm fornecedor selecionado. Envie para aprovação ou aprove diretamente.
                      </div>
                    )}
                  </div>
                ),
              },
            ]
          : undefined
      }
      footer={
        selected ? (
          <DrawerStickyFooter
            className="max-sm:flex-col"
            left={
              <>
                {selected.status === "aguardando_aprovacao" && (
                  <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/30 hover:text-destructive max-sm:h-11 max-sm:w-full" disabled={rejectPending} onClick={() => { setRejectMotivo(""); setRejectOpen(true); }}>
                    <ThumbsDown className="h-4 w-4" /> Reprovar
                  </Button>
                )}
                {!["convertida","cancelada","rejeitada"].includes(selected.status) && (
                  <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/30 hover:text-destructive max-sm:h-11 max-sm:w-full" disabled={cancelPending} onClick={() => { setCancelMotivo(""); setCancelOpen(true); }}>
                    <Ban className="h-4 w-4" /> Cancelar
                  </Button>
                )}
              </>
            }
            right={
              <>
                {(selected.status === "aberta" || selected.status === "em_analise") && drawerStats.allItemsHaveSelected && (
                  <Button variant="outline" size="sm" className="gap-2 max-sm:h-11 max-sm:w-full" disabled={sendPending} onClick={() => runSend(() => onSendForApproval())}>
                    <Send className="h-4 w-4" /> Enviar para Aprovação
                  </Button>
                )}
                {(selected.status === "aberta" || selected.status === "em_analise") && drawerStats.allItemsHaveSelected && (
                  <Button size="sm" className="gap-2 max-sm:h-11 max-sm:w-full" disabled={approvePending} onClick={() => runApprove(() => onApprove())}>
                    <ThumbsUp className="h-4 w-4" /> Aprovar
                  </Button>
                )}
                {selected.status === "aguardando_aprovacao" && (
                  <Button size="sm" className="gap-2 max-sm:h-11 max-sm:w-full" disabled={approvePending} onClick={() => runApprove(() => onApprove())}>
                    <ThumbsUp className="h-4 w-4" /> Aprovar
                  </Button>
                )}
                {cotacaoCanGeneratePedido(selected.status) && (
                  <Button size="sm" className="gap-2 max-sm:h-11 max-sm:w-full" disabled={gerarPending} onClick={() => setGerarOpen(true)}>
                    <ClipboardList className="h-4 w-4" /> Gerar Pedido de Compra
                  </Button>
                )}
                {selected.status === "convertida" && (
                  <Button variant="outline" size="sm" className="gap-2 max-sm:h-11 max-sm:w-full" onClick={onNavigatePedidos}>
                    <ChevronRight className="h-4 w-4" /> Ver Pedidos de Compra
                  </Button>
                )}
              </>
            }
          />
        ) : undefined
      }
    />
    {selected && (
      <>
        <ConfirmDialog
          open={rejectOpen}
          onClose={() => { setRejectOpen(false); setRejectMotivo(""); }}
          onConfirm={() => {
            if (!rejectMotivo.trim()) return;
            const motivo = rejectMotivo.trim();
            setRejectOpen(false);
            setRejectMotivo("");
            runReject(() => onReject(motivo));
          }}
          title="Reprovar cotação"
          description={`Informe o motivo da reprovação da cotação ${selected.numero}:`}
          confirmLabel="Reprovar"
          confirmVariant="destructive"
          confirmDisabled={!rejectMotivo.trim()}
        >
          <textarea
            value={rejectMotivo}
            onChange={(e) => setRejectMotivo(e.target.value)}
            className="w-full min-h-20 rounded-md border border-input bg-background p-2 text-sm"
            placeholder="Ex: preços acima do esperado / fornecedores insuficientes"
          />
        </ConfirmDialog>
        <ConfirmDialog
          open={cancelOpen}
          onClose={() => { setCancelOpen(false); setCancelMotivo(""); }}
          onConfirm={() => {
            if (!cancelMotivo.trim()) return;
            const motivo = cancelMotivo.trim();
            setCancelOpen(false);
            setCancelMotivo("");
            runCancel(() => onCancel(motivo));
          }}
          title="Cancelar cotação"
          description={`Informe o motivo do cancelamento da cotação ${selected.numero}:`}
          confirmLabel="Cancelar cotação"
          confirmVariant="destructive"
          confirmDisabled={!cancelMotivo.trim()}
        >
          <textarea
            value={cancelMotivo}
            onChange={(e) => setCancelMotivo(e.target.value)}
            className="w-full min-h-20 rounded-md border border-input bg-background p-2 text-sm"
            placeholder="Ex: necessidade cancelada / cotação substituída"
          />
        </ConfirmDialog>
        <ConfirmDialog
          open={gerarOpen}
          onClose={() => setGerarOpen(false)}
          onConfirm={() => {
            setGerarOpen(false);
            runGerar(() => onGerarPedido());
          }}
          title="Gerar pedido de compra"
          description={
            `Será criado o pedido com base nas propostas selecionadas` +
            (drawerStats.selectedSupplierName ? ` (fornecedor: ${drawerStats.selectedSupplierName})` : "") +
            `, total estimado ${formatCurrency(totalAprovado)}. ` +
            `A cotação será marcada como CONVERTIDA e não poderá ser editada.`
          }
          confirmLabel="Gerar pedido"
          confirmVariant="default"
        />
      </>
    )}
    </>
  );
}

export { ShoppingCart };

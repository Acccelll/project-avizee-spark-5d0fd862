import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { FormTabsList } from "@/components/FormTabsList";
import { formatCurrency, formatDate } from "@/lib/format";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { usePublishDrawerSlots } from "@/contexts/RelationalDrawerSlotsContext";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PermanentDeleteDialog } from "@/components/PermanentDeleteDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useCan } from "@/hooks/useCan";
import { useDetailFetch } from "@/hooks/useDetailFetch";
import { useDetailActions } from "@/hooks/useDetailActions";
import { useInvalidateAfterMutation } from "@/hooks/useInvalidateAfterMutation";
import { notifyError } from "@/utils/errorMessages";
import { pagamentoLabels, freteTipoLabels } from "@/utils/comercial";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { RecordIdentityCard } from "@/components/ui/RecordIdentityCard";
import { DetailLoading, DetailError, DetailEmpty } from "@/components/ui/DetailStates";
import {
  ensurePublicToken,
  cancelarOrcamento,
  criarRevisaoOrcamento,
  fetchOrcamentoDetalhes,
} from "@/services/orcamentos.service";
import { enviarOrcamentoAprovacao } from "@/services/comercial/orcamentosLifecycle.service";
import { useConverterOrcamento } from "@/pages/comercial/hooks/useConverterOrcamento";
import { useAprovarOrcamento } from "@/pages/comercial/hooks/useAprovarOrcamento";
import { useCrossModuleToast } from "@/hooks/useCrossModuleToast";
import { CrossModuleActionDialog, type ImpactItem } from "@/components/CrossModuleActionDialog";
import { canApproveOrcamento, canConvertOrcamento, canSendOrcamento, normalizeOrcamentoStatus } from "@/lib/comercialWorkflow";
import type { OrcamentoDetail } from "@/types/comercial";
import {
  Edit,
  Trash2,
  FileText,
  Send,
  CheckCircle,
  ArrowRightCircle,
  Link2,
  Copy,
  ExternalLink,
  AlertTriangle,
  GitBranch,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { ComercialFlowTimeline } from "@/components/views/ComercialFlowTimeline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  id: string;
}

export function OrcamentoView({ id }: Props) {
  const navigate = useNavigate();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const [convertConfirmOpen, setConvertConfirmOpen] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [poNumberCliente, setPoNumberCliente] = useState("");
  const [dataPoCliente, setDataPoCliente] = useState("");
  const [cancelMotivo, setCancelMotivo] = useState("");
  const { pushView, clearStack } = useRelationalNavigation();
  const { isAdmin } = useIsAdmin();
  const { can } = useCan();
  const canAprovar = can("orcamentos:aprovar") || isAdmin;
  const canCancelar = can("orcamentos:cancelar") || isAdmin;
  const canEditar = can("orcamentos:editar") || isAdmin;
  const { run, locked, isAnyLocked } = useDetailActions();
  const invalidate = useInvalidateAfterMutation();
  const converterOrcamento = useConverterOrcamento();
  const aprovarOrcamentoMut = useAprovarOrcamento();
  const crossToast = useCrossModuleToast();

  const { data, loading, error, reload } = useDetailFetch<OrcamentoDetail>(
    id,
    fetchOrcamentoDetalhes,
  );

  const selected = data?.orcamento ?? null;
  const items = data?.items ?? [];
  const linkedOV = data?.linkedOV ?? null;
  // C-01: pedido vinculado só bloqueia cancelamento se ainda estiver ATIVO.
  // Se o pedido derivado foi cancelado, o orçamento de origem deve poder
  // ser cancelado normalmente.
  const linkedOVAtivo = !!linkedOV && linkedOV.status !== "cancelada";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isExpired = !!(
    selected?.validade &&
    normalizeOrcamentoStatus(selected.status) !== "convertido" &&
    new Date(selected.validade) < today
  );

  const publicLink = selected?.public_token
    ? `${window.location.origin}/orcamento-publico?token=${selected.public_token}`
    : null;

  const handleSendForApproval = () =>
    run("send_approval", async () => {
      // F-03: usa serviço canônico (RPC com tipagem oficial).
      await enviarOrcamentoAprovacao(selected.id);
      await reload();
      invalidate(["orcamentos"]);
      toast.success(`Orçamento ${selected.numero} enviado para aprovação!`);
    }).catch(() => {});

  const handleApprove = () =>
    run("approve", async () => {
      // F-04: hook RQ com invalidação cross-módulo.
      await aprovarOrcamentoMut.mutateAsync({ id: selected.id, numero: selected.numero });
      await reload();
      setApproveConfirmOpen(false);
    }).catch(() => {});

  const handleConvertToOV = () =>
    run("convert", async () => {
      // RPC transacional + invalidação cross-módulo via hook.
      const result = await converterOrcamento.mutateAsync({
        orcamento: selected,
        options: { poNumber: poNumberCliente, dataPo: dataPoCliente },
      });
      setPoNumberCliente("");
      setDataPoCliente("");
      await reload();
      setConvertConfirmOpen(false);
      // Toast com CTA contextual: usuário abre o pedido recém-criado em 1 clique.
      crossToast.success({
        title: "Pedido gerado!",
        description: `OV ${result.ovNumero} criada a partir do orçamento ${selected.numero}.`,
        actionLabel: "Abrir pedido",
        action: { drawer: { type: "ordem_venda", id: result.ovId } },
      });
      // Mantém o usuário na visualização para ver o pedido vinculado
      // (em vez de navegar para fora — divergência intencional vs grid).
    }).catch(() => {});

  const handleGeneratePublicToken = () =>
    run("token", async () => {
      await ensurePublicToken(selected.id);
      await reload(); // refetch para pegar token + side-effects do DB
      toast.success("Link público gerado!");
    }).catch(() => {});

  const handleCopyLink = async () => {
    if (publicLink) {
      try {
        await navigator.clipboard.writeText(publicLink);
        toast.success("Link copiado!");
      } catch {
        toast.error("Não foi possível copiar o link. Copie manualmente.", { description: publicLink });
      }
    }
  };

  const handleCriarRevisao = () =>
    run("revisao", async () => {
      const novoId = await criarRevisaoOrcamento(selected.id);
      toast.success("Revisão criada!");
      invalidate(["orcamentos"]);
      if (novoId) navigate(`/orcamentos/${novoId}`);
    }).catch(() => {});

  const itemsSubtotal = items.reduce((s, i) => s + Number(i.valor_total || 0), 0);
  const kpiItens = items.length;
  const kpiQtd = items.reduce((s, i) => s + Number(i.quantidade || 0), 0);
  const kpiPeso = Number(selected?.peso_total || 0);
  const kpiValor = Number(selected?.valor_total || 0);

  // Publica slots do header padronizado (sempre — hook deve rodar incondicionalmente)
  usePublishDrawerSlots(`orcamento:${id}`, selected ? {
    breadcrumb: `Orçamento · ${selected.numero}${selected.revisao ? ` (rev ${selected.revisao})` : ""}`,
    summary: (
      <RecordIdentityCard
        icon={FileText}
        title={selected.numero}
        titleMono
        subtitle={`${formatDate(selected.data_orcamento)}${selected.clientes?.nome_razao_social ? ` · ${selected.clientes.nome_razao_social}` : ""}`}
        badges={
          <>
            <StatusBadge status={selected.status} />
            {isExpired && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">
                <AlertTriangle className="h-3 w-3" /> Expirada
              </span>
            )}
            <span className="inline-flex items-center rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              {formatCurrency(Number(selected.valor_total || 0))}
            </span>
          </>
        }
      />
    ),
    actions: (
      <>
        {/* MB-02: em mobile só mostra ações primárias; secundárias vão para dropdown abaixo. */}
        {canSendOrcamento(selected.status) && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs hidden md:inline-flex" onClick={handleSendForApproval} disabled={isAnyLocked}>
            <Send className="h-3.5 w-3.5" /> Enviar p/ Aprovação
          </Button>
        )}
        {canApproveOrcamento(selected.status) && canAprovar && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setApproveConfirmOpen(true)} disabled={isAnyLocked}>
            <CheckCircle className="h-3.5 w-3.5" /> Aprovar
          </Button>
        )}
        {canConvertOrcamento(selected.status) && (
          <Button size="sm" variant="default" className="h-8 gap-1.5 text-xs" onClick={() => setConvertConfirmOpen(true)} disabled={isAnyLocked}>
            <ArrowRightCircle className="h-3.5 w-3.5" /> Converter em Pedido
          </Button>
        )}
        {/* Desktop: ações secundárias inline */}
        {["aprovado", "rejeitado", "expirado", "convertido"].includes(normalizeOrcamentoStatus(selected.status)) && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs hidden md:inline-flex" onClick={handleCriarRevisao} disabled={isAnyLocked}>
            <GitBranch className="h-3.5 w-3.5" /> Criar revisão
          </Button>
        )}
        {normalizeOrcamentoStatus(selected.status) === "convertido" && linkedOV && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs hidden md:inline-flex" onClick={() => pushView("ordem_venda", linkedOV.id)}>
            <ExternalLink className="h-3.5 w-3.5" /> Ver Pedido {linkedOV.numero}
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs hidden md:inline-flex" onClick={() => { clearStack(); navigate(`/orcamentos/${id}?preview=1`); }}>
          <FileText className="h-3.5 w-3.5" /> PDF
        </Button>
        {canEditar && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs hidden md:inline-flex" aria-label="Editar orçamento" onClick={() => { clearStack(); navigate(`/orcamentos/${id}`); }}>
            <Edit className="h-3.5 w-3.5" /> Editar
          </Button>
        )}
        {canCancelar && (
        <Button
          variant="ghost" size="sm"
          className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 hidden md:inline-flex"
          aria-label="Cancelar orçamento"
          onClick={() => {
            if (linkedOVAtivo) {
              toast.error("Não é possível cancelar um orçamento com pedido vinculado.", {
                description: `Pedido ${linkedOV?.numero} está ativo. Cancele o pedido antes.`,
              });
              return;
            }
            setDeleteConfirmOpen(true);
          }}
          disabled={linkedOVAtivo}
        >
          <Trash2 className="h-3.5 w-3.5" /> Cancelar
        </Button>
        )}
        {isAdmin && (
          <Button
            variant="ghost" size="sm"
            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 hidden md:inline-flex"
            aria-label="Excluir orçamento definitivamente"
            onClick={() => setPermDeleteOpen(true)}
            title="Remove o orçamento e seus vínculos do banco de dados (admin)"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir definitivamente
          </Button>
        )}

        {/* Mobile: dropdown único com ações secundárias (Editar, PDF, Revisão, Cancelar...) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 md:hidden"
              aria-label="Mais ações"
              disabled={isAnyLocked}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canEditar && (
              <DropdownMenuItem onClick={() => { clearStack(); navigate(`/orcamentos/${id}`); }}>
                <Edit className="h-4 w-4 mr-2" /> Editar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => { clearStack(); navigate(`/orcamentos/${id}?preview=1`); }}>
              <FileText className="h-4 w-4 mr-2" /> PDF
            </DropdownMenuItem>
            {canSendOrcamento(selected.status) && (
              <DropdownMenuItem onClick={handleSendForApproval}>
                <Send className="h-4 w-4 mr-2" /> Enviar p/ Aprovação
              </DropdownMenuItem>
            )}
            {["aprovado", "rejeitado", "expirado", "convertido"].includes(normalizeOrcamentoStatus(selected.status)) && (
              <DropdownMenuItem onClick={handleCriarRevisao}>
                <GitBranch className="h-4 w-4 mr-2" /> Criar revisão
              </DropdownMenuItem>
            )}
            {normalizeOrcamentoStatus(selected.status) === "convertido" && linkedOV && (
              <DropdownMenuItem onClick={() => pushView("ordem_venda", linkedOV.id)}>
                <ExternalLink className="h-4 w-4 mr-2" /> Ver Pedido {linkedOV.numero}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {canCancelar && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={linkedOVAtivo}
              onClick={() => {
                if (linkedOVAtivo) {
                  toast.error("Não é possível cancelar um orçamento com pedido vinculado.", {
                    description: `Pedido ${linkedOV?.numero} está ativo. Cancele o pedido antes.`,
                  });
                  return;
                }
                setDeleteConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Cancelar
            </DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setPermDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluir definitivamente
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    ),
  } : {});

  if (loading) return <DetailLoading />;
  if (error) return <DetailError message={error.message} />;
  if (!selected) return <DetailEmpty title="Orçamento não encontrado" icon={FileText} />;

  return (
    <div className="space-y-4">
      {/* Timeline do fluxo Orçamento → Pedido → NF */}
      <ComercialFlowTimeline
        steps={[
          {
            key: "orcamento",
            label: `Orçamento ${selected.numero}`,
            done: true,
            current: !linkedOV,
            hint: "Etapa atual",
          },
          {
            key: "pedido",
            label: linkedOV ? `Pedido ${linkedOV.numero}` : "Pedido de Venda",
            done: !!linkedOV,
            hint: linkedOV ? "Abrir pedido vinculado" : "Use 'Converter em Pedido' para avançar",
            onClick: linkedOV ? () => pushView("ordem_venda", linkedOV.id) : undefined,
          },
          {
            key: "nf",
            label: "Nota Fiscal",
            done: false,
            hint: "Emitida a partir do Pedido (módulo Faturamento)",
          },
        ]}
      />

      {/* KPI strip */}
      <DrawerSummaryGrid cols={4}>
        <DrawerSummaryCard label="Itens" value={String(kpiItens)} align="center" />
        <DrawerSummaryCard label="Qtd Total" value={String(kpiQtd)} align="center" />
        <DrawerSummaryCard label="Peso (kg)" value={kpiPeso.toFixed(2)} align="center" />
        <DrawerSummaryCard label="Total" value={formatCurrency(kpiValor)} tone="primary" align="center" />
      </DrawerSummaryGrid>

      {/* Tabs */}
      <Tabs defaultValue="resumo" className="w-full">
        <FormTabsList
          tabs={[
            { value: "resumo", label: "Resumo" },
            { value: "itens", label: "Itens", count: items.length },
            { value: "totais", label: "Totais" },
            { value: "condicoes", label: "Condições" },
            { value: "vinculos", label: "Vínculos", count: linkedOV ? 1 : 0 },
          ]}
        />

        {/* --- RESUMO --- */}
        <TabsContent value="resumo" className="space-y-3 mt-3 text-sm">
          {isExpired && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Este orçamento está expirado (validade: {formatDate(selected.validade)}).</span>
            </div>
          )}
          {selected.status === "rejeitado" && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Este orçamento foi rejeitado. Edite-o para reenviar.</span>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Número</span>
              <span className="font-mono font-medium">{selected.numero}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data</span>
              <span>{formatDate(selected.data_orcamento)}</span>
            </div>
            {selected.validade && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Validade</span>
                <span className={isExpired ? "text-warning font-medium" : ""}>{formatDate(selected.validade)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={normalizeOrcamentoStatus(selected.status)} />
            </div>
            {normalizeOrcamentoStatus(selected.status) === "convertido" && linkedOV && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Convertido em Pedido</span>
                <RelationalLink onClick={() => pushView("ordem_venda", linkedOV.id)}>
                  {linkedOV.numero}
                </RelationalLink>
              </div>
            )}
          </div>
          {selected.observacoes && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Observações</p>
              <p className="text-xs text-muted-foreground italic">{selected.observacoes}</p>
            </div>
          )}
        </TabsContent>

        {/* --- ITENS --- */}
        <TabsContent value="itens" className="space-y-3 mt-3">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground">Cód.</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground">Descrição</th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold text-muted-foreground">Qtd</th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold text-muted-foreground">Unit.</th>
                  <th className="px-2 py-2 text-right text-[10px] font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground text-xs">Nenhum item</td>
                  </tr>
                )}
                {items.map((i, idx: number) => (
                  <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">
                      {i.codigo_snapshot || i.produtos?.sku || "—"}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => pushView("produto", i.produtos?.id)}
                        className="text-left hover:underline block"
                      >
                        <span className="line-clamp-1">{i.descricao_snapshot || i.produtos?.nome || "—"}</span>
                        {i.variacao && (
                          <span className="text-[10px] text-muted-foreground block">{i.variacao}</span>
                        )}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {i.quantidade}{i.unidade ? ` ${i.unidade}` : ""}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatCurrency(i.valor_unitario)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-medium">
                      {formatCurrency(i.valor_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* --- TOTAIS --- */}
        <TabsContent value="totais" className="space-y-2 mt-3 text-sm">
          {[
            { label: "Subtotal dos itens", value: itemsSubtotal, negative: false },
            { label: "Desconto", value: Number(selected.desconto || 0), negative: true },
            { label: "Imposto IPI", value: Number(selected.imposto_ipi || 0), negative: false },
            { label: "Imposto ST", value: Number(selected.imposto_st || 0), negative: false },
            { label: "Frete", value: Number(selected.frete_valor || 0), negative: false },
            { label: "Outras despesas", value: Number(selected.outras_despesas || 0), negative: false },
          ]
            .filter((row) => row.value !== 0)
            .map((row, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{row.label}</span>
                <span className={`font-mono ${row.negative ? "text-destructive" : ""}`}>
                  {row.negative
                    ? `-${formatCurrency(row.value)}`
                    : formatCurrency(row.value)}
                </span>
              </div>
            ))}
          <div className="flex justify-between font-bold border-t pt-2 mt-2">
            <span>Total</span>
            <span className="font-mono text-primary">{formatCurrency(kpiValor)}</span>
          </div>
        </TabsContent>

        {/* --- CONDIÇÕES --- */}
        <TabsContent value="condicoes" className="space-y-4 mt-3 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Pagamento</p>
              <p>{pagamentoLabels[selected.pagamento] || selected.pagamento || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Prazo de Pagamento</p>
              <p>{selected.prazo_pagamento || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Prazo de Entrega</p>
              <p>{selected.prazo_entrega || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Frete</p>
              <p>{freteTipoLabels[selected.frete_tipo] || selected.frete_tipo || "—"}</p>
            </div>
            {selected.modalidade && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Modalidade</p>
                <p className="capitalize">{selected.modalidade}</p>
              </div>
            )}
            {selected.validade && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Validade</p>
                <p className={isExpired ? "text-warning font-medium" : ""}>{formatDate(selected.validade)}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* --- VÍNCULOS --- */}
        <TabsContent value="vinculos" className="space-y-4 mt-3 text-sm">
          <div className="space-y-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Cliente</p>
              <RelationalLink onClick={() => pushView("cliente", selected.clientes?.id)}>
                {selected.clientes?.nome_razao_social || "—"}
              </RelationalLink>
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Pedido</p>
              {linkedOV ? (
                <RelationalLink onClick={() => pushView("ordem_venda", linkedOV.id)}>
                  {linkedOV.numero}
                </RelationalLink>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum pedido vinculado</p>
              )}
            </div>

            <div className="border-t pt-3">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">Link Público</p>
              {publicLink ? (
                <div className="space-y-2">
                  <p className="text-xs font-mono bg-muted rounded px-2 py-1.5 break-all">{publicLink}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1" onClick={handleCopyLink}>
                      <Copy className="h-3 w-3" /> Copiar link
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 flex-1"
                      onClick={() => window.open(publicLink, "_blank")}
                    >
                      <ExternalLink className="h-3 w-3" /> Abrir
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleGeneratePublicToken}
                  disabled={locked("token")}
                >
                  <Link2 className="h-3 w-3" />
                  {locked("token") ? "Gerando..." : "Gerar link público"}
                </Button>
              )}
            </div>

            <div className="border-t pt-3 space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Histórico</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Criado em</span>
                  <span>{formatDate(selected.created_at)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Atualizado em</span>
                  <span>{formatDate(selected.updated_at)}</span>
                </div>
                {normalizeOrcamentoStatus(selected.status) === "convertido" && linkedOV && (
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Convertido em Pedido</span>
                    <RelationalLink onClick={() => pushView("ordem_venda", linkedOV.id)}>
                      {linkedOV.numero}
                    </RelationalLink>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Cancel confirm */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setCancelMotivo("");
        }}
        onConfirm={async () => {
          try {
            // Usa a RPC oficial `cancelar_orcamento` para garantir auditoria.
            await cancelarOrcamento(id, cancelMotivo.trim() || undefined);
            invalidate(["orcamentos"]);
            await reload();
            setCancelMotivo("");
          } catch (err: unknown) {
            console.error("[OrcamentoView] erro ao cancelar:", err);
            notifyError(err);
          } finally {
            setDeleteConfirmOpen(false);
          }
        }}
        title="Cancelar orçamento"
        description={`Tem certeza que deseja cancelar o orçamento ${selected?.numero || ""}? Ele permanecerá no histórico e não poderá avançar no fluxo comercial.`}
        confirmLabel="Cancelar orçamento"
        confirmVariant="destructive"
      >
        <div className="space-y-2 mt-2">
          <Label className="text-xs">Motivo (opcional)</Label>
          <Input
            value={cancelMotivo}
            onChange={(e) => setCancelMotivo(e.target.value)}
            placeholder="Ex: cliente desistiu, valor fora do orçado..."
            className="h-9"
          />
          <p className="text-[10px] text-muted-foreground">O motivo é registrado na auditoria do orçamento.</p>
        </div>
      </ConfirmDialog>

      {/* Approve confirm */}
      <ConfirmDialog
        open={approveConfirmOpen}
        onClose={() => setApproveConfirmOpen(false)}
        onConfirm={handleApprove}
        title="Aprovar orçamento?"
        description="O orçamento ficará disponível para gerar um Pedido."
        confirmLabel="Aprovar"
        confirmVariant="default"
        loading={locked("approve")}
      />

      {/* Converter em Pedido de Venda — preview de impacto cross-módulo */}
      <CrossModuleActionDialog
        open={convertConfirmOpen}
        onClose={() => {
          setConvertConfirmOpen(false);
          setPoNumberCliente("");
          setDataPoCliente("");
        }}
        onConfirm={handleConvertToOV}
        title="Converter em Pedido de Venda"
        description={`Confirma a conversão do orçamento ${selected?.numero} em Pedido de Venda? Nenhuma Nota Fiscal será emitida nesta etapa.`}
        confirmLabel="Converter em Pedido"
        loading={locked("convert")}
        impacts={[
          {
            label: "Cria 1 Pedido de Venda em /pedidos (sem emitir NF)",
            detail: `${items.length} ${items.length === 1 ? "item" : "itens"} · ${formatCurrency(kpiValor)}`,
            tone: "primary",
          },
          {
            label: "Orçamento muda para “convertido”",
            detail: `Nº ${selected?.numero}`,
            tone: "info",
          },
          {
            label: "Pedido fica disponível para faturamento",
            tone: "success",
          },
        ] satisfies ImpactItem[]}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">Nº Pedido do Cliente (PO)</Label>
            <Input
              value={poNumberCliente}
              onChange={(e) => setPoNumberCliente(e.target.value)}
              placeholder="Ex: PO-2026-00123"
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Data do Pedido do Cliente</Label>
            <Input
              type="date"
              value={dataPoCliente}
              onChange={(e) => setDataPoCliente(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
      </CrossModuleActionDialog>

      <PermanentDeleteDialog
        open={permDeleteOpen}
        onClose={() => setPermDeleteOpen(false)}
        table="orcamentos"
        id={id}
        entityLabel="orçamento"
        recordName={selected?.numero || id}
        warning="Ação administrativa. Remove o registro do banco de dados — não é cancelamento."
        sideEffects={[
          "Itens do orçamento",
          linkedOV ? `Pedido vinculado ${linkedOV.numero} e suas notas fiscais` : "Nenhum pedido vinculado",
        ]}
        onDeleted={() => {
          invalidate(["orcamentos"]);
          clearStack();
        }}
      />
    </div>
  );
}

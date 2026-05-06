import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { FormTabsList } from "@/components/FormTabsList";
import { formatCurrency, formatDate } from "@/lib/format";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { usePublishDrawerSlots } from "@/contexts/RelationalDrawerSlotsContext";
import { LogisticaRastreioSection } from "@/components/logistica/LogisticaRastreioSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CrossModuleActionDialog, type ImpactItem } from "@/components/CrossModuleActionDialog";
import { RelatedRecordsStrip, type RelatedRecordChip } from "@/components/views/RelatedRecordsStrip";
import { useCrossModuleToast } from "@/hooks/useCrossModuleToast";
import { useDetailFetch } from "@/hooks/useDetailFetch";
import { useDetailActions } from "@/hooks/useDetailActions";
import { DetailLoading, DetailEmpty } from "@/components/ui/DetailStates";
import { pagamentoLabels, freteTipoLabels } from "@/utils/comercial";
import { useFaturarPedido } from "@/pages/comercial/hooks/useFaturarPedido";
import { useCancelarPedido } from "@/pages/comercial/hooks/useCancelarPedido";
import { canFaturarPedido, canCancelarPedido as canCancelarPedidoFn, getPedidoStatusLabel, statusFaturamentoLabels } from "@/lib/comercialWorkflow";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OVDetail, NotaFiscalListItem, LancamentoListItem, OrdemVendaItemWithProduto } from "@/types/comercial";
import { subscribeComercial } from "@/lib/realtime/comercialChannel";
import { ComercialFlowTimeline } from "@/components/views/ComercialFlowTimeline";
import { useCan } from "@/hooks/useCan";
import {
  FileOutput,
  DollarSign,
  Package,
  Scale,
  FileText,
  Truck,
  CalendarClock,
  Receipt,
  Link2,
  AlertTriangle,
  Edit,
  XCircle,
} from "lucide-react";

interface Props {
  id: string;
}

const statusFaturamentoColors: Record<string, string> = {
  aguardando: "bg-warning/10 text-warning border-warning/30",
  parcial: "bg-info/10 text-info border-info/30",
  total: "bg-success/10 text-success border-success/30",
};

const statusFinanceiroColors: Record<string, string> = {
  aberto: "bg-warning/10 text-warning border-warning/30",
  parcial: "bg-info/10 text-info border-info/30",
  pago: "bg-success/10 text-success border-success/30",
  vencido: "bg-destructive/10 text-destructive border-destructive/30",
};

const statusFinanceiroLabels: Record<string, string> = {
  aberto: "Em Aberto",
  parcial: "Pago Parcialmente",
  pago: "Pago",
  vencido: "Vencido",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

const statusNFLabels: Record<string, string> = {
  pendente: "Pendente",
  autorizada: "Autorizada",
  cancelada: "Cancelada",
  denegada: "Denegada",
};

export function OrdemVendaView({ id }: Props) {
  const [generateNfOpen, setGenerateNfOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const { pushView } = useRelationalNavigation();
  const navigate = useNavigate();
  const { run, locked } = useDetailActions();
  const faturarPedido = useFaturarPedido();
  const cancelarPedido = useCancelarPedido();
  const crossToast = useCrossModuleToast();

  const { data, loading, reload } = useDetailFetch<OVDetail>(id, async (ovId, signal) => {
    const { data: ov, error: ovErr } = await supabase
      .from("ordens_venda")
      .select(
        "*, clientes(id, nome_razao_social), orcamentos(id, numero, pagamento, prazo_pagamento, prazo_entrega, frete_tipo, observacoes)"
      )
      .eq("id", ovId)
      .abortSignal(signal)
      .maybeSingle();
    if (ovErr) throw ovErr;
    if (!ov) return null;

    const [{ data: itens }, { data: nfs }] = await Promise.all([
      supabase
        .from("ordens_venda_itens")
        .select("*, produtos(id, nome, sku)")
        .eq("ordem_venda_id", ov.id)
        .abortSignal(signal),
      supabase
        .from("notas_fiscais")
        .select("id, numero, status, valor_total, data_emissao, tipo_operacao, finalidade_nfe, nf_referenciada_id")
        .eq("ordem_venda_id", ov.id)
        .eq("ativo", true)
        .abortSignal(signal),
    ]);

    const nfList = nfs || [];
    let lancamentos: LancamentoListItem[] = [];
    let devolucoes: NotaFiscalListItem[] = [];
    if (nfList.length > 0) {
      const nfIds = nfList.map((n) => n.id);
      const [{ data: lanc }, { data: devs }] = await Promise.all([
        supabase
        .from("financeiro_lancamentos")
        .select("id, descricao, valor, status, data_vencimento, data_pagamento, forma_pagamento, parcela_numero, parcela_total")
        .in("nota_fiscal_id", nfIds)
        .eq("ativo", true)
        .order("data_vencimento", { ascending: true })
        .abortSignal(signal),
        supabase
          .from("notas_fiscais")
          .select("id, numero, status, valor_total, data_emissao, tipo_operacao, finalidade_nfe, nf_referenciada_id")
          .in("nf_referenciada_id", nfIds)
          .eq("ativo", true)
          .abortSignal(signal),
      ]);
      lancamentos = (lanc || []) as LancamentoListItem[];
      devolucoes = (devs || []) as NotaFiscalListItem[];
    }

    return {
      ov,
      items: (itens || []) as OrdemVendaItemWithProduto[],
      notasFiscais: nfList as NotaFiscalListItem[],
      lancamentos,
      devolucoes,
    } as OVDetail;
  });

  const selected = data?.ov ?? null;
  const items = data?.items ?? [];
  const notasFiscais = data?.notasFiscais ?? [];
  const lancamentos = data?.lancamentos ?? [];
  const devolucoes = data?.devolucoes ?? [];

  // Realtime: refaz fetch do detalhe quando o pedido em foco ou suas NFs
  // mudam (ex.: faturamento iniciado em outra aba, NF confirmada). Evita
  // mostrar status_faturamento desatualizado ao usuário.
  useEffect(() => {
    return subscribeComercial(() => {
      reload();
    });
  }, [reload]);

  const handleGenerateNF = async () => {
    if (!selected) return;
    await run("generate_nf", async () => {
      // RPC transacional + invalidação cross-módulo via hook.
      const result = await faturarPedido.mutateAsync({
        id: selected.id,
        numero: selected.numero,
        cliente_id: selected.cliente_id,
        status_faturamento: selected.status_faturamento,
      });
      await reload();
      setGenerateNfOpen(false);
      // Toast com CTA: usuário abre a NF gerada em 1 clique (drawer).
      crossToast.success({
        title: "Nota Fiscal gerada!",
        description: `NF ${result.nfNumero} emitida para o pedido ${selected.numero}.`,
        actionLabel: "Abrir NF",
        action: { drawer: { type: "nota_fiscal", id: result.nfId } },
      });
    }).catch(() => {
      // erro já reportado via toast
    });
  };

  const pesoTotal = items.reduce((s, i) => s + Number(i.peso_total || 0), 0);
  const qtdTotal = items.reduce((s, i) => s + Number(i.quantidade || 0), 0);
  const { can } = useCan();
  const canFaturarPerm = can("faturamento_fiscal:criar") || can("pedidos:editar");
  const canGenerateNF = canFaturarPedido(selected) && canFaturarPerm;

  // Gate de cancelamento: bloquear se já cancelado/faturado ou se houver NF ativa.
  const hasNFAtiva = notasFiscais.some(
    (n) => !["cancelada", "denegada"].includes(n.status || ""),
  );
  const canCancelarPedido = canCancelarPedidoFn(selected, hasNFAtiva);

  const handleCancelarPedido = async () => {
    if (!selected) return;
    await run("cancel_pedido", async () => {
      await cancelarPedido.mutateAsync({ id: selected.id, motivo: cancelMotivo.trim() || undefined });
      setCancelOpen(false);
      setCancelMotivo("");
      await reload();
    }).catch(() => {
      // erro já tratado via toast
    });
  };

  // KPI Faturado: NFs com status interno `confirmada` (após confirmarNotaFiscal)
  // ou `autorizada` (status SEFAZ, aplicável quando integração emite NFe oficial).
  // Canceladas/denegadas continuam listadas mas não somam para faturamento.
  const valorFaturado = notasFiscais
    .filter((n) => ["confirmada", "autorizada"].includes(n.status || ""))
    .reduce((s, n) => s + Number(n.valor_total || 0), 0);
  const valorPendente = Math.max(0, Number(selected?.valor_total || 0) - valorFaturado);

  // Publica slots no header padronizado
  usePublishDrawerSlots(`ordem_venda:${id}`, selected ? {
    breadcrumb: `Pedido · ${selected.numero}`,
    summary: (
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Receipt className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm leading-tight truncate font-mono">{selected.numero}</h3>
          <p className="text-[11px] text-muted-foreground">
            {formatDate(selected.data_emissao)}
            {selected.clientes?.nome_razao_social && ` · ${selected.clientes.nome_razao_social}`}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <StatusBadge status={selected.status} label={getPedidoStatusLabel(selected.status)} />
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${statusFaturamentoColors[selected.status_faturamento] || ""}`}>
              {statusFaturamentoLabels[selected.status_faturamento] || selected.status_faturamento}
            </Badge>
            <span className="inline-flex items-center rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              {formatCurrency(Number(selected.valor_total || 0))}
            </span>
          </div>
        </div>
      </div>
    ),
    actions: (
      <>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => navigate(`/pedidos/${selected.id}`)}>
          <Edit className="h-3.5 w-3.5" /> Editar Pedido
        </Button>
        {canGenerateNF && (
          <Button size="sm" variant="default" className="h-8 gap-1.5 text-xs" onClick={() => setGenerateNfOpen(true)} disabled={locked("generate_nf")}>
            <FileOutput className="h-3.5 w-3.5" /> Gerar NF
          </Button>
        )}
        {canCancelarPedido && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => setCancelOpen(true)}
            disabled={locked("cancel_pedido")}
          >
            <XCircle className="h-3.5 w-3.5" /> Cancelar
          </Button>
        )}
        {notasFiscais.map((nf) => (
          <Button key={nf.id} size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => pushView("nota_fiscal", nf.id)}>
            <FileText className="h-3.5 w-3.5" /> NF {nf.numero}
          </Button>
        ))}
      </>
    ),
  } : {});

  if (loading) return <DetailLoading />;
  if (!selected) return <DetailEmpty title="Pedido não encontrado" icon={Receipt} />;

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="bg-muted/30 rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-center gap-1 mb-1">
            <DollarSign className="h-3 w-3" /> Valor Total
          </p>
          <p className="text-sm font-bold font-mono text-primary">{formatCurrency(selected.valor_total || 0)}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-center gap-1 mb-1">
            <Package className="h-3 w-3" /> Itens / Qtd
          </p>
          <p className="text-sm font-bold font-mono">{items.length} / {qtdTotal}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-center gap-1 mb-1">
            <Scale className="h-3 w-3" /> Peso Total
          </p>
          <p className="text-sm font-bold font-mono">{pesoTotal > 0 ? `${pesoTotal.toFixed(2)} kg` : "—"}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center justify-center gap-1 mb-1">
            <Receipt className="h-3 w-3" /> Faturamento
          </p>
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0.5 ${statusFaturamentoColors[selected.status_faturamento] || ""}`}
          >
            {statusFaturamentoLabels[selected.status_faturamento] || selected.status_faturamento}
          </Badge>
        </div>
      </div>

      {/* Timeline do fluxo Orçamento → Pedido → NF */}
      <ComercialFlowTimeline
        steps={[
          {
            key: "orcamento",
            label: selected.orcamentos?.numero
              ? `Orçamento ${selected.orcamentos.numero}`
              : "Sem orçamento",
            done: !!selected.cotacao_id,
            hint: selected.cotacao_id ? "Abrir orçamento de origem" : "Pedido criado sem orçamento",
            onClick: selected.cotacao_id
              ? () => pushView("orcamento", selected.cotacao_id!)
              : undefined,
          },
          {
            key: "pedido",
            label: `Pedido ${selected.numero}`,
            done: true,
            current: notasFiscais.length === 0,
            hint: "Etapa atual",
          },
          {
            key: "nf",
            label:
              notasFiscais.length === 0
                ? "Nota Fiscal"
                : notasFiscais.length === 1
                  ? `NF ${notasFiscais[0].numero}`
                  : `${notasFiscais.length} NFs`,
            done: notasFiscais.some((n) => ["confirmada", "autorizada"].includes(n.status || "")),
            current: notasFiscais.length > 0,
            hint:
              notasFiscais.length === 1
                ? "Abrir Nota Fiscal"
                : notasFiscais.length === 0
                  ? "Use 'Gerar NF' no cabeçalho para faturar"
                  : "Várias NFs vinculadas — veja a aba Faturamento",
            onClick:
              notasFiscais.length === 1
                ? () => pushView("nota_fiscal", notasFiscais[0].id)
                : undefined,
          },
        ]}
      />

      {/* Strip de registros relacionados — visibilidade imediata dos vínculos cross-módulo. */}
      <RelatedRecordsStrip
        chips={[
          {
            icon: FileText,
            count: notasFiscais.length,
            label: notasFiscais.length === 1 ? "NF" : "NFs",
            tone: "primary",
            onClick: notasFiscais.length === 1
              ? () => pushView("nota_fiscal", notasFiscais[0].id)
              : undefined,
            title: "Notas Fiscais vinculadas a este pedido",
          },
          {
            icon: DollarSign,
            count: lancamentos.length,
            label: "Lançamentos",
            tone: "info",
            title: "Lançamentos financeiros decorrentes deste pedido",
          },
          {
            icon: Receipt,
            count: selected.cotacao_id ? 1 : 0,
            label: "Orçamento origem",
            tone: "default",
            onClick: selected.cotacao_id
              ? () => pushView("orcamento", selected.cotacao_id)
              : undefined,
            title: "Orçamento que originou este pedido",
          },
        ] satisfies RelatedRecordChip[]}
      />

      {/* Tabs */}
      <Tabs defaultValue="resumo" className="w-full">
        <FormTabsList
          tabs={[
            { value: "resumo", label: "Resumo" },
            { value: "itens", label: "Itens", count: items.length },
            { value: "logistica", label: "Logística" },
            { value: "faturamento", label: "Faturamento", count: notasFiscais.length },
            ...(devolucoes.length > 0
              ? [{ value: "devolucoes", label: "Devoluções", count: devolucoes.length }]
              : []),
            { value: "vinculos", label: "Vínculos" },
          ]}
        />

        {/* ── Resumo ─────────────────────────────────────── */}
        <TabsContent value="resumo" className="space-y-4 mt-3 text-sm">
          <div className="space-y-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Status Operacional</p>
              <div className="mt-0.5">
                <StatusBadge status={selected.status} label={getPedidoStatusLabel(selected.status)} />
              </div>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Escopo de edição do pedido</p>
              <p className="text-xs text-muted-foreground mt-1">
                A edição do pedido altera apenas dados operacionais (status, prazos, PO e observações). Itens, valores e vínculos com orçamento/NF permanecem no fluxo original.
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Cliente</p>
              <RelationalLink onClick={() => pushView("cliente", selected.clientes?.id)}>
                {selected.clientes?.nome_razao_social || "—"}
              </RelationalLink>
            </div>
            {selected.cotacao_id && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Orçamento de Origem</p>
                <RelationalLink type="orcamento" id={selected.cotacao_id}>
                  {selected.orcamentos?.numero ? `Orçamento ${selected.orcamentos.numero}` : "Ver orçamento"}
                </RelationalLink>
              </div>
            )}
            {selected.po_number && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">PO do Cliente</p>
                <p className="font-mono">{selected.po_number}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Data de Emissão</p>
                <p>{formatDate(selected.data_emissao)}</p>
              </div>
              {selected.data_aprovacao && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Data de Aprovação</p>
                  <p>{formatDate(selected.data_aprovacao)}</p>
                </div>
              )}
              {selected.data_prometida_despacho && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                    <CalendarClock className="inline h-3 w-3 mr-0.5" /> Despacho Prometido
                  </p>
                  <p>{formatDate(selected.data_prometida_despacho)}</p>
                </div>
              )}
              {selected.prazo_despacho_dias != null && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Prazo Despacho</p>
                  <p>{selected.prazo_despacho_dias} dias</p>
                </div>
              )}
            </div>
            {selected.orcamentos?.pagamento && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Condição de Pagamento</p>
                <p>{pagamentoLabels[selected.orcamentos.pagamento] || selected.orcamentos.pagamento}
                  {selected.orcamentos.prazo_pagamento ? ` — ${selected.orcamentos.prazo_pagamento}` : ""}
                </p>
              </div>
            )}
            {selected.orcamentos?.frete_tipo && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Tipo de Frete</p>
                <p>{freteTipoLabels[selected.orcamentos.frete_tipo] || selected.orcamentos.frete_tipo}</p>
              </div>
            )}
            {selected.orcamentos?.prazo_entrega && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Prazo de Entrega (Orçamento)</p>
                <p>{selected.orcamentos.prazo_entrega}</p>
              </div>
            )}
            {selected.observacoes && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Observações</p>
                <p className="text-xs text-muted-foreground italic">{selected.observacoes}</p>
              </div>
            )}
            {selected.status === "cancelada" && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                <p className="text-xs text-destructive">Este pedido foi cancelado.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Itens ──────────────────────────────────────── */}
        <TabsContent value="itens" className="space-y-3 mt-3">
          {items.length === 0 ? (
            <DetailEmpty title="Nenhum item encontrado" />
          ) : (
            <>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground">Produto</th>
                      <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground hidden sm:table-cell">Un.</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-muted-foreground">Qtd</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-muted-foreground hidden sm:table-cell">Unit.</th>
                      <th className="px-2 py-2 text-right text-[10px] font-semibold text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i, idx: number) => (
                      <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/20">
                        <td className="px-2 py-2">
                          <button
                            onClick={() => i.produtos?.id && pushView("produto", i.produtos.id)}
                            className="text-left hover:underline block"
                          >
                            <span className="truncate max-w-[110px] block text-xs font-medium">
                              {i.produtos?.nome || i.descricao_snapshot || "—"}
                            </span>
                            {i.produtos?.sku && (
                              <span className="text-[10px] text-muted-foreground font-mono">{i.produtos.sku}</span>
                            )}
                            {i.variacao && (
                              <span className="text-[10px] text-muted-foreground"> · {i.variacao}</span>
                            )}
                          </button>
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground hidden sm:table-cell">
                          {i.unidade || "—"}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{i.quantidade}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs hidden sm:table-cell">
                          {formatCurrency(i.valor_unitario)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-medium">
                          {formatCurrency(i.valor_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center rounded-lg border bg-muted/30 px-3 py-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Total do Pedido</span>
                <span className="font-mono text-sm font-bold text-primary">{formatCurrency(selected.valor_total || 0)}</span>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Logística ─────────────────────────────────── */}
        <TabsContent value="logistica" className="space-y-4 mt-3">
          <h4 className="text-xs font-semibold flex items-center gap-2 px-1 text-muted-foreground uppercase">
            <Truck className="w-3.5 h-3.5" /> Rastreamento / Remessas
          </h4>
          <LogisticaRastreioSection ordemVendaId={selected.id} />
        </TabsContent>

        {/* ── Faturamento ───────────────────────────────── */}
        <TabsContent value="faturamento" className="space-y-4 mt-3 text-sm">
          {/* Status summary */}
          <div className="rounded-lg border p-3 space-y-2 bg-muted/10">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Situação</span>
              <Badge
                variant="outline"
                className={`text-xs ${statusFaturamentoColors[selected.status_faturamento] || ""}`}
              >
                {statusFaturamentoLabels[selected.status_faturamento] || selected.status_faturamento}
              </Badge>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Valor do Pedido</span>
              <span className="font-mono font-medium">{formatCurrency(selected.valor_total || 0)}</span>
            </div>
            {valorFaturado > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Valor Faturado</span>
                <span className="font-mono text-success font-medium">{formatCurrency(valorFaturado)}</span>
              </div>
            )}
            {valorPendente > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">A Faturar</span>
                <span className="font-mono text-warning font-medium">{formatCurrency(valorPendente)}</span>
              </div>
            )}
          </div>

          {/* Notas Fiscais */}
          {notasFiscais.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Notas Fiscais Vinculadas</p>
              {notasFiscais.map((nf) => (
                <div
                  key={nf.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/20"
                >
                  <div>
                    <p className="font-mono text-xs font-medium">NF {nf.numero}</p>
                    <p className="text-[10px] text-muted-foreground">{formatDate(nf.data_emissao)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{formatCurrency(nf.valor_total || 0)}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5">
                      {statusNFLabels[nf.status || ""] || nf.status || "—"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => pushView("nota_fiscal", nf.id)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center border rounded-lg bg-muted/10">
              <Receipt className="w-7 h-7 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhuma Nota Fiscal emitida ainda.</p>
              {canGenerateNF && (
                <Button
                  size="sm"
                  variant="default"
                  className="mt-3 h-7 text-xs gap-1"
                  onClick={() => setGenerateNfOpen(true)}
                  disabled={locked("generate_nf")}
                >
                  <FileOutput className="h-3 w-3" /> Gerar NF
                </Button>
              )}
            </div>
          )}

          {/* Lançamentos Financeiros */}
          {lancamentos.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Lançamentos Financeiros</p>
              {lancamentos.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-medium truncate max-w-[150px]">{l.descricao}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Venc.: {formatDate(l.data_vencimento)}
                      {l.parcela_total && l.parcela_numero
                        ? ` · Parc. ${l.parcela_numero}/${l.parcela_total}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{formatCurrency(l.valor)}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 ${statusFinanceiroColors[l.status || ""] || ""}`}
                    >
                      {statusFinanceiroLabels[l.status || ""] || l.status || "—"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Devoluções ─────────────────────────────────── */}
        {devolucoes.length > 0 && (
          <TabsContent value="devolucoes" className="space-y-2 mt-3 text-sm">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">
              NFs de devolução referenciando este pedido
            </p>
            {devolucoes.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/20"
              >
                <div>
                  <p className="font-mono text-xs font-medium">NF {d.numero}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(d.data_emissao)} · {d.tipo_operacao || "—"} · finalidade {d.finalidade_nfe || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{formatCurrency(d.valor_total || 0)}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5">
                    {statusNFLabels[d.status || ""] || d.status || "—"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => pushView("nota_fiscal", d.id)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>
        )}

        {/* ── Vínculos / Histórico ──────────────────────── */}
        <TabsContent value="vinculos" className="space-y-4 mt-3 text-sm">
          <div className="space-y-3">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1.5">
              <Link2 className="h-3 w-3" /> Entidades Relacionadas
            </p>

            {selected.clientes && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Cliente</p>
                  <RelationalLink onClick={() => pushView("cliente", selected.clientes.id)}>
                    {selected.clientes.nome_razao_social}
                  </RelationalLink>
                </div>
              </div>
            )}

            {selected.cotacao_id && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Orçamento de Origem</p>
                  <RelationalLink type="orcamento" id={selected.cotacao_id}>
                    {selected.orcamentos?.numero ? `Orçamento ${selected.orcamentos.numero}` : "Ver orçamento"}
                  </RelationalLink>
                </div>
              </div>
            )}

            {notasFiscais.map((nf) => (
              <div key={nf.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Nota Fiscal</p>
                  <RelationalLink onClick={() => pushView("nota_fiscal", nf.id)}>
                    NF {nf.numero} · {formatDate(nf.data_emissao)}
                  </RelationalLink>
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5">
                  {statusNFLabels[nf.status || ""] || nf.status || "—"}
                </Badge>
              </div>
            ))}

            <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Histórico de Datas</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Emissão</span>
                  <span>{formatDate(selected.data_emissao)}</span>
                </div>
                {selected.data_aprovacao && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Aprovação</span>
                    <span>{formatDate(selected.data_aprovacao)}</span>
                  </div>
                )}
                {selected.data_prometida_despacho && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Despacho Prometido</span>
                    <span>{formatDate(selected.data_prometida_despacho)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Última Atualização</span>
                  <span>{formatDate(selected.updated_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <CrossModuleActionDialog
        open={generateNfOpen}
        onClose={() => setGenerateNfOpen(false)}
        onConfirm={handleGenerateNF}
        loading={locked("generate_nf")}
        title="Gerar Nota Fiscal"
        description={`Confirma a geração de uma NF de saída para o pedido ${selected.numero}?`}
        confirmLabel="Gerar NF"
        impacts={[
          {
            label: "Cria NF de saída em /fiscal",
            detail: `${items.length} ${items.length === 1 ? "item" : "itens"} · ${formatCurrency(selected.valor_total || 0)}`,
            tone: "primary",
          },
          {
            label: "Atualiza estoque (saída)",
            tone: "warning",
          },
          {
            label: "Gera lançamentos a receber em /financeiro",
            tone: "info",
          },
          {
            label: `Pedido ${selected.numero} muda status de faturamento`,
            tone: "success",
          },
        ] satisfies ImpactItem[]}
      />

      {/* Dialog de cancelamento — coleta motivo opcional antes da confirmação. */}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setCancelOpen(false)}>
          <div className="bg-card border rounded-xl shadow-lg p-5 max-w-md w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" /> Cancelar pedido {selected.numero}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                O cancelamento é registrado em auditoria. NFs ativas vinculadas precisam ser canceladas antes.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo (opcional)</Label>
              <Input
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                placeholder="Ex: cliente desistiu, duplicidade, ..."
                maxLength={500}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setCancelOpen(false); setCancelMotivo(""); }}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelarPedido}
                disabled={locked("cancel_pedido")}
              >
                {locked("cancel_pedido") ? "Cancelando..." : "Confirmar cancelamento"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

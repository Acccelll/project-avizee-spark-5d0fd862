import { useMemo } from "react";
import { ViewDrawerV2, ViewField, ViewSection } from "@/components/ViewDrawerV2";
import { StatusBadge } from "@/components/StatusBadge";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { DrawerStatusBanner } from "@/components/ui/DrawerStatusBanner";
import { DrawerActionBar } from "@/components/ui/DrawerActionBar";
import { DetailEmpty } from "@/components/ui/DetailStates";
import { Edit, Trash2, CreditCard, RotateCcw, AlertCircle, Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Lancamento } from "@/types/domain";
import { useDrawerData } from "@/hooks/useDrawerData";
import { useActionLock } from "@/hooks/useActionLock";
import { useCan } from "@/hooks/useCan";
import { getOrigemLabel } from "@/lib/financeiro";

interface Baixa {
  id: string;
  valor_pago: number;
  data_baixa: string;
  forma_pagamento: string | null;
  observacoes: string | null;
  created_at: string;
}

interface AuditoriaEvento {
  id: string;
  evento: string;
  created_at: string;
  payload: Record<string, unknown> | null;
}

interface FinanceiroDrawerProps {
  open: boolean;
  onClose: () => void;
  selected: Lancamento | null;
  effectiveStatus: string;
  onBaixa: (l: Lancamento) => void;
  onEstorno: (l: Lancamento) => void;
  onEdit: (l: Lancamento) => void;
  onDelete: (id: string) => void;
}

export function FinanceiroDrawer({ open, onClose, selected, effectiveStatus, onBaixa, onEstorno, onEdit, onDelete }: FinanceiroDrawerProps) {
  const selectedId = selected?.id ?? null;

  // Cancellation-aware fetch — evita que resultado de um lançamento antigo
  // sobrescreva o estado quando o usuário troca rapidamente de registro.
  const { data: baixas, loading: loadingBaixas } = useDrawerData<Baixa[]>(
    open,
    selectedId,
    async (id, signal) => {
      const { data } = await supabase
        .from("financeiro_baixas")
        .select("*")
        .eq("lancamento_id", id)
        .order("data_baixa", { ascending: false })
        .abortSignal(signal);
      return (data as Baixa[]) || [];
    },
  );
  const baixasList = baixas ?? [];

  // Auditoria do lançamento (eventos de criação, baixa, estorno, cancelamento…)
  const { data: auditoria, loading: loadingAuditoria } = useDrawerData<AuditoriaEvento[]>(
    open,
    selectedId,
    async (id, signal) => {
      const { data } = await supabase
        .from("financeiro_auditoria")
        .select("id, evento, created_at, payload")
        .eq("lancamento_id", id)
        .order("created_at", { ascending: false })
        .abortSignal(signal);
      return (data as AuditoriaEvento[]) || [];
    },
  );
  const auditoriaList = auditoria ?? [];

  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const { pending: actionPending, run: runAction } = useActionLock();
  const { can } = useCan();
  const canPermBaixar = can("financeiro:baixar");
  const canPermEditar = can("financeiro:editar");
  const canPermCancelar = can("financeiro:cancelar") || can("financeiro:excluir");

  // Guard cedo: não renderiza Sheet vazio nem monta hooks com `selected` nulo.
  if (!open || !selected) return null;

  const canBaixa = canPermBaixar && effectiveStatus !== "pago" && effectiveStatus !== "cancelado";
  const canEstorno = canPermBaixar && (effectiveStatus === "pago" || effectiveStatus === "parcial");

  const isCR = selected.tipo === "receber";
  const valorTotal = Number(selected.valor);
  const saldoRestante = selected.saldo_restante != null ? Number(selected.saldo_restante) : valorTotal;
  const valorBaixado = Math.max(0, valorTotal - saldoRestante);

  const vencimento = selected.data_vencimento
    ? new Date(selected.data_vencimento + "T00:00:00")
    : null;
  const diasAtraso =
    effectiveStatus === "vencido" && vencimento
      ? Math.floor((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

  const pessoa = isCR
    ? (selected.clientes?.nome_razao_social || "—")
    : (selected.fornecedores?.nome_razao_social || "—");

  const tipoLabel = isCR ? "Conta a Receber" : "Conta a Pagar";
  const tipoColor = isCR ? "text-success" : "text-destructive";

  const totalBaixado = baixasList.reduce((sum, b) => sum + Number(b.valor_pago || 0), 0);

  const origemLabel = getOrigemLabel(selected);

  const summary = (
    <DrawerSummaryGrid cols={4}>
      <DrawerSummaryCard label="Valor Total" value={formatCurrency(valorTotal)} />
      <DrawerSummaryCard
        label={isCR ? "Recebido" : "Pago"}
        value={formatCurrency(valorBaixado)}
        tone="success"
      />
      <DrawerSummaryCard
        label="Saldo em Aberto"
        value={formatCurrency(saldoRestante)}
        tone={saldoRestante > 0 ? "destructive" : "success"}
      />
      <DrawerSummaryCard
        label="Vencimento"
        value={vencimento ? vencimento.toLocaleDateString("pt-BR") : "—"}
        mono={false}
        tone={effectiveStatus === "vencido" ? "destructive" : "neutral"}
        hint={diasAtraso > 0 ? `${diasAtraso} dia(s) em atraso` : undefined}
      />
    </DrawerSummaryGrid>
  );

  return (
    <ViewDrawerV2
      open={open}
      onClose={onClose}
      title={tipoLabel}
      subtitle={(() => {
        const planoLabel = selected.contas_contabeis
          ? `${selected.contas_contabeis.codigo} - ${selected.contas_contabeis.descricao}`
          : (typeof selected.descricao === "string" ? selected.descricao : "");
        return (
          <span>
            <span className={cn("font-medium", tipoColor)}>{pessoa}</span>
            {planoLabel ? ` · ${planoLabel}` : ""}
          </span>
        );
      })()}
      badge={<StatusBadge status={effectiveStatus} />}
      summary={summary}
      actions={
        <DrawerActionBar
          primary={canBaixa ? {
            label: "Registrar Baixa",
            icon: CreditCard,
            onClick: () => runAction(() => onBaixa(selected)),
            pending: actionPending,
          } : undefined}
          secondary={[
            ...(canEstorno ? [{
              icon: RotateCcw,
              tooltip: "Estornar Baixa",
              onClick: () => runAction(() => { onEstorno(selected); onClose(); }),
              pending: actionPending,
              tone: "warning" as const,
            }] : []),
            ...(canPermEditar ? [{
              icon: Edit,
              tooltip: "Editar",
              onClick: () => runAction(() => { onEdit(selected); onClose(); }),
              pending: actionPending,
            }] : []),
          ]}
          destructive={canPermCancelar ? {
            icon: Trash2,
            tooltip: "Cancelar",
            onClick: () => runAction(() => { onDelete(selected.id); onClose(); }),
            pending: actionPending,
          } : undefined}
        />
      }
      tabs={[
        { value: "resumo", label: "Resumo", content: (
          <div className="space-y-4">
            {effectiveStatus === "vencido" && (
              <DrawerStatusBanner
                tone="destructive"
                icon={AlertCircle}
                title={isCR ? "Conta a receber em atraso" : "Conta a pagar em atraso"}
                description={
                  diasAtraso > 0
                    ? `Vencimento em ${vencimento?.toLocaleDateString("pt-BR")} — ${diasAtraso} dia(s) de atraso.`
                    : `Vencimento em ${vencimento?.toLocaleDateString("pt-BR")}.`
                }
              />
            )}
            <ViewSection title="Identificação">
              <div className="grid grid-cols-2 gap-4">
                <ViewField label="Tipo">
                  <Badge variant="outline" className={isCR ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}>
                    {isCR ? "A Receber" : "A Pagar"}
                  </Badge>
                </ViewField>
                <ViewField label="Status"><StatusBadge status={effectiveStatus} /></ViewField>
              </div>
              <ViewField label="Descrição">
                {selected.contas_contabeis
                  ? `${selected.contas_contabeis.codigo} - ${selected.contas_contabeis.descricao}`
                  : (typeof selected.descricao === "string" && selected.descricao) || "—"}
              </ViewField>
              <ViewField label={isCR ? "Cliente" : "Fornecedor"}>
                {isCR && selected.cliente_id ? (
                  <RelationalLink type="cliente" id={selected.cliente_id}>{pessoa}</RelationalLink>
                ) : !isCR && selected.fornecedor_id ? (
                  <RelationalLink type="fornecedor" id={selected.fornecedor_id}>{pessoa}</RelationalLink>
                ) : pessoa}
              </ViewField>
            </ViewSection>
            <ViewSection title="Pagamento">
              <div className="grid grid-cols-2 gap-4">
                <ViewField label="Forma de Pagamento">{selected.forma_pagamento || "—"}</ViewField>
                {selected.parcela_numero ? (
                  <ViewField label="Parcela"><span className="font-mono">{selected.parcela_numero}/{selected.parcela_total}</span></ViewField>
                ) : null}
              </div>
              {selected.data_pagamento && (
                <ViewField label="Data do Pagamento">{new Date(selected.data_pagamento).toLocaleDateString("pt-BR")}</ViewField>
              )}
            </ViewSection>
            {selected.observacoes && (
              <ViewSection title="Observações">
                <p className="text-sm text-foreground whitespace-pre-wrap">{selected.observacoes}</p>
              </ViewSection>
            )}
          </div>
        )},
        { value: "baixas", label: baixasList.length > 0 ? `Baixas (${baixasList.length})` : "Baixas", content: (
          <div className="space-y-4">
            <DrawerSummaryGrid cols={2}>
              <DrawerSummaryCard label={`Total ${isCR ? "Recebido" : "Pago"}`} value={formatCurrency(valorBaixado)} tone="success" />
              <DrawerSummaryCard label="Saldo em Aberto" value={formatCurrency(saldoRestante)} tone={saldoRestante > 0 ? "destructive" : "success"} />
            </DrawerSummaryGrid>
            {loadingBaixas ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando baixas...</p>
            ) : baixasList.length === 0 ? (
              <DetailEmpty
                icon={Receipt}
                title="Nenhuma baixa registrada"
                message={canBaixa ? "Registre uma baixa para acompanhar o pagamento." : undefined}
                action={canBaixa ? (
                  <Button size="sm" variant="outline" className="gap-2" disabled={actionPending} onClick={() => runAction(() => onBaixa(selected))}>
                    <CreditCard className="h-3.5 w-3.5" /> Registrar Baixa
                  </Button>
                ) : undefined}
              />
            ) : (
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Histórico de Baixas</span>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Data</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Valor</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Forma</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Obs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baixasList.map((b, i) => (
                        <tr key={b.id ?? `tmp-${i}`} className={cn("border-b last:border-0", i % 2 !== 0 && "bg-muted/20")}>
                          <td className="px-3 py-2">{new Date(b.data_baixa).toLocaleDateString("pt-BR")}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-success">{formatCurrency(Number(b.valor_pago))}</td>
                          <td className="px-3 py-2">{b.forma_pagamento || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[100px]">{b.observacoes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {baixasList.length > 1 && (
                  <p className="text-xs text-muted-foreground text-right">
                    {baixasList.length} baixas · total {isCR ? "recebido" : "pago"}: <span className="font-mono font-semibold text-success">{formatCurrency(totalBaixado)}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )},
        { value: "origem", label: "Origem", content: (
          <div className="space-y-4">
            <ViewSection title="Origem do Lançamento">
              <ViewField label="Tipo de Origem">{origemLabel}</ViewField>
              {selected.nota_fiscal_id && (
                <ViewField label="Nota Fiscal Vinculada">
                  <RelationalLink type="nota_fiscal" id={selected.nota_fiscal_id}>Ver NF vinculada</RelationalLink>
                </ViewField>
              )}
              {selected.origem_tipo === "nfe_entrada" && selected.origem_id && (
                <ViewField label="NF-e de Entrada">
                  <RelationalLink
                    to={`/faturamento?tab=manifestacao&nfe=${selected.origem_id}`}
                    behavior="route"
                  >
                    Ver NF-e de entrada original
                  </RelationalLink>
                </ViewField>
              )}
              {selected.origem_tipo === "societario" && (
                <ViewField label="Retirada de Sócio">
                  <RelationalLink to="/socios-participacoes" behavior="route">
                    Ver retirada vinculada
                  </RelationalLink>
                </ViewField>
              )}
              {selected.documento_pai_id && (
                <ViewField label="Grupo de Parcelas">
                  <span className="font-mono text-muted-foreground text-xs">{selected.documento_pai_id}</span>
                </ViewField>
              )}
              {selected.parcela_numero ? (
                <ViewField label="Parcela">
                  <span className="font-mono">{selected.parcela_numero} de {selected.parcela_total}</span>
                </ViewField>
              ) : null}
            </ViewSection>
            <ViewSection title="Conta / Banco">
              {selected.contas_bancarias ? (
                <ViewField label="Conta Bancária">
                  <RelationalLink to="/contas-bancarias">
                    {selected.contas_bancarias.bancos?.nome} - {selected.contas_bancarias.descricao}
                  </RelationalLink>
                </ViewField>
              ) : (
                <ViewField label="Conta Bancária">—</ViewField>
              )}
              {selected.contas_contabeis && (
                <ViewField label="Conta Contábil">
                  <RelationalLink to="/contas-contabeis-plano">{selected.contas_contabeis.codigo} - {selected.contas_contabeis.descricao}</RelationalLink>
                </ViewField>
              )}
            </ViewSection>
          </div>
        )},
        { value: "historico", label: "Histórico", content: (
          <div className="space-y-4">
            <ViewSection title="Rastreabilidade">
              <div className="grid grid-cols-2 gap-4">
                {selected.created_at && (
                  <ViewField label="Cadastrado em">
                    {new Date(selected.created_at).toLocaleDateString("pt-BR")}
                  </ViewField>
                )}
                {selected.data_pagamento && (
                  <ViewField label="Liquidado em">
                    {new Date(selected.data_pagamento).toLocaleDateString("pt-BR")}
                  </ViewField>
                )}
                <ViewField label="Status Atual"><StatusBadge status={effectiveStatus} /></ViewField>
                <ViewField label="Ativo">
                  <Badge variant="outline">{selected.ativo !== false ? "Sim" : "Não"}</Badge>
                </ViewField>
              </div>
            </ViewSection>
            <ViewSection title="Trilha de Auditoria">
              {loadingAuditoria ? (
                <p className="text-sm text-muted-foreground text-center py-4">Carregando histórico…</p>
              ) : auditoriaList.length === 0 ? (
                <DetailEmpty title="Nenhum evento de auditoria registrado" className="py-6" />
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Quando</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Evento</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditoriaList.map((e, i) => {
                        const motivo = (e.payload && typeof e.payload === "object"
                          ? (e.payload as Record<string, unknown>).motivo
                            ?? (e.payload as Record<string, unknown>).motivo_estorno
                          : null) as string | undefined;
                        return (
                          <tr key={e.id} className={cn("border-b last:border-0", i % 2 !== 0 && "bg-muted/20")}>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {new Date(e.created_at).toLocaleString("pt-BR")}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-[10px]">{e.evento}</Badge>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">
                              {motivo || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </ViewSection>
            {selected.observacoes && (
              <ViewSection title="Observações Internas">
                <p className="text-sm text-foreground whitespace-pre-wrap">{selected.observacoes}</p>
              </ViewSection>
            )}
          </div>
        )},
      ]}
    />
  );
}

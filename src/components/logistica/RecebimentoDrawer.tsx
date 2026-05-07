import { ViewDrawerV2, ViewField, ViewSection } from "@/components/ViewDrawerV2";
import { StatusBadge } from "@/components/StatusBadge";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { Badge } from "@/components/ui/badge";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { DrawerStatusBanner } from "@/components/ui/DrawerStatusBanner";
import { DrawerStickyFooter } from "@/components/ui/DrawerStickyFooter";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/format";
import { AlertTriangle, Package, Truck, ClipboardCheck, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Recebimento } from "@/pages/logistica/hooks/useRecebimentos";
import { getRecebimentoSourceMeta, getRecebimentoStatusCfg } from "@/pages/logistica/logisticaStatus";

interface RecebimentoDrawerProps {
  open: boolean;
  onClose: () => void;
  recebimento: Recebimento | null;
  onRegistrarRecebimento?: (recebimento: Recebimento) => void;
}

// NOTE: This drawer shows a read-only logistic view of a purchase order.
// Actual receiving (inventory update, NF reconciliation) must be performed
// in the Compras module.  The quantities shown here are approximations
// derived from the order status; they do NOT reflect real partial receiving
// until a dedicated quantidade_recebida column is added to pedidos_compra_itens.

function isAtrasado(recebimento: Recebimento) {
  if (!recebimento.previsao_entrega) return false;
  if (recebimento.status_logistico === "recebido" || recebimento.status_logistico === "cancelado") return false;
  return new Date(recebimento.previsao_entrega + "T00:00:00") < new Date();
}

export function RecebimentoDrawer({ open, onClose, recebimento: r, onRegistrarRecebimento }: RecebimentoDrawerProps) {
  const navigate = useNavigate();
  if (!r) return <ViewDrawerV2 open={open} onClose={onClose} title="" />;

  const cfg = getRecebimentoStatusCfg(r.status_logistico);
  const sourceMeta = getRecebimentoSourceMeta(r.recebimento_real);
  const atrasado = isAtrasado(r);
  const percentRecebido = r.quantidade_pedida > 0
    ? Math.round((r.quantidade_recebida / r.quantidade_pedida) * 100)
    : 0;

  const recebTone = percentRecebido >= 100 ? "success" : percentRecebido > 0 ? "warning" : "neutral";

  /* ── Summary strip ── */
  const summary = (
    <DrawerSummaryGrid cols={4}>
      <DrawerSummaryCard
        label="Pedido"
        value={r.numero_compra}
        hint="compra"
        align="center"
      />
      <DrawerSummaryCard
        label="Status"
        value={cfg.label}
        mono={false}
        align="center"
        tone={atrasado ? "destructive" : "neutral"}
        hint={atrasado ? "atrasado" : undefined}
      />
      <DrawerSummaryCard
        label="Prev. Entrega"
        value={r.previsao_entrega ? formatDate(r.previsao_entrega) : "—"}
        mono={false}
        align="center"
        hint={r.data_recebimento ? `Recebido: ${formatDate(r.data_recebimento)}` : "não recebido"}
        tone={atrasado ? "destructive" : "neutral"}
      />
      <DrawerSummaryCard
        label="Qtd. Recebida"
        value={`${formatNumber(r.quantidade_recebida)} / ${formatNumber(r.quantidade_pedida)}`}
        hint={`${percentRecebido}% do pedido`}
        align="center"
        tone={recebTone}
      />
    </DrawerSummaryGrid>
  );

  /* ── Tab Resumo ── */
  const tabResumo = (
    <div className="space-y-4">
      {!r.recebimento_real && (
        <DrawerStatusBanner
          tone="warning"
          icon={sourceMeta.icon}
          title={sourceMeta.label}
          description={sourceMeta.description}
        />
      )}

      {atrasado && (
        <DrawerStatusBanner
          tone="destructive"
          icon={AlertTriangle}
          title="Recebimento em atraso"
          description={`Previsão era ${r.previsao_entrega ? formatDate(r.previsao_entrega) : "—"} e ainda não foi concluído.`}
        />
      )}

      <ViewSection title="Pedido de Compra">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Número">{r.numero_compra}</ViewField>
          <ViewField label="Fornecedor">{r.fornecedor}</ViewField>
          <ViewField label="Status">
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusBadge status={cfg.badgeStatus} label={cfg.label} />
              <Badge variant="outline" className={`text-[10px] ${sourceMeta.className}`}>{sourceMeta.label}</Badge>
              {atrasado && (
                <Badge variant="outline" className="text-xs border-destructive/40 text-destructive gap-1">
                  <AlertTriangle className="h-3 w-3" />Atrasado
                </Badge>
              )}
            </div>
          </ViewField>
          <ViewField label="Responsável">
            <span className="font-mono text-xs">{r.responsavel !== "—" ? r.responsavel.slice(0, 8) + "…" : "—"}</span>
          </ViewField>
        </div>
      </ViewSection>

      <ViewSection title="Datas">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Previsão de Entrega">
            {r.previsao_entrega ? (
              <span className={atrasado ? "text-destructive font-semibold" : ""}>
                {formatDate(r.previsao_entrega)}
              </span>
            ) : "—"}
          </ViewField>
          <ViewField label="Data de Recebimento">
            {r.data_recebimento ? formatDate(r.data_recebimento) : (
              <span className="text-muted-foreground">Não informado</span>
            )}
          </ViewField>
        </div>
      </ViewSection>
    </div>
  );

  /* ── Tab Quantidades ── */
  const tabQuantidades = (
    <div className="space-y-4">
      <ViewSection title="Quantidades">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Pedida</p>
            <p className="text-xl font-bold font-mono">{formatNumber(r.quantidade_pedida)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Recebida</p>
            <p className={`text-xl font-bold font-mono ${r.quantidade_recebida >= r.quantidade_pedida ? "text-success" : "text-warning"}`}>
              {formatNumber(r.quantidade_recebida)}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Pendente</p>
            <p className={`text-xl font-bold font-mono ${r.pendencia > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {formatNumber(r.pendencia)}
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 px-4 py-2 text-center mt-2">
          <span className="text-xs text-muted-foreground">Progresso: </span>
          <span className={`text-sm font-bold font-mono ${percentRecebido >= 100 ? "text-success" : "text-warning"}`}>
            {percentRecebido}%
          </span>
          <div className="w-full bg-muted rounded-full h-1.5 mt-1.5">
            <div
              className={`h-1.5 rounded-full ${percentRecebido >= 100 ? "bg-success" : "bg-warning"}`}
              style={{ width: `${Math.min(100, percentRecebido)}%` }}
            />
          </div>
        </div>

        {r.status_logistico === "recebimento_parcial" && r.pendencia > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 flex gap-2">
            <Package className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-warning">Recebimento parcial.</strong>{" "}
              Restam {formatNumber(r.pendencia)} unidades pendentes — registre o restante pelo módulo de Compras.
            </p>
          </div>
        )}
      </ViewSection>
    </div>
  );

  /* ── Tab Vínculos ── */
  const tabVinculos = (
    <div className="space-y-4">
      <ViewSection title="Documentos Relacionados">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Pedido de Compra">
            <RelationalLink type="pedido_compra" id={r.id}>
              {r.numero_compra}
            </RelationalLink>
          </ViewField>
          <ViewField label="Nota Fiscal">
            {r.nf_vinculada ? (
              <RelationalLink type="nota_fiscal" id={r.nf_vinculada}>
                NF vinculada
              </RelationalLink>
            ) : (
              <span className="text-muted-foreground">Não informada</span>
            )}
          </ViewField>
        </div>
      </ViewSection>

      <ViewSection title="Observações">
        <p className="text-xs text-muted-foreground">
          Para visualizar os itens, NF e detalhes completos do pedido, acesse o módulo de Compras
          através do link acima.
        </p>
      </ViewSection>
    </div>
  );

  return (
    <ViewDrawerV2
      open={open}
      onClose={onClose}
      title={`Recebimento — Pedido ${r.numero_compra}`}
      subtitle={
        <span className="flex items-center gap-2">
          <Truck className="h-3.5 w-3.5" />
          {r.fornecedor}
        </span>
      }
      badge={
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={cfg.badgeStatus} label={cfg.label} />
          {!r.recebimento_real && <Badge variant="outline" className={`text-[10px] ${sourceMeta.className}`}>{sourceMeta.label}</Badge>}
          {atrasado && (
            <Badge variant="outline" className="text-xs border-destructive/40 text-destructive gap-1">
              <AlertTriangle className="h-3 w-3" />Atrasado
            </Badge>
          )}
        </div>
      }
      summary={summary}
      tabs={[
        { value: "resumo",      label: "Resumo",       content: tabResumo },
        { value: "quantidades", label: "Quantidades",  content: tabQuantidades },
        { value: "vinculos",    label: "Vínculos",     content: tabVinculos },
      ]}
      defaultTab="resumo"
      variant="operational"
      footerSticky
      footer={
        r.status_logistico !== "recebido" && r.status_logistico !== "cancelado" ? (
          <DrawerStickyFooter
            hint={atrasado ? "Pedido em atraso — registre o recebimento o quanto antes." : undefined}
            right={
              <Button
                size="lg"
                className="h-11 min-w-[180px] gap-2"
                onClick={() => {
                  if (onRegistrarRecebimento) {
                    onRegistrarRecebimento(r);
                    onClose();
                  } else {
                    onClose();
                    navigate(`/compras?recebimento=${r.id}`);
                  }
                }}
              >
                <ClipboardCheck className="h-4 w-4" />
                Registrar recebimento
                <ExternalLink className="h-3 w-3 opacity-70" />
              </Button>
            }
          />
        ) : undefined
      }
    />
  );
}

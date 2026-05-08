import { useNavigate } from 'react-router-dom';
import { ArrowRight, Truck, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import { useRelationalNavigation } from '@/contexts/RelationalNavigationContext';
import { ScopeBadge } from './ScopeBadge';
import { buildDrilldownUrl } from '@/lib/dashboard/drilldown';
import type { PedidoCompra } from '@/types/domain';

interface LogisticaBlockProps {
  /** Preview list of compras awaiting delivery (capped at 10 for UI). */
  comprasAguardando: PedidoCompra[];
  /** Real count of shipments (remessas) with overdue delivery date. */
  totalRemessasAtrasadas: number;
}

function calcDiasEntrega(compra: PedidoCompra) {
  if (!compra.data_entrega_prevista) return null;
  const hoje = new Date();
  const prevista = new Date(compra.data_entrega_prevista);
  return Math.ceil((prevista.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

export function LogisticaBlock({ comprasAguardando, totalRemessasAtrasadas }: LogisticaBlockProps) {
  const navigate = useNavigate();
  const { pushView } = useRelationalNavigation();

  /** Number of compras from the preview list that have a past delivery date. */
  const comprasAtrasadasPreview = comprasAguardando.filter((c) => {
    const dias = calcDiasEntrega(c);
    return dias !== null && dias < 0;
  }).length;

  const hasAlerts = comprasAtrasadasPreview > 0 || totalRemessasAtrasadas > 0;

  return (
    <div className="bg-card rounded-xl border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border/60">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Truck className="h-4 w-4 text-info" />
          Logística
          <ScopeBadge scope={{ kind: 'snapshot' }} />
          {hasAlerts && (
            <div className="flex items-center gap-1.5">
              {comprasAtrasadasPreview > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {comprasAtrasadasPreview} compra{comprasAtrasadasPreview > 1 ? 's' : ''} atrasada{comprasAtrasadasPreview > 1 ? 's' : ''}
                </span>
              )}
              {totalRemessasAtrasadas > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {totalRemessasAtrasadas} remessa{totalRemessasAtrasadas > 1 ? 's' : ''} atrasada{totalRemessasAtrasadas > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-primary hover:text-primary"
          onClick={() => navigate(totalRemessasAtrasadas > 0 ? buildDrilldownUrl({ kind: 'logistica:remessas-atrasadas' }) : '/logistica')}
        >
          Ver módulo <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 border-b border-border/60">
        <div className="px-4 py-2">
          <p className="text-xs text-muted-foreground">Compras aguardando entrega</p>
          <p className="text-lg font-bold mono mt-0.5">{comprasAguardando.length}</p>
          <p className="text-[10px] text-muted-foreground">prévia — até 10 registros</p>
        </div>
        <div className="px-4 py-2 border-l border-border/60">
          <p className="text-xs text-muted-foreground">Remessas atrasadas</p>
          <p className={`text-lg font-bold mono mt-0.5 ${totalRemessasAtrasadas > 0 ? 'text-destructive' : 'text-foreground'}`}>
            {totalRemessasAtrasadas}
          </p>
          <p className="text-[10px] text-muted-foreground">envios s/ confirmação</p>
        </div>
      </div>

      {/* Lista compras aguardando */}
      {comprasAguardando.length === 0 ? (
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-lg bg-success/5 border border-success/20 px-3 py-2">
            <div className="h-2 w-2 rounded-full bg-success shrink-0" />
            <p className="text-xs text-success font-medium">Nenhuma entrega pendente.</p>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-2.5 pb-3 flex flex-col">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Compras Aguardando Entrega
          </p>
          <div className="space-y-1 max-h-[160px] overflow-y-auto">
            {comprasAguardando.slice(0, 5).map((c: PedidoCompra) => {
              const dias = calcDiasEntrega(c);
              const atrasado = dias !== null && dias < 0;
              const urgente = dias !== null && dias >= 0 && dias <= 3;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded py-2 px-1 min-h-[44px] hover:bg-muted/20 active:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => pushView('pedido_compra', c.id)}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium mono leading-tight">{c.numero}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.fornecedores?.nome_razao_social || '—'}</p>
                  </div>
                  <div className="shrink-0 text-right ml-3">
                    <p className="text-xs font-semibold mono">{formatCurrency(Number(c.valor_total || 0))}</p>
                    {dias !== null ? (
                      <p className={`text-[11px] flex items-center justify-end gap-0.5 font-medium ${
                        atrasado ? 'text-destructive' : urgente ? 'text-warning' : 'text-muted-foreground'
                      }`}>
                        <Clock className="h-2.5 w-2.5" />
                        {atrasado
                          ? `${Math.abs(dias)}d atrasado`
                          : dias === 0
                          ? 'Hoje'
                          : `${dias}d`}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">{formatDate(c.data_pedido)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

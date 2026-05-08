import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileText, CheckCircle, AlertCircle, Clock, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber, formatCurrency } from '@/lib/format';
import { ScopeBadge, type ScopeKind } from './ScopeBadge';
import { buildDrilldownUrl } from '@/lib/dashboard/drilldown';

interface FiscalStats {
  emitidas: number;
  pendentes: number;
  canceladas: number;
  valorEmitidas: number;
  rejeitadas?: number;
  pedidosSemFaturamento?: number;
}

interface FiscalBlockProps {
  stats: FiscalStats;
  scope?: ScopeKind;
  hideHeaderOnMobile?: boolean;
}

export function FiscalBlock({ stats, scope, hideHeaderOnMobile = false }: FiscalBlockProps) {
  const navigate = useNavigate();

  const items = [
    {
      label: 'Notas emitidas',
      value: formatNumber(stats.emitidas),
      sub: formatCurrency(stats.valorEmitidas),
      icon: CheckCircle,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: 'Pendentes de emissão',
      value: formatNumber(stats.pendentes),
      sub: stats.pendentes > 0 ? 'ação necessária' : 'sem pendências',
      icon: Clock,
      color: stats.pendentes > 0 ? 'text-warning' : 'text-muted-foreground',
      bg: stats.pendentes > 0 ? 'bg-warning/10' : 'bg-muted/40',
    },
    {
      label: 'Canceladas',
      value: formatNumber(stats.canceladas),
      sub: 'no período',
      icon: AlertCircle,
      color: stats.canceladas > 0 ? 'text-destructive' : 'text-muted-foreground',
      bg: stats.canceladas > 0 ? 'bg-destructive/10' : 'bg-muted/40',
    },
  ];

  // Additional KPIs when available
  if ((stats.rejeitadas ?? 0) > 0) {
    items.push({
      label: 'Rejeitadas SEFAZ',
      value: formatNumber(stats.rejeitadas || 0),
      sub: 'requer atenção',
      icon: Ban,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    });
  }

  if ((stats.pedidosSemFaturamento ?? 0) > 0) {
    items.push({
      label: 'Pedidos s/ faturamento',
      value: formatNumber(stats.pedidosSemFaturamento || 0),
      sub: 'aprovados pendentes',
      icon: FileText,
      color: 'text-warning',
      bg: 'bg-warning/10',
    });
  }

  return (
    <div className="bg-card rounded-xl border flex flex-col">
      {/* Header */}
      <div
        className={
          'items-center justify-between px-4 pt-4 pb-2 border-b border-border/60 ' +
          (hideHeaderOnMobile ? 'hidden md:flex' : 'flex')
        }
      >
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-secondary" />
          Fiscal
          <ScopeBadge scope={scope ?? { kind: 'fixed-window', janela: 'mes-atual' }} />
          {stats.pendentes > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
              <Clock className="h-2.5 w-2.5" />
              {stats.pendentes} pendente{stats.pendentes > 1 ? 's' : ''}
            </span>
          )}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-primary hover:text-primary"
          onClick={() => navigate(stats.pendentes > 0 ? buildDrilldownUrl({ kind: 'fiscal:pendentes' }) : '/fiscal')}
        >
          Ver módulo <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Status das notas */}
      <div className="flex-1 px-4 pt-3 pb-4 space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5 min-h-[44px] hover:bg-muted/20 active:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => {
                if (item.label === 'Pendentes de emissão') navigate(buildDrilldownUrl({ kind: 'fiscal:pendentes' }));
                else navigate('/fiscal');
              }}
            >
              <div className={`rounded-lg p-1.5 ${item.bg}`}>
                <Icon className={`h-3.5 w-3.5 ${item.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{item.label}</p>
                <p className="text-[11px] text-muted-foreground">{item.sub}</p>
              </div>
              <span className={`text-lg font-bold mono ${item.color}`}>{item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

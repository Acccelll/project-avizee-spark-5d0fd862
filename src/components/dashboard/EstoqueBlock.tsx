import { useNavigate } from 'react-router-dom';
import { ArrowRight, Package, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useRelationalNavigation } from '@/contexts/RelationalNavigationContext';
import { ScopeBadge } from './ScopeBadge';
import { buildDrilldownUrl } from '@/lib/dashboard/drilldown';

export interface EstoqueBlockItem {
  id: string;
  nome: string;
  codigo_interno: string | null;
  estoque_atual: number | null;
  estoque_minimo: number;
}

interface EstoqueBlockProps {
  itensBaixoMinimo: EstoqueBlockItem[];
  valorTotalEstoque: number;
  totalProdutosAtivos: number;
  hideHeaderOnMobile?: boolean;
}

export function EstoqueBlock({ itensBaixoMinimo, valorTotalEstoque, totalProdutosAtivos, hideHeaderOnMobile = false }: EstoqueBlockProps) {
  const navigate = useNavigate();
  const { pushView } = useRelationalNavigation();

  const temCriticos = itensBaixoMinimo.length > 0;

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
          <Package className="h-4 w-4 text-info" />
          Estoque
          <ScopeBadge scope={{ kind: 'snapshot' }} />
          {temCriticos && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
              <AlertTriangle className="h-2.5 w-2.5" />
              {itensBaixoMinimo.length} crítico{itensBaixoMinimo.length > 1 ? 's' : ''}
            </span>
          )}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-primary hover:text-primary"
          onClick={() => navigate(temCriticos ? buildDrilldownUrl({ kind: 'estoque:critico' }) : '/estoque')}
        >
          Ver módulo <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 border-b border-border/60">
        <div className="px-4 py-2">
          <p className="text-xs text-muted-foreground">Produtos ativos</p>
          <p className="text-lg font-bold mono mt-0.5">{formatNumber(totalProdutosAtivos)}</p>
        </div>
        <div className="px-4 py-2 border-l border-border/60">
          <p className="text-xs text-muted-foreground">Valor em estoque</p>
          <p className="text-lg font-bold mono mt-0.5">{formatCurrency(valorTotalEstoque)}</p>
        </div>
      </div>

      {/* Itens críticos / estado vazio compacto */}
      {itensBaixoMinimo.length === 0 ? (
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-lg bg-success/5 border border-success/20 px-3 py-2">
            <div className="h-2 w-2 rounded-full bg-success shrink-0" />
            <p className="text-xs text-success font-medium">Estoque dentro dos níveis mínimos.</p>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-2.5 pb-3 flex flex-col">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Abaixo do Estoque Mínimo
          </p>
          <div className="space-y-1 max-h-[160px] overflow-y-auto">
            {itensBaixoMinimo.slice(0, 5).map((p) => {
              const pct = p.estoque_minimo > 0 ? (p.estoque_atual ?? 0) / p.estoque_minimo : 0;
              const isZero = (p.estoque_atual ?? 0) <= 0;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded py-2 px-1 min-h-[44px] hover:bg-muted/20 active:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => pushView('produto', p.id)}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{p.nome}</p>
                    <p className="text-[11px] text-muted-foreground mono">{p.codigo_interno || '—'}</p>
                  </div>
                  <div className="shrink-0 text-right ml-3">
                    <p className={`text-xs font-bold mono ${isZero ? 'text-destructive' : 'text-warning'}`}>
                      {formatNumber(p.estoque_atual ?? 0)}{' '}
                      <span className="font-normal text-muted-foreground">/ {formatNumber(p.estoque_minimo)}</span>
                    </p>
                    <div className="mt-0.5 h-1 w-16 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isZero ? 'bg-destructive' : pct < 0.5 ? 'bg-warning' : 'bg-success'}`}
                        style={{ width: `${Math.min(pct * 100, 100)}%` }}
                      />
                    </div>
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

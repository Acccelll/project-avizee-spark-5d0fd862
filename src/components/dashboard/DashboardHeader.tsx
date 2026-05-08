import { RefreshCw, CalendarRange, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDashboardPeriod, type DashboardPeriod } from '@/contexts/DashboardPeriodContext';

const periodLabels: Record<DashboardPeriod, string> = {
  today: 'Hoje',
  week: 'Esta semana',
  month: 'Este mês',
  '30d': 'Últimos 30 dias',
  year: 'Este ano',
  custom: 'Personalizado',
};

const PERIOD_BASE_TOOLTIP =
  'Período base aplicado aos blocos sensíveis ao período. Estoque e Logística usam snapshot, Fiscal usa janela própria.';

function formatRange(dateFrom: string, dateTo: string): string {
  // dateFrom / dateTo são YYYY-MM-DD locais.
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };
  if (dateFrom === dateTo) return fmt(dateFrom);
  return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
}

interface DashboardHeaderProps {
  lastUpdated?: Date;
  onRefresh?: () => void;
  /** Quando true, renderiza "Atualizando…" e anima o ícone de refresh. */
  fetching?: boolean;
  /** Optional slot rendered alongside the period selector / refresh button. */
  rightSlot?: React.ReactNode;
}

export function DashboardHeader({ lastUpdated, onRefresh, fetching = false, rightSlot }: DashboardHeaderProps) {
  const {
    period,
    setPeriod,
    customStartDraft,
    customEndDraft,
    setCustomStartDraft,
    setCustomEndDraft,
    applyCustomRange,
    customRangeDirty,
    customRangeInvalid,
    range,
  } = useDashboardPeriod();

  const now = new Date();
  const dateLabel = now.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="mb-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span>{dateLabel}</span>
            <span className="hidden md:inline text-border">·</span>
            <span className="flex items-center gap-1">
              <RefreshCw className={`h-3 w-3 ${fetching ? 'animate-spin' : ''}`} />
              {fetching ? 'Atualizando…' : `Atualizado às ${lastUpdatedLabel}`}
            </span>
            <span className="hidden md:inline text-border">·</span>
            <span
              className="flex items-center gap-1"
              title={PERIOD_BASE_TOOLTIP}
            >
              <CalendarRange className="h-3 w-3" />
              <span className="font-medium text-foreground/80">Período base</span>
              <span aria-hidden className="text-border">·</span>
              <span>{formatRange(range.dateFrom, range.dateTo)}</span>
              <span className="text-muted-foreground/70">({periodLabels[period]})</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-help-id="dashboard.globalPeriod">
          <div className="flex items-center gap-1.5">
            <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={period} onValueChange={(v: DashboardPeriod) => setPeriod(v)}>
              <SelectTrigger className="h-8 w-[175px] text-sm">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="year">Este ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={fetching} className="h-8 gap-1.5" aria-label="Atualizar dados do dashboard">
              <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          )}
          {rightSlot}
        </div>
      </div>

      {period === 'custom' && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label className="text-xs">Data inicial</Label>
              <Input
                type="date"
                value={customStartDraft}
                onChange={(e) => setCustomStartDraft(e.target.value)}
                aria-invalid={customRangeInvalid || undefined}
                className={`mt-1 h-8 text-sm ${customRangeInvalid ? 'border-destructive' : ''}`}
              />
            </div>
            <div>
              <Label className="text-xs">Data final</Label>
              <Input
                type="date"
                value={customEndDraft}
                onChange={(e) => setCustomEndDraft(e.target.value)}
                aria-invalid={customRangeInvalid || undefined}
                className={`mt-1 h-8 text-sm ${customRangeInvalid ? 'border-destructive' : ''}`}
              />
            </div>
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => applyCustomRange()}
              disabled={customRangeInvalid || !customRangeDirty}
              title={customRangeInvalid ? 'Datas inválidas' : !customRangeDirty ? 'Sem alterações' : 'Aplicar período'}
            >
              <Check className="h-3.5 w-3.5" />
              Aplicar
            </Button>
          </div>
          {customRangeInvalid ? (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              Verifique as datas: a data inicial deve ser anterior ou igual à data final.
            </p>
          ) : customRangeDirty ? (
            <p className="text-xs text-muted-foreground">Clique em <strong>Aplicar</strong> para atualizar o dashboard.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Período aplicado.</p>
          )}
        </div>
      )}
    </div>
  );
}

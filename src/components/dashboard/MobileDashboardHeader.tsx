import { useState } from 'react';
import { RefreshCw, CalendarRange, Check, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from '@/components/ui/drawer';
import { useDashboardPeriod, type DashboardPeriod } from '@/contexts/DashboardPeriodContext';
import { cn } from '@/lib/utils';

const periodLabels: Record<DashboardPeriod, string> = {
  today: 'Hoje',
  week: 'Esta semana',
  month: 'Este mês',
  '30d': 'Últimos 30 dias',
  year: 'Este ano',
  custom: 'Personalizado',
};

const periodOptions: { value: DashboardPeriod; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mês' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'year', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' },
];

interface MobileDashboardHeaderProps {
  lastUpdated?: Date;
  onRefresh?: () => void;
  rightSlot?: React.ReactNode;
  fetching?: boolean;
}

/**
 * Compact sticky header used on <md viewports. Replaces the desktop
 * `DashboardHeader` (which stacks vertically and eats ~140px before the
 * first KPI). Period selection moves to a bottom-sheet drawer for a
 * touch-first experience; custom range uses native date inputs inside the
 * drawer with confirm/cancel.
 */
export function MobileDashboardHeader({
  lastUpdated,
  onRefresh,
  rightSlot,
  fetching,
}: MobileDashboardHeaderProps) {
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
  } = useDashboardPeriod();
  const [open, setOpen] = useState(false);

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  const handlePick = (next: DashboardPeriod) => {
    setPeriod(next);
    if (next !== 'custom') setOpen(false);
  };

  const handleApply = () => {
    applyCustomRange();
    if (!customRangeInvalid) setOpen(false);
  };

  return (
    <div className="-mx-4 mb-2 sticky top-0 z-30 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center gap-2">
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1 justify-start gap-1.5 px-3 text-xs"
              aria-label={`Período: ${periodLabels[period]}`}
            >
              <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate font-medium">{periodLabels[period]}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">trocar</span>
            </Button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[85vh] rounded-t-[20px]">
            <DrawerHeader className="text-left">
              <div className="flex items-center justify-between gap-2">
                <DrawerTitle>Período</DrawerTitle>
                <DrawerClose asChild>
                  <button
                    type="button"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Fechar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </DrawerClose>
              </div>
              <DrawerDescription>Atualiza todos os blocos sensíveis ao período.</DrawerDescription>
            </DrawerHeader>

            <div className="grid gap-1 px-4 pb-2">
              {periodOptions.map((opt) => {
                const active = period === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handlePick(opt.value)}
                    className={cn(
                      'flex h-12 w-full items-center justify-between rounded-lg border px-4 text-left text-sm transition-colors',
                      'active:bg-muted/40',
                      active
                        ? 'border-primary bg-primary/5 font-semibold text-primary'
                        : 'border-border/60 bg-background text-foreground hover:bg-muted/20',
                    )}
                  >
                    <span>{opt.label}</span>
                    {active && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>

            {period === 'custom' && (
              <div className="space-y-3 px-4 pb-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Data inicial</Label>
                    <Input
                      type="date"
                      value={customStartDraft}
                      onChange={(e) => setCustomStartDraft(e.target.value)}
                      aria-invalid={customRangeInvalid || undefined}
                      className={cn(
                        'mt-1 h-11 text-sm',
                        customRangeInvalid && 'border-destructive',
                      )}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Data final</Label>
                    <Input
                      type="date"
                      value={customEndDraft}
                      onChange={(e) => setCustomEndDraft(e.target.value)}
                      aria-invalid={customRangeInvalid || undefined}
                      className={cn(
                        'mt-1 h-11 text-sm',
                        customRangeInvalid && 'border-destructive',
                      )}
                    />
                  </div>
                </div>
                {customRangeInvalid && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    Verifique as datas: a inicial deve ser ≤ final.
                  </p>
                )}
              </div>
            )}

            <DrawerFooter className="flex-row gap-2 border-t border-border/60 pt-3">
              <DrawerClose asChild>
                <Button variant="outline" className="flex-1 h-11">
                  Fechar
                </Button>
              </DrawerClose>
              {period === 'custom' && (
                <Button
                  className="flex-1 h-11 gap-1.5"
                  onClick={handleApply}
                  disabled={customRangeInvalid || !customRangeDirty}
                >
                  <Check className="h-4 w-4" />
                  Aplicar
                </Button>
              )}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        {onRefresh && (
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            className="h-9 w-9 shrink-0"
            aria-label={fetching ? "Atualizando…" : `Atualizar (última: ${lastUpdatedLabel})`}
            title={fetching ? "Atualizando…" : `Atualizado às ${lastUpdatedLabel}`}
            disabled={fetching}
          >
            <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
          </Button>
        )}
        {rightSlot}
      </div>
      {lastUpdated && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Atualizado às {lastUpdatedLabel}
        </p>
      )}
    </div>
  );
}
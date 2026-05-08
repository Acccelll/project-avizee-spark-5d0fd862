import { forwardRef } from 'react';
import { Calendar, Clock, CalendarRange } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Discrete badge that explains the temporal scope a dashboard block
 * is currently using. Helps the user understand that not every block
 * follows the global period filter — some are fixed windows and some
 * are snapshots of "now".
 */
export type ScopeKind =
  | { kind: 'global-range'; eixo: string }
  | { kind: 'fixed-window'; janela: 'today' | 'next-7d' | 'last-7d' | 'mes-atual' | 'mes-anterior' }
  | { kind: 'snapshot' };

const fixedLabels: Record<Extract<ScopeKind, { kind: 'fixed-window' }>['janela'], string> = {
  today: 'Hoje',
  'next-7d': 'Próximos 7 dias',
  'last-7d': 'Últimos 7 dias',
  'mes-atual': 'Mês atual',
  'mes-anterior': 'Mês anterior',
};

function describe(scope: ScopeKind): { label: string; tooltip: string; Icon: typeof Calendar } {
  if (scope.kind === 'global-range') {
    return {
      label: 'Período',
      tooltip: `Aplica o período global selecionado sobre ${scope.eixo}.`,
      Icon: CalendarRange,
    };
  }
  if (scope.kind === 'fixed-window') {
    return {
      label: fixedLabels[scope.janela],
      tooltip: 'Janela fixa — não acompanha o período global do dashboard.',
      Icon: Calendar,
    };
  }
  return {
    label: 'Snapshot',
    tooltip: 'Posição atual — não depende do período selecionado.',
    Icon: Clock,
  };
}

export const ScopeBadge = forwardRef<
  HTMLSpanElement,
  { scope: ScopeKind; className?: string; variant?: 'default' | 'subtle' }
>(function ScopeBadge({ scope, className, variant = 'default' }, ref) {
    const { label, tooltip, Icon } = describe(scope);
    const base =
      variant === 'subtle'
        ? 'inline-flex max-w-full items-center gap-1 px-1 py-0 text-[10px] font-normal text-muted-foreground/70 whitespace-nowrap shrink-0 '
        : 'inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap shrink-0 ';
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            ref={ref}
            className={base + (className ?? '')}
          >
            <Icon className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[220px]">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
});
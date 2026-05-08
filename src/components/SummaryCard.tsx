import React, { forwardRef } from 'react';
import { ArrowUpIcon, ArrowDownIcon, LucideIcon, BarChart2 } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

export interface SummaryCardProps {
  title: string;
  /** Title shorter usado no mobile (evita truncar o título principal). */
  shortTitle?: string;
  value: string | number;
  subtitle?: string;
  variation?: string;
  variationType?: 'positive' | 'negative' | 'neutral';
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  icon?: LucideIcon;
  onClick?: () => void;
  /** Accessible label for the clickable card element. Recommended when `onClick` is provided. */
  'aria-label'?: string;
  /** Optional callback to open a detail view (e.g. a metric drawer). Renders a small chart icon button. */
  onDetail?: () => void;
  className?: string;
  sparklineData?: number[];
  loading?: boolean;
  /** Numeric goal (meta). When provided alongside a numeric `value`, renders a progress bar. */
  meta?: number;
  /** Numeric realised value used to compute progress against `meta`. Defaults to `value` if numeric. */
  realizado?: number;
  /**
   * Visual density. `compact` removes sparkline and meta bar, reduces padding and
   * font sizes — ideal for dashboard KPI rows where vertical space is limited.
   */
  density?: 'default' | 'compact';
  /**
   * When true, renders an "active" affordance (ring + tinted bg) signalling
   * that this card is currently filtering the connected list.
   */
  active?: boolean;
}

const variantStyles: Record<string, { border: string; iconBg: string; iconColor: string }> = {
  default: { border: '', iconBg: 'bg-accent', iconColor: 'text-primary' },
  success: { border: 'border-l-4 border-l-success', iconBg: 'bg-success/10', iconColor: 'text-success' },
  danger: { border: 'border-l-4 border-l-destructive', iconBg: 'bg-destructive/10', iconColor: 'text-destructive' },
  warning: { border: 'border-l-4 border-l-warning', iconBg: 'bg-warning/10', iconColor: 'text-warning' },
  info: { border: 'border-l-4 border-l-primary', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
};

export const SummaryCard = forwardRef<HTMLDivElement, SummaryCardProps>(
  function SummaryCard(
    {
      title,
      shortTitle,
      value,
      subtitle,
      variation,
      variationType = 'neutral',
      variant = 'default',
      icon: Icon,
      onClick,
      onDetail,
      className,
      sparklineData,
      loading,
      meta,
      realizado,
      density = 'default',
      active = false,
      'aria-label': ariaLabel,
    },
    ref,
  ) {
    const isCompact = density === 'compact';
    const isMobile = useIsMobile();
    const displayTitle = isMobile && shortTitle ? shortTitle : title;

    if (loading) {
      return (
        <div ref={ref} className={cn('stat-card', isCompact && '!p-3', className)}>
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className={cn(isCompact ? 'h-6' : 'h-7', 'w-32')} />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className={cn(isCompact ? 'h-9 w-9' : 'h-11 w-11', 'rounded-lg')} />
          </div>
        </div>
      );
    }
    const variationColors = {
      positive: 'text-success',
      negative: 'text-destructive',
      neutral: 'text-muted-foreground',
    };

    const styles = variantStyles[variant] || variantStyles.default;

    return (
      <div
        ref={ref}
        className={cn(
          'stat-card',
          isCompact && '!p-3',
          styles.border,
          onClick && 'cursor-pointer hover:border-primary/30 active:scale-[0.98]',
          active && 'ring-2 ring-primary/40 bg-primary/5 border-primary/30',
          className
        )}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={ariaLabel}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn(isCompact ? 'text-xs' : 'text-sm', 'text-muted-foreground font-medium tracking-wide truncate')}>{displayTitle}</p>
            <p
              className={cn(
                isCompact ? 'text-lg sm:text-xl' : 'text-2xl',
                'font-bold mt-1 tracking-tight tabular-nums truncate',
              )}
              title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
            >
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
            {variation && (
              <div className={cn('flex items-center gap-1 text-xs mt-1 font-medium', variationColors[variationType])}>
                {variationType === 'positive' && <ArrowUpIcon className="h-3 w-3" />}
                {variationType === 'negative' && <ArrowDownIcon className="h-3 w-3" />}
                <span>{variation}</span>
              </div>
            )}
          </div>
          {Icon && (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className={cn(isCompact ? 'p-2' : 'p-3', 'rounded-lg', styles.iconBg)}>
                <Icon className={cn(isCompact ? 'w-4 h-4' : 'w-5 h-5', styles.iconColor)} />
              </div>
              {onDetail && (
                <button
                  type="button"
                  aria-label="Ver detalhes"
                  onClick={(e) => { e.stopPropagation(); onDetail(); }}
                  className="rounded p-0.5 text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
                >
                  <BarChart2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
        {/* Sparkline and meta bar are hidden in compact mode to keep KPI row lightweight */}
        {!isCompact && sparklineData && sparklineData.length > 1 && (
          <div className="mt-2 h-8">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData.map((v) => ({ v }))}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={variationType === 'negative' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'}
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {!isCompact && meta != null && meta > 0 && (() => {
          const realized = realizado != null ? realizado : typeof value === 'number' ? value : null;
          if (realized == null) return null;
          const pct = Math.min(Math.round((realized / meta) * 100), 100);
          const overGoal = realized >= meta;
          return (
            <div className="mt-2 space-y-0.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Meta</span>
                <span className={cn('font-medium', overGoal ? 'text-success' : 'text-foreground')}>
                  {pct}%
                </span>
              </div>
              <Progress
                value={pct}
                className={cn('h-1.5', overGoal && '[&>div]:bg-success')}
              />
            </div>
          );
        })()}
      </div>
    );
  }
);

export default SummaryCard;

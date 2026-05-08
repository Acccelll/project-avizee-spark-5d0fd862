import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import type { FluxoCaixaFinanceiroRow } from '@/types/database-views';

interface ChartPoint {
  mes: string;
  entradas_real: number;
  saidas_real: number;
  entradas_prev: number;
  saidas_prev: number;
}

interface FluxoCaixaChartProps {
  /**
   * When `true`, renders without the outer card wrapper (bg-card, border, padding),
   * and uses a responsive height to fill its container. Use this when embedding
   * inside another card (e.g. FinanceiroBlock) to avoid nested card styles.
   */
  embedded?: boolean;
}

export function FluxoCaixaChart({ embedded = false }: FluxoCaixaChartProps) {
  const [view, setView] = useState<'realizado' | 'previsto'>('realizado');
  const { data = [], isLoading: loading } = useQuery<ChartPoint[]>({
    queryKey: ['dashboard', 'fluxo-caixa-6m'],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      const dateFrom = sixMonthsAgo.toISOString().slice(0, 10);

      const { data: rows } = await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            gte: (col: string, val: string) => Promise<{
              data: FluxoCaixaFinanceiroRow[] | null;
              error: unknown;
            }>;
          };
        };
      })
        .from('vw_fluxo_caixa_financeiro')
        .select('tipo, valor, data_ref, categoria')
        .gte('data_ref', dateFrom);

      const realMap = new Map<string, { entradas_real: number; saidas_real: number }>();
      const prevMap = new Map<string, { entradas_prev: number; saidas_prev: number }>();

      for (const r of rows ?? []) {
        if (!r.data_ref) continue;
        const month = r.data_ref.slice(0, 7);
        const valor = Number(r.valor || 0);
        if (r.categoria === 'realizado') {
          const cur = realMap.get(month) || { entradas_real: 0, saidas_real: 0 };
          if (r.tipo === 'receber') cur.entradas_real += valor;
          else cur.saidas_real += valor;
          realMap.set(month, cur);
        } else {
          const cur = prevMap.get(month) || { entradas_prev: 0, saidas_prev: 0 };
          if (r.tipo === 'receber') cur.entradas_prev += valor;
          else cur.saidas_prev += valor;
          prevMap.set(month, cur);
        }
      }

      const months = Array.from(new Set([...realMap.keys(), ...prevMap.keys()])).sort();
      return months.map((m) => {
        const real = realMap.get(m) || { entradas_real: 0, saidas_real: 0 };
        const prev = prevMap.get(m) || { entradas_prev: 0, saidas_prev: 0 };
        const [year, mon] = m.split('-');
        const mesLabel = new Date(Number(year), Number(mon) - 1).toLocaleDateString('pt-BR', {
          month: 'short',
          year: '2-digit',
        });
        return {
          mes: mesLabel,
          entradas_real: real.entradas_real,
          saidas_real: real.saidas_real,
          entradas_prev: prev.entradas_prev,
          saidas_prev: prev.saidas_prev,
        };
      });
    },
    staleTime: 2 * 60 * 1000,
  });

  const showRealizado = view === 'realizado';
  const showPrevisto = view === 'previsto';
  const chartContent = (
    <>
      <defs>
        <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
          <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="hsl(0 84% 60%)" stopOpacity={0.3} />
          <stop offset="95%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
      <XAxis dataKey="mes" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
      <YAxis hide />
      <Tooltip
        formatter={(value: number, name: string) => [
          formatCurrency(value),
          name === 'entradas_real'
            ? 'Recebimentos realizados'
            : name === 'saidas_real'
              ? 'Pagamentos realizados'
              : name === 'entradas_prev'
                ? 'A receber (previsto)'
                : 'A pagar (previsto)',
        ]}
        contentStyle={{ fontSize: 12, borderRadius: 8 }}
      />
      {showRealizado && (
        <>
          <Area type="monotone" dataKey="entradas_real" stroke="hsl(142 76% 36%)" fill="url(#colorEntradas)" strokeWidth={2} />
          <Area type="monotone" dataKey="saidas_real" stroke="hsl(0 84% 60%)" fill="url(#colorSaidas)" strokeWidth={2} />
        </>
      )}
      {showPrevisto && (
        <>
          <Area type="monotone" dataKey="entradas_prev" stroke="hsl(142 76% 36%)" fill="url(#colorEntradas)" strokeWidth={2} strokeDasharray="5 3" />
          <Area type="monotone" dataKey="saidas_prev" stroke="hsl(0 84% 60%)" fill="url(#colorSaidas)" strokeWidth={2} strokeDasharray="5 3" />
        </>
      )}
    </>
  );

  if (loading) {
    if (embedded) {
      return (
        <div className="flex flex-col h-full gap-3">
          <Skeleton className="h-4 w-40 shrink-0" />
          <Skeleton className="flex-1 w-full" />
        </div>
      );
    }
    return (
      <div className="bg-card rounded-xl border p-5">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (data.length === 0) {
    if (embedded) {
      return (
        <div className="flex flex-col h-full">
          <p className="text-xs font-semibold text-foreground mb-2">Fluxo de Caixa</p>
          <p className="text-sm text-muted-foreground text-center py-4">Sem dados financeiros para exibir.</p>
        </div>
      );
    }
    return (
      <div className="bg-card rounded-xl border p-5">
        <h3 className="font-semibold text-foreground mb-4">Fluxo de Caixa</h3>
        <p className="text-sm text-muted-foreground text-center py-8">Sem dados financeiros para exibir.</p>
      </div>
    );
  }

  if (embedded) {
    const totals = data.reduce(
      (acc, p) => {
        acc.recR += p.entradas_real;
        acc.pagR += p.saidas_real;
        acc.recP += p.entradas_prev;
        acc.pagP += p.saidas_prev;
        return acc;
      },
      { recR: 0, pagR: 0, recP: 0, pagP: 0 },
    );
    const saldoR = totals.recR - totals.pagR;
    const saldoP = totals.recP - totals.pagP;
    return (
      <div
        className="flex flex-col h-full"
        role="img"
        aria-label="Gráfico de fluxo de caixa — realizados vs previstos (6 meses)"
      >
        <div className="mb-1.5 shrink-0 flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">Fluxo de Caixa</p>
            <p className="text-[10px] text-muted-foreground mono truncate">
              {showRealizado
                ? `+${formatCurrency(totals.recR)} · −${formatCurrency(totals.pagR)} · Saldo ${formatCurrency(saldoR)}`
                : `+${formatCurrency(totals.recP)} · −${formatCurrency(totals.pagP)} · Saldo ${formatCurrency(saldoP)}`}
            </p>
          </div>
          <div className="inline-flex rounded-md border border-border/60 bg-muted/30 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setView('realizado')}
              className={
                'px-2 py-0.5 rounded-sm transition-colors ' +
                (showRealizado ? 'bg-background text-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground')
              }
              aria-pressed={showRealizado}
            >
              Realizado
            </button>
            <button
              type="button"
              onClick={() => setView('previsto')}
              className={
                'px-2 py-0.5 rounded-sm transition-colors ' +
                (showPrevisto ? 'bg-background text-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground')
              }
              aria-pressed={showPrevisto}
            >
              Previsto
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>{chartContent}</AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground shrink-0">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-[hsl(142_76%_36%)] inline-block" />
            {showRealizado ? 'Recebido' : 'A receber'}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-[hsl(0_84%_60%)] inline-block" />
            {showRealizado ? 'Pago' : 'A pagar'}
          </span>
        </div>
        {/* Accessible data table for screen readers */}
        <div className="sr-only">
          <table>
            <caption>Fluxo de Caixa — Realizado vs Previsto (6 meses)</caption>
            <thead><tr><th>Mês</th><th>Recebimentos Realizados</th><th>Pagamentos Realizados</th><th>A Receber (Previsto)</th><th>A Pagar (Previsto)</th></tr></thead>
            <tbody>{data.map((p) => (<tr key={p.mes}><td>{p.mes}</td><td>{formatCurrency(p.entradas_real)}</td><td>{formatCurrency(p.saidas_real)}</td><td>{formatCurrency(p.entradas_prev)}</td><td>{formatCurrency(p.saidas_prev)}</td></tr>))}</tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <figure className="bg-card rounded-xl border p-5" role="img" aria-label="Gráfico de área do fluxo de caixa dos últimos seis meses com séries de recebimentos e pagamentos realizados e previstos.">
      <h3 className="font-semibold text-foreground mb-4">Fluxo de Caixa — Realizado vs Previsto (6 meses)</h3>
      <div
        role="img"
        aria-label={`Gráfico de área: fluxo de caixa dos últimos 6 meses. ${data.map((p) => `${p.mes}: recebimentos realizados ${formatCurrency(p.entradas_real)}, pagamentos realizados ${formatCurrency(p.saidas_real)}`).join('; ')}`}
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data}>{chartContent}</AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Accessible data table for screen readers */}
      <div className="sr-only">
        <table>
          <caption>Fluxo de Caixa — Realizado vs Previsto (6 meses)</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col">Recebimentos Realizados</th>
              <th scope="col">Pagamentos Realizados</th>
              <th scope="col">A Receber (Previsto)</th>
              <th scope="col">A Pagar (Previsto)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.mes}>
                <td>{p.mes}</td>
                <td>{formatCurrency(p.entradas_real)}</td>
                <td>{formatCurrency(p.saidas_real)}</td>
                <td>{formatCurrency(p.entradas_prev)}</td>
                <td>{formatCurrency(p.saidas_prev)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-6 mt-3 text-xs text-muted-foreground justify-center flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[hsl(142_76%_36%)]" />Recebimentos realizados
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[hsl(0_84%_60%)]" />Pagamentos realizados
        </span>
        <span className="flex items-center gap-1.5 opacity-60">
          <span className="w-3 border-t border-dashed border-[hsl(142_76%_36%)]" />A receber (previsto)
        </span>
        <span className="flex items-center gap-1.5 opacity-60">
          <span className="w-3 border-t border-dashed border-[hsl(0_84%_60%)]" />A pagar (previsto)
        </span>
      </div>
      <figcaption className="sr-only">
        O gráfico compara recebimentos e pagamentos realizados com valores previstos para facilitar o acompanhamento do caixa.
      </figcaption>
    </figure>
  );
}

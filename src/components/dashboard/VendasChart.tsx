import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardPeriod } from '@/contexts/DashboardPeriodContext';

interface VendasPoint {
  mes: string;
  valor: number;
  rawDate: string;
}

interface VendasChartProps {
  /** Called with the ISO month string (YYYY-MM) when user clicks a bar. */
  onBarClick?: (monthStart: string, monthEnd: string) => void;
}

/** Converts a "YYYY-MM" string into {label, start, end}. */
function parseMonth(rawDate: string) {
  const [year, mon] = rawDate.split('-');
  const y = Number(year);
  const m = Number(mon);
  const label = new Date(y, m - 1).toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
  });
  const start = `${year}-${mon}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${year}-${mon}-${String(lastDay).padStart(2, '0')}`;
  return { label, start, end };
}

export function VendasChart({ onBarClick }: VendasChartProps) {
  const navigate = useNavigate();
  const { range } = useDashboardPeriod();
  const { data = [], isLoading: loading } = useQuery<VendasPoint[]>({
    queryKey: ['dashboard', 'vendas-6m', range.dateTo],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      const dateFrom = sixMonthsAgo.toISOString().slice(0, 10);
      const dateTo = range.dateTo || new Date().toISOString().slice(0, 10);

      const { data: rows } = await supabase
        .from('notas_fiscais')
        .select('valor_total, data_emissao')
        .eq('ativo', true)
        .eq('tipo', 'saida')
        .in('status', ['confirmada', 'importada'])
        .gte('data_emissao', dateFrom)
        .lte('data_emissao', dateTo);

      const monthMap = new Map<string, number>();
      for (const row of rows || []) {
        const month = (row.data_emissao as string).slice(0, 7);
        monthMap.set(month, (monthMap.get(month) ?? 0) + Number(row.valor_total || 0));
      }

      // Sempre devolve 6 meses (atual + 5 anteriores), preenchendo zeros para
      // garantir um eixo X estável e leitura visual previsível.
      const today = new Date();
      const months: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      return months.map((month) => ({
        mes: parseMonth(month).label,
        valor: monthMap.get(month) ?? 0,
        rawDate: month,
      }));
    },
    staleTime: 2 * 60 * 1000,
  });

interface RechartsClickPayload {
  activePayload?: Array<{ payload: VendasPoint }>;
}

  const handleBarClick = (payload: RechartsClickPayload) => {
    if (!payload?.activePayload?.[0]) return;
    const point = payload.activePayload[0].payload as VendasPoint;
    const { start, end } = parseMonth(point.rawDate);

    if (onBarClick) {
      onBarClick(start, end);
    } else {
      navigate(`/relatorios?tipo=vendas&di=${start}&df=${end}`);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full space-y-3">
        <Skeleton className="h-5 w-48 shrink-0" />
        <Skeleton className="flex-1 w-full min-h-[160px]" />
      </div>
    );
  }

  const total = data.reduce((acc, p) => acc + p.valor, 0);
  const melhor = data.reduce<VendasPoint | null>((best, p) => (!best || p.valor > best.valor ? p : best), null);
  const currentRaw = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  })();
  const compactCurrency = (v: number) =>
    v >= 1000 ? `R$ ${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `R$ ${v.toFixed(0)}`;

  return (
    <figure
      role="img"
      aria-label="Gráfico de barras de faturamento mensal dos últimos 6 meses. Clique em uma barra para detalhar o relatório de vendas."
      className="flex flex-col h-full"
    >
      <div className="mb-2 shrink-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className="font-semibold text-foreground text-sm">
          Faturamento — últimos 6 meses
          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(janela fixa)</span>
        </h3>
        <span className="text-[11px] text-muted-foreground">
          Total: <strong className="font-semibold text-foreground mono">{formatCurrency(total)}</strong>
          {melhor && melhor.valor > 0 && (
            <>
              {' · '}Melhor mês:{' '}
              <strong className="font-semibold text-foreground">{melhor.mes}</strong>
            </>
          )}
        </span>
      </div>
      <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          onClick={handleBarClick}
          style={{ cursor: 'pointer' }}
          margin={{ top: 18, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
          <YAxis hide />
          <Tooltip
            formatter={(value: number) => [formatCurrency(value), 'Faturamento']}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar
            dataKey="valor"
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          >
            {data.map((p) => (
              <Cell
                key={p.rawDate}
                fill={
                  p.rawDate === currentRaw
                    ? 'hsl(var(--primary))'
                    : 'hsl(var(--primary) / 0.5)'
                }
              />
            ))}
            <LabelList
              dataKey="valor"
              position="top"
              className="hidden md:block"
              formatter={(v: number) => (v > 0 ? compactCurrency(v) : '')}
              style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Clique em uma barra para navegar ao relatório de vendas filtrado pelo mês correspondente.
      </figcaption>
    </figure>
  );
}

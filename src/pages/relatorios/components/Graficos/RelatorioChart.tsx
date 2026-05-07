/**
 * RelatorioChart — displays the report summary chart (bar / pie / line) plus
 * a compact legend list below.
 *
 * Accepts the raw `chartData` from RelatorioResultado and the chart type
 * derived from the report configuration.
 */

import type React from "react";
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { ChartType } from "@/config/relatoriosConfig";

export interface ChartDataPoint {
  name: string;
  value: number;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(262 83% 58%)",
];

export interface RelatorioChartProps {
  chartData: ChartDataPoint[];
  chartType: ChartType;
  isQuantityReport?: boolean;
  contextLabel?: string;
  importance?: 'central' | 'complementar';
  onDataPointClick?: (point: ChartDataPoint) => void;
}

export function RelatorioChart({
  chartData,
  chartType,
  isQuantityReport = false,
  contextLabel,
  importance = 'complementar',
  onDataPointClick,
}: RelatorioChartProps) {
  const usePie = chartType === "pie";
  const useLine = chartType === "line";
  const formatValue = (v: number) =>
    isQuantityReport ? formatNumber(v) : formatCurrency(v);

  /** Recharts activeDot onClick receives (event, payload) with extra positional args. */
  const handleActiveDotClick: React.MouseEventHandler<SVGCircleElement> | undefined =
    onDataPointClick
      ? ((...args: unknown[]) => {
          const payload = args[1] as { payload?: ChartDataPoint } | undefined;
          if (payload?.payload) onDataPointClick(payload.payload);
        }) as React.MouseEventHandler<SVGCircleElement>
      : undefined;

  const chartIcon = useLine ? (
    <LineChartIcon className="h-4 w-4 text-muted-foreground" />
  ) : usePie ? (
    <PieChartIcon className="h-4 w-4 text-muted-foreground" />
  ) : (
    <BarChart3 className="h-4 w-4 text-muted-foreground" />
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Resumo Visual {chartIcon}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {contextLabel || 'Consolidação gráfica dos principais agrupamentos do relatório.'}
          <span className="ml-1">·</span>
          <span className="ml-1">{importance === 'central' ? 'Visão central para análise' : 'Leitura complementar da tabela'}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {chartData.length > 0 ? (
          <>
            <div className="h-56 min-h-[224px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={200}>
                {useLine ? (
                  <LineChart data={chartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis hide />
                    <Tooltip formatter={(v: number) => formatValue(v)} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      activeDot={handleActiveDotClick ? { r: 5, style: { cursor: 'pointer' }, onClick: handleActiveDotClick } : { r: 5 }}
                    />
                  </LineChart>
                ) : usePie ? (
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                      paddingAngle={3}
                      onClick={onDataPointClick}
                      style={onDataPointClick ? { cursor: 'pointer' } : undefined}
                    >
                      {chartData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" height={36} />
                    <Tooltip formatter={(v: number) => formatValue(v)} />
                  </PieChart>
                ) : (
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={chartData.length > 8 ? 'preserveStartEnd' : 0} />
                    <YAxis hide />
                    <Tooltip formatter={(v: number) => formatValue(v)} />
                    <Bar
                      dataKey="value"
                      radius={[6, 6, 0, 0]}
                      fill="hsl(var(--primary))"
                      onClick={onDataPointClick}
                      style={onDataPointClick ? { cursor: 'pointer' } : undefined}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {chartData.slice(0, 6).map((item, i) => (
                <div
                  key={`${item.name}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                    <span className="text-sm font-medium truncate">{item.name}</span>
                  </div>
                  <span className="text-sm font-mono font-semibold tabular-nums flex-shrink-0">
                    {formatValue(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            O resumo gráfico aparecerá conforme o relatório possuir dados
            consolidados.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

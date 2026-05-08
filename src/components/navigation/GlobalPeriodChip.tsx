import { useContext } from "react";
import { useLocation } from "react-router-dom";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useGlobalPeriod,
  type DashboardPeriod,
} from "@/contexts/DashboardPeriodContext";

const PRESETS: { value: DashboardPeriod; label: string; short: string }[] = [
  { value: "today", label: "Hoje", short: "Hoje" },
  { value: "week", label: "Esta semana", short: "Semana" },
  { value: "month", label: "Este mês", short: "Mês" },
  { value: "30d", label: "Últimos 30 dias", short: "30d" },
];

/**
 * GlobalPeriodChip — seletor compacto de período no header global mobile.
 *
 * Lê/escreve no `GlobalPeriodContext` (alias do `DashboardPeriodContext`).
 * Renderiza apenas se o provider estiver montado acima — caso contrário,
 * é silencioso (no-op) para permitir uso defensivo no AppHeader.
 *
 * Páginas que mantêm seu próprio `<PeriodFilter>` local seguem funcionando;
 * o chip global serve como default transversal e como fonte de verdade
 * para novas telas.
 */
export function GlobalPeriodChip({ className }: { className?: string }) {
  // Defensive: o contexto pode não estar montado em rotas de auth/onboarding.
  // Como `useGlobalPeriod` lança quando ausente, replicamos a checagem com
  // useContext direto.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = useSafeGlobalPeriod();
  const location = useLocation();
  // Esconder no Dashboard (`/`): a tela já tem seu próprio seletor de período
  // (DashboardHeader/MobileDashboardHeader). Evita dois controles redundantes.
  if (!ctx || location.pathname === "/") return null;

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
  } = ctx;

  const activePreset = PRESETS.find((p) => p.value === period);
  const label = period === "custom"
    ? `${range.dateFrom} → ${range.dateTo}`
    : activePreset?.short ?? "Período";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 gap-1.5 rounded-full px-3 text-xs", className)}
          aria-label={`Período: ${label}`}
          data-help-id="dashboard.globalPeriod"
        >
          <CalendarRange className="h-3.5 w-3.5" />
          <span className="font-medium">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-3">
          <div>
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">
              Presets
            </Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.value}
                  variant={period === p.value ? "default" : "outline"}
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">
              Personalizado
            </Label>
            <div className="mt-1.5 flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] text-muted-foreground">De</Label>
                <Input
                  type="date"
                  value={customStartDraft}
                  onChange={(e) => setCustomStartDraft(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Até</Label>
                <Input
                  type="date"
                  value={customEndDraft}
                  onChange={(e) => setCustomEndDraft(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="default"
              className="mt-2 h-9 w-full text-xs"
              disabled={!customRangeDirty || customRangeInvalid}
              onClick={() => {
                if (applyCustomRange()) setPeriod("custom");
              }}
            >
              Aplicar período personalizado
            </Button>
            {customRangeInvalid && (
              <p className="mt-1 text-[10px] text-destructive">
                Intervalo inválido: data inicial deve ser ≤ final.
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Internal: avoids throwing when provider is absent (rotas públicas).
function useSafeGlobalPeriod() {
  try {
    return useGlobalPeriod();
  } catch {
    return null;
  }
}
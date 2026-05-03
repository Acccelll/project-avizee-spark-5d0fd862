import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string; // YYYY-MM ou ""
  onChange: (v: string) => void;
  label: string;
  /** Quantos anos para trás listar (default 3). */
  yearsBack?: number;
  className?: string;
}

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function formatLabel(v: string): string {
  if (!v) return "";
  const [y, m] = v.split("-").map(Number);
  if (!y || !m) return v;
  return `${MESES[m - 1]}/${String(y).slice(-2)}`;
}

export function MonthPicker({ value, onChange, label, yearsBack = 3, className }: Props) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const selectedYear = value ? Number(value.split("-")[0]) : currentYear;
  const selectedMonth = value ? Number(value.split("-")[1]) : null;

  const set = (y: number, m: number) => {
    onChange(`${y}-${String(m).padStart(2, "0")}`);
  };

  const minYear = currentYear - yearsBack;
  const maxYear = currentYear + 1;
  const stepYear = (delta: number) => {
    const next = Math.min(maxYear, Math.max(minYear, selectedYear + delta));
    set(next, selectedMonth ?? currentMonth);
  };

  const hasValue = !!value;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-1.5 px-2.5 text-xs font-normal",
            !hasValue && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          <span className="text-[10px] uppercase font-bold tracking-wider">{label}</span>
          <span className="font-medium">{hasValue ? formatLabel(value) : "Todos"}</span>
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar"
              className="ml-0.5 rounded hover:bg-muted p-0.5"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange("");
              }}
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={selectedYear <= minYear}
                onClick={() => stepYear(-1)}
                aria-label="Ano anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-sm font-semibold tabular-nums min-w-[3ch] text-center">
                {selectedYear}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={selectedYear >= maxYear}
                onClick={() => stepYear(1)}
                aria-label="Próximo ano"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MESES.map((nome, i) => {
              const m = i + 1;
              const isActive = selectedMonth === m && Number(value.split("-")[0]) === selectedYear;
              const isFuture = selectedYear === currentYear && m > currentMonth;
              return (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={isActive ? "default" : "outline"}
                  className={cn("h-8 text-xs", isFuture && "opacity-50")}
                  onClick={() => set(selectedYear, m)}
                >
                  {nome}
                </Button>
              );
            })}
          </div>
          {hasValue && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => onChange("")}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Limpar filtro
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
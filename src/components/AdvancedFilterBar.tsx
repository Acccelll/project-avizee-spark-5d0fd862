import { ReactNode, useState } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerClose,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

export interface FilterChip {
  key: string;
  label: string;
  value: string | string[];
  displayValue: string;
  mobileCard?: boolean;
  mobilePrimary?: boolean;
}

interface AdvancedFilterBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
  activeFilters?: FilterChip[];
  onRemoveFilter?: (key: string, value?: string) => void;
  onClearAll?: () => void;
  count?: number;
  /** Hide the inline count chip (e.g. when ModulePage already shows it). */
  hideCount?: boolean;
  extra?: ReactNode;
}

export function AdvancedFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  children,
  activeFilters = [],
  onRemoveFilter,
  onClearAll,
  count,
  hideCount = false,
  extra,
}: AdvancedFilterBarProps) {
  const showCount = !hideCount && count !== undefined;
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasSearch = typeof onSearchChange === "function";
  const hasActiveFilters = activeFilters.length > 0;
  const activeCount = activeFilters.length;

  const filterChips = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground font-medium">Filtros:</span>
      {activeFilters.map((chip) => (
        <Badge key={`${chip.key}-${chip.displayValue}`} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
          <span className="text-muted-foreground">{chip.label}:</span>
          <span className="font-medium">{chip.displayValue}</span>
          {onRemoveFilter && (
            <button
              type="button"
              onClick={() => onRemoveFilter(chip.key, Array.isArray(chip.value) ? chip.value[0] : chip.value as string)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              aria-label={`Remover filtro ${chip.label}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}
      {onClearAll && activeFilters.length >= 1 && (
        <Button variant="ghost" size="sm" onClick={onClearAll} className="h-6 px-2 text-xs text-muted-foreground">
          Limpar filtros
        </Button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className="mb-4 space-y-2">
        <div className="flex gap-2">
          {hasSearch && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9 pr-8 h-11"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => onSearchChange?.("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {children && (
            <Button
              variant="outline"
              className="relative h-11 shrink-0 gap-2 px-3"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir filtros"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="text-sm">Filtros</span>
              {activeCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </Button>
          )}
          {extra && <div className="shrink-0">{extra}</div>}
        </div>

        {hasActiveFilters && filterChips}

        {showCount && (
          <p className="text-xs text-muted-foreground">
            {count} {count === 1 ? "registro" : "registros"}
          </p>
        )}

        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="text-left">
              <div className="flex items-center justify-between gap-2">
                <DrawerTitle>Filtros</DrawerTitle>
                <DrawerClose asChild>
                  <button
                    type="button"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Fechar filtros"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </DrawerClose>
              </div>
              <DrawerDescription>Refine os resultados por critérios específicos.</DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-4">
              <div className="flex flex-col gap-4 [&>*]:!w-full [&_button[role=combobox]]:!w-full [&_[data-radix-popper-content-wrapper]]:!w-full">
                {children}
              </div>
            </div>
            <DrawerFooter className="pt-2">
              {onClearAll && activeCount > 0 && (
                <Button
                  variant="outline"
                  onClick={() => { onClearAll(); setDrawerOpen(false); }}
                >
                  Limpar filtros
                </Button>
              )}
              <Button onClick={() => setDrawerOpen(false)}>
                Ver resultados{count !== undefined ? ` (${count})` : ""}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          {hasSearch && (
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9 pr-8"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => onSearchChange?.("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
        </div>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          {extra}
          {showCount && (
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              {count} {count === 1 ? "registro" : "registros"}
            </span>
          )}
        </div>
      </div>

      {hasActiveFilters && filterChips}
    </div>
  );
}

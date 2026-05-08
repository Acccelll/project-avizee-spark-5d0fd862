import { Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface MobileQuickAddFABProps {
  onClick: () => void;
  label?: string;
  /** Posição vertical em rem a partir do bottom (acima do MobileBottomNav). */
  bottomOffset?: string;
  className?: string;
}

/**
 * Botão flutuante "+" para criação rápida em listagens mobile.
 * Posicionado acima do MobileBottomNav (que ocupa ~4rem no bottom).
 * Chama `onClick` ao tocar — tipicamente abre um QuickAdd*Modal.
 */
export function MobileQuickAddFAB({
  onClick,
  label = "Novo",
  bottomOffset = "5.25rem",
  className,
}: MobileQuickAddFABProps) {
  const isMobile = useIsMobile();
  if (!isMobile) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{ bottom: bottomOffset }}
      className={cn(
        "fixed right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full",
        "bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background",
        "active:scale-95 transition-transform",
        className,
      )}
    >
      <Plus className="h-6 w-6" strokeWidth={2.5} />
    </button>
  );
}
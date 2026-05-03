/**
 * `EmBreve` — marcador padronizado para funcionalidades planejadas mas não
 * implementadas. Substitui badges/labels inline "Em breve" espalhados pelo
 * código (Fiscal, Admin, Faturamento) garantindo um único contrato visual e
 * de acessibilidade.
 *
 * Modos:
 *  - `badge` (default): apenas o pill "Em breve" (use ao lado de um título).
 *  - `wrap`: envolve um botão/elemento, força `disabled` + tooltip e mostra
 *    o pill ao lado. Usar para botões já visíveis (Buscar por chave, QR).
 *
 * @example
 * <EmBreve />                  // badge solto
 * <EmBreve mode="wrap"><Button>Buscar por chave</Button></EmBreve>
 */
import { cloneElement, isValidElement, ReactElement, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface EmBreveProps {
  mode?: "badge" | "wrap";
  /** Texto custom do tooltip (mode=wrap). */
  tooltip?: string;
  /** Classes extras no badge. */
  className?: string;
  children?: ReactNode;
}

export function EmBreve({
  mode = "badge",
  tooltip = "Funcionalidade em desenvolvimento — disponível em breve.",
  className,
  children,
}: EmBreveProps) {
  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "border-warning/40 text-warning text-[10px] uppercase tracking-wider font-medium",
        className,
      )}
    >
      Em breve
    </Badge>
  );

  if (mode === "badge") return badge;

  let disabledChild: ReactNode = children;
  if (isValidElement(children)) {
    disabledChild = cloneElement(children as ReactElement<Record<string, unknown>>, {
      disabled: true,
      "aria-disabled": true,
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      },
    });
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 cursor-not-allowed">
          {disabledChild}
          <span className="hidden md:inline">{badge}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <span className="text-xs leading-snug">{tooltip}</span>
      </TooltipContent>
    </Tooltip>
  );
}
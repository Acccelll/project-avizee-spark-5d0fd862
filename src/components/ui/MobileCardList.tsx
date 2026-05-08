import { type ReactNode, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

export interface MobileCardField<T> {
  key: string;
  label: string;
  render?: (item: T) => ReactNode;
  primary?: boolean;
  /** Marca como identificador secundário (CNPJ, SKU, código). Renderizado em mono cinza abaixo do primary. */
  identifier?: boolean;
}

interface MobileCardListProps<T extends { id?: string }> {
  items: T[];
  fields: MobileCardField<T>[];
  onItemClick?: (item: T) => void;
  actions?: (item: T) => ReactNode;
  /**
   * Pill de status renderizada no canto superior direito do card,
   * antes do menu `actions`. Use para destacar o estado do registro
   * (status do orçamento, pedido, etc.) — substitui a renderização
   * como detail-field cinza.
   */
  statusBadge?: (item: T) => ReactNode;
  /** Ícones de ação rápida (até 3) renderizados no rodapé do card (📞 Wpp ✉ 👁). Cada um é um botão 36px touch-friendly. */
  actionsInline?: (item: T) => ReactNode;
  /**
   * Ação primária mobile — botão grande full-width renderizado no rodapé do card,
   * acima dos `actionsInline`. Use para a próxima ação esperada do fluxo
   * (Aprovar / Gerar Pedido / Faturar / Enviar). Retorne `null` para ocultar
   * em itens sem ação aplicável.
   */
  primaryAction?: (item: T) => ReactNode;
  /** Long-press abre bottom-sheet de ações destrutivas. */
  onLongPress?: (item: T) => void;
  /** Suprime a renderização da linha identifier (CNPJ/SKU) — útil quando o
   *  primary já carrega os metadados. */
  hideIdentifier?: boolean;
  /** Quando true, renderiza detail-fields como pares `label: valor` em grid
   *  2-col, ao invés do flex inline cinza. Útil em cards com KPIs (estoque,
   *  preço, margem) onde os rótulos ajudam a leitura. */
  labeledDetails?: boolean;
  /** Virtualiza lista quando items > 100 (default true). Desligue para listas curtas em containers sem altura definida. */
  virtualize?: boolean;
  className?: string;
  emptyMessage?: string;
}

/**
 * Renders a list of items as touch-friendly cards for mobile.
 * Intended for use in modals, drawers, or any place where DataTable is not used.
 */
export function MobileCardList<T extends { id?: string }>({
  items,
  fields,
  onItemClick,
  actions,
  statusBadge,
  actionsInline,
  primaryAction,
  onLongPress,
  hideIdentifier = false,
  labeledDetails = false,
  virtualize = true,
  className,
  emptyMessage = "Nenhum item encontrado.",
}: MobileCardListProps<T>) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  const primaryField = fields.find((f) => f.primary) ?? fields[0];
  const identifierField = hideIdentifier ? undefined : fields.find((f) => f.identifier);
  const detailFields = fields.filter((f) => !f.primary && !f.identifier);

  const renderValue = (item: T, field: MobileCardField<T>): ReactNode => {
    if (field.render) return field.render(item);
    const val = (item as Record<string, unknown>)[field.key];
    return val != null ? String(val) : "—";
  };

  const renderCard = (item: T, idx: number) => {
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    const startPress = () => {
      if (!onLongPress) return;
      pressTimer = setTimeout(() => onLongPress(item), 500);
    };
    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    return (
      <div
        key={item.id ?? idx}
        className={cn(
          "relative rounded-xl border bg-card px-3.5 py-2.5 transition-colors active:bg-muted/60",
          onItemClick && "cursor-pointer",
        )}
        onClick={() => onItemClick?.(item)}
        onTouchStart={startPress}
        onTouchEnd={cancelPress}
        onTouchMove={cancelPress}
        onTouchCancel={cancelPress}
        onContextMenu={(e) => {
          if (onLongPress) {
            e.preventDefault();
            onLongPress(item);
          }
        }}
      >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              {/* Primary: title forte */}
              {primaryField && (
                <div className="font-semibold text-[15px] leading-snug truncate">
                  {renderValue(item, primaryField)}
                </div>
              )}
              {/* Identifier (CNPJ/SKU/código): mono cinza */}
              {identifierField && (
                <div className="font-mono text-xs text-muted-foreground truncate">
                  {renderValue(item, identifierField)}
                </div>
              )}
              {/* Detalhes secundários */}
              {detailFields.length > 0 && (
                labeledDetails ? (
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                    {detailFields.map((field) => (
                      <div key={field.key} className="min-w-0">
                        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/80 leading-none">
                          {field.label}
                        </dt>
                        <dd className="text-xs text-foreground min-w-0 truncate mt-0.5">
                          {renderValue(item, field)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-0.5">
                    {detailFields.map((field) => (
                      <div key={field.key} className="text-xs text-muted-foreground min-w-0 truncate">
                        {renderValue(item, field)}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
            {/* Menu ⋮ no canto */}
            {(statusBadge || actions) && (
              <div
                className="flex shrink-0 items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                {statusBadge?.(item)}
                {actions?.(item)}
              </div>
            )}
          </div>
          {/* Ações rápidas inline (📞 Wpp ✉ etc) — rodapé tap-friendly */}
          {primaryAction && (() => {
            const node = primaryAction(item);
            if (!node) return null;
            return (
              <div
                className="mt-2 border-t border-border/40 pt-2"
                onClick={(e) => e.stopPropagation()}
              >
                {node}
              </div>
            );
          })()}
          {actionsInline && (
            <div
              className={cn(
                "flex items-center gap-1.5 pt-2",
                primaryAction ? "mt-1" : "mt-2 border-t border-border/40",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {actionsInline(item)}
            </div>
          )}
      </div>
    );
  };

  // Virtualização ativa apenas para listas longas (>100 itens) — evita complexidade desnecessária
  if (virtualize && items.length > 100) {
    return (
      <VirtualizedCardList
        items={items}
        renderCard={renderCard}
        className={className}
      />
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {items.map((item, idx) => renderCard(item, idx))}
    </div>
  );
}

function VirtualizedCardList<T>({
  items,
  renderCard,
  className,
}: {
  items: T[];
  renderCard: (item: T, idx: number) => ReactNode;
  className?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 92,
    overscan: 8,
  });

  return (
    <div
      ref={parentRef}
      className={cn("max-h-[70vh] overflow-y-auto", className)}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vRow.start}px)`,
              paddingBottom: 6,
            }}
          >
            {renderCard(items[vRow.index], vRow.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

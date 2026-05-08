import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * DrawerHeaderShell — padronização visual do topo de TODOS os drawers do projeto.
 *
 * Estrutura em 3 zonas (de cima para baixo):
 *  1. HEADER GLOBAL  → título + breadcrumb/contexto à esquerda · controles globais à direita
 *  2. BARRA DE RESUMO DO REGISTRO  → faixa compacta com dados-chave (chips/badges/KPIs)
 *  3. LINHA DE AÇÕES DO REGISTRO   → botões editar/excluir/etc. integrados ao topo
 *
 * Todas as zonas são opcionais. Apenas o título é obrigatório (acessibilidade).
 *
 * Uso típico:
 * ```tsx
 * <DrawerHeaderShell
 *   title="Detalhes do Produto"
 *   breadcrumb={<>Cadastros › Produtos · Produto · cx001</>}
 *   counter={{ index: 0, total: 5 }}
 *   globalControls={<button>×</button>}
 *   recordSummary={<IdentityCard />}
 *   recordActions={<EditButton />}
 * />
 * ```
 */
export interface DrawerHeaderShellProps {
  /** Título principal do drawer (peso visual forte). */
  title: ReactNode;
  /** Linha de contexto/breadcrumb logo abaixo do título. */
  breadcrumb?: ReactNode;
  /** Badge "X de N" — exibido como chip ao lado do breadcrumb. */
  counter?: { index: number; total: number };
  /** Controles globais à direita (ex: Fechar todos, X). */
  globalControls?: ReactNode;
  /** Faixa de resumo do registro (identity card, KPIs, status). */
  recordSummary?: ReactNode;
  /** Linha de ações do registro (Editar, Excluir, Mais). */
  recordActions?: ReactNode;
  /** Slot opcional logo abaixo do header global (ex: barra de navegação entre drawers). */
  navigationBar?: ReactNode;
  className?: string;
}

export function DrawerHeaderShell({
  title,
  breadcrumb,
  counter,
  globalControls,
  recordSummary,
  recordActions,
  navigationBar,
  className,
}: DrawerHeaderShellProps) {
  const hasBreadcrumbRow = Boolean(breadcrumb) || Boolean(counter);

  return (
    <div
      className={cn(
        "sticky top-0 z-20 bg-card border-b shadow-sm",
        className,
      )}
    >
      {/* Zona 1 — Header global */}
      <div className="px-3 sm:px-6 pt-2 pb-1.5 sm:pt-3 sm:pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-semibold leading-tight text-foreground truncate">
              {title}
            </h2>
            {hasBreadcrumbRow && (
              <div className="mt-0.5 hidden sm:flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                {breadcrumb && (
                  <span className="truncate">{breadcrumb}</span>
                )}
                {counter && (
                  <span className="inline-flex items-center rounded-full border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                    {counter.index + 1} de {counter.total}
                  </span>
                )}
              </div>
            )}
            {/* Counter compacto no mobile só quando há mais de 1 drawer */}
            {counter && counter.total > 1 && (
              <div className="mt-0.5 sm:hidden">
                <span className="inline-flex items-center rounded-full border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {counter.index + 1} de {counter.total}
                </span>
              </div>
            )}
          </div>
          {globalControls && (
            <div className="flex items-center gap-1 shrink-0">{globalControls}</div>
          )}
        </div>
      </div>

      {/* Barra de navegação entre drawers (opcional) */}
      {navigationBar && (
        <div className="px-4 sm:px-6 py-1.5 border-t bg-muted/20">{navigationBar}</div>
      )}

      {/* Zona 2 — Resumo do registro */}
      {recordSummary && (
        <div className="px-4 sm:px-6 py-2.5 border-t bg-muted/15">
          {recordSummary}
        </div>
      )}

      {/* Zona 3 — Ações do registro */}
      {recordActions && (
        <div className="px-3 sm:px-6 py-2 border-t bg-card flex items-center justify-between sm:justify-end gap-1.5 flex-wrap">
          {recordActions}
        </div>
      )}
    </div>
  );
}

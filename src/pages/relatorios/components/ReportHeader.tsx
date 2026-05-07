/**
 * ReportHeader — cabeçalho unificado de um relatório ativo.
 *
 * Substitui o bloco "[← Voltar] + Card title" disperso por um header coeso com:
 *  - breadcrumb leve "Categoria · Relatório"
 *  - título e descrição
 *  - chip de período em destaque
 *  - slot de ações secundárias (refresh, salvar/carregar favoritos)
 *
 * Ações de exportação ficam na ReportToolbar; este header só carrega contexto
 * e ações de gestão do próprio relatório.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Calendar, MoreVertical, Clock } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ReportHeaderProps {
  categoryLabel?: string;
  categoryIcon?: LucideIcon;
  title: string;
  description?: string;
  /** Texto pronto do período (ex: "01/01/2025 a 31/01/2025"). */
  periodLabel?: string;
  /** Total de registros visíveis. */
  recordCount?: number;
  periodAxisLabel?: string;
  /** Timestamp (ms) da última atualização dos dados — fonte: react-query `dataUpdatedAt`. */
  updatedAt?: number;
  /** Callback para o botão Voltar. */
  onBack: () => void;
  /** Ações secundárias (refresh, salvar/carregar). Renderizadas à direita. */
  actions?: ReactNode;
}

export function ReportHeader({
  categoryLabel,
  categoryIcon: CategoryIcon,
  title,
  description,
  periodLabel,
  recordCount,
  periodAxisLabel,
  updatedAt,
  onBack,
  actions,
}: ReportHeaderProps) {
  const isMobile = useIsMobile();

  const updatedLabel = formatRelative(updatedAt);

  if (isMobile) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1 -ml-2 min-h-11 px-2"
            aria-label="Voltar para lista de relatórios"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">Voltar</span>
          </Button>
          {actions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11"
                  aria-label="Mais ações"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-[calc(100vw-2rem)] max-w-xs p-2 flex flex-col gap-1"
              >
                {actions}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground leading-tight truncate">
            {title}
          </h2>
          {periodLabel && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{periodLabel}</span>
              {recordCount != null && (
                <span className="ml-1 flex-shrink-0">· {recordCount} reg</span>
              )}
              {updatedLabel && (
                <span className="ml-1 flex-shrink-0 inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {updatedLabel}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Linha 1: voltar + breadcrumb + chip período */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1.5 -ml-2 h-8 px-2"
            aria-label="Voltar para lista de relatórios"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </Button>
          {categoryLabel && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {CategoryIcon && <CategoryIcon className="h-3.5 w-3.5" />}
              <span>{categoryLabel}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="font-medium text-foreground">{title}</span>
            </div>
          )}
        </div>
        {periodLabel && (
          <Badge variant="secondary" className="gap-1.5 font-normal">
            <Calendar className="h-3 w-3" />
            {periodLabel}
            {recordCount != null && (
              <span className="ml-1 text-muted-foreground">· {recordCount} registros</span>
            )}
            {periodAxisLabel ? <span className="ml-1 text-muted-foreground">· eixo: {periodAxisLabel}</span> : null}
            {updatedLabel ? (
              <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" /> atualizado {updatedLabel}
              </span>
            ) : null}
          </Badge>
        )}
      </div>

      {/* Linha 2: título + descrição + ações secundárias */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-foreground leading-tight">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

function formatRelative(ts?: number): string | null {
  if (!ts) return null;
  const diff = Date.now() - ts;
  if (diff < 0 || diff < 30_000) return 'agora';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

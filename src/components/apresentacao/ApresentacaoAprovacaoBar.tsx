import { CheckCircle2, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ApresentacaoGeracao } from '@/types/apresentacao';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ApresentacaoAprovacaoBar({
  geracao,
  canAprovar,
  comentariosCount = 0,
  onEnviarRevisao,
  onAprovarGerar,
}: {
  geracao: ApresentacaoGeracao | null;
  canAprovar: boolean;
  /** Onda 9.4 (M-06) — bloqueia aprovação quando ainda não há comentários revisados. */
  comentariosCount?: number;
  onEnviarRevisao: () => Promise<void>;
  onAprovarGerar: () => Promise<void>;
}) {
  if (!geracao) return null;

  const semComentarios = comentariosCount === 0;
  const aprovarDisabled = semComentarios;
  const tooltipMsg = semComentarios
    ? 'Inclua ao menos um comentário antes de aprovar a versão final.'
    : null;

  return (
    <div className="rounded-md border p-3 flex items-center justify-between gap-3 bg-muted/30">
      <div>
        <p className="text-sm font-medium">Fluxo editorial</p>
        <p className="text-xs text-muted-foreground">
          Status atual: {geracao.status_editorial ?? 'rascunho'}
          {comentariosCount > 0 && ` · ${comentariosCount} comentário(s)`}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onEnviarRevisao}>
          <FileCheck2 className="h-4 w-4 mr-1" />Enviar para revisão
        </Button>
        {canAprovar && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="sm" onClick={onAprovarGerar} disabled={aprovarDisabled}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />Aprovar e gerar final
                  </Button>
                </span>
              </TooltipTrigger>
              {tooltipMsg && <TooltipContent>{tooltipMsg}</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

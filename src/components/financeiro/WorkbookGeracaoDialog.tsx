import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { WorkbookParametrosCard } from './WorkbookParametrosCard';
import { WORKBOOK_SHEET_GROUPS } from '@/lib/workbook/templateMap';
import type { WorkbookTemplate, WorkbookModoGeracao } from '@/types/workbook';

interface WorkbookGeracaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: WorkbookTemplate[];
  onGerar: (params: {
    templateId: string;
    competenciaInicial: string;
    competenciaFinal: string;
    modoGeracao: WorkbookModoGeracao;
    abasSelecionadas: string[];
  }) => Promise<void>;
  isGenerating: boolean;
  /** Onda 9.2 (A-04) — cancela a geração em andamento. */
  onCancel?: () => void;
}

export function WorkbookGeracaoDialog({
  open,
  onOpenChange,
  templates,
  onGerar,
  isGenerating,
  onCancel,
}: WorkbookGeracaoDialogProps) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [competenciaInicial, setCompetenciaInicial] = useState(currentMonth);
  const [competenciaFinal, setCompetenciaFinal] = useState(currentMonth);
  const [modoGeracao, setModoGeracao] = useState<WorkbookModoGeracao>('dinamico');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [abasSelecionadas, setAbasSelecionadas] = useState<string[]>(
    WORKBOOK_SHEET_GROUPS.filter((g) => g.defaultEnabled).map((g) => g.id),
  );

  const handleGerar = async () => {
    await onGerar({ templateId, competenciaInicial, competenciaFinal, modoGeracao, abasSelecionadas });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar Workbook Gerencial</DialogTitle>
          <DialogDescription>
            Configure os parâmetros e clique em Gerar para criar o arquivo Excel gerencial.
          </DialogDescription>
        </DialogHeader>
        <WorkbookParametrosCard
          competenciaInicial={competenciaInicial}
          competenciaFinal={competenciaFinal}
          modoGeracao={modoGeracao}
          templateId={templateId}
          templates={templates}
          abasSelecionadas={abasSelecionadas}
          onCompetenciaInicialChange={setCompetenciaInicial}
          onCompetenciaFinalChange={setCompetenciaFinal}
          onModoGeracaoChange={setModoGeracao}
          onTemplateChange={setTemplateId}
          onAbasChange={setAbasSelecionadas}
        />
        {modoGeracao === 'fechado' && (
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground flex gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Modo fechado — cortes V2 indisponíveis</p>
              <p>
                As abas DRE V2, Caixa Evolutivo, Vendas (Vendedor/ABC/Região), Funil, Compras por Fornecedor,
                Estoque (Giro/Crítico), Logística, Fiscal e Budget não são preservadas em snapshot. O workbook
                gerará uma aba de aviso (00b_Aviso_Modo_Fechado) listando os cortes suprimidos. Use modo dinâmico
                se precisar destes cortes.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          {isGenerating && onCancel ? (
            <Button variant="outline" onClick={onCancel}>
              Cancelar geração
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
              Fechar
            </Button>
          )}
          <Button onClick={handleGerar} disabled={isGenerating || !templateId}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              'Gerar Workbook'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

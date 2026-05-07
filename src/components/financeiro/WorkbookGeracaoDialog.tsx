import { useState } from 'react';
import { Loader2 } from 'lucide-react';
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
}

export function WorkbookGeracaoDialog({
  open,
  onOpenChange,
  templates,
  onGerar,
  isGenerating,
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancelar
          </Button>
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

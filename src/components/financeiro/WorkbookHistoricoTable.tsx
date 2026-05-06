import { Download, Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/DataTable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { WorkbookGeracao } from '@/types/workbook';

const STATUS_ICON: Record<string, React.ReactNode> = {
  concluido: <CheckCircle2 className="h-4 w-4 text-success" />,
  erro: <XCircle className="h-4 w-4 text-destructive" />,
  gerando: <Loader2 className="h-4 w-4 animate-spin text-info" />,
  pendente: <Clock className="h-4 w-4 text-warning" />,
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  concluido: 'default',
  erro: 'destructive',
  gerando: 'secondary',
  pendente: 'outline',
};

const ABAS_LABELS: Record<string, string> = {
  capa: 'Capa',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
  operacional: 'Operacional',
  logistica_fiscal: 'Log/Fiscal',
  raw: 'RAW',
};

interface WorkbookHistoricoTableProps {
  geracoes: WorkbookGeracao[];
  isLoading: boolean;
  onDownload: (geracao: WorkbookGeracao) => void;
  canDownload: boolean;
}

export function WorkbookHistoricoTable({
  geracoes,
  isLoading,
  onDownload,
  canDownload,
}: WorkbookHistoricoTableProps) {
  const columns = [
    {
      key: 'gerado_em',
      label: 'Gerado em',
      render: (r: WorkbookGeracao) =>
        new Date(r.gerado_em).toLocaleString('pt-BR'),
    },
    {
      key: 'template',
      label: 'Template',
      render: (r: WorkbookGeracao) =>
        r.workbook_templates?.nome ?? '—',
    },
    {
      key: 'periodo',
      label: 'Período',
      render: (r: WorkbookGeracao) =>
        r.competencia_inicial && r.competencia_final
          ? `${r.competencia_inicial} → ${r.competencia_final}`
          : '—',
    },
    {
      key: 'modo_geracao',
      label: 'Modo',
      render: (r: WorkbookGeracao) => (
        <Badge variant="outline">{r.modo_geracao ?? '—'}</Badge>
      ),
    },
    {
      key: 'abas',
      label: 'Conteúdo',
      render: (r: WorkbookGeracao) => {
        const params = (r.parametros_json ?? {}) as { abasSelecionadas?: string[] };
        const abas = params.abasSelecionadas ?? [];
        if (!abas.length) return <span className="text-xs text-muted-foreground">Completo</span>;
        return (
          <div className="flex flex-wrap gap-0.5">
            {abas.map(a => (
              <Badge key={a} variant="secondary" className="text-[10px] px-1 py-0 h-4">
                {ABAS_LABELS[a] ?? a}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (r: WorkbookGeracao) => {
        const badge = (
          <div className="flex items-center gap-1.5">
            {STATUS_ICON[r.status]}
            <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
            {r.status === 'erro' && r.observacoes && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertCircle className="h-3.5 w-3.5 text-destructive cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">{r.observacoes}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
        return badge;
      },
    },
    {
      key: 'hash',
      label: 'Hash',
      render: (r: WorkbookGeracao) =>
        r.hash_geracao ? (
          <code className="text-[10px] text-muted-foreground font-mono">
            {r.hash_geracao.slice(0, 8)}
          </code>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      label: '',
      render: (r: WorkbookGeracao) =>
        r.status === 'concluido' && canDownload ? (
          <Button size="sm" variant="outline" onClick={() => onDownload(r)}>
            <Download className="h-4 w-4 mr-1" /> Download
          </Button>
        ) : null,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={geracoes}
      loading={isLoading}
      emptyTitle="Nenhuma geração encontrada."
      mobileStatusKey="status"
    />
  );
}

import { Download, CheckCircle2, Loader2, XCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/DataTable';
import type { ApresentacaoGeracao } from '@/types/apresentacao';

const STATUS_ICON: Record<string, React.ReactNode> = {
  concluido: <CheckCircle2 className="h-4 w-4 text-success" />,
  erro: <XCircle className="h-4 w-4 text-destructive" />,
  gerando: <Loader2 className="h-4 w-4 animate-spin text-info" />,
  pendente: <Clock className="h-4 w-4 text-warning" />,
};

export function ApresentacaoHistoricoTable({
  geracoes,
  isLoading,
  canDownload,
  onDownload,
}: {
  geracoes: ApresentacaoGeracao[];
  isLoading: boolean;
  canDownload: boolean;
  onDownload: (g: ApresentacaoGeracao) => void;
}) {
  const columns = [
    { key: 'gerado_em', label: 'Gerado em', render: (r: ApresentacaoGeracao) => new Date(r.gerado_em).toLocaleString('pt-BR') },
    { key: 'template', label: 'Template', render: (r: ApresentacaoGeracao) => r.apresentacao_templates?.nome ?? '—' },
    { key: 'periodo', label: 'Período', render: (r: ApresentacaoGeracao) => `${r.competencia_inicial ?? '—'} → ${r.competencia_final ?? '—'}` },
    { key: 'modo', label: 'Modo', render: (r: ApresentacaoGeracao) => <Badge variant="outline">{r.modo_geracao ?? '—'}</Badge> },
    { key: 'editorial', label: 'Editorial', render: (r: ApresentacaoGeracao) => <Badge variant="secondary">{r.status_editorial ?? 'rascunho'}</Badge> },
    { key: 'slides', label: '#Slides', render: (r: ApresentacaoGeracao) => r.total_slides ?? '—' },
    {
      key: 'status',
      label: 'Status',
      render: (r: ApresentacaoGeracao) => <div className="flex items-center gap-2">{STATUS_ICON[r.status]}<span>{r.status}</span></div>,
    },
    {
      key: 'actions',
      label: '',
      render: (r: ApresentacaoGeracao) => (r.status === 'concluido' && canDownload ? <Button variant="outline" size="sm" onClick={() => onDownload(r)}><Download className="h-4 w-4 mr-1" />Download</Button> : null),
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

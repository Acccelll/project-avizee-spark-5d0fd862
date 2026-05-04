import { Badge } from '@/components/ui/badge';
import {
  FileEdit, Clock, CheckCircle, Cog, CheckCheck,
  AlertTriangle, XCircle, AlarmClock, Ban, Send, FileSearch, GitMerge, FileDown,
  Hourglass, PackageCheck, Receipt, Truck, RotateCcw, History, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStatusVariant, type StatusVariant, STATUS_VARIANT_MAP } from '@/types/ui';

/**
 * StatusBadge — fonte canônica visual para status de domínio.
 *
 * O TOM (cor) vem de `STATUS_VARIANT_MAP` em `@/types/ui` (single source of truth).
 * Este arquivo apenas mapeia ícone + label legível por chave de status.
 *
 * Para adicionar um novo status:
 *   1. Adicione a chave em `STATUS_VARIANT_MAP` (cor)
 *   2. (Opcional) Adicione `{ icon, label }` em `statusMeta` aqui
 */

interface StatusMeta {
  icon: LucideIcon;
  label: string;
}

const statusMeta: Record<string, StatusMeta> = {
  rascunho:             { icon: FileEdit, label: 'Rascunho' },
  pendente:             { icon: Clock, label: 'Pendente' },
  conciliado:           { icon: CheckCheck, label: 'Conciliado' },
  divergente:           { icon: AlertTriangle, label: 'Divergente' },
  sem_correspondencia:  { icon: XCircle, label: 'Sem Correspondência' },
  conciliado_manual:    { icon: GitMerge, label: 'Manual' },
  aberto:               { icon: Clock, label: 'Aberto' },
  aberta:               { icon: Clock, label: 'Aberta' },
  em_analise:           { icon: FileSearch, label: 'Em Análise' },
  finalizada:           { icon: CheckCheck, label: 'Finalizada' },
  finalizado:           { icon: CheckCheck, label: 'Finalizado' },
  convertida:           { icon: CheckCircle, label: 'Convertida em Pedido' },
  enviado:              { icon: Send, label: 'Enviado' },
  enviada:              { icon: Send, label: 'Enviada' },
  aprovado:             { icon: CheckCircle, label: 'Aprovado' },
  aprovada:             { icon: CheckCircle, label: 'Aprovada' },
  processando:          { icon: Cog, label: 'Processando' },
  em_separacao:         { icon: Cog, label: 'Em Separação' },
  concluido:            { icon: CheckCheck, label: 'Concluído' },
  confirmado:           { icon: Clock, label: 'Confirmado' },
  confirmada:           { icon: Clock, label: 'Confirmada' },
  parcial:              { icon: AlertTriangle, label: 'Parcial' },
  cancelado:            { icon: XCircle, label: 'Cancelado' },
  cancelada:            { icon: XCircle, label: 'Cancelada' },
  importada:            { icon: FileDown, label: 'Importada' },
  importado:            { icon: FileDown, label: 'Importado' },
  rejeitado:            { icon: XCircle, label: 'Rejeitado' },
  rejeitada:            { icon: XCircle, label: 'Rejeitada' },
  aguardando_aprovacao: { icon: Clock, label: 'Aguardando Aprovação' },
  aguardando_recebimento: { icon: Clock, label: 'Aguardando Recebimento' },
  parcialmente_recebido: { icon: AlertTriangle, label: 'Parcialmente Recebido' },
  faturada_parcial:     { icon: AlertTriangle, label: 'Faturado Parcial' },
  enviado_ao_fornecedor:{ icon: Send, label: 'Enviado ao Fornecedor' },
  separado:             { icon: PackageCheck, label: 'Separado' },
  em_transporte:        { icon: Truck, label: 'Em Transporte' },
  coletado:             { icon: PackageCheck, label: 'Coletado' },
  postado:              { icon: Send, label: 'Postado' },
  devolvido:            { icon: RotateCcw, label: 'Devolvido' },
  estornado:            { icon: RotateCcw, label: 'Estornado' },
  inutilizada:          { icon: Ban, label: 'Inutilizada' },
  autorizada:           { icon: CheckCircle, label: 'Autorizada' },
  historico:            { icon: History, label: 'Histórico' },
  denegada:             { icon: XCircle, label: 'Denegada' },
  expirado:             { icon: AlarmClock, label: 'Expirado' },
  vencido:              { icon: AlarmClock, label: 'Vencido' },
  vencida:              { icon: AlarmClock, label: 'Vencida' },
  bloqueado:            { icon: Ban, label: 'Bloqueado' },
  pago:                 { icon: CheckCheck, label: 'Pago' },
  faturado:             { icon: CheckCircle, label: 'Faturado' },
  faturada:             { icon: CheckCircle, label: 'Faturada' },
  convertido:           { icon: CheckCircle, label: 'Convertido' },
  entregue:             { icon: CheckCheck, label: 'Entregue' },
  aguardando:           { icon: Clock, label: 'Aguardando' },
  total:                { icon: CheckCheck, label: 'Total' },
  ativo:                { icon: CheckCircle, label: 'Ativo' },
  ativa:                { icon: CheckCircle, label: 'Ativa' },
  inativo:              { icon: Ban, label: 'Inativo' },
  inativa:              { icon: Ban, label: 'Inativa' },
  simples:              { icon: FileEdit, label: 'Simples' },
  composto:             { icon: Cog, label: 'Composto' },
  produto:              { icon: FileEdit, label: 'Produto' },
  insumo:               { icon: Cog, label: 'Insumo' },
  nao_faturado:         { icon: FileEdit, label: 'Não faturado' },
  no_prazo:             { icon: CheckCircle, label: 'No prazo' },
  proximo_vencimento:   { icon: Hourglass, label: 'Próximo do prazo' },
  atrasado:             { icon: AlarmClock, label: 'Atrasado' },
  despachado:           { icon: PackageCheck, label: 'Despachado' },
  em_transito:          { icon: Send, label: 'Em trânsito' },
  recebido:             { icon: PackageCheck, label: 'Recebido' },
  recebido_parcial:     { icon: AlertTriangle, label: 'Receb. parcial' },
  emitida:              { icon: Receipt, label: 'Emitida' },
};

/**
 * Mapeia variant semântica para classes de cor (single source para cor).
 * Mantém consistência com `Badge` shadcn estendido (variants success/warning/info/muted).
 */
const variantClasses: Record<StatusVariant, string> = {
  success:     'bg-success/10 text-success border-success/20',
  warning:     'bg-warning/10 text-warning border-warning/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  info:        'bg-info/10 text-info border-info/20',
  primary:     'bg-primary/10 text-primary border-primary/20',
  muted:       'bg-muted text-muted-foreground border-border',
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const key = status?.toLowerCase() ?? '';
  const meta = statusMeta[key];
  const variant = getStatusVariant(key);
  const Icon = meta?.icon ?? Clock;
  // Pretty fallback: replace underscores in unknown statuses
  const displayLabel = label || meta?.label || (status ? status.replace(/_/g, ' ') : '');

  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium gap-1', variantClasses[variant], className)}
    >
      <Icon className="h-3 w-3" />
      {displayLabel}
    </Badge>
  );
}

// Re-export for convenience: callers that need just the variant string (e.g. for
// other Badge compositions) can derive it without importing from types/ui.
export { getStatusVariant, STATUS_VARIANT_MAP };

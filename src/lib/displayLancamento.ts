/**
 * Helpers de exibição para lançamentos financeiros.
 *
 * Bug histórico: alguns registros foram gravados com `descricao = "[object Object]"`
 * (resultado de `String(objetoPlanoContas)`). O backfill SQL corrige a base, mas
 * mantemos esta camada de defesa em cascata para o eventual reincidência ou
 * payloads em memória.
 */

interface LancamentoLike {
  descricao?: unknown;
  contas_contabeis?: { descricao?: string | null } | null;
}

export function displayDescricao(l: LancamentoLike): string {
  const raw = l.descricao;
  if (raw && typeof raw === 'object') {
    const planoNome = l.contas_contabeis?.descricao;
    return planoNome || 'Lançamento sem descrição';
  }
  if (typeof raw === 'string') {
    if (raw === '[object Object]' || raw.trim() === '') {
      return l.contas_contabeis?.descricao || 'Lançamento sem descrição';
    }
    return raw;
  }
  return l.contas_contabeis?.descricao || 'Lançamento sem descrição';
}

/**
 * Renderiza `observacoes` de forma legível.
 * Defesa em camada para casos em que o backend gravou objeto serializado
 * (`"[object Object]"`) ou JSON cru.
 *
 * - string limpa  → retorna a própria string
 * - "[object Object]" / vazio → null (caller não renderiza a seção)
 * - JSON parseável → tenta extrair pares chave/valor amigáveis
 * - objeto         → idem
 */
const OBS_KEY_LABELS: Record<string, string> = {
  origem: 'Origem',
  origem_tipo: 'Origem',
  referencia: 'Referência',
  modulo: 'Módulo',
  conta_contabil: 'Conta contábil',
  motivo: 'Motivo',
  observacao: 'Observação',
  documento: 'Documento',
  responsavel: 'Responsável',
};

const OBS_VALUE_LABELS: Record<string, string> = {
  CP: 'Conta a Pagar',
  CR: 'Conta a Receber',
  fiscal_nota: 'Nota Fiscal',
  comercial: 'Comercial',
  compras: 'Compras',
  manual: 'Manual',
  parcelamento: 'Parcelamento',
  sistemica: 'Sistêmica',
  societario: 'Retirada de Sócio',
};

function formatObsObject(obj: Record<string, unknown>): string | null {
  const entries = Object.entries(obj).filter(
    ([, v]) => v != null && v !== '' && typeof v !== 'object',
  );
  if (entries.length === 0) return null;
  return entries
    .map(([k, v]) => {
      const label = OBS_KEY_LABELS[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
      const valueStr = String(v);
      const valueLabel = OBS_VALUE_LABELS[valueStr] ?? valueStr;
      return `${label}: ${valueLabel}`;
    })
    .join('\n');
}

export function displayObservacoes(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'object') {
    return formatObsObject(value as Record<string, unknown>);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[object Object]') return null;
    // Tenta JSON
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const formatted = formatObsObject(parsed as Record<string, unknown>);
          if (formatted) return formatted;
        }
      } catch { /* mantém string original */ }
    }
    return trimmed;
  }
  return String(value);
}

/**
 * Mapa de eventos da trilha de auditoria → label amigável.
 */
export const EVENTO_AUDITORIA_LABELS: Record<string, string> = {
  criacao: 'Criação',
  edicao: 'Edição',
  baixa: 'Baixa registrada',
  estorno: 'Estorno',
  cancelamento: 'Cancelamento',
  reativacao: 'Reativação',
  exclusao: 'Exclusão',
};

export function labelEventoAuditoria(evento: string): string {
  return EVENTO_AUDITORIA_LABELS[evento] ?? evento;
}

/**
 * Módulo de origem inferido a partir do `origem_tipo`.
 */
export function getOrigemModulo(origemTipo: string | null | undefined): string {
  switch (origemTipo) {
    case 'fiscal_nota':
    case 'nfe_entrada':
      return 'Fiscal';
    case 'comercial':
      return 'Comercial';
    case 'compras':
      return 'Compras';
    case 'parcelamento':
      return 'Financeiro';
    case 'sistemica':
      return 'Sistema';
    case 'societario':
      return 'Societário';
    case 'manual':
    default:
      return 'Financeiro';
  }
}
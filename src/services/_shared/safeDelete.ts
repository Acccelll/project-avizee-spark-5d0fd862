/**
 * safeDelete — utilitário transversal para "exclusão segura" de cadastros.
 *
 * Estratégia:
 *  1. Antes de qualquer DELETE/UPDATE, verifica dependências em tabelas
 *     vinculadas. Se houver, lança erro descritivo (sem tocar no banco).
 *  2. Quando a tabela tem coluna `ativo`, faz soft delete (`ativo=false`).
 *  3. Hard delete continua disponível via `hardDelete=true` para cenários
 *     administrativos (ex.: gate por permissão `useCanHardDelete`).
 *
 * Mensagens são humanas e informam ao usuário o que fazer ("Desative em
 * vez de excluir") em vez de propagar erros crus do Postgres.
 */
import { supabase } from "@/integrations/supabase/client";

export interface DependencyCheck {
  /** Tabela onde checar a existência de referências. */
  table: string;
  /** Coluna que aponta para o registro alvo. */
  column: string;
  /** Rótulo amigável para a mensagem ("pedidos", "lançamentos financeiros"). */
  label: string;
}

export interface SafeDeleteOptions {
  /** Tabela alvo. */
  table: string;
  /** ID do registro a remover. */
  id: string;
  /** Rótulo do registro para mensagens ("Cliente", "Fornecedor"). */
  entityLabel: string;
  /** Lista de dependências a checar antes de remover. */
  dependencies: DependencyCheck[];
  /** Se `true`, executa DELETE físico mesmo havendo coluna `ativo`. */
  hardDelete?: boolean;
}

export class DependencyError extends Error {
  readonly counts: Record<string, number>;
  constructor(message: string, counts: Record<string, number>) {
    super(message);
    this.name = "DependencyError";
    this.counts = counts;
  }
}

/**
 * Checa dependências e retorna o mapa {label: count}. Não lança.
 */
export async function checkDependencies(
  id: string,
  deps: DependencyCheck[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const dep of deps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count, error } = await (supabase as any)
      .from(dep.table)
      .select("id", { count: "exact", head: true })
      .eq(dep.column, id);
    if (error) {
      // Falha em uma checagem não bloqueia tudo — apenas registra como 0
      // para que o usuário ainda possa tentar remover. Erros reais virão
      // do banco no DELETE/UPDATE final com mensagem do Postgres.
      continue;
    }
    if ((count ?? 0) > 0) result[dep.label] = count ?? 0;
  }
  return result;
}

/**
 * Executa exclusão segura: verifica dependências, faz soft delete quando
 * possível, ou hard delete quando explicitado. Lança `DependencyError`
 * se houver vínculos impeditivos.
 */
export async function safeDelete(opts: SafeDeleteOptions): Promise<void> {
  const { table, id, entityLabel, dependencies, hardDelete = false } = opts;

  const counts = await checkDependencies(id, dependencies);
  const blockers = Object.entries(counts);
  if (blockers.length > 0) {
    const partes = blockers
      .map(([label, n]) => `${n} ${label}`)
      .join(", ");
    throw new DependencyError(
      `${entityLabel} possui vínculos (${partes}). Desative em vez de excluir.`,
      counts,
    );
  }

  if (hardDelete) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from(table).delete().eq("id", id);
    if (error) throw error;
    return;
  }

  // Soft delete por padrão.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from(table)
    .update({ ativo: false })
    .eq("id", id);
  if (error) throw error;
}
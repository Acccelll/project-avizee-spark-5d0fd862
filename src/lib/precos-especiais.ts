/**
 * Funções puras para cálculo e aplicação de preços especiais.
 *
 * Todas as funções são determinísticas e livres de efeitos colaterais,
 * facilitando testes unitários e reutilização em componentes e serviços.
 */

export interface RegraPrecoEspecial {
  produto_id: string;
  /** Preço fixo (quando definido, tem prioridade sobre percentual). */
  preco_especial?: number | null;
  /**
   * Data de início de vigência (ISO "YYYY-MM-DD"), inclusive.
   * Mapeia diretamente a coluna `precos_especiais.data_inicio` no banco.
   */
  data_inicio?: string | null;
  /**
   * Data de fim de vigência (ISO "YYYY-MM-DD"), inclusive.
   * Mapeia diretamente a coluna `precos_especiais.data_fim` no banco.
   */
  data_fim?: string | null;
}

/**
 * Verifica se uma regra de preço está vigente na data informada.
 *
 * @param vigenciaInicio   Data de início (ISO "YYYY-MM-DD"), ou null/undefined para sem limite.
 * @param vigenciaFim      Data de fim    (ISO "YYYY-MM-DD"), ou null/undefined para sem limite.
 * @param hoje             Data de referência.
 * @returns `true` se a regra está ativa na data informada.
 */
export function isRegraVigente(
  dataInicio: string | null | undefined,
  dataFim: string | null | undefined,
  hoje: Date,
): boolean {
  if (dataInicio) {
    const inicio = new Date(dataInicio + 'T00:00:00');
    if (inicio > hoje) return false;
  }
  if (dataFim) {
    const fim = new Date(dataFim + 'T23:59:59');
    if (fim < hoje) return false;
  }
  return true;
}

/**
 * Busca a primeira regra aplicável para um produto na data informada.
 *
 * @param regras     Lista de regras de preço especial.
 * @param produtoId  ID do produto a consultar.
 * @param hoje       Data de referência.
 * @returns A regra vigente encontrada, ou `undefined` se não houver.
 */
export function buscarRegraAplicavel(
  regras: RegraPrecoEspecial[],
  produtoId: string,
  hoje: Date,
): RegraPrecoEspecial | undefined {
  return regras.find(
    (r) =>
      r.produto_id === produtoId &&
      isRegraVigente(r.data_inicio, r.data_fim, hoje),
  );
}

/**
 * Aplica uma regra de preço especial a um preço base, retornando o novo preço.
 *
 * Atualmente a tabela `precos_especiais` só persiste preço fixo
 * (`preco_especial`). Desconto percentual ficou fora desta versão até que
 * uma migration adicione a coluna correspondente.
 *
 * - `preco_especial` > 0 → preço fixo substitui o preço base.
 * - Caso contrário → retorna o preço base original.
 *
 * @param precoBase   Preço de venda original do produto.
 * @param regra       Regra de preço a aplicar.
 * @returns Novo preço calculado.
 */
export function aplicarPrecoEspecial(
  precoBase: number,
  regra: RegraPrecoEspecial,
): number {
  if (regra.preco_especial && Number(regra.preco_especial) > 0) {
    return Number(regra.preco_especial);
  }
  return precoBase;
}

/**
 * Aplica as regras de preço especial a uma lista de itens de orçamento.
 * Retorna uma nova lista imutável com os preços atualizados.
 *
 * @param itens          Lista de itens do orçamento.
 * @param regras         Regras de preço especial ativas para o cliente.
 * @param hoje           Data de referência.
 * @returns `{ itens: ItemAtualizado[], alterados: string[] }` — itens atualizados
 *          e IDs dos produtos cujo preço foi alterado.
 */
export function aplicarPrecosEspeciaisEmLote<
  T extends { produto_id: string; valor_unitario: number; quantidade: number },
>(
  itens: T[],
  regras: RegraPrecoEspecial[],
  hoje: Date,
): { itens: T[]; alterados: string[] } {
  const alterados: string[] = [];
  const atualizados = itens.map((item) => {
    const regra = buscarRegraAplicavel(regras, item.produto_id, hoje);
    if (!regra) return item;

    const novoPreco = aplicarPrecoEspecial(item.valor_unitario, regra);
    if (novoPreco === item.valor_unitario) return item;

    alterados.push(item.produto_id);
    return {
      ...item,
      valor_unitario: novoPreco,
      valor_total: Math.round(item.quantidade * novoPreco * 100) / 100,
    };
  });
  return { itens: atualizados as T[], alterados };
}

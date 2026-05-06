import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TipoDocumento = "cpf" | "cnpj";
export type DocumentoTable = "clientes" | "fornecedores" | "transportadoras" | "funcionarios" | "socios";

const CPF_LENGTH = 11;
const CNPJ_LENGTH = 14;

/**
 * Verifica se um documento (CPF/CNPJ) está disponível para uso.
 *
 * Política: o mesmo documento PODE existir em tabelas diferentes
 * (ex.: o mesmo CNPJ pode ser cliente e fornecedor — caso comum).
 * A unicidade é exigida apenas DENTRO da mesma tabela. Quando estamos
 * editando, o próprio registro (`excludeId`) é desconsiderado.
 */
async function checkDocumentoUnico(
  tipo: TipoDocumento,
  valor: string,
  excludeId?: string,
  excludeTable?: DocumentoTable,
): Promise<boolean> {
  const digits = valor.replace(/\D/g, "");

  // A unicidade é validada apenas dentro da MESMA tabela. Sem `excludeTable`
  // não há como saber qual escopo aplicar — assume disponível e deixa a UI
  // decidir (ex.: cadastro novo passa `excludeTable` da entidade alvo).
  if (!excludeTable) return true;

  if (excludeTable === "funcionarios" || excludeTable === "socios") {
    if (tipo !== "cpf") return true;
    let q = supabase
      .from(excludeTable)
      .select("id", { count: "exact", head: true })
      .eq("cpf", digits);
    if (excludeId) q = q.neq("id", excludeId);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return (count ?? 0) === 0;
  }

  let q = supabase
    .from(excludeTable)
    .select("id", { count: "exact", head: true })
    .eq("cpf_cnpj", digits);
  if (excludeId) q = q.neq("id", excludeId);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return (count ?? 0) === 0;
}

export interface UseDocumentoUnicoReturn {
  isUnique: boolean | undefined;
  isLoading: boolean;
}

export function useDocumentoUnico(
  tipo: TipoDocumento,
  valor: string,
  excludeId?: string,
  excludeTable?: DocumentoTable,
): UseDocumentoUnicoReturn {
  const expectedLength = tipo === "cpf" ? CPF_LENGTH : CNPJ_LENGTH;
  const digits = valor.replace(/\D/g, "");
  const isReady = !!valor && digits.length === expectedLength;

  const { data: isUnique, isLoading } = useQuery<boolean>({
    queryKey: ["documento-unico", tipo, digits, excludeId, excludeTable],
    queryFn: () => checkDocumentoUnico(tipo, digits, excludeId, excludeTable),
    enabled: isReady,
    staleTime: 30 * 1000,
  });

  return { isUnique, isLoading };
}

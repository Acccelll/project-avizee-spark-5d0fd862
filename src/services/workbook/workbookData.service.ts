/**
 * Acessos tipados ao banco usados pelo agregador de Workbook
 * (`src/lib/workbook/fetchWorkbookData.ts`). As views agregadas
 * `vw_workbook_*` permanecem no agregador por serem chamadas dezenas de
 * vezes em paralelo dentro de uma única `Promise.all`.
 */
import { supabase } from "@/integrations/supabase/client";

export interface FolhaPagamentoRow {
  competencia: string;
  salario_base: number | null;
  proventos: number | null;
  descontos: number | null;
  valor_liquido: number | null;
  funcionarios: { nome: string | null } | null;
}

export async function fetchFolhaPagamentoRange(
  iniYM: string,
  fimYM: string,
): Promise<FolhaPagamentoRow[]> {
  const { data, error } = await supabase
    .from("folha_pagamento")
    .select("competencia, salario_base, proventos, descontos, valor_liquido, funcionarios(nome)")
    .gte("competencia", iniYM)
    .lte("competencia", fimYM);
  if (error) throw error;
  return (data ?? []) as unknown as FolhaPagamentoRow[];
}

export interface EmpresaConfigBrand {
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  logo_url: string | null;
}

export async function fetchEmpresaConfigBrand(): Promise<EmpresaConfigBrand | null> {
  const { data, error } = await supabase
    .from("empresa_config")
    .select("razao_social, nome_fantasia, cnpj, logo_url")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as EmpresaConfigBrand | null) ?? null;
}
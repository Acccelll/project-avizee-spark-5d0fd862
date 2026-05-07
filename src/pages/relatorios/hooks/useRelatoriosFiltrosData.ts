/**
 * Reference data for the Reports module filter controls:
 *   - grupos de produto (small, all active loaded eagerly)
 *   - empresa config (name / CNPJ for PDF header)
 *   - clientes/fornecedores selecionados → buscados por id (server-side)
 *
 * As listas completas de clientes/fornecedores NÃO são mais pré-carregadas:
 * o select usa `loadClienteOptions`/`loadFornecedorOptions` (ilike no servidor)
 * e os chips usam `useSelectedRefLabels` para resolver apenas os ids ativos.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AsyncOption } from "@/components/ui/AsyncMultiSelect";

export interface ClienteRef {
  id: string;
  nome_razao_social: string;
}

export interface FornecedorRef {
  id: string;
  nome_razao_social: string;
}

export interface GrupoProdutoRef {
  id: string;
  nome: string;
}

export interface EmpresaConfigRef {
  razao_social?: string;
  cnpj?: string;
  nome_fantasia?: string;
}

const STALE = 30 * 60 * 1000; // 30 minutes

function useGruposRef() {
  return useQuery<GrupoProdutoRef[]>({
    queryKey: ["ref-grupos-produto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grupos_produto")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: STALE,
    refetchOnWindowFocus: false,
  });
}

function useEmpresaConfig() {
  return useQuery<EmpresaConfigRef | null>({
    queryKey: ["empresa-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresa_config")
        .select("razao_social, cnpj, nome_fantasia")
        .limit(1)
        .single();
      if (error) return null;
      return (data as EmpresaConfigRef) ?? null;
    },
    staleTime: STALE,
    refetchOnWindowFocus: false,
  });
}

/** Aggregates all reference data needed by the Reports module. */
export function useRelatoriosFiltrosData() {
  const grupos = useGruposRef();
  const empresaConfig = useEmpresaConfig();

  return {
    clientes: [] as ClienteRef[],
    fornecedores: [] as FornecedorRef[],
    grupos: grupos.data ?? [],
    empresaConfig: empresaConfig.data ?? null,
    limits: {
      // Listas server-side: sem cap fixo — exibimos hint genérico no select.
      clientes: 0,
      fornecedores: 0,
    },
  };
}

/**
 * Resolve labels (nome_razao_social) apenas para os ids selecionados.
 * Usado pelos chips de filtros ativos para evitar pré-carregar listas inteiras.
 */
export function useSelectedRefLabels(clienteIds: string[], fornecedorIds: string[]) {
  const cliKey = [...clienteIds].sort().join(",");
  const forKey = [...fornecedorIds].sort().join(",");

  const clientes = useQuery<ClienteRef[]>({
    queryKey: ["ref-clientes-selected", cliKey],
    enabled: clienteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome_razao_social")
        .in("id", clienteIds);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: STALE,
    refetchOnWindowFocus: false,
  });

  const fornecedores = useQuery<FornecedorRef[]>({
    queryKey: ["ref-fornecedores-selected", forKey],
    enabled: fornecedorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("id, nome_razao_social")
        .in("id", fornecedorIds);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: STALE,
    refetchOnWindowFocus: false,
  });

  return {
    clientes: clientes.data ?? [],
    fornecedores: fornecedores.data ?? [],
  };
}

// ─── Async loaders for AsyncMultiSelect ──────────────────────────────────────

/**
 * Returns a `loadOptions(query)` function for clientes that searches
 * `nome_razao_social` server-side (case-insensitive, debounced by the caller).
 */
export const loadClienteOptions = async (query: string): Promise<AsyncOption[]> => {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome_razao_social")
    .eq("ativo", true)
    .ilike("nome_razao_social", `%${query}%`)
    .order("nome_razao_social")
    .limit(50);
  if (error) return [];
  return (data ?? []).map((c) => ({ value: c.id, label: c.nome_razao_social }));
};

export const loadClienteLabels = async (ids: string[]): Promise<AsyncOption[]> => {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome_razao_social")
    .in("id", ids);
  if (error) return [];
  return (data ?? []).map((c) => ({ value: c.id, label: c.nome_razao_social }));
};

export const loadFornecedorOptions = async (query: string): Promise<AsyncOption[]> => {
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, nome_razao_social")
    .eq("ativo", true)
    .ilike("nome_razao_social", `%${query}%`)
    .order("nome_razao_social")
    .limit(50);
  if (error) return [];
  return (data ?? []).map((f) => ({ value: f.id, label: f.nome_razao_social }));
};

export const loadFornecedorLabels = async (ids: string[]): Promise<AsyncOption[]> => {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, nome_razao_social")
    .in("id", ids);
  if (error) return [];
  return (data ?? []).map((f) => ({ value: f.id, label: f.nome_razao_social }));
};

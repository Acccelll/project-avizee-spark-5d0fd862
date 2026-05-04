import { supabase } from "@/integrations/supabase/client";

/**
 * Lookups compartilhados pela tela de Logística (combos de filtro/relacionamento).
 *
 * Encapsulam SELECTs simples em entidades de cadastro para que a página
 * `Logistica.tsx` deixe de chamar `supabase.from(...)` diretamente.
 */

export interface LookupRef {
  id: string;
  nome_razao_social: string;
  cpf_cnpj?: string | null;
}

export interface DocumentoRef {
  id: string;
  numero: string | null;
}

export interface NotaFiscalRef extends DocumentoRef {
  tipo: string | null;
}

export async function listClientesAtivos(): Promise<LookupRef[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id,nome_razao_social,cpf_cnpj")
    .eq("ativo", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as LookupRef[];
}

export async function listTransportadorasAtivas(): Promise<LookupRef[]> {
  const { data, error } = await supabase
    .from("transportadoras")
    .select("id,nome_razao_social,cpf_cnpj")
    .eq("ativo", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as LookupRef[];
}

export async function listPedidosCompraAtivos(): Promise<DocumentoRef[]> {
  const { data, error } = await supabase
    .from("pedidos_compra")
    .select("id, numero")
    .eq("ativo", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as DocumentoRef[];
}

export async function listOrdensVendaAtivas(): Promise<DocumentoRef[]> {
  const { data, error } = await supabase
    .from("ordens_venda")
    .select("id, numero")
    .eq("ativo", true)
    .order("numero", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as DocumentoRef[];
}

export async function listNotasFiscaisAtivas(): Promise<NotaFiscalRef[]> {
  const { data, error } = await supabase
    .from("notas_fiscais")
    .select("id, numero, tipo")
    .eq("ativo", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as NotaFiscalRef[];
}
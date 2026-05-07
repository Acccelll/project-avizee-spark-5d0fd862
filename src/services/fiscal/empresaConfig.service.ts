import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type EmpresaConfigRow = Database["public"]["Tables"]["empresa_config"]["Row"];
type EmpresaConfigInsert = Database["public"]["Tables"]["empresa_config"]["Insert"];
type EmpresaConfigUpdate = Database["public"]["Tables"]["empresa_config"]["Update"];

export async function getEmpresaConfigPrincipal() {
  const { data, error } = await supabase
    .from("empresa_config")
    .select("*")
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

export async function getEmpresaConfig(): Promise<EmpresaConfigRow | null> {
  const { data, error } = await supabase
    .from("empresa_config")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function upsertEmpresaConfig(
  payload: EmpresaConfigInsert | EmpresaConfigUpdate,
  configId?: string | null,
): Promise<string> {
  if (configId) {
    const { error } = await supabase
      .from("empresa_config")
      .update(payload as EmpresaConfigUpdate)
      .eq("id", configId);
    if (error) throw error;
    return configId;
  }
  const { data, error } = await supabase
    .from("empresa_config")
    .insert(payload as EmpresaConfigInsert)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

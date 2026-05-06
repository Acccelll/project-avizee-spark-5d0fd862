/**
 * Query keys de cadastros (clientes, fornecedores, produtos).
 */
export const cadastrosKeys = {
  all: ["cadastros"] as const,
  clientes: () => ["clientes"] as const,
  cliente: (id: string | null | undefined) => ["clientes", id ?? null] as const,
  fornecedores: () => ["fornecedores"] as const,
  fornecedor: (id: string | null | undefined) => ["fornecedores", id ?? null] as const,
  produtos: () => ["produtos"] as const,
  produto: (id: string | null | undefined) => ["produtos", id ?? null] as const,
} as const;
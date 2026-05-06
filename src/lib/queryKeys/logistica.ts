/**
 * Query keys do módulo Logística (remessas, etiquetas, rastreio).
 */
export const logisticaKeys = {
  all: ["logistica"] as const,
  remessas: () => ["logistica", "remessas"] as const,
  etiquetas: () => ["logistica", "etiquetas"] as const,
  rastreio: (codigo: string | null | undefined) =>
    ["logistica", "rastreio", codigo ?? null] as const,
} as const;
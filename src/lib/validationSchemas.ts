import { z } from "zod";
import { validateCPF, validateCNPJ } from "./validators";

/**
 * Validação de CPF/CNPJ com verificação de dígitos.
 */
const cpfCnpjSchema = z.string().optional().refine(
  (val) => {
    if (!val || val.trim() === "") return true;
    const digits = val.replace(/\D/g, "");
    if (digits.length <= 11) return validateCPF(digits);
    if (digits.length === 14) return validateCNPJ(digits);
    return false;
  },
  { message: "CPF ou CNPJ inválido" }
);

const emailSchema = z.string().optional().refine(
  (val) => !val || val.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
  { message: "E-mail inválido" }
);

const telefoneSchema = z.string().optional().refine(
  (val) => !val || val.trim() === "" || val.replace(/\D/g, "").length >= 10,
  { message: "Telefone inválido (mínimo 10 dígitos)" }
);

const cepSchema = z.string().optional().refine(
  (val) => !val || val.trim() === "" || val.replace(/\D/g, "").length === 8,
  { message: "CEP inválido (deve ter 8 dígitos)" }
);

const ufSchema = z.string().optional().refine(
  (val) => {
    if (!val || val.trim() === "") return true;
    const ufs = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
    return ufs.includes(val.toUpperCase());
  },
  { message: "UF inválida" }
);

/**
 * Schema de validação para Clientes e Fornecedores.
 */
export const clienteFornecedorSchema = z.object({
  tipo_pessoa: z.enum(["F", "J"]),
  nome_razao_social: z.string().min(2, "Nome/Razão Social deve ter pelo menos 2 caracteres").max(200, "Máximo 200 caracteres"),
  nome_fantasia: z.string().max(200, "Máximo 200 caracteres").optional().or(z.literal("")),
  cpf_cnpj: cpfCnpjSchema,
  inscricao_estadual: z.string().max(20).optional().or(z.literal("")),
  email: emailSchema,
  telefone: telefoneSchema,
  celular: telefoneSchema,
  contato: z.string().max(100).optional().or(z.literal("")),
  prazo_padrao: z.number().min(0, "Prazo não pode ser negativo").max(365, "Prazo máximo 365 dias"),
  limite_credito: z.number().min(0, "Limite não pode ser negativo"),
  logradouro: z.string().max(200).optional().or(z.literal("")),
  numero: z.string().max(20).optional().or(z.literal("")),
  complemento: z.string().max(100).optional().or(z.literal("")),
  bairro: z.string().max(100).optional().or(z.literal("")),
  cidade: z.string().max(100).optional().or(z.literal("")),
  uf: ufSchema,
  cep: cepSchema,
  pais: z.string().max(50).optional().or(z.literal("")),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
});

/**
 * Schema de validação para Produtos.
 */
export const produtoSchema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200, "Máximo 200 caracteres"),
  sku: z.string().max(50, "SKU máximo 50 caracteres").optional().or(z.literal("")),
  codigo_interno: z.string().max(50).optional().or(z.literal("")),
  descricao: z.string().max(2000).optional().or(z.literal("")),
  unidade_medida: z.string().min(1, "Unidade é obrigatória"),
  preco_custo: z.number().min(0, "Custo não pode ser negativo"),
  preco_venda: z.number().min(0.01, "Preço de venda é obrigatório"),
  estoque_minimo: z.number().min(0, "Estoque mínimo não pode ser negativo"),
  ncm: z.string().max(8).optional().or(z.literal("")),
  cst: z.string().max(10).optional().or(z.literal("")),
  cfop_padrao: z.string().max(10).optional().or(z.literal("")),
  peso: z.number().min(0, "Peso não pode ser negativo"),
  eh_composto: z.boolean(),
  grupo_id: z.string().optional().or(z.literal("")),
});

/**
 * Variante de `produtoSchema` para insumos (matérias-primas), onde
 * `preco_venda` é opcional. Mantemos um schema dedicado em vez de
 * recompor inline para evitar `as never` e garantir tipagem segura.
 */
export const produtoInsumoSchema = produtoSchema.extend({
  preco_venda: z.number().min(0).optional(),
});

/**
 * Schema de validação para Transportadoras — exige DV de CNPJ.
 */
export const transportadoraSchema = z.object({
  tipo_pessoa: z.enum(["F", "J"]).optional(),
  nome_razao_social: z.string().min(2, "Razão Social obrigatória").max(200),
  nome_fantasia: z.string().max(200).optional().or(z.literal("")),
  cpf_cnpj: z.string().optional().refine((val) => {
    if (!val || val.trim() === "") return true;
    const digits = val.replace(/\D/g, "");
    if (digits.length === 11) return validateCPF(digits);
    if (digits.length === 14) return validateCNPJ(digits);
    return false;
  }, { message: "CPF/CNPJ inválido" }),
  contato: z.string().max(100).optional().or(z.literal("")),
  telefone: telefoneSchema,
  email: emailSchema,
  logradouro: z.string().max(200).optional().or(z.literal("")),
  numero: z.string().max(20).optional().or(z.literal("")),
  complemento: z.string().max(100).optional().or(z.literal("")),
  bairro: z.string().max(100).optional().or(z.literal("")),
  cidade: z.string().max(100).optional().or(z.literal("")),
  uf: ufSchema,
  cep: cepSchema,
  modalidade: z.string().optional().or(z.literal("")),
  prazo_medio: z.string().optional().or(z.literal("")),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
  ativo: z.boolean().optional(),
});

/**
 * Helper: valida um formulário contra um schema Zod e retorna erros por campo.
 */
export function validateForm<T>(schema: z.ZodSchema<T>, data: unknown): { success: boolean; data?: T; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data, errors: {} };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  }
  return { success: false, errors };
}

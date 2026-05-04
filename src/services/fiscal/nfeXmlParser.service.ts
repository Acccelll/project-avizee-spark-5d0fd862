/**
 * Wrapper sobre `@/lib/nfeXmlParser` que adapta o resultado para a forma
 * usada por `nfe_distribuicao` / `nfe_distribuicao_itens`.
 *
 * Mantido como serviço dedicado por compatibilidade com chamadores existentes
 * (ManifestacaoDestinatarioDrawer). A lógica de parse propriamente dita vive
 * em `src/lib/nfeXmlParser.ts` — este arquivo apenas reexporta tipos/funcs
 * e renomeia campos para o vocabulário da distribuição DF-e.
 */
import { parseNFeXml as parseNFeXmlBase } from "@/lib/nfeXmlParser";

export interface NFeXmlItem {
  numero: number;
  codigo: string | null;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export interface NFeXmlParsed {
  chave: string;
  numero: string;
  serie: string;
  dataEmissao: string | null;
  naturezaOperacao: string | null;
  cnpjEmitente: string | null;
  nomeEmitente: string | null;
  ufEmitente: string | null;
  ieEmitente: string | null;
  valorTotal: number;
  valorIcms: number;
  valorIpi: number;
  protocolo: string | null;
  itens: NFeXmlItem[];
}

/**
 * Faz o parse de um XML de NF-e (string) e devolve os dados estruturados.
 * Lança Error se o XML for inválido ou não contiver uma NFe identificável.
 * Internamente delega ao parser canônico em `@/lib/nfeXmlParser`.
 */
export function parseNFeXml(xmlString: string): NFeXmlParsed {
  const nfe = parseNFeXmlBase(xmlString);
  if (!nfe.chaveAcesso) {
    throw new Error("XML não parece ser uma NF-e (chave de acesso não encontrada).");
  }
  return {
    chave: nfe.chaveAcesso,
    numero: nfe.numero,
    serie: nfe.serie,
    dataEmissao: nfe.dataEmissao || null,
    naturezaOperacao: nfe.naturezaOperacao ?? null,
    cnpjEmitente: nfe.emitente.cnpj || null,
    nomeEmitente: nfe.emitente.razaoSocial || null,
    ufEmitente: nfe.emitente.uf || null,
    ieEmitente: nfe.emitente.inscricaoEstadual || null,
    valorTotal: nfe.valorTotal,
    valorIcms: nfe.icmsTotal,
    valorIpi: nfe.ipiTotal,
    protocolo: nfe.protocolo ?? null,
    itens: nfe.itens.map((it) => ({
      numero: it.numero,
      codigo: it.codigo || null,
      descricao: it.descricao || "(sem descrição)",
      ncm: it.ncm || null,
      cfop: it.cfop || null,
      unidade: it.unidade || null,
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      valorTotal: it.valorTotal,
    })),
  };
}
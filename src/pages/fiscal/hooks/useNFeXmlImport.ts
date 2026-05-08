/**
 * Hook para importação de XML de NF-e.
 *
 * Encapsula toda a lógica de:
 *  - Parse do XML via `parseNFeXml`
 *  - Verificação de duplicidade pela chave de acesso (`verificarDuplicidadeChave`)
 *  - Casamento automático de fornecedor (por CNPJ) e produtos (por SKU/código interno)
 *  - Construção do payload `FiscalForm` + `GridItem[]` + mapa fiscal por item
 *
 * Extraído de `src/pages/Fiscal.tsx` na Fase 3 (parte 2) do roadmap fiscal
 * para reduzir o god component sem alterar comportamento.
 */
import { useCallback } from "react";
import { toast } from "sonner";
import { parseNFeXml, type NFeData } from "@/lib/nfeXmlParser";
import { verificarDuplicidadeChave } from "@/services/fiscal.service";
import { supabase } from "@/integrations/supabase/client";
import type { GridItem } from "@/components/ui/ItemsGrid";

export interface FornecedorMatchRef {
  id: string;
  nome_razao_social: string;
  cpf_cnpj: string | null;
}

export interface ProdutoMatchRef {
  id: string;
  nome: string;
  sku: string | null;
  codigo_interno: string | null;
  unidade_medida?: string | null;
  /** Lista de variações do cadastro (ex.: ["13 X 45"]). Usada para distinguir produtos homônimos. */
  variacoes?: string[] | null;
}

export interface NfItemFiscalDataLike {
  cfop?: string | null;
  ncm?: string | null;
  unidade?: string | null;
  icms_valor?: number | null;
  ipi_valor?: number | null;
  pis_valor?: number | null;
  cofins_valor?: number | null;
  descricao?: string | null;
  codigo_produto?: string | null;
}

/**
 * Linha da "tradução" XML→sistema. A esquerda (campos `xml*`) é a verdade fiscal e
 * NUNCA é alterada. A direita (`produtoId`, `unidadeInterna`, `fatorConversao`) é o
 * mapeamento interno aplicado em estoque/custo. Ver mem://features/traducao-xml-fiscal.
 */
export interface TraducaoLinha {
  index: number;
  // XML (read-only)
  xmlCodigo: string;
  xmlDescricao: string;
  xmlUnidade: string;
  xmlQuantidade: number;
  xmlValorUnitario: number;
  xmlValorTotal: number;
  // Internos
  produtoId: string;
  unidadeInterna: string | null;
  fatorConversao: number;
  /** Persistir o de-para (fornecedor + cProd → produto + fator) ao confirmar. */
  salvarDePara: boolean;
  /** "auto" = veio memorizado de produtos_fornecedores; "direto" = uCom == unidade interna; "manual" = usuário ajustou; "" = pendente. */
  matchStatus: "" | "auto" | "direto" | "manual";
  pendente: boolean;
}

export interface NFeXmlImportResult {
  nfe: NFeData;
  fornecedorId: string;
  items: GridItem[];
  fiscalMap: Record<number, NfItemFiscalDataLike>;
  unmatchedItemsCount: number;
  traducao: TraducaoLinha[];
  /** true se TODOS os itens caíram em "OK" (sem pendência) — drawer pode ser opcional. */
  traducaoOk: boolean;
  /** Se a chave já consta em `nfe_distribuicao` (caminho automático já recebeu),
   *  carrega referência para o caller exibir CTA "Abrir caminho automático". */
  distdfeRef?: {
    id: string;
    chave_acesso: string;
    ciencia_em: string | null;
    status: string | null;
  } | null;
}

export interface UseNFeXmlImportArgs {
  fornecedores: FornecedorMatchRef[];
  produtos: ProdutoMatchRef[];
}

/**
 * Importa um XML de NF-e a partir de um `File` e devolve o resultado já
 * normalizado para popular o formulário. Lança erro em caso de duplicidade
 * ou parse inválido — o caller decide como reagir (toast/modal).
 */
export function useNFeXmlImport({ fornecedores, produtos }: UseNFeXmlImportArgs) {
  const importXml = useCallback(
    async (input: File | string): Promise<NFeXmlImportResult | null> => {
      // Aceita File (upload manual) ou string (XML obtido por consulta de chave / DistDFe).
      const xmlText = typeof input === "string" ? input : await input.text();
      const nfe: NFeData = parseNFeXml(xmlText);

      // Bloqueio de re-importação por chave de acesso (idempotência fiscal).
      // Ignora canceladas/inutilizadas para permitir reimportação corretiva.
      if (nfe.chaveAcesso) {
        const dup = await verificarDuplicidadeChave(nfe.chaveAcesso, {
          ignorarCanceladas: true,
        });
        if (dup) {
          const ref = dup.numero ? `nº ${dup.numero}/${dup.serie ?? "1"}` : `id ${dup.id.slice(0, 8)}…`;
          const statusInfo = dup.status_sefaz ?? dup.status ?? "—";
          toast.error(
            `XML já importado (NF ${ref}, status: ${statusInfo}). Importação abortada.`,
          );
          return null;
        }
      }

      // Cross-check com o caminho automático (DistDFe). Não bloqueia, apenas
      // informa para o usuário não importar manualmente algo já recebido.
      let distdfeRef: NFeXmlImportResult["distdfeRef"] = null;
      if (nfe.chaveAcesso) {
        const { data: dist } = await supabase
          .from("nfe_distribuicao")
          .select("id, chave_acesso, ciencia_em, status")
          .eq("chave_acesso", nfe.chaveAcesso)
          .maybeSingle();
        if (dist) {
          distdfeRef = dist as NonNullable<NFeXmlImportResult["distdfeRef"]>;
          const dataCiencia = dist.ciencia_em
            ? new Date(dist.ciencia_em).toLocaleDateString("pt-BR")
            : "data desconhecida";
          toast.info(
            `Esta chave já foi recebida pelo DistDFe (${dataCiencia}). Considere usar o caminho automático para evitar divergências.`,
          );
        }
      }

      // Match de fornecedor por CNPJ (limpo).
      let fornecedorId = "";
      if (nfe.emitente.cnpj) {
        const cnpjClean = nfe.emitente.cnpj.replace(/\D/g, "");
        const matched = fornecedores.find(
          (f) => (f.cpf_cnpj || "").replace(/\D/g, "") === cnpjClean,
        );
        if (matched) {
          fornecedorId = matched.id;
          toast.info(`Fornecedor identificado: ${matched.nome_razao_social}`);
        } else {
          toast.info(
            `Fornecedor CNPJ ${nfe.emitente.cnpj} não encontrado no cadastro. Preencha manualmente.`,
          );
        }
      }

      // Lookup do de-para por (fornecedor, cProd) — fonte preferencial de match.
      type DeParaRow = { produto_id: string; referencia_fornecedor: string | null; unidade_fornecedor: string | null; fator_conversao: number };
      const deParaByCodigo = new Map<string, DeParaRow>();
      if (fornecedorId) {
        const codigos = Array.from(new Set(nfe.itens.map((i) => i.codigo).filter(Boolean)));
        if (codigos.length > 0) {
          const { data: depara } = await supabase
            .from("produtos_fornecedores")
            .select("produto_id, referencia_fornecedor, unidade_fornecedor, fator_conversao")
            .eq("fornecedor_id", fornecedorId)
            .in("referencia_fornecedor", codigos);
          (depara || []).forEach((d) => {
            if (d.referencia_fornecedor) deParaByCodigo.set(d.referencia_fornecedor, d as DeParaRow);
          });
        }
      }

      const norm = (s: string | null | undefined) => (s || "").trim().toUpperCase();

      // Index produtos por id, codigo_interno e sku para evitar varreduras
      // O(n×m) por linha do XML.
      const produtosById = new Map<string, typeof produtos[number]>();
      const produtosByCodigo = new Map<string, typeof produtos[number]>();
      produtos.forEach((p) => {
        produtosById.set(p.id, p);
        if (p.codigo_interno) produtosByCodigo.set(p.codigo_interno, p);
        if (p.sku) produtosByCodigo.set(p.sku, p);
      });

      const traducao: TraducaoLinha[] = nfe.itens.map((nfeItem, idx) => {
        const dp = deParaByCodigo.get(nfeItem.codigo);
        const matchedById = dp ? produtosById.get(dp.produto_id) : undefined;
        const matchedByCodigo = !matchedById ? produtosByCodigo.get(nfeItem.codigo) : undefined;
        const matched = matchedById || matchedByCodigo;
        const unidadeInterna = matched?.unidade_medida ?? null;
        const xmlUni = norm(nfeItem.unidade);
        const intUni = norm(unidadeInterna);
        const unidadesIguais = !!intUni && xmlUni === intUni;

        let fator = 1;
        let matchStatus: TraducaoLinha["matchStatus"] = "";
        let pendente = true;

        if (!matched) {
          pendente = true; // sem produto vinculado
        } else if (dp && Number(dp.fator_conversao) > 0) {
          fator = Number(dp.fator_conversao);
          matchStatus = "auto";
          pendente = false;
        } else if (unidadesIguais) {
          fator = 1;
          matchStatus = "direto";
          pendente = false;
        } else {
          // Match por código interno mas unidade diverge sem fator memorizado.
          pendente = true;
        }

        return {
          index: idx,
          xmlCodigo: nfeItem.codigo,
          xmlDescricao: nfeItem.descricao,
          xmlUnidade: nfeItem.unidade,
          xmlQuantidade: nfeItem.quantidade,
          xmlValorUnitario: nfeItem.valorUnitario,
          xmlValorTotal: nfeItem.valorTotal,
          produtoId: matched?.id || "",
          unidadeInterna,
          fatorConversao: fator,
          salvarDePara: pendente, // sugerir salvar quando o usuário resolver a pendência
          matchStatus,
          pendente,
        };
      });

      // Items aplicando a tradução (qtd_interna = qCom * fator; vUn_interno preserva total).
      const items: GridItem[] = traducao.map((t, i) => {
        const nfeItem = nfe.itens[i];
        const qtdInterna = t.fatorConversao > 0 ? t.xmlQuantidade * t.fatorConversao : t.xmlQuantidade;
        const vUnInterno = qtdInterna > 0 ? t.xmlValorTotal / qtdInterna : t.xmlValorUnitario;
        const matched = t.produtoId ? produtosById.get(t.produtoId) : undefined;
        return {
          produto_id: t.produtoId,
          codigo: nfeItem.codigo,
          descricao: matched?.nome || nfeItem.descricao,
          quantidade: qtdInterna,
          valor_unitario: vUnInterno,
          valor_total: t.xmlValorTotal, // total fiscal preservado
        };
      });

      // Preserva campos fiscais que vêm do XML para reescrita ao salvar.
      const fiscalMap: Record<number, NfItemFiscalDataLike> = {};
      nfe.itens.forEach((nfeItem, idx) => {
        fiscalMap[idx] = {
          cfop: nfeItem.cfop || null,
          ncm: nfeItem.ncm || null,
          unidade: nfeItem.unidade || null,
          icms_valor: nfeItem.icms || null,
          ipi_valor: nfeItem.ipi || null,
          pis_valor: nfeItem.pis || null,
          cofins_valor: nfeItem.cofins || null,
          descricao: nfeItem.descricao || null,
          codigo_produto: nfeItem.codigo || null,
        };
      });

      const unmatchedItemsCount = items.filter((i) => !i.produto_id).length;
      const traducaoOk = traducao.every((t) => !t.pendente);

      return { nfe, fornecedorId, items, fiscalMap, unmatchedItemsCount, traducao, traducaoOk, distdfeRef };
    },
    [fornecedores, produtos],
  );

  return { importXml };
}
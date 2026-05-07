import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { calcularTotalNF } from "@/lib/fiscal";
import { logger } from "@/lib/logger";
import {
  listOrdensVendaParaFiscal,
  listContasContabeisLancaveis,
  listNotaFiscalItensCompletos,
  upsertNotaFiscalComItens,
  registrarEventoFiscal,
} from "@/services/fiscal.service";
import { listCartoesAtivos, type CartaoCredito } from "@/services/cartoesCredito.service";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import type { GridItem } from "@/components/ui/ItemsGrid";
import type { ParcelaPlano } from "@/pages/fiscal/components/ParcelasFiscalEditor";
import type {
  FornecedorRefMin,
  ClienteRefMin,
  ProdutoRefMin,
  OrdemVendaRefMin,
  ContaContabilRefMin,
} from "@/pages/fiscal/components/NfeCreateFormModal";

/**
 * Estado canônico do formulário de NF-e — alinhado a `Fiscal.tsx::FiscalForm`
 * para permitir o uso compartilhado de `NfeFormBody` entre o modal de criação
 * e a página `/fiscal/novo` | `/fiscal/:id/editar` (Sprint 7.2 #9).
 */
export interface FiscalFormState {
  tipo: string; numero: string; serie: string; chave_acesso: string;
  data_emissao: string; fornecedor_id: string; cliente_id: string;
  valor_total: number; status: string; observacoes: string;
  movimenta_estoque: boolean; gera_financeiro: boolean;
  forma_pagamento: string; condicao_pagamento: string;
  ordem_venda_id: string; conta_contabil_id: string;
  modelo_documento: string; cartao_id: string;
  frete_valor: number; icms_valor: number; ipi_valor: number;
  pis_valor: number; cofins_valor: number; icms_st_valor: number;
  desconto_valor: number; outras_despesas: number; origem: string;
  [key: string]: string | number | boolean;
}

export interface NfItemFiscalData {
  cfop?: string | null; cst?: string | null; ncm?: string | null; unidade?: string | null;
  descricao?: string | null; icms_valor?: number | null; icms_aliquota?: number | null;
  icms_base?: number | null; ipi_valor?: number | null; ipi_aliquota?: number | null;
  pis_valor?: number | null; pis_aliquota?: number | null; base_pis?: number | null;
  cofins_valor?: number | null; cofins_aliquota?: number | null; base_cofins?: number | null;
  valor_st?: number | null; base_st?: number | null;
  csosn?: string | null; cst_pis?: string | null; cst_cofins?: string | null;
  cst_ipi?: string | null; desconto?: number | null; codigo_produto?: string | null;
}

export const emptyFiscalForm: FiscalFormState = {
  tipo: "entrada", numero: "", serie: "1", chave_acesso: "",
  data_emissao: new Date().toISOString().split("T")[0],
  fornecedor_id: "", cliente_id: "", valor_total: 0, status: "pendente",
  observacoes: "", movimenta_estoque: true, gera_financeiro: true,
  forma_pagamento: "", condicao_pagamento: "a_vista",
  ordem_venda_id: "", conta_contabil_id: "", modelo_documento: "55", cartao_id: "",
  frete_valor: 0, icms_valor: 0, ipi_valor: 0, pis_valor: 0, cofins_valor: 0,
  icms_st_valor: 0, desconto_valor: 0, outras_despesas: 0, origem: "manual",
};

interface UseFiscalNotaFormOpts {
  notaId?: string | null;
  onSaved?: (id: string) => void;
}

/**
 * Hook canônico de orquestração do form de NF — usado pela página
 * `NotaFiscalForm`. Compartilha a forma de estado com `Fiscal.tsx` para
 * que ambos consumam o mesmo `NfeFormBody`.
 */
export function useFiscalNotaForm({ notaId, onSaved }: UseFiscalNotaFormOpts) {
  const fornecedoresCrud = useSupabaseCrud<FornecedorRefMin>({ table: "fornecedores" });
  const clientesCrud = useSupabaseCrud<ClienteRefMin>({ table: "clientes" });
  const produtosCrud = useSupabaseCrud<ProdutoRefMin>({ table: "produtos" });
  const [ordensVenda, setOrdensVenda] = useState<OrdemVendaRefMin[]>([]);
  const [contasContabeis, setContasContabeis] = useState<ContaContabilRefMin[]>([]);
  const [cartoes, setCartoes] = useState<CartaoCredito[]>([]);

  const [form, setForm] = useState<FiscalFormState>({ ...emptyFiscalForm });
  const [items, setItems] = useState<GridItem[]>([]);
  const [itemContaContabil, setItemContaContabil] = useState<Record<number, string>>({});
  const [itemFiscalData, setItemFiscalData] = useState<Record<number, NfItemFiscalData>>({});
  const [parcelas, setParcelas] = useState(1);
  const [primeiroVencimento, setPrimeiroVencimento] = useState("");
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [parcelasPlano, setParcelasPlano] = useState<ParcelaPlano[]>([]);

  const [loading, setLoading] = useState(!!notaId);
  const [saving, setSaving] = useState(false);

  // Lookups auxiliares
  useEffect(() => {
    (async () => {
      const [ovs, contas, cs] = await Promise.all([
        listOrdensVendaParaFiscal(),
        listContasContabeisLancaveis(),
        listCartoesAtivos().catch(() => []),
      ]);
      setOrdensVenda(ovs);
      setContasContabeis(contas);
      setCartoes(cs);
    })();
  }, []);

  // Carregamento de NF existente
  useEffect(() => {
    if (!notaId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .eq("id", notaId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Nota fiscal não encontrada.");
        setLoading(false);
        return;
      }
      const n = data as Record<string, unknown>;
      setForm({
        ...emptyFiscalForm,
        tipo: String(n.tipo || "entrada"),
        numero: String(n.numero || ""),
        serie: String(n.serie || "1"),
        chave_acesso: String(n.chave_acesso || ""),
        data_emissao: String(n.data_emissao || emptyFiscalForm.data_emissao),
        fornecedor_id: String(n.fornecedor_id || ""),
        cliente_id: String(n.cliente_id || ""),
        valor_total: Number(n.valor_total || 0),
        status: String(n.status || "pendente"),
        observacoes: String(n.observacoes || ""),
        movimenta_estoque: n.movimenta_estoque !== false,
        gera_financeiro: n.gera_financeiro !== false,
        forma_pagamento: String(n.forma_pagamento || ""),
        condicao_pagamento: String(n.condicao_pagamento || "a_vista"),
        ordem_venda_id: String(n.ordem_venda_id || ""),
        conta_contabil_id: String(n.conta_contabil_id || ""),
        modelo_documento: String(n.modelo_documento || "55"),
        cartao_id: String(n.cartao_id || ""),
        frete_valor: Number(n.frete_valor || 0),
        icms_valor: Number(n.icms_valor || 0),
        ipi_valor: Number(n.ipi_valor || 0),
        pis_valor: Number(n.pis_valor || 0),
        cofins_valor: Number(n.cofins_valor || 0),
        icms_st_valor: Number(n.icms_st_valor || 0),
        desconto_valor: Number(n.desconto_valor || 0),
        outras_despesas: Number(n.outras_despesas || 0),
        origem: String(n.origem || "manual"),
      });
      const itens = await listNotaFiscalItensCompletos(notaId).catch(() => []);
      const itensTyped = itens as unknown as Array<Record<string, unknown> & {
        produtos?: { nome: string; sku: string } | null;
      }>;
      const loadedItems: GridItem[] = itensTyped.map((i) => ({
        id: String(i.id || ""),
        produto_id: String(i.produto_id || ""),
        codigo: i.produtos?.sku || "",
        descricao: i.produtos?.nome || String(i.descricao || ""),
        quantidade: Number(i.quantidade || 0),
        valor_unitario: Number(i.valor_unitario || 0),
        valor_total: Number(i.quantidade || 0) * Number(i.valor_unitario || 0),
      }));
      const contaMap: Record<number, string> = {};
      const fiscalMap: Record<number, NfItemFiscalData> = {};
      itensTyped.forEach((i, idx) => {
        if (i.conta_contabil_id) contaMap[idx] = String(i.conta_contabil_id);
        fiscalMap[idx] = {
          cfop: (i.cfop as string) ?? null, cst: (i.cst as string) ?? null,
          ncm: (i.ncm as string) ?? null, unidade: (i.unidade as string) ?? null,
          descricao: (i.descricao as string) ?? null,
          icms_valor: (i.icms_valor as number) ?? null, icms_aliquota: (i.icms_aliquota as number) ?? null,
          icms_base: (i.icms_base as number) ?? null, ipi_valor: (i.ipi_valor as number) ?? null,
          ipi_aliquota: (i.ipi_aliquota as number) ?? null,
          pis_valor: (i.pis_valor as number) ?? null, pis_aliquota: (i.pis_aliquota as number) ?? null,
          base_pis: (i.base_pis as number) ?? null,
          cofins_valor: (i.cofins_valor as number) ?? null, cofins_aliquota: (i.cofins_aliquota as number) ?? null,
          base_cofins: (i.base_cofins as number) ?? null,
          valor_st: (i.valor_st as number) ?? null, base_st: (i.base_st as number) ?? null,
          csosn: (i.csosn as string) ?? null, cst_pis: (i.cst_pis as string) ?? null,
          cst_cofins: (i.cst_cofins as string) ?? null, cst_ipi: (i.cst_ipi as string) ?? null,
          desconto: (i.desconto as number) ?? null,
          codigo_produto: (i.codigo_produto as string) ?? null,
        };
      });
      setItems(loadedItems);
      setItemContaContabil(contaMap);
      setItemFiscalData(fiscalMap);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [notaId]);

  const valorProdutos = useMemo(
    () => items.reduce((s, i) => s + (i.valor_total || 0), 0),
    [items],
  );
  const totalImpostos = useMemo(
    () => Number(form.ipi_valor || 0) + Number(form.icms_st_valor || 0),
    [form.ipi_valor, form.icms_st_valor],
  );
  const totalNF = useMemo(
    () => calcularTotalNF(
      valorProdutos,
      Number(form.desconto_valor || 0),
      Number(form.icms_st_valor || 0),
      Number(form.ipi_valor || 0),
      Number(form.frete_valor || 0),
      Number(form.outras_despesas || 0),
    ),
    [valorProdutos, form.desconto_valor, form.icms_st_valor, form.ipi_valor, form.frete_valor, form.outras_despesas],
  );

  const buildItemsPayload = (nfId: string) =>
    items.map((i, idx) => {
      if (!i.produto_id) {
        throw new Error(`Item ${idx + 1} sem vínculo de produto.`);
      }
      const f = itemFiscalData[idx] || {};
      return {
        nota_fiscal_id: nfId,
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        valor_unitario: i.valor_unitario,
        conta_contabil_id: itemContaContabil[idx] || null,
        cfop: f.cfop ?? null, cst: f.cst ?? null, ncm: f.ncm ?? null,
        unidade: f.unidade ?? null,
        descricao: f.descricao ?? i.descricao ?? null,
        icms_valor: f.icms_valor ?? null, icms_aliquota: f.icms_aliquota ?? null,
        icms_base: f.icms_base ?? null,
        ipi_valor: f.ipi_valor ?? null, ipi_aliquota: f.ipi_aliquota ?? null,
        pis_valor: f.pis_valor ?? null, pis_aliquota: f.pis_aliquota ?? null,
        base_pis: f.base_pis ?? null,
        cofins_valor: f.cofins_valor ?? null, cofins_aliquota: f.cofins_aliquota ?? null,
        base_cofins: f.base_cofins ?? null,
        valor_st: f.valor_st ?? null, base_st: f.base_st ?? null,
        csosn: f.csosn ?? null, cst_pis: f.cst_pis ?? null, cst_cofins: f.cst_cofins ?? null,
        cst_ipi: f.cst_ipi ?? null,
        desconto: f.desconto ?? null,
        codigo_produto: f.codigo_produto ?? i.codigo ?? null,
      };
    });

  const submit = async () => {
    if (!form.numero) { toast.error("Número é obrigatório"); return; }
    if (form.tipo === "entrada" && !form.fornecedor_id) {
      toast.error("Fornecedor é obrigatório para entrada"); return;
    }
    if (form.tipo === "saida" && !form.cliente_id) {
      toast.error("Cliente é obrigatório para saída"); return;
    }
    if (form.forma_pagamento === "cartao_credito" && !form.cartao_id) {
      toast.error("Selecione o cartão de crédito."); return;
    }
    const unlinked = items.filter((i) => !i.produto_id).length;
    if (unlinked > 0) {
      toast.error(`${unlinked} item(ns) sem produto vinculado.`); return;
    }
    setSaving(true);
    try {
      const savedTotal = totalNF || form.valor_total;
      const planoParcelas =
        form.condicao_pagamento === "a_prazo" && parcelas > 1 ? parcelasPlano : null;
      const payload = {
        ...form,
        fornecedor_id: form.fornecedor_id || null,
        cliente_id: form.cliente_id || null,
        ordem_venda_id: form.ordem_venda_id || null,
        conta_contabil_id: form.conta_contabil_id || null,
        cartao_id: form.cartao_id || null,
        valor_total: savedTotal,
        valor_produtos: valorProdutos,
        parcelas: planoParcelas,
      };
      const nfId = await upsertNotaFiscalComItens({
        mode: notaId ? "edit" : "create",
        nfId: notaId ?? undefined,
        payload: payload as never,
        itemsBuilder: (id) => buildItemsPayload(id) as never,
      });
      if (!notaId) {
        await registrarEventoFiscal({
          nota_fiscal_id: nfId,
          tipo_evento: "criacao",
          status_novo: "pendente",
          descricao: `NF ${form.numero} criada manualmente.`,
          payload_resumido: { valor_total: savedTotal, itens: items.length },
        });
      } else {
        await registrarEventoFiscal({
          nota_fiscal_id: notaId,
          tipo_evento: "edicao",
          descricao: `NF ${form.numero} editada. Novo total: R$ ${savedTotal.toFixed(2)}.`,
          payload_resumido: { valor_total: savedTotal, itens: items.length },
        });
      }
      toast.success("Nota fiscal salva!");
      onSaved?.(nfId);
    } catch (err) {
      logger.error("[fiscal] salvar NF (page):", err);
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return {
    // lookups
    fornecedores: fornecedoresCrud.data,
    clientes: clientesCrud.data,
    produtos: produtosCrud.data,
    ordensVenda, contasContabeis, cartoes,
    // estado
    form, setForm, items, setItems,
    itemContaContabil, setItemContaContabil,
    itemFiscalData, setItemFiscalData,
    parcelas, setParcelas,
    primeiroVencimento, setPrimeiroVencimento,
    intervaloDias, setIntervaloDias,
    parcelasPlano, setParcelasPlano,
    // derivados
    valorProdutos, totalImpostos, totalNF,
    // status
    loading, saving,
    // ações
    submit,
  };
}
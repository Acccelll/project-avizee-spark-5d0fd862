import { useCallback, useState } from "react";
import { toast } from "sonner";
import { exportarParaExcel, exportarParaPdf } from "@/services/export.service";
import { processarEstorno } from "@/services/financeiro.service";
import { notifyError } from "@/utils/errorMessages";
import { supabase } from "@/integrations/supabase/client";
import type { Lancamento } from "@/types/domain";
import type { LancamentoForm } from "@/pages/financeiro/types";
import { useGerarParcelas } from "@/pages/financeiro/hooks/useBaixaFinanceira";
import { logger } from "@/lib/logger";
import { cartaoFaturaParaData } from "@/services/cartoesCredito.service";

type LancamentoWritePayload = Partial<Lancamento>;

interface Params {
  filteredData: Lancamento[];
  getLancamentoStatus: (l: Lancamento) => string;
  create: (payload: LancamentoWritePayload) => Promise<Lancamento>;
  update: (id: string, payload: LancamentoWritePayload) => Promise<Lancamento>;
  fetchData: () => Promise<void>;
}

export function useFinanceiroActions({ filteredData, getLancamentoStatus, create, update, fetchData }: Params) {
  const [saving, setSaving] = useState(false);
  const [estornoTarget, setEstornoTarget] = useState<Lancamento | null>(null);
  const [estornoProcessing, setEstornoProcessing] = useState(false);
  const [estornoMotivo, setEstornoMotivo] = useState("");
  const gerarParcelas = useGerarParcelas();

  const handleSubmit = useCallback(
    async (mode: "create" | "edit", form: LancamentoForm, selected: Lancamento | null, onSuccess: () => void) => {
      if (!form.descricao || !form.valor) {
        toast.error("Descrição e valor são obrigatórios");
        return;
      }
      if (!form.data_vencimento) {
        toast.error("Data de vencimento é obrigatória");
        return;
      }
      if (form.status === "pago") {
        if (!form.data_pagamento) {
          toast.error("Data de pagamento é obrigatória para status Pago");
          return;
        }
        if (!form.forma_pagamento) {
          toast.error("Forma de pagamento é obrigatória para status Pago");
          return;
        }
        if (!form.conta_bancaria_id) {
          toast.error("Conta bancária é obrigatória para baixa");
          return;
        }
      }

      setSaving(true);

      try {
        // Se é pagamento em cartão de crédito com cartão selecionado,
        // resolve a fatura correspondente à data de vencimento e usa o
        // vencimento da fatura como vencimento efetivo do lançamento.
        let resolvedVencimento = form.data_vencimento;
        let resolvedFaturaId: string | null = form.cartao_fatura_id || null;
        if (
          form.forma_pagamento === "cartao_credito" &&
          form.cartao_id &&
          mode === "create"
        ) {
          try {
            const faturaId = await cartaoFaturaParaData(
              form.cartao_id,
              form.data_vencimento,
            );
            if (faturaId) {
              resolvedFaturaId = faturaId;
              const { data: fat } = await supabase
                .from("cartao_faturas")
                .select("data_vencimento")
                .eq("id", faturaId)
                .maybeSingle();
              if (fat?.data_vencimento) {
                resolvedVencimento = fat.data_vencimento;
              }
            }
          } catch (err) {
            logger.warn("[financeiro] falha ao resolver fatura de cartão", err);
          }
        }

        const basePayload: LancamentoWritePayload = {
          tipo: form.tipo,
          descricao: form.descricao,
          valor: form.valor,
          data_vencimento: resolvedVencimento,
          status: form.status === "vencido" ? "aberto" : form.status,
          forma_pagamento: form.forma_pagamento || null,
          banco: form.banco || null,
          cartao: form.cartao || null,
          cartao_id: form.cartao_id || null,
          cartao_fatura_id: resolvedFaturaId,
          cliente_id: form.cliente_id || null,
          fornecedor_id: form.fornecedor_id || null,
          conta_bancaria_id: form.conta_bancaria_id || null,
          conta_contabil_id: form.conta_contabil_id || null,
          data_pagamento: form.data_pagamento || null,
          observacoes: form.observacoes || null,
        };

        if (mode === "create" && form.gerar_parcelas && form.num_parcelas > 1) {
          const numParcelas = Number(form.num_parcelas);
          const intervalo = Number(form.intervalo_dias) || 30;
          // RPC oficial `gerar_parcelas_financeiras`: cria agrupador + N parcelas
          // de forma atômica, garantindo rollback automático em caso de falha.
          await gerarParcelas.mutateAsync({
            base: {
              tipo: form.tipo as "receber" | "pagar",
              descricao: form.descricao,
              valor: form.valor,
              data_vencimento: form.data_vencimento,
              forma_pagamento: form.forma_pagamento || null,
              banco: form.banco || null,
              cartao: form.cartao || null,
              cliente_id: form.cliente_id || null,
              fornecedor_id: form.fornecedor_id || null,
              conta_bancaria_id: form.conta_bancaria_id || null,
              conta_contabil_id: form.conta_contabil_id || null,
              observacoes: form.observacoes || null,
            },
            numParcelas,
            intervaloDias: intervalo,
          });
          await fetchData();
        } else if (mode === "create") {
          await create(basePayload);
        } else if (selected) {
          await update(selected.id, basePayload);
        }

        onSuccess();
      } catch (error) {
        logger.error("[financeiro] erro ao salvar:", error);
        notifyError(error);
      } finally {
        setSaving(false);
      }
    },
    [create, update, fetchData, gerarParcelas],
  );

  const handleEstorno = useCallback(async () => {
    if (!estornoTarget) return;
    if (!estornoMotivo.trim()) {
      toast.error("Informe o motivo do estorno");
      return;
    }

    setEstornoProcessing(true);
    const ok = await processarEstorno(estornoTarget.id, estornoMotivo.trim());
    setEstornoProcessing(false);

    if (ok) {
      setEstornoTarget(null);
      setEstornoMotivo("");
      await fetchData();
    }
  }, [estornoTarget, estornoMotivo, fetchData]);

  const handleExportar = useCallback(
    async (formato: "excel" | "pdf") => {
      const rows = filteredData.map((item) => ({
        Tipo: item.tipo === "receber" ? "A Receber" : "A Pagar",
        Descrição: item.descricao,
        Pessoa:
          item.tipo === "receber"
            ? (item.clientes?.nome_razao_social ?? "")
            : (item.fornecedores?.nome_razao_social ?? ""),
        Vencimento: item.data_vencimento,
        "Valor (R$)": Number(item.valor),
        Status: getLancamentoStatus(item),
        "Forma Pgto": item.forma_pagamento ?? "",
        Banco: item.contas_bancarias
          ? `${item.contas_bancarias.bancos?.nome ?? ""} - ${item.contas_bancarias.descricao}`
          : "",
      }));
      const opts = { titulo: "Contas a Pagar-Receber", rows };
      if (formato === "excel") await exportarParaExcel(opts);
      else await exportarParaPdf(opts);
    },
    [filteredData, getLancamentoStatus],
  );

  return {
    saving,
    handleSubmit,
    handleExportar,
    handleEstorno,
    estornoTarget,
    setEstornoTarget,
    estornoProcessing,
    estornoMotivo,
    setEstornoMotivo,
  };
}

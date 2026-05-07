import { useState } from "react";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import * as ccs from "@/services/cotacoesCompra.service";
import type { CotacaoCompra, Proposta } from "@/components/compras/cotacaoCompraTypes";

/**
 * Encapsula o formulário de propostas + handlers (add/select/delete) e
 * recarrega `viewPropostas`. Extraído de `useCotacoesCompra`.
 */
export function useCotacaoPropostas(params: {
  selected: CotacaoCompra | null;
  viewPropostas: Proposta[];
  setViewPropostas: (v: Proposta[]) => void;
}) {
  const { selected, viewPropostas, setViewPropostas } = params;

  const [addingProposal, setAddingProposal] = useState<string | null>(null);
  const [proposalForm, setProposalForm] = useState({
    fornecedor_id: "",
    preco_unitario: 0,
    prazo_entrega_dias: "",
    observacoes: "",
  });

  const reload = async () => {
    if (!selected) return;
    const propostas = await ccs.listCotacaoPropostas(selected.id);
    setViewPropostas((propostas || []) as Proposta[]);
  };

  const handleAddProposal = async (itemId: string) => {
    if (!proposalForm.fornecedor_id || !selected) {
      toast.error("Selecione um fornecedor.");
      return;
    }
    if (Number(proposalForm.preco_unitario) <= 0) {
      toast.error("Preço unitário deve ser maior que zero.");
      return;
    }
    const duplicado = viewPropostas.some(
      (p) => p.item_id === itemId && p.fornecedor_id === proposalForm.fornecedor_id,
    );
    if (duplicado) {
      toast.error(
        "Este fornecedor já tem uma proposta para este item. Edite a proposta existente.",
      );
      return;
    }
    try {
      await ccs.insertCotacaoProposta({
        cotacao_compra_id: selected.id,
        item_id: itemId,
        fornecedor_id: proposalForm.fornecedor_id,
        preco_unitario: proposalForm.preco_unitario,
        prazo_entrega_dias: proposalForm.prazo_entrega_dias
          ? Number(proposalForm.prazo_entrega_dias)
          : null,
        observacoes: proposalForm.observacoes || null,
      });
      toast.success("Proposta adicionada!");
      setAddingProposal(null);
      setProposalForm({ fornecedor_id: "", preco_unitario: 0, prazo_entrega_dias: "", observacoes: "" });
      await reload();
    } catch (err: unknown) {
      notifyError(err);
    }
  };

  const handleSelectProposal = async (propostaId: string, itemId: string) => {
    if (!selected) return;
    // Optimistic update: marca local imediatamente para feedback instantâneo,
    // depois reconcilia com o servidor.
    const previous = viewPropostas;
    setViewPropostas(
      viewPropostas.map((p) =>
        p.item_id === itemId
          ? { ...p, selecionado: p.id === propostaId }
          : p,
      ) as Proposta[],
    );
    try {
      await ccs.selectCotacaoProposta({ cotacaoId: selected.id, itemId, propostaId });
      toast.success("Fornecedor selecionado!");
      await reload();
    } catch (err: unknown) {
      setViewPropostas(previous);
      notifyError(err);
    }
  };

  const handleDeleteProposal = async (propostaId: string) => {
    if (!selected) return;
    await ccs.deleteCotacaoProposta(propostaId);
    toast.success("Proposta removida");
    await reload();
  };

  return {
    addingProposal,
    setAddingProposal,
    proposalForm,
    setProposalForm,
    handleAddProposal,
    handleSelectProposal,
    handleDeleteProposal,
  };
}

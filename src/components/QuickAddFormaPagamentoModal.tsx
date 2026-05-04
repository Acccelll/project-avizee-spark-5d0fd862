import { useState } from "react";
import { Wallet } from "lucide-react";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { FormSection } from "@/components/FormSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QuickAddFormaPagamentoModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

import { FORMA_PAGAMENTO_OPTIONS } from "@/lib/financeiro";

const empty = {
  descricao: "",
  tipo: "boleto_dda",
  prazo_dias: 0,
  parcelas: 1,
  gera_financeiro: true,
};

/**
 * Cadastro rápido de Forma de Pagamento — disparado de Orçamento/Pedido/NF.
 */
export function QuickAddFormaPagamentoModal({
  open,
  onClose,
  onCreated,
}: QuickAddFormaPagamentoModalProps) {
  const { saving, submit } = useSubmitLock({
    errorPrefix: "Erro ao cadastrar forma de pagamento",
  });
  const [form, setForm] = useState({ ...empty });
  const [isDirty, setIsDirty] = useState(false);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setIsDirty(true);
  };

  const reset = () => {
    setForm({ ...empty });
    setIsDirty(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descricao.trim()) {
      toast.error("Descrição é obrigatória");
      return;
    }
    if (form.parcelas < 1) {
      toast.error("Parcelas deve ser ≥ 1");
      return;
    }
    await submit(async () => {
      const { data, error } = await supabase
        .from("formas_pagamento")
        .insert({
          descricao: form.descricao.trim(),
          tipo: form.tipo,
          prazo_dias: form.prazo_dias,
          parcelas: form.parcelas,
          gera_financeiro: form.gera_financeiro,
          ativo: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Forma de pagamento cadastrada!");
      onCreated(data.id);
      reset();
      onClose();
    });
  };

  return (
    <FormModal
      open={open}
      onClose={handleClose}
      title="Cadastro Rápido de Forma de Pagamento"
      mode="create"
      size="md"
      isDirty={isDirty}
      confirmOnDirty
      createHint="Preencha o essencial — ajustes finos (intervalos por parcela) ficam para a tela completa."
      footer={
        <FormModalFooter
          saving={saving}
          isDirty={isDirty}
          onCancel={handleClose}
          submitAsForm
          formId="quick-add-fp-form"
          mode="create"
          primaryLabel="Cadastrar"
        />
      }
    >
      <form id="quick-add-fp-form" onSubmit={handleSubmit} className="space-y-5">
        <FormSection icon={Wallet} title="Dados" noBorder>
          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Input
              value={form.descricao}
              onChange={(e) => update("descricao", e.target.value)}
              placeholder="Ex.: Boleto 30/60/90"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => update("tipo", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMA_PAGAMENTO_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prazo (dias)</Label>
              <Input
                type="number"
                min={0}
                value={form.prazo_dias}
                onChange={(e) => update("prazo_dias", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Parcelas</Label>
              <Input
                type="number"
                min={1}
                value={form.parcelas}
                onChange={(e) => update("parcelas", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Gera financeiro</Label>
              <p className="text-xs text-muted-foreground">
                Quando marcado, gera lançamentos automáticos a partir de pedidos/NF.
              </p>
            </div>
            <Switch
              checked={form.gera_financeiro}
              onCheckedChange={(v) => update("gera_financeiro", v)}
            />
          </div>
        </FormSection>
      </form>
    </FormModal>
  );
}
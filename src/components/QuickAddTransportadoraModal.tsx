import { useState } from "react";
import { Truck, Search } from "lucide-react";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { FormSection } from "@/components/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QuickAddTransportadoraModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

const empty = {
  nome_razao_social: "",
  nome_fantasia: "",
  cpf_cnpj: "",
  email: "",
  telefone: "",
  contato: "",
};

/**
 * Cadastro rápido de transportadora — disparado de remessas/pedidos.
 * Inclui lookup automático por CNPJ via useCnpjLookup.
 */
export function QuickAddTransportadoraModal({
  open,
  onClose,
  onCreated,
}: QuickAddTransportadoraModalProps) {
  const { saving, submit } = useSubmitLock({
    errorPrefix: "Erro ao cadastrar transportadora",
  });
  const { buscarCnpj, loading: cnpjLoading } = useCnpjLookup();
  const [form, setForm] = useState({ ...empty });
  const [isDirty, setIsDirty] = useState(false);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setIsDirty(true);
  };

  const handleCnpjLookup = async () => {
    const r = await buscarCnpj(form.cpf_cnpj);
    if (r) {
      setForm((p) => ({
        ...p,
        nome_razao_social: r.razao_social || p.nome_razao_social,
        nome_fantasia: r.nome_fantasia || p.nome_fantasia,
        email: r.email || p.email,
        telefone: r.telefone || p.telefone,
      }));
      setIsDirty(true);
    }
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
    if (!form.nome_razao_social.trim()) {
      toast.error("Razão Social é obrigatória");
      return;
    }
    await submit(async () => {
      const { data, error } = await supabase
        .from("transportadoras")
        .insert({
          nome_razao_social: form.nome_razao_social.trim(),
          nome_fantasia: form.nome_fantasia.trim() || null,
          cpf_cnpj: form.cpf_cnpj || null,
          email: form.email || null,
          telefone: form.telefone || null,
          contato: form.contato || null,
          ativo: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Transportadora cadastrada!");
      onCreated(data.id);
      reset();
      onClose();
    });
  };

  return (
    <FormModal
      open={open}
      onClose={handleClose}
      title="Cadastro Rápido de Transportadora"
      mode="create"
      size="md"
      isDirty={isDirty}
      confirmOnDirty
      createHint="Preencha os dados essenciais — refine o cadastro completo depois."
      footer={
        <FormModalFooter
          saving={saving}
          isDirty={isDirty}
          onCancel={handleClose}
          submitAsForm
          formId="quick-add-transp-form"
          mode="create"
          primaryLabel="Cadastrar"
        />
      }
    >
      <form id="quick-add-transp-form" onSubmit={handleSubmit} className="space-y-5">
        <FormSection icon={Truck} title="Identificação" noBorder>
          <div className="space-y-2">
            <Label>CNPJ</Label>
            <div className="flex gap-1">
              <MaskedInput
                mask="cpf_cnpj"
                value={form.cpf_cnpj}
                onChange={(v) => update("cpf_cnpj", v)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                disabled={cnpjLoading}
                onClick={handleCnpjLookup}
                aria-label="Buscar CNPJ"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Razão Social *</Label>
            <Input
              value={form.nome_razao_social}
              onChange={(e) => update("nome_razao_social", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Nome Fantasia</Label>
            <Input
              value={form.nome_fantasia}
              onChange={(e) => update("nome_fantasia", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={form.telefone}
                onChange={(e) => update("telefone", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Contato</Label>
              <Input
                value={form.contato}
                onChange={(e) => update("contato", e.target.value)}
              />
            </div>
          </div>
        </FormSection>
      </form>
    </FormModal>
  );
}
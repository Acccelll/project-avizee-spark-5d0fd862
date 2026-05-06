import { useEffect, useState } from "react";
import { Package, Tag, Wand2 } from "lucide-react";
import { FormModal } from "@/components/FormModal";
import { FormModalFooter } from "@/components/FormModalFooter";
import { FormSection } from "@/components/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { supabase } from "@/integrations/supabase/client";
import { listGruposAtivos, proximoSkuDoGrupo } from "@/services/produtos.service";
import { toast } from "sonner";

interface QuickAddProductModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (produtoId: string) => void;
  /** "produto" cobre 99% dos cadastros rápidos a partir de Orçamento/Pedido. */
  tipoItemDefault?: "produto" | "insumo";
  /** Pré-preenche o nome (ex.: vem do xProd do XML). */
  defaultNome?: string;
}

interface UnidadeOption {
  id: string;
  codigo: string;
  descricao: string | null;
}

interface GrupoOption { id: string; nome: string; sigla?: string | null }

const emptyForm = {
  nome: "",
  sku: "",
  grupo_id: "",
  unidade_medida: "UN",
  preco_venda: 0,
  preco_custo: 0,
};

/**
 * Cadastro mínimo de produto disparado a partir de Orçamento/Pedido,
 * para evitar que o usuário precise sair do fluxo. Espelha
 * `QuickAddClientModal` em estrutura (FormModal + FormSection).
 */
export function QuickAddProductModal({
  open,
  onClose,
  onCreated,
  tipoItemDefault = "produto",
  defaultNome = "",
}: QuickAddProductModalProps) {
  const { saving, submit } = useSubmitLock({ errorPrefix: "Erro ao cadastrar produto" });
  const [form, setForm] = useState({ ...emptyForm });
  const [isDirty, setIsDirty] = useState(false);
  const [unidades, setUnidades] = useState<UnidadeOption[]>([]);
  const [grupos, setGrupos] = useState<GrupoOption[]>([]);

  useEffect(() => {
    if (!open) return;
    void supabase
      .from("unidades_medida")
      .select("id, codigo, descricao")
      .eq("ativo", true)
      .order("codigo")
      .then(({ data }) => setUnidades((data ?? []) as UnidadeOption[]));
    void listGruposAtivos().then((g) => setGrupos(g as GrupoOption[]));
    if (defaultNome) {
      setForm((prev) => ({ ...prev, nome: defaultNome }));
      setIsDirty(true);
    }
  }, [open, defaultNome]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const reset = () => {
    setForm({ ...emptyForm });
    setIsDirty(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    await submit(async () => {
      const { data, error } = await supabase
        .from("produtos")
        .insert({
          // codigo_interno é gerado pelo trigger trg_produtos_codigo_interno_auto
          codigo_interno: "",
          nome: form.nome.trim(),
          sku: form.sku.trim() || null,
          grupo_id: form.grupo_id || null,
          unidade_medida: form.unidade_medida || "UN",
          preco_venda: Number(form.preco_venda) || 0,
          preco_custo: Number(form.preco_custo) || 0,
          tipo_item: tipoItemDefault,
          ativo: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Produto cadastrado!");
      onCreated(data.id);
      reset();
      onClose();
    });
  };

  const grupoSelecionado = grupos.find((g) => g.id === form.grupo_id);

  return (
    <FormModal
      open={open}
      onClose={handleClose}
      title="Cadastro Rápido de Produto"
      mode="create"
      size="md"
      isDirty={isDirty}
      confirmOnDirty
      createHint="Preencha os dados essenciais — refine o cadastro completo depois em Produtos."
      footer={
        <FormModalFooter
          saving={saving}
          isDirty={isDirty}
          onCancel={handleClose}
          submitAsForm
          formId="quick-add-product-form"
          mode="create"
          primaryLabel="Cadastrar"
        />
      }
    >
      <form id="quick-add-product-form" onSubmit={handleSubmit} className="space-y-5">
        <FormSection icon={Package} title="Identificação" noBorder>
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input
              value={form.nome}
              onChange={(e) => update("nome", e.target.value)}
              placeholder="Nome do produto"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>SKU</Label>
              <div className="flex gap-1.5">
                <Input
                  value={form.sku}
                  onChange={(e) => update("sku", e.target.value)}
                  placeholder={grupoSelecionado?.sigla ? `${grupoSelecionado.sigla}001` : "Código (opcional)"}
                  className="font-mono flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-9 w-9"
                  title="Gerar SKU pela sigla do grupo"
                  disabled={!form.grupo_id || !grupoSelecionado?.sigla}
                  onClick={async () => {
                    try {
                      const next = await proximoSkuDoGrupo(form.grupo_id);
                      update("sku", next);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select
                value={form.unidade_medida}
                onValueChange={(v) => update("unidade_medida", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unidades.length === 0 && (
                    <SelectItem value="UN">UN — Unidade</SelectItem>
                  )}
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.codigo}>
                      {u.codigo} — {u.descricao ?? u.codigo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Grupo</Label>
            <Select
              value={form.grupo_id || "nenhum"}
              onValueChange={(v) => update("grupo_id", v === "nenhum" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Nenhum</SelectItem>
                {grupos.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.nome}{g.sigla ? ` · ${g.sigla}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FormSection>

        <FormSection icon={Tag} title="Preço">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Preço de Custo</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.preco_custo}
                onChange={(e) => update("preco_custo", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Preço de Venda</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.preco_venda}
                onChange={(e) => update("preco_venda", Number(e.target.value))}
              />
            </div>
          </div>
        </FormSection>
      </form>
    </FormModal>
  );
}
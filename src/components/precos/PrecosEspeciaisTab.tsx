import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, Trash2, Edit, Save, Tag } from "lucide-react";
import { toast } from "sonner";
import { AutocompleteSearch } from "@/components/ui/AutocompleteSearch";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { notifyError } from "@/utils/errorMessages";
import { formatVariacoesSuffix } from "@/utils/cadastros";
import {
  listPrecosEspeciais,
  listClientesAtivosBasic,
  listProdutosAtivosBasic,
  upsertPrecoEspecial,
  softDeletePrecoEspecial,
  type PrecoEspecialRow,
} from "@/services/precosEspeciais.service";

interface Props {
  clienteId?: string;
  produtoId?: string;
}

interface ClienteOption { id: string; nome_razao_social: string }

interface ProdutoOption { id: string; nome: string; sku: string | null; variacoes?: unknown }

export function PrecosEspeciaisTab({ clienteId, produtoId }: Props) {
  const [items, setItems] = useState<PrecoEspecialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [produtos, setProdutos] = useState<ProdutoOption[]>([]);

  const [form, setForm] = useState({
    cliente_id: clienteId || "",
    produto_id: produtoId || "",
    preco_especial: 0,
    data_inicio: "",
    data_fim: "",
    observacoes: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await listPrecosEspeciais({ clienteId, produtoId });
      setItems(data);
    } catch (err) {
      console.error("[precos-especiais] fetch:", err);
      setItems([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    if (!clienteId) {
      listClientesAtivosBasic().then(setClientes).catch(() => setClientes([]));
    }
    if (!produtoId) {
      listProdutosAtivosBasic().then((d) =>
        setProdutos(d as ProdutoOption[]),
      ).catch(() => setProdutos([]));
    }
  }, [clienteId, produtoId]);

  const handleSave = async () => {
    if (!form.cliente_id || !form.produto_id || !form.preco_especial) {
      toast.error("Preencha cliente, produto e preço");
      return;
    }

    try {
      await upsertPrecoEspecial(
        {
          ...form,
          data_inicio: form.data_inicio || null,
          data_fim: form.data_fim || null,
          observacoes: form.observacoes || null,
        },
        editingId,
      );
      toast.success(editingId ? "Regra de preço atualizada" : "Nova regra de preço criada");
      setEditingId(null);
      setShowAdd(false);
      setForm({
        cliente_id: clienteId || "",
        produto_id: produtoId || "",
        preco_especial: 0,
        data_inicio: "",
        data_fim: "",
        observacoes: "",
      });
      fetchData();
    } catch (err) {
      console.error('[precos-especiais] erro ao salvar:', err);
      notifyError(err);
    }
  };

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleRemove = async (id: string) => {
    await softDeletePrecoEspecial(id);
    toast.success("Regra removida");
    setDeleteId(null);
    fetchData();
  };

  if (loading && items.length === 0) return <div className="p-4 text-center animate-pulse">Carregando regras...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Tag className="w-4 h-4" /> Regras de Preço Especial
        </h3>
        {!showAdd && !editingId && (
          <Button size="sm" onClick={() => setShowAdd(true)} className="h-8 gap-1">
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </Button>
        )}
      </div>

      {(showAdd || editingId) && (
        <div className="rounded-lg border bg-accent/20 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!clienteId && (
              <div className="space-y-1">
                <Label className="text-xs">Cliente</Label>
                <AutocompleteSearch
                  options={clientes.map(c => ({ id: c.id, label: c.nome_razao_social }))}
                  value={form.cliente_id}
                  onChange={(v) => setForm({...form, cliente_id: v})}
                  placeholder="Selecione o cliente..."
                />
              </div>
            )}
            {!produtoId && (
              <div className="space-y-1">
                <Label className="text-xs">Produto</Label>
                <AutocompleteSearch
                  options={produtos.map(p => ({ id: p.id, label: `${p.nome}${formatVariacoesSuffix(p.variacoes)}`, sublabel: p.sku }))}
                  value={form.produto_id}
                  onChange={(v) => setForm({...form, produto_id: v})}
                  placeholder="Selecione o produto..."
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Preço Especial (R$)</Label>
              <Input
                type="number" step="0.01"
                value={form.preco_especial}
                onChange={(e) => setForm({...form, preco_especial: Number(e.target.value)})}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Início Vigência</Label>
              <Input
                type="date"
                value={form.data_inicio}
                onChange={(e) => setForm({...form, data_inicio: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fim Vigência</Label>
              <Input
                type="date"
                value={form.data_fim}
                onChange={(e) => setForm({...form, data_fim: e.target.value})}
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Observação</Label>
              <Input
                value={form.observacoes}
                onChange={(e) => setForm({...form, observacoes: e.target.value})}
                placeholder="Ex: Contrato Anual, Promoção, etc."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setEditingId(null); }}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}><Save className="w-3.5 h-3.5 mr-1" /> Salvar Regra</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg">
            Nenhuma regra de preço especial definida.
          </p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-primary">{formatCurrency(item.preco_especial)}</span>
                  {!clienteId && <span className="text-xs truncate font-medium">· {item.clientes?.nome_razao_social}</span>}
                  {!produtoId && <span className="text-xs truncate font-medium">· {item.produtos?.nome}{formatVariacoesSuffix(item.produtos?.variacoes)}</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                  {item.data_inicio && (
                    <span className="text-[10px] text-muted-foreground">
                      Vigência: {formatDate(item.data_inicio)} {item.data_fim ? `até ${formatDate(item.data_fim)}` : "em diante"}
                    </span>
                  )}
                  {item.observacoes && (
                    <span className="text-[10px] text-muted-foreground italic">"{item.observacoes}"</span>
                  )}
                  {produtoId && item.produtos?.preco_venda && (
                    <span className="text-[10px] text-muted-foreground">
                      (Padrão: {formatCurrency(item.produtos.preco_venda)})
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Editar regra de preço" onClick={() => {
                      setEditingId(item.id);
                      setForm({
                        cliente_id: item.cliente_id,
                        produto_id: item.produto_id,
                        preco_especial: item.preco_especial,
                        data_inicio: item.data_inicio || "",
                        data_fim: item.data_fim || "",
                        observacoes: item.observacoes || "",
                      });
                    }}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Editar</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Excluir regra de preço" onClick={() => setDeleteId(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Excluir</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleRemove(deleteId)}
        title="Remover regra de preço"
        description="Deseja remover esta regra de preço especial? Esta ação não pode ser desfeita."
        confirmLabel="Remover"
      />
    </div>
  );
}

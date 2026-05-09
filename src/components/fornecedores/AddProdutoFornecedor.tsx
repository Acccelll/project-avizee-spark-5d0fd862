import { useState, useEffect } from "react";
import { listProdutosBasicAtivos, vincularProdutoFornecedor } from "@/services/produtos.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductAutocomplete } from "@/components/ui/ProductAutocomplete";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { Plus, Loader2 } from "lucide-react";

interface AddProdutoFornecedorProps {
  fornecedorId: string;
  onAdded: () => void;
}

export function AddProdutoFornecedor({ fornecedorId, onAdded }: AddProdutoFornecedorProps) {
  const [produtoId, setProdutoId] = useState("");
  const [precoCompra, setPrecoCompra] = useState<number>(0);
  const [leadTime, setLeadTime] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [produtos, setProdutos] = useState<{ id: string; nome: string; sku: string; codigo_interno: string }[]>([]);

  useEffect(() => {
    listProdutosBasicAtivos().then(setProdutos).catch(() => setProdutos([]));
  }, []);

  const handleAdd = async () => {
    if (!produtoId) { toast.error("Selecione um produto"); return; }
    setSaving(true);
    try {
      await vincularProdutoFornecedor({
        produto_id: produtoId,
        fornecedor_id: fornecedorId,
        preco_compra: precoCompra || 0,
        lead_time_dias: leadTime || 0,
        eh_principal: false,
      });
      toast.success("Produto vinculado com sucesso!");
      setProdutoId("");
      setPrecoCompra(0);
      setLeadTime(0);
      onAdded();
    } catch (err: unknown) {
      notifyError(err);
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_110px_140px_auto] md:items-end">
      <div className="space-y-1">
        <Label className="text-xs">Produto</Label>
        <ProductAutocomplete products={produtos} value={produtoId} onChange={setProdutoId} placeholder="Buscar produto..." />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Preço</Label>
        <Input type="number" min={0} step="0.01" value={precoCompra} onChange={(e) => setPrecoCompra(Number(e.target.value))} className="h-9 max-sm:h-11" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Prazo entrega (dias)</Label>
        <Input type="number" min={0} value={leadTime} onChange={(e) => setLeadTime(Number(e.target.value))} className="h-9 max-sm:h-11" />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-9 gap-1 max-sm:h-11 max-sm:w-full"
        onClick={handleAdd}
        disabled={saving}
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
        <span>Vincular produto</span>
      </Button>
    </div>
  );
}

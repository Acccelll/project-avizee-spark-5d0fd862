import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DrawerStickyFooter } from "@/components/ui/DrawerStickyFooter";
import { useAjustarEstoque } from "@/pages/estoque/hooks/useAjustarEstoque";
import { useSupabaseCrud } from "@/hooks/useSupabaseCrud";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, ChevronsUpDown, ShieldAlert, CircleAlert } from "lucide-react";
import type { TableRow } from "@/types/domain";

type ProdutoRow = TableRow<"produtos">;

type TipoAjuste = "entrada" | "saida" | "ajuste";

/**
 * EstoqueAjusteSheet — bottom-sheet (mobile) / right-sheet (desktop) para a
 * operação de ajuste manual de estoque. Reaproveita o RPC `ajustar_estoque_manual`
 * (via `useAjustarEstoque`) e mantém o mesmo contrato do form da aba "Ajuste Manual".
 *
 * Pode ser pré-preenchido via `produtoId` (ex.: chips do banner "Abaixo do mínimo"
 * ou `mobilePrimaryAction` da lista de saldos).
 */
export interface EstoqueAjusteSheetProps {
  open: boolean;
  onClose: () => void;
  produtoId?: string | null;
  /** Tipo inicial; default = "ajuste". Ao abrir do banner crítico costuma vir como "entrada". */
  tipoInicial?: TipoAjuste;
}

export function EstoqueAjusteSheet({ open, onClose, produtoId, tipoInicial = "ajuste" }: EstoqueAjusteSheetProps) {
  const produtosCrud = useSupabaseCrud<ProdutoRow>({ table: "produtos" });
  const ajustar = useAjustarEstoque();
  const saving = ajustar.isPending;

  const [form, setForm] = useState({
    produto_id: "",
    tipo: tipoInicial,
    quantidade: 0,
    motivo: "",
    categoria_ajuste: "correcao_inventario",
  });
  const [produtoSelectorOpen, setProdutoSelectorOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // Sync produto/tipo iniciais quando o sheet abre
  useEffect(() => {
    if (open) {
      setForm((f) => ({
        ...f,
        produto_id: produtoId ?? "",
        tipo: tipoInicial,
        quantidade: 0,
        motivo: "",
        categoria_ajuste: "correcao_inventario",
      }));
    }
  }, [open, produtoId, tipoInicial]);

  const produtoSelecionado = useMemo(
    () => produtosCrud.data.find((p) => p.id === form.produto_id),
    [produtosCrud.data, form.produto_id],
  );
  const saldoAtualPreview = Number(produtoSelecionado?.estoque_atual ?? 0);
  const qty = isNaN(form.quantidade) ? 0 : form.quantidade;
  const novoSaldoPreview = form.tipo === "ajuste"
    ? qty
    : form.tipo === "saida"
    ? saldoAtualPreview - qty
    : saldoAtualPreview + qty;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || pendingSubmit) return;
    if (!form.produto_id) { toast.error("Selecione um produto"); return; }
    if (form.quantidade <= 0) { toast.error("A quantidade deve ser maior que zero"); return; }
    if (!form.motivo.trim()) {
      toast.error(
        form.tipo === "saida" ? "Informe o motivo da saída de estoque" :
        form.tipo === "entrada" ? "Informe a origem da entrada de estoque" :
        "Informe o motivo do ajuste manual",
      );
      return;
    }
    setConfirmOpen(true);
  };

  const executar = async () => {
    if (pendingSubmit || saving) return;
    setPendingSubmit(true);
    try {
      const isCritico = form.tipo === "ajuste";
      await ajustar.mutateAsync({
        produto_id: form.produto_id,
        tipo: form.tipo,
        quantidade: form.tipo === "ajuste" ? form.quantidade : Math.abs(form.quantidade),
        motivo: form.motivo,
        categoria_ajuste: isCritico ? form.categoria_ajuste : undefined,
        motivo_estruturado: isCritico ? form.motivo : undefined,
      });
      onClose();
    } catch (err) {
      console.error("[EstoqueAjusteSheet] executar:", err);
    } finally {
      setPendingSubmit(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && !saving && onClose()}>
        <SheetContent
          side="right"
          className={
            "w-full sm:max-w-md flex flex-col gap-0 p-0 " +
            // Mobile: bottom-sheet
            "max-sm:!inset-x-0 max-sm:!bottom-0 max-sm:!top-auto max-sm:!h-auto max-sm:!max-h-[92vh] " +
            "max-sm:!w-full max-sm:!max-w-full max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 " +
            "max-sm:data-[state=closed]:slide-out-to-bottom max-sm:data-[state=open]:slide-in-from-bottom"
          }
        >
          <SheetHeader className="px-4 sm:px-6 pt-5 pb-3 border-b">
            <SheetTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" />
              Ajuste rápido de estoque
            </SheetTitle>
            <SheetDescription className="text-xs">
              Operação auditável — registra responsável, data e motivo.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
            {/* Produto */}
            <div className="space-y-2">
              <Label>Produto *</Label>
              <Popover open={produtoSelectorOpen} onOpenChange={setProdutoSelectorOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={produtoSelectorOpen}
                    className="w-full justify-between font-normal h-11 text-left"
                  >
                    {produtoSelecionado ? (
                      <span className="truncate flex items-center gap-2">
                        <span className="font-medium">{produtoSelecionado.nome}</span>
                        {produtoSelecionado.sku && (
                          <span className="text-muted-foreground font-mono text-xs">({produtoSelecionado.sku})</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Selecione o produto...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] sm:w-[420px] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Buscar por nome, SKU ou código..." />
                    <CommandList>
                      <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                      <CommandGroup>
                        {produtosCrud.data.filter((p) => p.ativo !== false).map((p) => (
                          <CommandItem
                            key={p.id}
                            value={[p.nome, p.sku, p.codigo_interno].filter(Boolean).join(" ")}
                            onSelect={() => {
                              setForm((f) => ({ ...f, produto_id: p.id }));
                              setProdutoSelectorOpen(false);
                            }}
                            className={cn("gap-2 cursor-pointer", form.produto_id === p.id && "bg-primary/5")}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{p.nome}</p>
                              {p.sku && (
                                <span className="text-[11px] text-muted-foreground font-mono">{p.sku}</span>
                              )}
                            </div>
                            <span className={cn(
                              "text-xs font-mono font-semibold shrink-0",
                              Number(p.estoque_atual) <= 0 ? "text-destructive" : "text-success",
                            )}>
                              {formatNumber(p.estoque_atual)} {p.unidade_medida || "UN"}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo de Operação *</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm({ ...form, tipo: v as TipoAjuste })}
              >
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada — adicionar ao saldo</SelectItem>
                  <SelectItem value="saida">Saída — reduzir do saldo</SelectItem>
                  <SelectItem value="ajuste">Ajuste — definir novo saldo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quantidade */}
            <div className="space-y-2">
              <Label>{form.tipo === "ajuste" ? "Novo Saldo *" : "Quantidade *"}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.quantidade || ""}
                onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
                className="h-11 font-mono text-base"
                inputMode="decimal"
                required
              />
            </div>

            {/* Preview de impacto */}
            {produtoSelecionado && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Saldo Atual</p>
                    <p className="font-bold font-mono text-2xl tabular-nums">{formatNumber(saldoAtualPreview)}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Novo Saldo</p>
                    <p className={cn(
                      "font-bold font-mono text-2xl tabular-nums",
                      novoSaldoPreview < 0 ? "text-destructive" :
                      novoSaldoPreview === 0 ? "text-warning" :
                      novoSaldoPreview === saldoAtualPreview ? "text-muted-foreground" :
                      "text-success",
                    )}>
                      {formatNumber(novoSaldoPreview)}
                    </p>
                  </div>
                </div>
                {novoSaldoPreview < 0 && (
                  <div className="mt-2 text-xs text-destructive font-medium flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Saldo ficará negativo.
                  </div>
                )}
              </div>
            )}

            {/* Aviso por tipo */}
            <div className={cn(
              "rounded-md border-l-4 px-3 py-2 text-xs flex gap-2 border bg-card",
              form.tipo === "saida" ? "border-l-warning bg-warning/5 text-warning" :
              form.tipo === "entrada" ? "border-success/40 bg-success/5 text-success" :
              "border-warning/40 bg-warning/10 text-warning",
            )}>
              {form.tipo === "ajuste" ? <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <CircleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
              <p>
                {form.tipo === "ajuste"
                  ? "Ajuste define o saldo absoluto. Use apenas para correções administrativas."
                  : form.tipo === "saida"
                    ? "Saída manual reduz o saldo e pode resultar em saldo negativo."
                    : "Entrada manual incrementa o saldo. Prefira fluxos de compra com NF."}
              </p>
            </div>

            {/* Categoria (apenas ajuste) */}
            {form.tipo === "ajuste" && (
              <div className="space-y-2">
                <Label>Categoria do ajuste *</Label>
                <Select
                  value={form.categoria_ajuste}
                  onValueChange={(v) => setForm({ ...form, categoria_ajuste: v })}
                >
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="correcao_inventario">Correção de inventário</SelectItem>
                    <SelectItem value="perda">Perda</SelectItem>
                    <SelectItem value="avaria">Avaria</SelectItem>
                    <SelectItem value="vencimento">Vencimento</SelectItem>
                    <SelectItem value="furto_extravio">Furto / extravio</SelectItem>
                    <SelectItem value="divergencia_recebimento">Divergência de recebimento</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Motivo */}
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Textarea
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                placeholder="Descreva a causa raiz e referência operacional (mín. 10 caracteres)"
                rows={3}
                required
              />
            </div>

            {/* Submit hidden — sticky footer aciona via form */}
            <button type="submit" className="sr-only">Registrar</button>
          </form>

          <DrawerStickyFooter
            left={
              <Button type="button" variant="outline" onClick={onClose} disabled={saving || pendingSubmit} className="h-11">
                Cancelar
              </Button>
            }
            right={
              <Button
                type="button"
                onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
                disabled={saving || pendingSubmit}
                className="h-11 min-w-[140px]"
              >
                {saving || pendingSubmit ? "Registrando..." : "Registrar"}
              </Button>
            }
          />
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={executar}
        title="Confirmar movimentação de estoque"
        description={(() => {
          const nome = produtoSelecionado?.nome ?? "produto";
          const tipoLabels: Record<TipoAjuste, string> = {
            entrada: "entrada de",
            saida: "saída de",
            ajuste: "ajuste para",
          };
          const aviso = form.tipo === "saida" && novoSaldoPreview < 0 ? " O saldo ficará negativo." : "";
          const ajusteAviso = form.tipo === "ajuste" ? " Este ajuste sobrescreve o saldo atual." : "";
          return `Confirmar ${tipoLabels[form.tipo]} ${form.quantidade} unidade(s) do produto "${nome}"?${ajusteAviso}${aviso}`;
        })()}
        confirmLabel="Confirmar"
        confirmVariant="default"
        loading={saving || pendingSubmit}
      />
    </>
  );
}
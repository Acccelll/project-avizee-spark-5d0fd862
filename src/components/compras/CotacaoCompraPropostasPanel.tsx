/**
 * Subcomponente: painel de propostas por item com comparativo de fornecedores.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AutocompleteSearch } from '@/components/ui/AutocompleteSearch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatCurrency } from '@/lib/format';
import { Plus, Trash2, CheckCircle2, Trophy, Award, BarChart3, Crown } from 'lucide-react';
import type { CotacaoItem, Proposta, CotacaoCompra } from './cotacaoCompraTypes';

interface FornecedorOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface CotacaoCompraPropostasPanelProps {
  selected: CotacaoCompra;
  viewItems: CotacaoItem[];
  viewPropostas: Proposta[];
  uniqueSuppliers: number;
  fornecedorOptions: FornecedorOption[];
  addingProposal: string | null;
  setAddingProposal: (id: string | null) => void;
  proposalForm: { fornecedor_id: string; preco_unitario: number; prazo_entrega_dias: string; observacoes: string };
  setProposalForm: (f: { fornecedor_id: string; preco_unitario: number; prazo_entrega_dias: string; observacoes: string }) => void;
  onSelectProposal: (propostaId: string, itemId: string) => void;
  onDeleteProposal: (propostaId: string) => void;
  onAddProposal: (itemId: string) => void;
}

/** Comparative table shown when there are 2+ suppliers */
function ComparativoFornecedores({ viewItems, viewPropostas }: { viewItems: CotacaoItem[]; viewPropostas: Proposta[] }) {
  const supplierIds = [...new Set(viewPropostas.map((p) => p.fornecedor_id))];
  const supplierNames = supplierIds.map(
    (id) => viewPropostas.find((p) => p.fornecedor_id === id)?.fornecedores?.nome_razao_social || id,
  );
  const colTotals = supplierIds.map((sid) =>
    viewItems.reduce((sum, item) => {
      const p = viewPropostas.find((pp) => pp.item_id === item.id && pp.fornecedor_id === sid);
      return sum + (p ? Number(p.preco_unitario) * item.quantidade : 0);
    }, 0),
  );
  const bestColTotal = Math.min(...colTotals.filter((t) => t > 0));

  return (
    <>
      {/* Mobile: cards verticais por fornecedor */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Comparativo de Fornecedores</span>
        </div>
        {supplierIds.map((sid, si) => {
          const total = colTotals[si];
          const isWinner = total > 0 && total === bestColTotal;
          return (
            <div key={sid} className={`rounded-lg border p-3 space-y-2 ${isWinner ? "border-success/40 bg-success/20" : "bg-card"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{supplierNames[si]}</p>
                  {isWinner && (
                    <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold uppercase text-success dark:text-success">
                      <Crown className="h-3 w-3" /> Menor total
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-mono text-base font-bold ${isWinner ? "text-success dark:text-success" : "text-foreground"}`}>
                    {total > 0 ? formatCurrency(total) : "—"}
                  </p>
                </div>
              </div>
              <div className="space-y-1 pt-1.5 border-t">
                {viewItems.map((item) => {
                  const p = viewPropostas.find((pp) => pp.item_id === item.id && pp.fornecedor_id === sid);
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground flex-1 min-w-0">{item.produtos?.nome || "—"}</span>
                      {p ? (
                        <span className="font-mono shrink-0 inline-flex items-center gap-1">
                          {p.selecionado && <Trophy className="h-3 w-3 text-primary" />}
                          {formatCurrency(Number(p.preco_unitario))}
                          {p.prazo_entrega_dias && <span className="text-muted-foreground">· {p.prazo_entrega_dias}d</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {/* Desktop: tabela matriz */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">Comparativo de Fornecedores</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/20">
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Produto</th>
              {supplierNames.map((name, si) => (
                <th key={supplierIds[si]} className="px-3 py-2 text-right font-semibold text-muted-foreground min-w-[100px]">
                  <span className="truncate block max-w-[90px] ml-auto">{name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {viewItems.map((item) => {
              const rowPrices = supplierIds.map((sid) => {
                const p = viewPropostas.find((pp) => pp.item_id === item.id && pp.fornecedor_id === sid);
                return p ? Number(p.preco_unitario) : null;
              });
              const validPrices = rowPrices.filter((v): v is number => v !== null);
              const bestRow = validPrices.length > 0 ? Math.min(...validPrices) : null;
              return (
                <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/10">
                  <td className="px-3 py-2 font-medium max-w-[110px]">
                    <span className="truncate block">{item.produtos?.nome || "—"}</span>
                    <span className="text-muted-foreground font-normal">{item.quantidade} {item.unidade || "UN"}</span>
                  </td>
                  {supplierIds.map((sid) => {
                    const p = viewPropostas.find((pp) => pp.item_id === item.id && pp.fornecedor_id === sid);
                    const isBestRow = p && Number(p.preco_unitario) === bestRow;
                    return (
                      <td key={sid} className={`px-3 py-2 text-right ${p?.selecionado ? "bg-primary/5 font-semibold" : isBestRow ? "text-success dark:text-success" : ""}`}>
                        {p ? (
                          <div>
                            <div className="flex items-center justify-end gap-1">
                              {p.selecionado && <Trophy className="h-3 w-3 text-primary" />}
                              {isBestRow && !p.selecionado && <Award className="h-3 w-3 text-success" />}
                              <span className="font-mono">{formatCurrency(Number(p.preco_unitario))}</span>
                            </div>
                            {p.prazo_entrega_dias && <span className="text-muted-foreground text-[10px]">{p.prazo_entrega_dias}d</span>}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2 text-muted-foreground text-[10px] uppercase">Total</td>
              {colTotals.map((total, si) => (
                <td key={supplierIds[si]} className={`px-3 py-2 text-right font-mono ${total > 0 && total === bestColTotal ? "text-success dark:text-success" : ""}`}>
                  {total > 0 ? formatCurrency(total) : "—"}
                  {total > 0 && total === bestColTotal && <div className="text-[9px] font-normal text-success uppercase">menor</div>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}

export function CotacaoCompraPropostasPanel({
  selected, viewItems, viewPropostas, uniqueSuppliers, fornecedorOptions,
  addingProposal, setAddingProposal, proposalForm, setProposalForm,
  onSelectProposal, onDeleteProposal, onAddProposal,
}: CotacaoCompraPropostasPanelProps) {
  const isMobile = useIsMobile();
  const canEdit = selected.status !== "aprovada" && selected.status !== "convertida" && selected.status !== "cancelada";
  const canSelect = selected.status !== "aprovada" && selected.status !== "convertida";
  const proposalFormContent = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-sm">Fornecedor</Label>
        <AutocompleteSearch
          options={fornecedorOptions}
          value={proposalForm.fornecedor_id}
          onChange={(id) => setProposalForm({ ...proposalForm, fornecedor_id: id })}
          placeholder="Selecionar fornecedor..."
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-sm">Preço Unitário</Label>
          <Input type="number" step="0.01" value={proposalForm.preco_unitario} onChange={(e) => setProposalForm({ ...proposalForm, preco_unitario: Number(e.target.value) })} className="h-11 font-mono" />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Prazo (dias)</Label>
          <Input type="number" value={proposalForm.prazo_entrega_dias} onChange={(e) => setProposalForm({ ...proposalForm, prazo_entrega_dias: e.target.value })} className="h-11 font-mono" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-sm">Observações</Label>
        <Input value={proposalForm.observacoes} onChange={(e) => setProposalForm({ ...proposalForm, observacoes: e.target.value })} className="h-11" placeholder="Condições, validade da proposta..." />
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      {viewItems.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Adicione itens à cotação antes de registrar propostas.
        </div>
      )}

      {viewItems.length > 0 && uniqueSuppliers > 1 && (
        <ComparativoFornecedores viewItems={viewItems} viewPropostas={viewPropostas} />
      )}

      {viewItems.map((item) => {
        const itemPropostas = viewPropostas.filter((p) => p.item_id === item.id);
        const prices = itemPropostas.map((p) => Number(p.preco_unitario)).filter((v) => v > 0);
        const bestPrice = prices.length > 0 ? Math.min(...prices) : null;

        return (
          <Card key={item.id} className="border">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>
                  {item.produtos?.nome || "—"}
                  <span className="ml-2 text-xs text-muted-foreground font-mono">
                    {item.produtos?.codigo_interno || item.produtos?.sku || ""}
                  </span>
                </span>
                <Badge variant="outline" className="font-mono shrink-0">
                  {item.quantidade} {item.unidade || "UN"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {itemPropostas.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nenhuma proposta cadastrada.</p>
              ) : (
                <div className="space-y-2">
                  {itemPropostas.map((p) => {
                    const isBest = Number(p.preco_unitario) === bestPrice;
                    const totalProposta = Number(p.preco_unitario) * item.quantidade;
                    return (
                      <div
                        key={p.id}
                        className={`rounded-lg border p-3 text-sm md:flex md:items-center md:justify-between md:py-2 ${
                          p.selecionado ? "border-primary bg-primary/5 ring-1 ring-primary/20" : isBest ? "border-success/30 bg-success/20" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 md:items-center md:gap-2 md:min-w-0 md:flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            {p.selecionado && <Trophy className="h-4 w-4 text-primary flex-shrink-0" />}
                            {isBest && !p.selecionado && <span className="text-[10px] font-bold text-success dark:text-success">MENOR</span>}
                            <span className="truncate font-medium">{p.fornecedores?.nome_razao_social || "—"}</span>
                          </div>
                          {/* Desktop trash on right; mobile shows in actions row below */}
                          {canEdit && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive md:hidden" aria-label="Remover proposta" onClick={() => onDeleteProposal(p.id!)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Remover</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="mt-2 md:mt-0 flex items-center justify-between gap-3 md:flex-shrink-0">
                          <div className="text-left md:text-right">
                            <p className="font-mono font-semibold">
                              {formatCurrency(Number(p.preco_unitario))}<span className="text-muted-foreground">/un</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">Total: {formatCurrency(totalProposta)}</p>
                          </div>
                          {p.prazo_entrega_dias && <Badge variant="secondary" className="text-[10px]">{p.prazo_entrega_dias}d</Badge>}
                          <div className="hidden md:flex gap-1">
                            {!p.selecionado && canSelect && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Selecionar proposta" onClick={() => onSelectProposal(p.id!, item.id)}>
                                    <CheckCircle2 className="h-4 w-4 text-success" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Selecionar</TooltipContent>
                              </Tooltip>
                            )}
                            {canEdit && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Remover proposta" onClick={() => onDeleteProposal(p.id!)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remover</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        {/* Mobile: botão Selecionar full-width 44px */}
                        {!p.selecionado && canSelect && (
                          <Button
                            type="button"
                            size="sm"
                            className="md:hidden mt-2 w-full h-11 gap-1.5"
                            onClick={() => onSelectProposal(p.id!, item.id)}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Selecionar este fornecedor
                          </Button>
                        )}
                        {p.selecionado && (
                          <p className="md:hidden mt-2 text-[11px] font-semibold text-primary uppercase flex items-center gap-1">
                            <Trophy className="h-3 w-3" /> Selecionado
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {canEdit && (
                <>
                  {addingProposal === item.id && !isMobile ? (
                    <div className="rounded-lg border border-dashed p-3 space-y-3 bg-muted/30">
                      <div className="space-y-2">
                        <Label className="text-xs">Fornecedor</Label>
                        <AutocompleteSearch
                          options={fornecedorOptions}
                          value={proposalForm.fornecedor_id}
                          onChange={(id) => setProposalForm({ ...proposalForm, fornecedor_id: id })}
                          placeholder="Selecionar fornecedor..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Preço Unitário</Label>
                          <Input type="number" step="0.01" value={proposalForm.preco_unitario} onChange={(e) => setProposalForm({ ...proposalForm, preco_unitario: Number(e.target.value) })} className="h-8 font-mono" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Prazo (dias)</Label>
                          <Input type="number" value={proposalForm.prazo_entrega_dias} onChange={(e) => setProposalForm({ ...proposalForm, prazo_entrega_dias: e.target.value })} className="h-8 font-mono" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Observações</Label>
                        <Input value={proposalForm.observacoes} onChange={(e) => setProposalForm({ ...proposalForm, observacoes: e.target.value })} className="h-8 text-xs" placeholder="Condições, validade da proposta..." />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => onAddProposal(item.id)} disabled={!proposalForm.fornecedor_id}>Salvar</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setAddingProposal(null)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button" variant={itemPropostas.length === 0 ? "default" : "outline"} size="sm"
                      className="w-full gap-1.5 text-xs max-sm:h-11 max-sm:text-sm"
                      onClick={() => { setAddingProposal(item.id); setProposalForm({ fornecedor_id: "", preco_unitario: 0, prazo_entrega_dias: "", observacoes: "" }); }}
                    >
                      <Plus className="h-3 w-3" /> {itemPropostas.length === 0 ? "Adicionar proposta" : "Adicionar outra proposta"}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
      {/* Bottom-sheet mobile: form de adicionar proposta */}
      <Sheet open={isMobile && !!addingProposal} onOpenChange={(o) => !o && setAddingProposal(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[92vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nova Proposta</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{proposalFormContent}</div>
          <div className="mt-4 flex flex-col-reverse gap-2">
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setAddingProposal(null)}>Cancelar</Button>
            <Button type="button" className="h-11 w-full" onClick={() => addingProposal && onAddProposal(addingProposal)} disabled={!proposalForm.fornecedor_id}>Salvar Proposta</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

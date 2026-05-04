import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AutocompleteSearch } from "@/components/ui/AutocompleteSearch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Barcode } from "lucide-react";
import { BoletoReaderModal } from "@/components/financeiro/BoletoReaderModal";
import { formatCurrency } from "@/lib/format";
import type { Cliente, Fornecedor } from "@/types/domain";
import type { ContaContabil, LancamentoForm } from "@/pages/financeiro/types";
import type { ContaBancaria } from "@/types/domain";
import { statusFinanceiro, getStatusLabel } from "@/lib/statusSchema";
import { FORMA_PAGAMENTO_OPTIONS } from "@/lib/financeiro";
import type { CartaoCredito } from "@/services/cartoesCredito.service";

interface Props {
  form: LancamentoForm;
  mode: "create" | "edit";
  saving: boolean;
  contasBancarias: ContaBancaria[];
  contasContabeis: ContaContabil[];
  clientes: Cliente[];
  fornecedores: Fornecedor[];
  cartoes?: CartaoCredito[];
  setForm: (next: LancamentoForm) => void;
  onCancel: () => void;
  onSubmit: (e: FormEvent) => void;
}

// Status editáveis no formulário: apenas `aberto` e `cancelado`.
// `pago` e `parcial` são DERIVADOS de baixas (trigger trg_sync_financeiro_saldo).
// `vencido` é estado efetivo derivado, nunca persistido.
const STATUS_READONLY = new Set(["parcial", "pago"]);
const STATUS_BADGE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  parcial: "secondary",
  pago: "default",
};

export function FinanceiroLancamentoForm({
  form,
  mode,
  saving,
  contasBancarias,
  contasContabeis,
  clientes,
  fornecedores,
  cartoes = [],
  setForm,
  onCancel,
  onSubmit,
}: Props) {
  const updateField = <K extends keyof LancamentoForm>(field: K, value: LancamentoForm[K]) => {
    setForm({ ...form, [field]: value });
  };

  const isStatusReadonly = STATUS_READONLY.has(form.status);
  const selectStatusValue = form.status === "vencido" ? "aberto" : form.status;
  const [boletoOpen, setBoletoOpen] = useState(false);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="space-y-2"><Label>Tipo</Label>
          <Select value={form.tipo} onValueChange={(v) => updateField("tipo", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="receber">A Receber</SelectItem><SelectItem value="pagar">A Pagar</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          {isStatusReadonly ? (
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/30">
              <Badge variant={STATUS_BADGE_VARIANTS[form.status] ?? "outline"}>
                {getStatusLabel(statusFinanceiro, form.status)}
              </Badge>
              <span className="text-xs text-muted-foreground">(somente leitura)</span>
            </div>
          ) : (
            <Select value={selectStatusValue} onValueChange={(v) => updateField("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aberto">Aberto</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">
            Status <strong>Pago/Parcial</strong> é derivado das baixas. Use <strong>Baixar</strong> para liquidar.
          </p>
          {form.status === "vencido" && (
            <p className="text-[11px] text-warning mt-1">Status efetivo: <strong>Vencido</strong> (salvo como Aberto)</p>
          )}
        </div>
        <div className="space-y-2"><Label>Forma de Pagamento</Label>
          <Select value={form.forma_pagamento || "nenhum"} onValueChange={(v) => updateField("forma_pagamento", v === "nenhum" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhum">Selecione...</SelectItem>
              {FORMA_PAGAMENTO_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 md:col-span-3 space-y-2"><Label>Descrição *</Label><Input value={form.descricao} onChange={(e) => updateField("descricao", e.target.value)} required /></div>
        <div className="space-y-2"><Label>Valor *</Label><Input type="number" step="0.01" value={form.valor} onChange={(e) => updateField("valor", Number(e.target.value))} required /></div>
        <div className="space-y-2"><Label>Vencimento *</Label><Input type="date" value={form.data_vencimento} onChange={(e) => updateField("data_vencimento", e.target.value)} required /></div>
        <div className="space-y-2"><Label>Data Pagamento</Label><Input type="date" value={form.data_pagamento} onChange={(e) => updateField("data_pagamento", e.target.value)} /></div>
        <div className="space-y-2"><Label>Conta Bancária</Label>
          <Select value={form.conta_bancaria_id || "nenhum"} onValueChange={(v) => updateField("conta_bancaria_id", v === "nenhum" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Selecione conta..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhum">Selecione...</SelectItem>
              {contasBancarias.map(c => (<SelectItem key={c.id} value={c.id}>{c.bancos?.nome} - {c.descricao}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>
            Cartão {form.forma_pagamento === "cartao_credito" ? "*" : ""}
          </Label>
          {cartoes.length > 0 ? (
            <Select
              value={form.cartao_id || "nenhum"}
              onValueChange={(v) => {
                if (v === "nenhum") {
                  updateField("cartao_id", "");
                  updateField("cartao", "");
                  return;
                }
                const sel = cartoes.find((c) => c.id === v);
                updateField("cartao_id", v);
                updateField("cartao", sel?.nome ?? "");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione cartão..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Selecione...</SelectItem>
                {cartoes
                  .filter((c) => c.ativo)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                      {c.ultimos4 ? ` •••• ${c.ultimos4}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={form.cartao}
              onChange={(e) => updateField("cartao", e.target.value)}
              placeholder="Nome do cartão"
            />
          )}
        </div>
        {form.tipo === "receber" && (
          <div className="space-y-2"><Label>Cliente</Label>
            <AutocompleteSearch
              options={clientes.map((c) => ({
                id: c.id,
                label: c.nome_razao_social,
                sublabel: c.cpf_cnpj ?? undefined,
              }))}
              value={form.cliente_id ?? ""}
              onChange={(v) => updateField("cliente_id", v)}
              placeholder="Buscar cliente por nome ou CNPJ..."
            />
          </div>
        )}
        {form.tipo === "pagar" && (
          <div className="space-y-2"><Label>Fornecedor</Label>
            <AutocompleteSearch
              options={fornecedores.map((f) => ({
                id: f.id,
                label: f.nome_razao_social,
                sublabel: f.cpf_cnpj ?? undefined,
              }))}
              value={form.fornecedor_id ?? ""}
              onChange={(v) => updateField("fornecedor_id", v)}
              placeholder="Buscar fornecedor por nome ou CNPJ..."
            />
          </div>
        )}
      </div>

      {contasContabeis.length > 0 && (
        <div className="space-y-2">
          <Label>Conta Contábil (opcional)</Label>
          <Select value={form.conta_contabil_id || "none"} onValueChange={(v) => updateField("conta_contabil_id", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Vincular conta contábil..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {contasContabeis.map((c) => (<SelectItem key={c.id} value={c.id}>{c.codigo} - {c.descricao}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      )}

      {mode === "create" && (
        <div className="space-y-3 rounded-lg border p-4">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={form.gerar_parcelas} onChange={(e) => updateField("gerar_parcelas", e.target.checked)} className="rounded" />
            Gerar parcelas automaticamente
          </label>
          {form.gerar_parcelas && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label className="text-xs">Nº de Parcelas</Label><Input type="number" min={2} max={48} value={form.num_parcelas} onChange={(e) => updateField("num_parcelas", Number(e.target.value))} className="h-9" /></div>
              <div className="space-y-1"><Label className="text-xs">Intervalo (dias)</Label><Input type="number" min={1} max={365} value={form.intervalo_dias} onChange={(e) => updateField("intervalo_dias", Number(e.target.value))} className="h-9" /></div>
              <div className="col-span-2 text-xs text-muted-foreground">
                {form.num_parcelas > 1 && form.valor > 0 && (<span>{form.num_parcelas}× de <strong>{formatCurrency(form.valor / form.num_parcelas)}</strong> a cada {form.intervalo_dias} dias</span>)}
              </div>
              {form.forma_pagamento === "cartao_credito" && form.cartao_id && (
                <div className="col-span-2 text-xs text-primary bg-primary/5 border border-primary/20 rounded-md p-2">
                  💳 Cada parcela será alocada na fatura correspondente do cartão e o vencimento usará a data da fatura.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => updateField("observacoes", e.target.value)} /></div>
      <div className="flex justify-between items-center gap-2">
        {form.tipo === "pagar" ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setBoletoOpen(true)}>
            <Barcode className="w-3.5 h-3.5 mr-1" /> Ler boleto
          </Button>
        ) : <span />}
        <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={saving || isStatusReadonly}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </div>
      <BoletoReaderModal
        open={boletoOpen}
        onClose={() => setBoletoOpen(false)}
        onApply={(r) => {
          setForm({
            ...form,
            valor: r.valor,
            data_vencimento: r.vencimento,
            forma_pagamento: form.forma_pagamento || "boleto_dda",
            observacoes: form.observacoes
              ? `${form.observacoes}\nLinha digitável: ${r.linhaDigitavel}`
              : `Linha digitável: ${r.linhaDigitavel}`,
          });
        }}
      />
    </form>
  );
}



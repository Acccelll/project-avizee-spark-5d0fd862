import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

// Status persistidos editáveis: aberto/pago/cancelado.
// "parcial" é somente leitura (derivado de baixas).
// "vencido" é estado efetivo derivado, nunca persistido — não aparece no Select.
// "estornado" foi descontinuado pelo modelo canônico (backfilled para cancelado).
const STATUS_READONLY = new Set(["parcial"]);
const STATUS_BADGE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  parcial: "secondary",
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
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          )}
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
        <div className="space-y-2"><Label>Conta Bancária {form.status === "pago" ? "*" : ""}</Label>
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
            <Select value={form.cliente_id || "nenhum"} onValueChange={(v) => updateField("cliente_id", v === "nenhum" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Selecione...</SelectItem>
                {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {form.tipo === "pagar" && (
          <div className="space-y-2"><Label>Fornecedor</Label>
            <Select value={form.fornecedor_id || "nenhum"} onValueChange={(v) => updateField("fornecedor_id", v === "nenhum" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Selecione...</SelectItem>
                {fornecedores.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome_razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
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

      {form.status === "pago" && (!form.data_pagamento || !form.forma_pagamento || !form.conta_bancaria_id) && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning">
          ⚠️ Para confirmar como Pago, preencha Data de Pagamento, Forma de Pagamento e Conta Bancária.
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
            </div>
          )}
        </div>
      )}

      <div className="space-y-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => updateField("observacoes", e.target.value)} /></div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={saving || isStatusReadonly}>{saving ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  );
}



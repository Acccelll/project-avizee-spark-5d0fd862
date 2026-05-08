import * as React from "react";
import { type FormEvent, type ReactNode } from "react";
import { FormModal } from "@/components/FormModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AutocompleteSearch } from "@/components/ui/AutocompleteSearch";
import { ItemsGrid, type GridItem } from "@/components/ui/ItemsGrid";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  AlertCircle,
  Building2,
  CheckCircle,
  DollarSign,
  FileText,
  Lock,
  Package,
  Truck,
} from "lucide-react";
import { isFiscalReadOnly, isFiscalStructurallyLocked, canConfirmFiscal, getFiscalInternalStatus, getFiscalSefazStatus } from "@/lib/fiscalStatus";
import { FiscalInternalStatusBadge, FiscalSefazStatusBadge } from "@/components/fiscal/FiscalStatusBadges";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NotaFiscalForEdit {
  id: string;
  tipo: string;
  numero: string;
  serie: string;
  chave_acesso: string;
  data_emissao: string;
  fornecedor_id: string;
  cliente_id: string;
  valor_total: number;
  status: string;
  forma_pagamento: string;
  condicao_pagamento: string;
  observacoes: string;
  movimenta_estoque: boolean;
  gera_financeiro: boolean;
  ordem_venda_id: string | null;
  conta_contabil_id: string | null;
  modelo_documento: string;
  tipo_operacao?: string;
  fornecedores?: { nome_razao_social: string; cpf_cnpj?: string | null };
  clientes?: { nome_razao_social: string };
  ordens_venda?: { numero: string };
}

/** Minimal shape for dropdown options – the full row may have more fields. */
interface FornecedorOpt { id: string; nome_razao_social: string; cpf_cnpj?: string | null }
interface ClienteOpt    { id: string; nome_razao_social: string; cpf_cnpj?: string | null }
interface OrdemVendaOpt { id: string; numero: string; clientes?: { nome_razao_social: string } | null }
interface ContaContabilOpt { id: string; codigo: string; descricao: string }

interface NotaFiscalEditModalProps {
  open: boolean;
  onClose: () => void;
  selected: NotaFiscalForEdit;
  form: Record<string, any>;
  setForm: (f: Record<string, any>) => void;
  items: GridItem[];
  setItems: (items: GridItem[]) => void;
  itemContaContabil: Record<number, string>;
  setItemContaContabil: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  >;
  parcelas: number;
  setParcelas: (n: number) => void;
  saving: boolean;
  onSubmit: (e: FormEvent) => void;
  onSaveAndConfirm?: () => void;
  onCancelarRascunho?: () => void;
  fornecedores: FornecedorOpt[];
  clientes: ClienteOpt[];
  ordensVenda: OrdemVendaOpt[];
  contasContabeis: ContaContabilOpt[];
  produtosCrud: any[];
  valorProdutos: number;
  totalImpostos: number;
  totalNF: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const modeloLabels: Record<string, string> = {
  "55": "NF-e",
  "65": "NFC-e",
  "57": "CT-e",
  "67": "CT-e OS",
  nfse: "NFS-e",
  outro: "Outro",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getStatusRules(status: string, statusSefaz?: string | null) {
  return {
    // Fully locked: no changes at all
    isFullyLocked: isFiscalReadOnly(status, statusSefaz),
    // Structurally locked: only observações can be changed
    isStructurallyLocked: isFiscalStructurallyLocked(status, statusSefaz),
    // Rejeitada: editable again (SEFAZ rejected, needs correction)
    canConfirmar: canConfirmFiscal(status),
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon?: React.ElementType;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-2 pb-1 border-b mb-3">
      {Icon && <Icon className="h-4 w-4 text-primary shrink-0" />}
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

interface ReadFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

const ReadField = React.forwardRef<HTMLDivElement, ReadFieldProps>(
  ({ label, value, mono, className, ...rest }, ref) => {
    return (
      <div ref={ref} className={cn("space-y-0.5", className)} {...rest}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={cn("text-sm font-medium", mono && "font-mono")}>{value}</p>
      </div>
    );
  },
);
ReadField.displayName = "ReadField";

// ── Main Component ─────────────────────────────────────────────────────────────

/**
 * @deprecated Componente legado mantido apenas para o fluxo desktop em
 * `Fiscal.tsx`. Novos callers devem usar a página dedicada `/fiscal/:id/editar`
 * (atualmente o caminho mobile já navega para essa rota). Será removido após
 * a migração completa do desktop para a página — D-01 da Onda 8 do plano
 * fiscal. Não importe este modal em features novas.
 */
export function NotaFiscalEditModal({
  open,
  onClose,
  selected,
  form,
  setForm,
  items,
  setItems,
  itemContaContabil,
  setItemContaContabil,
  parcelas,
  setParcelas,
  saving,
  onSubmit,
  onSaveAndConfirm,
  onCancelarRascunho,
  fornecedores,
  clientes,
  ordensVenda,
  contasContabeis,
  produtosCrud,
  valorProdutos,
  totalImpostos,
  totalNF,
}: NotaFiscalEditModalProps) {
  const statusSefaz = (selected as { status_sefaz?: string }).status_sefaz ?? null;
  const rules = getStatusRules(selected.status, statusSefaz);
  const modelo =
    modeloLabels[selected.modelo_documento || "55"] ||
    selected.modelo_documento;
  const parceiro =
    selected.tipo === "entrada"
      ? selected.fornecedores?.nome_razao_social || "—"
      : selected.clientes?.nome_razao_social || "—";

  const contaContabilLabel = (() => {
    const c = contasContabeis.find((x) => x.id === form.conta_contabil_id);
    return c ? `${c.codigo} – ${c.descricao}` : "—";
  })();

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Editar ${modelo} · NF ${selected.numero}`}
      size="xl"
    >
      <div className="space-y-6">
        {/* ── Document Identity Banner ──────────────────────────────── */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-bold font-mono text-primary">
                  NF {selected.numero}
                </span>
                <span className="text-sm text-muted-foreground">
                  / Série {selected.serie || "1"}
                </span>
                <Badge
                  variant="outline"
                  className={
                    selected.tipo === "entrada"
                      ? "border-primary/40 text-primary text-xs"
                      : "border-warning/40 text-warning text-xs"
                  }
                >
                  {selected.tipo === "entrada" ? "Entrada" : "Saída"}
                </Badge>
                {(selected.tipo_operacao || "normal") !== "normal" && (
                  <Badge
                    variant="outline"
                    className="border-warning/40 text-warning text-xs capitalize"
                  >
                    {selected.tipo_operacao}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground truncate max-w-[200px]">
                  {parceiro}
                </span>
                {selected.data_emissao && (
                  <span>· {formatDate(selected.data_emissao)}</span>
                )}
                {selected.ordens_venda?.numero && (
                  <span>· Pedido {selected.ordens_venda.numero}</span>
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  · {modelo}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <FiscalInternalStatusBadge status={selected.status} />
              <FiscalSefazStatusBadge status={(selected as { status_sefaz?: string }).status_sefaz || "nao_enviada"} />
              <span className="text-lg font-bold font-mono text-primary">
                {formatCurrency(selected.valor_total)}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">Situação ERP</p>
            <p className="text-xs text-muted-foreground mt-0.5">{getFiscalInternalStatus(selected.status).description}</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">Situação SEFAZ</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {getFiscalSefazStatus((selected as { status_sefaz?: string }).status_sefaz || "nao_enviada").description}
            </p>
          </div>
        </div>

        {/* ── Status Alert ──────────────────────────────────────────── */}
        {rules.isFullyLocked && (
          <div className="rounded-lg border bg-destructive/5 border-destructive/20 p-3 flex items-start gap-2">
            <Lock className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-destructive">
                {statusSefaz === "cancelada_sefaz"
                  ? "Nota cancelada junto à SEFAZ — somente leitura"
                  : statusSefaz === "inutilizada"
                  ? "Numeração inutilizada — somente leitura"
                  : "Nota fiscal cancelada — somente leitura"}
              </p>
              <p className="text-xs text-destructive/70 mt-0.5">
                {statusSefaz === "cancelada_sefaz"
                  ? "Cancelamento registrado na SEFAZ. Nenhuma alteração pode ser realizada."
                  : statusSefaz === "inutilizada"
                  ? "Número inutilizado junto à receita. Não pode ser reaproveitado."
                  : "Esta nota foi cancelada. Nenhuma alteração pode ser realizada."}
              </p>
            </div>
          </div>
        )}
        {rules.isStructurallyLocked && (
          <div className="rounded-lg border bg-warning/5 border-warning/20 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-warning">
                {statusSefaz === "autorizada"
                  ? "Nota autorizada pela SEFAZ — edição restrita"
                  : "Nota fiscal confirmada — edição restrita"}
              </p>
              <p className="text-xs text-warning/70 mt-0.5">
                Dados fiscais, itens e valores estão bloqueados. Estoque e
                financeiro já foram impactados. Apenas observações podem ser
                alteradas.
              </p>
            </div>
          </div>
        )}
        {statusSefaz === "rejeitada" && (
          <div className="rounded-lg border bg-destructive/5 border-destructive/20 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-destructive">
                Nota rejeitada pela SEFAZ — corrija e reenvie
              </p>
              <p className="text-xs text-destructive/70 mt-0.5">
                SEFAZ rejeitou esta nota. Os campos estão liberados para correção.
              </p>
            </div>
          </div>
        )}

        {/* ── Form ──────────────────────────────────────────────────── */}
        <form onSubmit={onSubmit} className="space-y-6">
          {/* ── 1. Identificação Fiscal ──────────────────────────── */}
          <div>
            <SectionHeader
              icon={FileText}
              title="Identificação Fiscal"
              description={
                rules.isStructurallyLocked || rules.isFullyLocked
                  ? "Campos bloqueados conforme status do documento"
                  : undefined
              }
            />
            {rules.isStructurallyLocked || rules.isFullyLocked ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 rounded-lg bg-muted/20 border p-4">
                <ReadField
                  label="Tipo"
                  value={form.tipo === "entrada" ? "Entrada" : "Saída"}
                />
                <ReadField label="Modelo" value={modelo} mono />
                <ReadField label="Número" value={form.numero} mono />
                <ReadField label="Série" value={form.serie || "1"} mono />
                <ReadField
                  label="Data de Emissão"
                  value={formatDate(form.data_emissao)}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={form.tipo}
                    onValueChange={(v) => setForm({ ...form, tipo: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="saida">Saída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Select
                    value={form.modelo_documento || "55"}
                    onValueChange={(v) =>
                      setForm({ ...form, modelo_documento: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="55">NF-e (Modelo 55)</SelectItem>
                      <SelectItem value="65">NFC-e (Modelo 65)</SelectItem>
                      <SelectItem value="57">CT-e (Modelo 57)</SelectItem>
                      <SelectItem value="67">CT-e OS (Modelo 67)</SelectItem>
                      <SelectItem value="nfse">NFS-e (Serviço)</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Número *</Label>
                  <Input
                    value={form.numero}
                    onChange={(e) =>
                      setForm({ ...form, numero: e.target.value })
                    }
                    required
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Série</Label>
                  <Input
                    value={form.serie}
                    onChange={(e) =>
                      setForm({ ...form, serie: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data Emissão</Label>
                  <Input
                    type="date"
                    value={form.data_emissao}
                    onChange={(e) =>
                      setForm({ ...form, data_emissao: e.target.value })
                    }
                  />
                </div>
              </div>
            )}

            {/* Chave de Acesso */}
            <div className="mt-3 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Chave de Acesso (44 dígitos)
              </p>
              {rules.isStructurallyLocked || rules.isFullyLocked ? (
                form.chave_acesso ? (
                  <div className="flex items-start gap-2 rounded-lg border bg-success/5 border-success/20 p-3">
                    <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    <p className="font-mono text-xs break-all flex-1 select-all leading-relaxed">
                      {form.chave_acesso}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-1 italic">
                    Chave de acesso não informada — documento sem chave de
                    acesso eletrônica
                  </p>
                )
              ) : (
                <Input
                  value={form.chave_acesso}
                  onChange={(e) =>
                    setForm({ ...form, chave_acesso: e.target.value })
                  }
                  className="font-mono text-xs"
                  placeholder="Chave de acesso de 44 dígitos..."
                />
              )}
            </div>
          </div>

          {/* ── 2. Parceiro e Origem ─────────────────────────────── */}
          <div>
            <SectionHeader
              icon={Building2}
              title="Parceiro e Origem"
            />
            <div className="rounded-lg bg-accent/30 border p-4 space-y-3">
              {rules.isStructurallyLocked || rules.isFullyLocked ? (
                <div className="grid grid-cols-2 gap-4">
                  <ReadField
                    label={form.tipo === "entrada" ? "Fornecedor" : "Cliente"}
                    value={parceiro}
                  />
                  {selected.ordens_venda?.numero && (
                    <ReadField
                      label="Pedido Vinculado"
                      value={selected.ordens_venda.numero}
                      mono
                    />
                  )}
                </div>
              ) : (
                <>
                  {form.tipo === "entrada" ? (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">
                        Fornecedor
                      </Label>
                      <AutocompleteSearch
                        options={fornecedores.map((f) => ({
                          id: f.id,
                          label: f.nome_razao_social,
                          sublabel: f.cpf_cnpj,
                        }))}
                        value={form.fornecedor_id}
                        onChange={(id) =>
                          setForm({ ...form, fornecedor_id: id })
                        }
                        placeholder="Buscar fornecedor..."
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Cliente</Label>
                      <AutocompleteSearch
                        options={clientes.map((c) => ({
                          id: c.id,
                          label: c.nome_razao_social,
                          sublabel: c.cpf_cnpj,
                        }))}
                        value={form.cliente_id}
                        onChange={(id) =>
                          setForm({ ...form, cliente_id: id })
                        }
                        placeholder="Buscar cliente..."
                      />
                    </div>
                  )}
                  {form.tipo === "saida" && ordensVenda.length > 0 && (
                    <div className="space-y-2">
                      <Label>Pedido Vinculado (opcional)</Label>
                      <Select
                        value={form.ordem_venda_id || "none"}
                        onValueChange={(v) =>
                          setForm({
                            ...form,
                            ordem_venda_id: v === "none" ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Vincular a um Pedido..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {ordensVenda.map((ov) => (
                              <SelectItem key={ov.id} value={ov.id}>
                              {ov.numero} —{" "}
                              {ov.clientes?.nome_razao_social || ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── 2b. Dados Fiscais Complementares ────────────────── */}
          {!rules.isFullyLocked && (
            <div>
              <SectionHeader
                icon={Truck}
                title="Dados Fiscais e Transporte"
                description={rules.isStructurallyLocked ? "Campos bloqueados" : "Natureza da operação, ambiente, transporte e volumes"}
              />
              {rules.isStructurallyLocked ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-lg bg-muted/20 border p-4">
                  <ReadField label="Natureza da Operação" value={form.natureza_operacao || "—"} />
                  <ReadField label="Ambiente" value={form.ambiente_emissao === "producao" ? "Produção" : "Homologação"} />
                  <ReadField label="Modalidade Frete" value={form.frete_modalidade || "—"} />
                  <ReadField label="Peso Bruto" value={`${form.peso_bruto || 0} kg`} mono />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-2 col-span-2 md:col-span-1">
                      <Label>Natureza da Operação</Label>
                      <Input
                        value={form.natureza_operacao || ""}
                        onChange={(e) => setForm({ ...form, natureza_operacao: e.target.value })}
                        placeholder="Ex: Venda de mercadoria"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Ambiente de Emissão</Label>
                      <Select
                        value={form.ambiente_emissao || "homologacao"}
                        onValueChange={(v) => setForm({ ...form, ambiente_emissao: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="homologacao">Homologação</SelectItem>
                          <SelectItem value="producao">Produção</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Modalidade Frete</Label>
                      <Select
                        value={form.frete_modalidade || "0"}
                        onValueChange={(v) => setForm({ ...form, frete_modalidade: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0 – CIF (Emitente)</SelectItem>
                          <SelectItem value="1">1 – FOB (Destinatário)</SelectItem>
                          <SelectItem value="2">2 – Terceiros</SelectItem>
                          <SelectItem value="9">9 – Sem frete</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Peso Bruto (kg)</Label>
                      <Input type="number" step="0.001" value={form.peso_bruto || 0} onChange={(e) => setForm({ ...form, peso_bruto: Number(e.target.value) })} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Peso Líquido (kg)</Label>
                      <Input type="number" step="0.001" value={form.peso_liquido || 0} onChange={(e) => setForm({ ...form, peso_liquido: Number(e.target.value) })} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qtd Volumes</Label>
                      <Input type="number" value={form.quantidade_volumes || 0} onChange={(e) => setForm({ ...form, quantidade_volumes: Number(e.target.value) })} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Espécie</Label>
                      <Input value={form.especie_volumes || ""} onChange={(e) => setForm({ ...form, especie_volumes: e.target.value })} className="h-8 text-xs" placeholder="Ex: Caixa" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 3. Itens da Nota ─────────────────────────────────── */}
          <div>
            <SectionHeader
              icon={Package}
              title="Itens da Nota"
              description={
                items.length > 0
                  ? `${items.length} item(ns) · Subtotal ${formatCurrency(valorProdutos)}`
                  : rules.isStructurallyLocked || rules.isFullyLocked
                  ? "Itens bloqueados — nota confirmada"
                  : undefined
              }
            />
            <ItemsGrid
              items={items}
              onChange={setItems}
              produtos={produtosCrud}
              title=""
              readOnly={rules.isStructurallyLocked || rules.isFullyLocked}
            />
            {items.length > 0 &&
              contasContabeis.length > 0 &&
              !rules.isStructurallyLocked &&
              !rules.isFullyLocked && (
                <div className="mt-3 space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Conta Contábil por Item
                  </Label>
                  <div className="space-y-2 rounded-lg border p-3">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground min-w-[120px] truncate">
                          {item.descricao || `Item ${idx + 1}`}
                        </span>
                        <Select
                          value={itemContaContabil[idx] || "none"}
                          onValueChange={(v) =>
                            setItemContaContabil((prev) => ({
                              ...prev,
                              [idx]: v === "none" ? "" : v,
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue placeholder="Conta contábil..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhuma</SelectItem>
                            {contasContabeis.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.codigo} - {c.descricao}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* ── 4. Frete, Impostos e Despesas ────────────────────── */}
          {!rules.isStructurallyLocked && !rules.isFullyLocked && (
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-left min-h-11 md:hidden"
              >
                <span className="text-sm font-semibold">Frete, Impostos e Despesas</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <div className="hidden md:block">
                <SectionHeader title="Frete, Impostos e Despesas" />
              </div>
              <CollapsibleContent forceMount className="md:!block data-[state=closed]:hidden md:data-[state=closed]:!block mt-3 md:mt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Frete", key: "frete_valor" },
                    { label: "ICMS", key: "icms_valor" },
                    { label: "IPI", key: "ipi_valor" },
                    { label: "PIS", key: "pis_valor" },
                    { label: "COFINS", key: "cofins_valor" },
                    { label: "ICMS-ST", key: "icms_st_valor" },
                    { label: "Desconto", key: "desconto_valor" },
                    { label: "Outras Despesas", key: "outras_despesas" },
                  ].map(({ label, key }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: Number(e.target.value) })
                        }
                        className="h-11 md:h-8 text-sm md:text-xs"
                      />
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* ── 5. Resumo de Totais ───────────────────────────────── */}
          <div>
            <SectionHeader icon={DollarSign} title="Resumo de Totais" />
            <div className="rounded-lg border bg-accent/50 p-4 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">
                  Valor dos Produtos:
                </span>
                <span className="font-mono font-semibold">
                  {formatCurrency(valorProdutos)}
                </span>
              </div>
              {Number(form.frete_valor || 0) > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Frete:</span>
                  <span className="font-mono">
                    {formatCurrency(Number(form.frete_valor))}
                  </span>
                </div>
              )}
              {totalImpostos > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    Impostos (ICMS + IPI + PIS + COFINS + ST):
                  </span>
                  <span className="font-mono">
                    {formatCurrency(totalImpostos)}
                  </span>
                </div>
              )}
              {Number(form.outras_despesas || 0) > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    Outras Despesas:
                  </span>
                  <span className="font-mono">
                    {formatCurrency(Number(form.outras_despesas))}
                  </span>
                </div>
              )}
              {Number(form.desconto_valor || 0) > 0 && (
                <div className="flex justify-between items-center text-sm text-destructive">
                  <span>Desconto:</span>
                  <span className="font-mono">
                    -{formatCurrency(Number(form.desconto_valor))}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center font-bold border-t pt-2">
                <span>Total da Nota Fiscal:</span>
                <span className="font-mono text-lg text-primary">
                  {formatCurrency(totalNF)}
                </span>
              </div>
              {form.condicao_pagamento === "a_prazo" && parcelas > 1 && (
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>{parcelas}× de</span>
                  <span className="font-mono font-semibold">
                    {formatCurrency(totalNF / parcelas)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── 6. Pagamento ─────────────────────────────────────── */}
          {!rules.isFullyLocked && (
            <div>
              <SectionHeader title="Pagamento" />
              {rules.isStructurallyLocked ? (
                <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/20 border p-4">
                  <ReadField
                    label="Forma de Pagamento"
                    value={
                      <span className="capitalize">
                        {form.forma_pagamento || "—"}
                      </span>
                    }
                  />
                  <ReadField
                    label="Condição"
                    value={
                      form.condicao_pagamento === "a_vista"
                        ? "À Vista"
                        : "A Prazo"
                    }
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Forma de Pagamento</Label>
                    <Select
                      value={form.forma_pagamento}
                      onValueChange={(v) =>
                        setForm({ ...form, forma_pagamento: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="boleto_dda">Boleto/DDA</SelectItem>
                        <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                        <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="transferencia">
                          Transferência
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Condição</Label>
                    <Select
                      value={form.condicao_pagamento}
                      onValueChange={(v) =>
                        setForm({ ...form, condicao_pagamento: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a_vista">À Vista</SelectItem>
                        <SelectItem value="a_prazo">A Prazo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.condicao_pagamento === "a_prazo" && (
                    <div className="space-y-2">
                      <Label>Nº Parcelas</Label>
                      <Input
                        type="number"
                        min={1}
                        max={48}
                        value={parcelas}
                        onChange={(e) => setParcelas(Number(e.target.value))}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── 7. Impactos Operacionais ──────────────────────────── */}
          <div>
            <SectionHeader
              title="Impactos Operacionais"
              description="Geração de movimentos ao confirmar a nota"
            />
            {rules.isFullyLocked ? (
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/20 border p-4">
                <ReadField
                  label="Movimenta Estoque"
                  value={
                    <span
                      className={
                        form.movimenta_estoque
                          ? "text-success font-semibold"
                          : "text-muted-foreground"
                      }
                    >
                      {form.movimenta_estoque ? "Sim" : "Não"}
                    </span>
                  }
                />
                <ReadField
                  label="Gera Financeiro"
                  value={
                    <span
                      className={
                        form.gera_financeiro
                          ? "text-success font-semibold"
                          : "text-muted-foreground"
                      }
                    >
                      {form.gera_financeiro ? "Sim" : "Não"}
                    </span>
                  }
                />
              </div>
            ) : (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label
                    className={cn(
                      "flex items-start gap-3 rounded-lg p-3 border transition-colors",
                      rules.isStructurallyLocked
                        ? "opacity-60 cursor-not-allowed"
                        : "cursor-pointer",
                      form.movimenta_estoque
                        ? "bg-success/5 border-success/20"
                        : "bg-muted/20",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={form.movimenta_estoque}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          movimenta_estoque: e.target.checked,
                        })
                      }
                      className="rounded mt-0.5"
                      disabled={rules.isStructurallyLocked}
                    />
                    <div>
                      <p className="text-sm font-medium">Movimenta Estoque</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {form.movimenta_estoque
                          ? "Ao confirmar, gerará movimentos de entrada/saída no estoque."
                          : "Não impactará o estoque ao ser confirmada."}
                      </p>
                    </div>
                  </label>
                  <label
                    className={cn(
                      "flex items-start gap-3 rounded-lg p-3 border transition-colors",
                      rules.isStructurallyLocked
                        ? "opacity-60 cursor-not-allowed"
                        : "cursor-pointer",
                      form.gera_financeiro
                        ? "bg-success/5 border-success/20"
                        : "bg-muted/20",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={form.gera_financeiro}
                      onChange={(e) =>
                        setForm({ ...form, gera_financeiro: e.target.checked })
                      }
                      className="rounded mt-0.5"
                      disabled={rules.isStructurallyLocked}
                    />
                    <div>
                      <p className="text-sm font-medium">Gera Financeiro</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {form.gera_financeiro
                          ? "Ao confirmar, gerará lançamentos em Lançamentos."
                          : "Não gerará lançamentos financeiros ao ser confirmada."}
                      </p>
                    </div>
                  </label>
                </div>
                {!form.gera_financeiro && !rules.isStructurallyLocked && (
                  <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-xs text-warning">
                    ⚠️ "Gera Financeiro" está desmarcado — ao confirmar, esta
                    NF <strong>não</strong> gerará lançamentos financeiros.
                  </div>
                )}
                {contasContabeis.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs text-muted-foreground">
                      Conta Contábil Geral (fallback para itens sem conta)
                    </Label>
                    {rules.isStructurallyLocked ? (
                      <p className="text-sm font-medium">
                        {contaContabilLabel}
                      </p>
                    ) : (
                      <Select
                        value={form.conta_contabil_id || "none"}
                        onValueChange={(v) =>
                          setForm({
                            ...form,
                            conta_contabil_id: v === "none" ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Vincular conta contábil..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {contasContabeis.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.codigo} - {c.descricao}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 8. Observações ───────────────────────────────────── */}
          <div className="space-y-2">
            <Label>Observações</Label>
            {rules.isFullyLocked ? (
              <div className="min-h-[60px] rounded-lg bg-muted/20 border p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                {form.observacoes || "—"}
              </div>
            ) : (
              <Textarea
                value={form.observacoes}
                onChange={(e) =>
                  setForm({ ...form, observacoes: e.target.value })
                }
                placeholder={
                  rules.isStructurallyLocked
                    ? "Adicione observações complementares..."
                    : undefined
                }
              />
            )}
          </div>

          {/* ── 9. Ações ─────────────────────────────────────────── */}
          <div className="pt-2 border-t">
            {rules.isFullyLocked ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={onClose}
              >
                Fechar
              </Button>
            ) : rules.isStructurallyLocked ? (
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar Observações"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row justify-between gap-2">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancelar
                  </Button>
                  {onCancelarRascunho && (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/5"
                      onClick={onCancelarRascunho}
                    >
                      Cancelar Rascunho
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={saving}
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                  {onSaveAndConfirm && (
                    <Button
                      type="button"
                      className="gap-1.5"
                      onClick={onSaveAndConfirm}
                      disabled={saving}
                    >
                      <CheckCircle className="h-4 w-4" />
                      {saving ? "Processando..." : "Salvar e Confirmar"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </FormModal>
  );
}

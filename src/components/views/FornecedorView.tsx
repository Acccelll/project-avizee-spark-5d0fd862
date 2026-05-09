import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchFornecedorDetalhes, deleteFornecedor } from "@/services/fornecedores.service";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/format";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { usePublishDrawerSlots } from "@/contexts/RelationalDrawerSlotsContext";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PermanentDeleteDialog } from "@/components/PermanentDeleteDialog";
import { useCanHardDelete } from "@/hooks/useCanHardDelete";
import { Truck, Mail, MapPin, ShoppingBag, CreditCard, Package, FileText, Edit, Trash2, Building2, Clock, MessageSquare, MoreHorizontal, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useDetailFetch } from "@/hooks/useDetailFetch";
import { useDetailActions } from "@/hooks/useDetailActions";
import { useInvalidateAfterMutation } from "@/hooks/useInvalidateAfterMutation";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { RecordIdentityCard } from "@/components/ui/RecordIdentityCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DetailLoading, DetailError, DetailEmpty } from "@/components/ui/DetailStates";
import type { FornecedorRow, CompraRow, FinanceiroLancamentoRow, ProdutoFornecedorRow } from "@/types/cadastros";
import { getEffectiveStatus } from "@/lib/financeiro";
import { cpfCnpjMask, phoneMask, cepMask } from "@/utils/masks";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  id: string;
}

interface FornecedorDetail {
  fornecedor: FornecedorRow;
  compras: CompraRow[];
  financeiro: FinanceiroLancamentoRow[];
  produtos: ProdutoFornecedorRow[];
}

export function FornecedorView({ id }: Props) {
  const navigate = useNavigate();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const { canHardDelete: isAdmin } = useCanHardDelete();
  const { pushView, clearStack } = useRelationalNavigation();
  const { run, locked } = useDetailActions();
  const invalidate = useInvalidateAfterMutation();

  const { data, loading, error } = useDetailFetch<FornecedorDetail>(id, async (fId, signal) => {
    const res = await fetchFornecedorDetalhes(fId, signal);
    if (!res) return null;
    const { fornecedor, cRes, finRes, pRes } = res;
    return {
      fornecedor: fornecedor as FornecedorRow,
      compras: (cRes.data as CompraRow[]) || [],
      financeiro: (finRes.data as FinanceiroLancamentoRow[]) || [],
      produtos: (pRes.data as ProdutoFornecedorRow[]) || [],
    };
  });

  const selected = data?.fornecedor ?? null;
  const compras = data?.compras ?? [];
  const financeiro = data?.financeiro ?? [];
  const produtos = data?.produtos ?? [];

  const ultCompra = compras.length > 0 ? compras[0].data_pedido : null;
  const volumeTotal = compras.reduce((acc, curr) => acc + (curr.valor_total || 0), 0);
  // "vencido" derivado: aberto/parcial cuja data já passou.
  const hojeDate = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const isVencido = (f: FinanceiroLancamentoRow) =>
    getEffectiveStatus(f.status ?? "", f.data_vencimento ?? "", hojeDate) === "vencido";
  const vencidos = financeiro.filter(isVencido);
  // B6 fix: incluir 'parcial' (alinhado a financeiro-migracao-saldos).
  const totalAberto = financeiro
    .filter((f) => f.status === "aberto" || f.status === "parcial")
    .reduce((acc, curr) => acc + (curr.saldo_restante || curr.valor), 0);
  const totalVencido = vencidos.reduce((acc, curr) => acc + (curr.saldo_restante || curr.valor), 0);

  // B7: distinguir lead time observado de prazo cadastral (renomeado para clareza).
  const produtosComPrazo = produtos.filter((p) => p.lead_time_dias !== null && p.lead_time_dias !== undefined);
  const leadTimeMedio = produtosComPrazo.length > 0
    ? Math.round(produtosComPrazo.reduce((acc, p) => acc + (p.lead_time_dias || 0), 0) / produtosComPrazo.length)
    : null;
  const prazoMedio = leadTimeMedio ?? selected?.prazo_padrao ?? null;
  const prazoMedioFonte = leadTimeMedio !== null ? "lead time" : selected?.prazo_padrao ? "prazo padrão" : null;

  const deleteDescription = (() => {
    const parts: string[] = [];
    if (compras.length > 0) parts.push(`${compras.length} pedido(s) de compra`);
    if (financeiro.length > 0) parts.push(`${financeiro.length} lançamento(s) financeiro(s)`);
    if (produtos.length > 0) parts.push(`${produtos.length} produto(s) vinculado(s)`);
    const cnpj = selected?.cpf_cnpj ? ` (${selected.cpf_cnpj})` : "";
    if (parts.length > 0) {
      return `Tem certeza que deseja excluir "${selected?.nome_razao_social || ""}"${cnpj}? Este fornecedor possui ${parts.join(", ")}. Considere inativá-lo em vez de excluir.`;
    }
    return `Tem certeza que deseja excluir "${selected?.nome_razao_social || ""}"${cnpj}? Esta ação não pode ser desfeita.`;
  })();

  // Publica slots no header padronizado
  usePublishDrawerSlots(`fornecedor:${id}`, {
    breadcrumb: selected?.cpf_cnpj ? `Fornecedor · ${selected.cpf_cnpj}` : undefined,
    summary: selected ? (
      <RecordIdentityCard
        icon={Truck}
        title={selected.nome_razao_social}
        subtitle={selected.nome_fantasia || undefined}
        meta={
          <>
            {selected.cpf_cnpj && <span className="font-mono">{selected.cpf_cnpj}</span>}
            {(selected.cidade || selected.uf) && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[selected.cidade, selected.uf].filter(Boolean).join("/")}</span>
            )}
          </>
        }
        badges={<StatusBadge status={selected.ativo ? "ativo" : "inativo"} />}
      />
    ) : undefined,
    actions: selected ? (
      <>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" aria-label="Editar fornecedor" onClick={() => {
          navigate(`/fornecedores?editId=${id}`);
          window.setTimeout(() => clearStack(), 0);
        }}>
          <Edit className="h-3.5 w-3.5" /> Editar
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" aria-label="Excluir fornecedor" onClick={() => setDeleteConfirmOpen(true)}>
          <Trash2 className="h-3.5 w-3.5" /> Excluir
        </Button>
        {isAdmin && selected.ativo === false && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label="Excluir fornecedor permanentemente"
            onClick={() => setPermDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir definitivamente
          </Button>
        )}
      </>
    ) : undefined,
  });

  if (loading) return <DetailLoading />;
  if (error) return <DetailError message={error.message} />;
  if (!selected) return <DetailEmpty title="Fornecedor não encontrado" icon={Truck} />;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <DrawerSummaryGrid cols={4}>
        <DrawerSummaryCard
          label="Prazo Médio"
          value={prazoMedio ? `${prazoMedio} dias` : "—"}
          hint={prazoMedioFonte || undefined}
        />
        <DrawerSummaryCard
          label="Saldo Aberto"
          value={formatCurrency(totalAberto)}
          tone={totalAberto > 0 ? "destructive" : "neutral"}
        />
        <DrawerSummaryCard label="Vol. Compras" value={formatCurrency(volumeTotal)} />
        <DrawerSummaryCard label="Última Compra" value={ultCompra ? formatDate(ultCompra) : "—"} mono={false} />
      </DrawerSummaryGrid>

      <Tabs defaultValue="geral" className="w-full">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="geral" className="text-xs px-1">Geral</TabsTrigger>
          <TabsTrigger value="compras" className="text-xs px-1">Compras</TabsTrigger>
          <TabsTrigger value="financeiro" className="text-xs px-1">Financ.</TabsTrigger>
          <TabsTrigger value="produtos" className="text-xs px-1">Produtos</TabsTrigger>
          <TabsTrigger value="relacionamento" className="text-xs px-1">Relac.</TabsTrigger>
        </TabsList>

        {/* TAB: GERAL */}
        <TabsContent value="geral" className="space-y-4 mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><Building2 className="h-3 w-3" /> Dados Fiscais</h4>
                <p><span className="text-muted-foreground">CNPJ/CPF:</span> {selected.cpf_cnpj || "—"}</p>
                {selected.inscricao_estadual && <p><span className="text-muted-foreground">Insc. Estadual:</span> {selected.inscricao_estadual}</p>}
                <p><span className="text-muted-foreground">Tipo:</span> {selected.tipo_pessoa === "J" ? "Pessoa Jurídica" : "Pessoa Física"}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><Mail className="h-3 w-3" /> Contato</h4>
                <p><span className="text-muted-foreground">Email:</span> {selected.email || "—"}</p>
                <p><span className="text-muted-foreground">Telefone:</span> {selected.telefone || "—"}</p>
                {selected.celular && <p><span className="text-muted-foreground">Celular:</span> {selected.celular}</p>}
                {selected.contato && <p><span className="text-muted-foreground">Responsável:</span> {selected.contato}</p>}
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><CreditCard className="h-3 w-3" /> Condições</h4>
                <p><span className="text-muted-foreground">Prazo Padrão:</span> {selected.prazo_padrao ? `${selected.prazo_padrao} dias` : "—"}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><MapPin className="h-3 w-3" /> Endereço</h4>
                <p className="leading-snug text-sm">
                  {[selected.logradouro, selected.numero].filter(Boolean).join(", ")}
                  {selected.complemento && <span>{[selected.logradouro, selected.numero].filter(Boolean).length > 0 ? ", " : ""}{selected.complemento}</span>}
                  {(selected.bairro || selected.cidade || selected.uf) && (
                    <><br />{[selected.bairro, [selected.cidade, selected.uf].filter(Boolean).join("/")].filter(Boolean).join(" — ")}</>
                  )}
                  {selected.cep && <><br />CEP: {selected.cep}</>}
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB: COMPRAS */}
        <TabsContent value="compras" className="space-y-3 mt-3">
          {compras.length > 0 && (
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/20 p-3 border">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Pedidos</p>
                <p className="font-bold text-sm">{compras.length}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total</p>
                <p className="font-bold text-sm font-mono">{formatCurrency(volumeTotal)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Ult. Compra</p>
                <p className="font-bold text-sm">{ultCompra ? formatDate(ultCompra) : "—"}</p>
              </div>
            </div>
          )}
          <h4 className="font-semibold text-sm flex items-center gap-2 px-1 text-muted-foreground uppercase text-[10px]"><ShoppingBag className="h-3.5 w-3.5" /> Últimos Pedidos de Compra</h4>
          {compras.length === 0 ? (
            <DetailEmpty icon={ShoppingBag} title="Nenhum pedido de compra" message="Nenhum pedido de compra encontrado para este fornecedor" />
          ) : (
            <div className="space-y-2">
              {compras.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2.5 rounded border bg-card hover:bg-muted/30 transition-colors text-sm">
                  <div>
                    <RelationalLink onClick={() => pushView("pedido_compra", c.id)} className="font-mono">PC {c.numero}</RelationalLink>
                    <p className="text-[10px] text-muted-foreground">{formatDate(c.data_pedido)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(c.valor_total)}</p>
                    <StatusBadge status={c.status} className="h-3.5 text-[9px]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB: FINANCEIRO */}
        <TabsContent value="financeiro" className="space-y-3 mt-3">
          <div className="rounded-lg border p-3 space-y-3 bg-muted/10">
            <h4 className="font-semibold flex items-center gap-2 text-muted-foreground uppercase text-[10px]"><CreditCard className="h-3 w-3" /> Situação Financeira</h4>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Saldo Aberto</p>
                <p className={`font-bold font-mono ${totalAberto > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{formatCurrency(totalAberto)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Vencidos</p>
                <p className={`font-bold font-mono ${vencidos.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{formatCurrency(totalVencido)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Prazo Padrão</p>
                <p className="font-bold">{selected.prazo_padrao ? `${selected.prazo_padrao}d` : "—"}</p>
              </div>
            </div>
          </div>
          <h4 className="font-semibold flex items-center gap-2 px-1 text-muted-foreground uppercase text-[10px]"><FileText className="h-3.5 w-3.5" /> Lançamentos Recentes</h4>
          {financeiro.length === 0 ? (
            <DetailEmpty icon={CreditCard} title="Nenhum lançamento financeiro" message="Nenhum lançamento financeiro registrado para este fornecedor" />
          ) : (
            <div className="space-y-2">
              {financeiro.map((f) => (
                <div key={f.id} className={`flex items-center justify-between p-2.5 rounded border bg-card text-xs ${isVencido(f) ? 'border-destructive/30' : ''}`}>
                  <div>
                    <p className="font-medium truncate max-w-[180px]">{f.descricao}</p>
                    <p className="text-[10px] text-muted-foreground">Vencimento: {formatDate(f.data_vencimento)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${f.status === 'pago' ? 'text-success' : isVencido(f) ? 'text-destructive' : ''}`}>
                      {formatCurrency(f.saldo_restante || f.valor)}
                    </p>
                    <StatusBadge status={f.status} className="h-3.5 text-[9px]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB: PRODUTOS */}
        <TabsContent value="produtos" className="space-y-3 mt-3">
          <h4 className="font-semibold text-sm flex items-center gap-2 px-1 text-muted-foreground uppercase text-[10px]"><Package className="h-3.5 w-3.5" /> Produtos Fornecidos</h4>
          {produtos.length === 0 ? (
            <DetailEmpty icon={Package} title="Nenhum produto vinculado" message="Nenhum produto vinculado a este fornecedor" />
          ) : (
            <div className="space-y-2">
              {produtos.map((p) => (
                <div key={p.id} className={`flex items-center justify-between p-2.5 rounded border bg-card text-xs ${p.eh_principal ? 'border-primary/30 bg-primary/5' : ''}`}>
                  <div>
                    <button onClick={() => pushView("produto", p.produtos?.id)} className="font-medium hover:underline text-left">
                      {p.produtos?.nome}
                    </button>
                    <p className="text-[10px] text-muted-foreground font-mono">{p.produtos?.sku}</p>
                    {p.referencia_fornecedor && <p className="text-[9px] text-primary mt-0.5">Ref: {p.referencia_fornecedor}</p>}
                    {p.descricao_fornecedor && <p className="text-[9px] text-muted-foreground mt-0.5 italic">{p.descricao_fornecedor}{p.unidade_fornecedor ? ` · ${p.unidade_fornecedor}` : ""}</p>}
                  </div>
                  <div className="text-right space-y-0.5">
                    <p className="font-bold">{formatCurrency(p.preco_compra || 0)}</p>
                    {p.lead_time_dias !== null && p.lead_time_dias !== undefined && <p className="text-[9px] text-muted-foreground">{p.lead_time_dias} dias</p>}
                    {p.eh_principal && <span className="inline-block bg-primary/10 text-primary px-1 rounded-[2px] font-bold">Principal</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB: RELACIONAMENTO */}
        <TabsContent value="relacionamento" className="space-y-4 mt-3">
          {selected.observacoes ? (
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><FileText className="h-3 w-3" /> Observações</h4>
              <p className="text-xs text-muted-foreground italic leading-relaxed bg-muted/20 rounded-lg p-3">{selected.observacoes}</p>
            </div>
          ) : (
            <DetailEmpty title="Sem observações registradas" className="py-6" />
          )}
          {(selected.contato || selected.email || selected.telefone || selected.celular) && (
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><MessageSquare className="h-3 w-3" /> Contato Principal</h4>
              <div className="rounded-lg border bg-card p-3 space-y-1.5 text-xs">
                {selected.contato && <p><span className="text-muted-foreground">Responsável:</span> {selected.contato}</p>}
                {selected.email && <p><span className="text-muted-foreground">Email:</span> {selected.email}</p>}
                {selected.telefone && <p><span className="text-muted-foreground">Telefone:</span> {selected.telefone}</p>}
                {selected.celular && <p><span className="text-muted-foreground">Celular:</span> {selected.celular}</p>}
              </div>
            </div>
          )}
          {selected.prazo_padrao && (
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><Clock className="h-3 w-3" /> Condições Negociadas</h4>
              <div className="rounded-lg border bg-card p-3 space-y-1.5 text-xs">
                <p><span className="text-muted-foreground">Prazo Padrão:</span> {selected.prazo_padrao} dias</p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        loading={locked("delete")}
        onConfirm={() =>
          run("delete", async () => {
            await deleteFornecedor(id);
            toast.success("Fornecedor excluído com sucesso.");
            await invalidate(["fornecedores", "pedidos_compra", "financeiro_lancamentos"]);
            setDeleteConfirmOpen(false);
            clearStack();
          })
        }
        title="Excluir fornecedor"
        description={deleteDescription}
      />

      <PermanentDeleteDialog
        open={permDeleteOpen}
        onClose={() => setPermDeleteOpen(false)}
        table="fornecedores"
        id={id}
        entityLabel="fornecedor"
        recordName={selected?.nome_razao_social || id}
        warning="Ação administrativa. Remove o fornecedor do banco — não é inativação."
        sideEffects={[
          compras.length > 0 || financeiro.length > 0 || produtos.length > 0
            ? "Há pedidos de compra, lançamentos ou produtos vinculados. A exclusão será bloqueada."
            : "Nenhum vínculo operacional detectado.",
        ]}
        onDeleted={() => {
          invalidate(["fornecedores"]);
          clearStack();
        }}
      />
    </div>
  );
}

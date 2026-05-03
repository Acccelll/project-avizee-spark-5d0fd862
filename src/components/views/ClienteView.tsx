import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { fetchClienteDetalhes, deleteCliente } from "@/services/clientes.service";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/format";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { usePublishDrawerSlots } from "@/contexts/RelationalDrawerSlotsContext";
import { PrecosEspeciaisTab } from "@/components/precos/PrecosEspeciaisTab";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Edit, Trash2, User, Mail, MapPin, FileText, CreditCard, MessageSquare, Truck, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useDetailFetch } from "@/hooks/useDetailFetch";
import { useDetailActions } from "@/hooks/useDetailActions";
import { useInvalidateAfterMutation } from "@/hooks/useInvalidateAfterMutation";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { RecordIdentityCard } from "@/components/ui/RecordIdentityCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DetailLoading, DetailError, DetailEmpty } from "@/components/ui/DetailStates";

interface Props {
  id: string;
}

type ClienteWithGroup = Tables<"clientes"> & {
  grupos_economicos: { nome: string } | null;
  formas_pagamento: { descricao: string } | null;
};

interface VendaRow { id: string; numero: string; data_emissao: string; valor_total: number; status: string }
interface NotaSaidaRow { id: string; numero: string | null; data_emissao: string | null; valor_total: number | null; status: string | null; ordem_venda_id: string | null }
type FinanceiroRow = Tables<"financeiro_lancamentos">;
type ComunicacaoRow = Tables<"cliente_registros_comunicacao">;
type TransportadoraRow = Tables<"cliente_transportadoras"> & { transportadoras: { nome_razao_social: string } | null };

interface ClienteDetail {
  cliente: ClienteWithGroup;
  vendas: VendaRow[];
  notasSaida: NotaSaidaRow[];
  financeiro: FinanceiroRow[];
  comunicacao: ComunicacaoRow[];
  transportadoras: TransportadoraRow[];
}

export function ClienteView({ id }: Props) {
  const navigate = useNavigate();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { pushView, clearStack } = useRelationalNavigation();
  const { run, locked } = useDetailActions();
  const invalidate = useInvalidateAfterMutation();

  // Fetch padronizado (race-safe + cancelável + reset entre ids).
  const { data, loading, error } = useDetailFetch<ClienteDetail>(id, async (cId, signal) => {
    const res = await fetchClienteDetalhes(cId, signal);
    if (!res) return null;
    const { cliente, vRes, nfRes, fRes, commRes, transRes } = res;
    return {
      cliente: cliente as ClienteWithGroup,
      vendas: (vRes.data as VendaRow[]) || [],
      notasSaida: (nfRes.data as NotaSaidaRow[]) || [],
      financeiro: (fRes.data as FinanceiroRow[]) || [],
      comunicacao: (commRes.data as ComunicacaoRow[]) || [],
      transportadoras: (transRes.data as TransportadoraRow[]) || [],
    };
  });

  const selected = data?.cliente ?? null;
  const vendas = data?.vendas ?? [];
  const notasSaida = data?.notasSaida ?? [];
  const financeiro = data?.financeiro ?? [];
  const comunicacao = data?.comunicacao ?? [];
  const transportadoras = data?.transportadoras ?? [];

  // B6 fix: incluir 'parcial' no saldo aberto (alinhado à memória financeiro-migracao-saldos).
  const totalAberto = financeiro
    .filter((f) => f.status === "aberto" || f.status === "vencido" || f.status === "parcial")
    .reduce((acc, curr) => acc + (curr.saldo_restante || curr.valor), 0);
  // Combina pedidos atuais + notas históricas migradas para os KPIs.
  const ultCompra = vendas[0]?.data_emissao || notasSaida[0]?.data_emissao || null;
  const pmvBase = vendas.length > 0 ? vendas : notasSaida;
  const pmv = pmvBase.length > 0
    ? pmvBase.reduce((acc, curr) => acc + (Number(curr.valor_total) || 0), 0) / pmvBase.length
    : 0;

  // Publica slots no header padronizado
  usePublishDrawerSlots(`cliente:${id}`, {
    breadcrumb: selected?.cpf_cnpj ? `Cliente · ${selected.cpf_cnpj}` : undefined,
    summary: selected ? (
      <RecordIdentityCard
        icon={User}
        title={selected.nome_razao_social}
        meta={
          <>
            {selected.cpf_cnpj && <span className="font-mono">{selected.cpf_cnpj}</span>}
            {(selected.cidade || selected.uf) && <span>{[selected.cidade, selected.uf].filter(Boolean).join("/")}</span>}
          </>
        }
        badges={
          <>
            <StatusBadge status={selected.ativo ? "ativo" : "inativo"} />
            {selected.grupos_economicos?.nome && (
              <span className="inline-flex items-center rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground font-medium">
                {selected.grupos_economicos.nome}
              </span>
            )}
          </>
        }
      />
    ) : undefined,
    actions: selected ? (
      <>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" aria-label="Editar cliente" onClick={() => {
          navigate(`/clientes?editId=${id}`);
          window.setTimeout(() => clearStack(), 0);
        }}>
          <Edit className="h-3.5 w-3.5" /> Editar
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" aria-label="Excluir cliente" onClick={() => setDeleteConfirmOpen(true)}>
          <Trash2 className="h-3.5 w-3.5" /> Excluir
        </Button>
      </>
    ) : undefined,
  });

  if (loading) return <DetailLoading />;
  if (error) return <DetailError message={error.message} />;
  if (!selected) return <DetailEmpty title="Cliente não encontrado" icon={User} />;

  return (
    <div className="space-y-5">
      <DrawerSummaryGrid cols={4}>
        <DrawerSummaryCard label="Saldo Devedor" value={formatCurrency(totalAberto)} tone={totalAberto > 0 ? "destructive" : "neutral"} />
        <DrawerSummaryCard label="PMV (Médio)" value={formatCurrency(pmv)} />
        <DrawerSummaryCard label="Lmt. Crédito" value={formatCurrency(selected.limite_credito || 0)} tone={selected.limite_credito && selected.limite_credito > 0 ? "success" : "neutral"} />
        <DrawerSummaryCard label="Última Compra" value={ultCompra ? formatDate(ultCompra) : "—"} mono={false} />
      </DrawerSummaryGrid>

      <Tabs defaultValue="geral" className="w-full">
        <TabsList className="w-full grid grid-cols-6">
          <TabsTrigger value="geral" className="text-xs px-1">Geral</TabsTrigger>
          <TabsTrigger value="vendas" className="text-xs px-1">Vendas</TabsTrigger>
          <TabsTrigger value="financeiro" className="text-xs px-1">Financ.</TabsTrigger>
          <TabsTrigger value="contatos" className="text-xs px-1">Contatos</TabsTrigger>
          <TabsTrigger value="logistica" className="text-xs px-1">Logíst.</TabsTrigger>
          <TabsTrigger value="precos" className="text-xs px-1">Preços</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-4 mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><Mail className="h-3 w-3" /> Contato</h4>
                <p><span className="text-muted-foreground">Email:</span> {selected.email || "—"}</p>
                <p><span className="text-muted-foreground">Telefone:</span> {selected.telefone || "—"}</p>
                <p><span className="text-muted-foreground">Celular:</span> {selected.celular || "—"}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><BarChart3 className="h-3 w-3" /> Corporativo</h4>
                <p><span className="text-muted-foreground">Grupo Econômico:</span> {selected.grupos_economicos?.nome || "—"}</p>
                <p><span className="text-muted-foreground">Relação:</span> <span className="capitalize">{selected.tipo_relacao_grupo || "independente"}</span></p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><MapPin className="h-3 w-3" /> Endereço</h4>
                <p className="leading-tight">
                  {selected.logradouro}, {selected.numero}<br />
                  {selected.bairro} — {selected.cidade}/{selected.uf}<br />
                  CEP: {selected.cep}
                  {selected.caixa_postal && <><br />Cx. Postal: {selected.caixa_postal}</>}
                </p>
              </div>
              {selected.observacoes && (
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><FileText className="h-3 w-3" /> Observações</h4>
                  <p className="text-xs text-muted-foreground italic leading-relaxed">{selected.observacoes}</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vendas" className="space-y-3 mt-3">
          <SectionTitle icon={FileText}>Últimos Pedidos</SectionTitle>
          {vendas.length === 0 ? (
            <DetailEmpty icon={FileText} title="Nenhum pedido encontrado" message="Este cliente ainda não possui pedidos de venda." />
          ) : (
            <div className="space-y-2">
              {vendas.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-2 rounded border bg-card hover:bg-muted/30 transition-colors text-sm">
                  <div>
                    <RelationalLink onClick={() => pushView("ordem_venda", v.id)} className="font-mono">{v.numero}</RelationalLink>
                    <p className="text-[10px] text-muted-foreground">{formatDate(v.data_emissao)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(v.valor_total)}</p>
                    <StatusBadge status={v.status} className="h-4 text-[10px]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          <SectionTitle icon={FileText} className="mt-5">Notas Fiscais de Saída</SectionTitle>
          {notasSaida.length === 0 ? (
            <DetailEmpty icon={FileText} title="Nenhuma nota de saída" message="Este cliente ainda não possui notas fiscais de saída emitidas ou migradas." />
          ) : (
            <div className="space-y-2">
              {notasSaida.map((nf) => (
                <div key={nf.id} className="flex items-center justify-between p-2 rounded border bg-card hover:bg-muted/30 transition-colors text-sm">
                  <div>
                    <RelationalLink onClick={() => pushView("nota_fiscal", nf.id)} className="font-mono">
                      {nf.numero || "—"}
                    </RelationalLink>
                    <p className="text-[10px] text-muted-foreground">{nf.data_emissao ? formatDate(nf.data_emissao) : "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(Number(nf.valor_total) || 0)}</p>
                    {nf.status && <StatusBadge status={nf.status} className="h-4 text-[10px]" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="financeiro" className="space-y-4 mt-3">
           <div className="rounded-lg border p-4 space-y-3 bg-muted/10">
             <h4 className="font-semibold text-sm flex items-center gap-2"><CreditCard className="h-4 w-4" /> Condições Padrão</h4>
             <div className="grid grid-cols-3 gap-4 text-sm">
               <div>
                 <p className="text-[10px] text-muted-foreground uppercase font-semibold">Forma de Pagto</p>
                 <p className="font-medium">{selected.formas_pagamento?.descricao || selected.forma_pagamento_padrao || "Não definida"}</p>
               </div>
               <div>
                 <p className="text-[10px] text-muted-foreground uppercase font-semibold">Prazo (dias)</p>
                 <p className="font-medium">{selected.prazo_padrao || "—"}</p>
               </div>
               <div>
                 <p className="text-[10px] text-muted-foreground uppercase font-semibold">Prazo Pref.</p>
                 <p className="font-medium">{selected.prazo_preferencial || "—"}</p>
               </div>
             </div>
           </div>

           <div className="space-y-3">
             <SectionTitle>Lançamentos Recentes</SectionTitle>
             {financeiro.length === 0 ? (
               <DetailEmpty icon={CreditCard} title="Nenhum lançamento" message="Sem lançamentos financeiros vinculados a este cliente." />
             ) : (
               <div className="space-y-2">
                 {financeiro.map((f) => (
                   <div key={f.id} className="flex items-center justify-between p-2.5 rounded border bg-card text-xs">
                     <div>
                       <p className="font-medium truncate max-w-[180px]">{f.descricao}</p>
                       <p className="text-[10px] text-muted-foreground">Vencimento: {formatDate(f.data_vencimento)}</p>
                     </div>
                     <div className="text-right">
                       <p className={`font-bold ${f.status === 'pago' ? 'text-success' : f.status === 'vencido' ? 'text-destructive' : ''}`}>
                         {formatCurrency(f.saldo_restante || f.valor)}
                       </p>
                       <StatusBadge status={f.status} className="h-3.5 text-[9px]" />
                     </div>
                   </div>
                 ))}
               </div>
             )}
           </div>
        </TabsContent>

        <TabsContent value="contatos" className="space-y-3 mt-3">
           <SectionTitle icon={MessageSquare}>Histórico de Contatos</SectionTitle>
           {comunicacao.length === 0 ? (
             <DetailEmpty icon={MessageSquare} title="Nenhum contato registrado" message="Registros de comunicação aparecerão aqui." />
           ) : (
             <div className="space-y-4">
               {comunicacao.map((c) => (
                 <div key={c.id} className="relative pl-4 border-l-2 border-primary/20 space-y-1 py-1">
                   <div className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-primary" />
                   <div className="flex justify-between items-start">
                     <p className="text-xs font-bold">{c.assunto || "Sem assunto"}</p>
                     <span className="text-[10px] text-muted-foreground bg-muted px-1.5 rounded">{formatDate(c.data_hora)}</span>
                   </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{c.conteudo}</p>
                    <p className="text-[9px] text-primary/70 uppercase font-semibold">{c.tipo || "Geral"}</p>
                 </div>
               ))}
             </div>
           )}
        </TabsContent>

        <TabsContent value="logistica" className="space-y-3 mt-3">
           <SectionTitle icon={Truck}>Transportadoras de Preferência</SectionTitle>
           {transportadoras.length === 0 ? (
             <DetailEmpty icon={Truck} title="Nenhuma transportadora vinculada" message="Defina transportadoras preferenciais para este cliente." />
           ) : (
             <div className="space-y-3">
               {transportadoras.map((t) => (
                 <div key={t.id} className="p-3 rounded-lg border bg-card space-y-2">
                   <div className="flex justify-between items-start">
                     <p className="text-sm font-semibold">{t.transportadoras?.nome_razao_social}</p>
                     {t.prioridade && <span className="text-[10px] bg-primary/10 text-primary px-1.5 rounded-full font-bold">Prioridade {t.prioridade}</span>}
                   </div>
                   <div className="grid grid-cols-2 gap-2 text-[10px]">
                     <div>
                       <p className="text-muted-foreground uppercase font-bold">Modalidade</p>
                       <p>{t.modalidade || "—"}</p>
                     </div>
                     <div>
                       <p className="text-muted-foreground uppercase font-bold">Prazo Médio</p>
                       <p>{t.prazo_medio || "—"}</p>
                     </div>
                   </div>
                   {(t as any).observacoes && <p className="text-[10px] text-muted-foreground italic border-t pt-1">"{(t as any).observacoes}"</p>}
                 </div>
               ))}
             </div>
           )}
        </TabsContent>

        <TabsContent value="precos" className="mt-3">
          <PrecosEspeciaisTab clienteId={selected.id} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        loading={locked("delete")}
        onConfirm={() =>
          run("delete", async () => {
            await deleteCliente(id);
            toast.success("Cliente excluído com sucesso.");
            // Invalida cache da grid (D2) — evita exibir registro morto.
            await invalidate(["clientes", "ordens_venda", "financeiro_lancamentos"]);
            setDeleteConfirmOpen(false);
            clearStack();
          })
        }
        title="Excluir cliente"
        message={`Tem certeza que deseja excluir "${selected?.nome_razao_social || ""}"? Esta ação não pode ser desfeita.`}
      />
    </div>
  );
}

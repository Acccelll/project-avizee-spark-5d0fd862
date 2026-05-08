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
import { PermanentDeleteDialog } from "@/components/PermanentDeleteDialog";
import { useCanHardDelete } from "@/hooks/useCanHardDelete";
import { Edit, Trash2, User, Mail, MapPin, FileText, CreditCard, MessageSquare, Truck, BarChart3, MoreHorizontal, AlertTriangle, Plus, Info } from "lucide-react";
import { toast } from "sonner";
import { useDetailFetch } from "@/hooks/useDetailFetch";
import { useDetailActions } from "@/hooks/useDetailActions";
import { useInvalidateAfterMutation } from "@/hooks/useInvalidateAfterMutation";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { RecordIdentityCard } from "@/components/ui/RecordIdentityCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DetailLoading, DetailError, DetailEmpty } from "@/components/ui/DetailStates";
import { getEffectiveStatus } from "@/lib/financeiro";
import { cpfCnpjMask, phoneMask, cepMask } from "@/utils/masks";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReactNode } from "react";

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

/** Helper local — devolve placeholder italizado quando o valor estiver vazio. */
function fmt(v: string | null | undefined): ReactNode {
  if (v === null || v === undefined || String(v).trim() === "") {
    return <span className="text-muted-foreground italic">Não informado</span>;
  }
  return v;
}

/** Rotula documento conforme tamanho dos dígitos. */
function labelDocumento(doc: string | null | undefined): { label: string; value: string } | null {
  if (!doc) return null;
  const digits = doc.replace(/\D/g, "");
  if (digits.length === 11) return { label: "CPF", value: cpfCnpjMask(doc) };
  if (digits.length === 14) return { label: "CNPJ", value: cpfCnpjMask(doc) };
  return { label: "Documento", value: doc };
}

/** Lista de campos cadastrais ausentes (mesmo critério usado na grid). */
function getMissingFields(c: ClienteWithGroup): string[] {
  const missing: string[] = [];
  if (!c.cpf_cnpj || c.cpf_cnpj.trim() === "") missing.push("Sem documento");
  if ((!c.telefone || c.telefone.trim() === "") && (!c.celular || c.celular.trim() === "")) {
    missing.push("Sem telefone");
  }
  if (!c.email || c.email.trim() === "") missing.push("Sem e-mail");
  if (c.prazo_padrao === null || c.prazo_padrao === undefined) missing.push("Sem prazo");
  const enderecoIncompleto = !c.logradouro || !c.cidade || !c.uf || !c.cep;
  if (enderecoIncompleto) missing.push("Endereço incompleto");
  return missing;
}

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
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const { canHardDelete: isAdmin } = useCanHardDelete();
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
    .filter((f) => f.status === "aberto" || f.status === "parcial")
    .reduce((acc, curr) => acc + (curr.saldo_restante || curr.valor), 0);
  const titulosAbertos = financeiro.filter((f) => f.status === "aberto" || f.status === "parcial").length;
  // Combina pedidos atuais + notas históricas migradas para os KPIs.
  const ultCompra = vendas[0]?.data_emissao || notasSaida[0]?.data_emissao || null;
  const ultCompraOrigem: "pedido" | "nf" | null = vendas[0]?.data_emissao ? "pedido" : (notasSaida[0]?.data_emissao ? "nf" : null);
  const pmvBase = vendas.length > 0 ? vendas : notasSaida;
  const pmv = pmvBase.length > 0
    ? pmvBase.reduce((acc, curr) => acc + (Number(curr.valor_total) || 0), 0) / pmvBase.length
    : 0;
  const pmvHint = pmvBase.length > 0
    ? `baseado em ${pmvBase.length} ${vendas.length > 0 ? "pedido" : "nota"}${pmvBase.length > 1 ? "s" : ""}`
    : "sem histórico";

  const missingFields = selected ? getMissingFields(selected) : [];
  const docInfo = labelDocumento(selected?.cpf_cnpj);

  const goEditar = () => {
    navigate(`/clientes?editId=${id}`);
    window.setTimeout(() => clearStack(), 0);
  };

  // Publica slots no header padronizado
  usePublishDrawerSlots(`cliente:${id}`, {
    breadcrumb: docInfo ? `Cliente · ${docInfo.value}` : undefined,
    summary: selected ? (
      <RecordIdentityCard
        icon={User}
        title={selected.nome_razao_social}
        meta={
          <>
            {docInfo && (
              <span>
                <span className="text-muted-foreground">{docInfo.label}: </span>
                <span className="font-mono">{docInfo.value}</span>
              </span>
            )}
            {(selected.cidade || selected.uf) && (
              <span>
                <span className="text-muted-foreground">{selected.cidade ? "Cidade" : "UF"}: </span>
                {[selected.cidade, selected.uf].filter(Boolean).join("/")}
              </span>
            )}
          </>
        }
        badges={
          <>
            <StatusBadge status={selected.ativo ? "ativo" : "inativo"} />
            {missingFields.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 text-warning px-2 py-0.5 text-[10px] font-medium cursor-help">
                    <AlertTriangle className="h-3 w-3" />
                    Cadastro incompleto
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="text-xs space-y-0.5">
                    <p className="font-semibold">Faltam:</p>
                    <p>{missingFields.join(" · ")}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
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
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" aria-label="Editar cliente" onClick={goEditar}>
          <Edit className="h-3.5 w-3.5" /> Editar
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" aria-label="Mais ações">
              <MoreHorizontal className="h-3.5 w-3.5" /> Mais ações
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
            </DropdownMenuItem>
            {isAdmin && selected.ativo === false && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setPermDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir definitivamente
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    ) : undefined,
  });

  if (loading) return <DetailLoading />;
  if (error) return <DetailError message={error.message} />;
  if (!selected) return <DetailEmpty title="Cliente não encontrado" icon={User} />;

  // KPI: Limite de crédito — diferencia "não definido" de "R$ 0,00".
  const limiteUndefined = selected.limite_credito === null || selected.limite_credito === undefined;
  const limiteValue: ReactNode = limiteUndefined ? "Não definido" : formatCurrency(selected.limite_credito || 0);
  const limiteHint = limiteUndefined
    ? "Defina um limite no cadastro"
    : (selected.limite_credito || 0) > 0 ? "Crédito disponível" : "Sem crédito aprovado";

  // Observações: separa marcação de migração de observações comerciais.
  const obsRaw = selected.observacoes ?? "";
  const migracaoMatch = obsRaw.match(/Importado via faturamento histórico[^.]*?(?:IBGE:?\s*\d+)?/i);
  const origemCadastro = migracaoMatch ? migracaoMatch[0].trim().replace(/IBGE:\s*/i, "IBGE ") : null;
  const obsComercial = origemCadastro ? obsRaw.replace(migracaoMatch![0], "").trim() : obsRaw.trim();

  // Aba Financeiro — condições padrão estão totalmente vazias?
  const semCondicoes = !selected.formas_pagamento?.descricao && !selected.forma_pagamento_padrao && !selected.prazo_padrao;

  return (
    <div className="space-y-5">
      <DrawerSummaryGrid cols={4}>
        <DrawerSummaryCard
          label="Saldo devedor"
          value={formatCurrency(totalAberto)}
          hint={titulosAbertos === 0 ? "Sem títulos em aberto" : `${titulosAbertos} título${titulosAbertos > 1 ? "s" : ""} em aberto`}
          tone={totalAberto > 0 ? "destructive" : "neutral"}
        />
        <DrawerSummaryCard
          label="Pedido médio"
          value={formatCurrency(pmv)}
          hint={pmvHint}
        />
        <DrawerSummaryCard
          label="Limite de crédito"
          value={limiteValue}
          hint={limiteHint}
          mono={!limiteUndefined}
          tone={limiteUndefined ? "neutral" : ((selected.limite_credito || 0) > 0 ? "success" : "neutral")}
        />
        <DrawerSummaryCard
          label="Última compra"
          value={ultCompra ? formatDate(ultCompra) : "—"}
          hint={ultCompraOrigem === "pedido" ? "Pedido" : ultCompraOrigem === "nf" ? "NF importada" : "Sem histórico"}
          mono={false}
        />
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
          {missingFields.length >= 3 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-xs font-semibold text-warning">Cadastro incompleto</p>
                <p className="text-[11px] text-muted-foreground">Faltam: {missingFields.join(" · ")}</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={goEditar}>
                Completar cadastro
              </Button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><Mail className="h-3 w-3" /> Contato</h4>
                <p><span className="text-muted-foreground">Email:</span> {fmt(selected.email)}</p>
                <p><span className="text-muted-foreground">Telefone:</span> {selected.telefone ? phoneMask(selected.telefone) : fmt(null)}</p>
                <p><span className="text-muted-foreground">Celular:</span> {selected.celular ? phoneMask(selected.celular) : fmt(null)}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><BarChart3 className="h-3 w-3" /> Corporativo</h4>
                <p><span className="text-muted-foreground">Grupo Econômico:</span> {fmt(selected.grupos_economicos?.nome)}</p>
                <p><span className="text-muted-foreground">Relação:</span> <span className="capitalize">{selected.tipo_relacao_grupo || "independente"}</span></p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><MapPin className="h-3 w-3" /> Endereço</h4>
                <div className="leading-tight space-y-0.5">
                  {selected.logradouro ? (
                    <p>{selected.logradouro}{selected.numero ? `, ${selected.numero}` : ""}</p>
                  ) : (
                    <p>{fmt(null)}</p>
                  )}
                  {(selected.bairro || selected.cidade || selected.uf) && (
                    <p>
                      {selected.bairro && <span>{selected.bairro}</span>}
                      {selected.bairro && (selected.cidade || selected.uf) && <span> — </span>}
                      {(selected.cidade || selected.uf) && (
                        <span>{[selected.cidade || "—", selected.uf || "—"].join("/")}</span>
                      )}
                    </p>
                  )}
                  <p>
                    <span className="text-muted-foreground">CEP:</span>{" "}
                    {selected.cep ? cepMask(selected.cep) : <span className="text-muted-foreground italic">não informado</span>}
                  </p>
                  {selected.caixa_postal && <p><span className="text-muted-foreground">Cx. Postal:</span> {selected.caixa_postal}</p>}
                </div>
              </div>
              {(obsComercial || origemCadastro) && (
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2 border-b pb-1 text-muted-foreground uppercase text-[10px]"><FileText className="h-3 w-3" /> Observações</h4>
                  {obsComercial ? (
                    <p className="text-xs text-muted-foreground italic leading-relaxed">{obsComercial}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Nenhuma observação cadastrada.</p>
                  )}
                  {origemCadastro && (
                    <div className="pt-1">
                      <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Origem do cadastro</p>
                      <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                        <Info className="h-3 w-3" />
                        {origemCadastro}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vendas" className="space-y-3 mt-3">
          {vendas.length === 0 && notasSaida.length > 0 && (
            <div className="rounded-md border border-info/30 bg-info/5 p-2.5 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-info shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Este cliente possui notas fiscais importadas, mas nenhum pedido de venda registrado.
              </p>
            </div>
          )}
          <SectionTitle icon={FileText}>Pedidos de venda</SectionTitle>
          {vendas.length === 0 ? (
            <DetailEmpty icon={FileText} title="Nenhum pedido de venda encontrado" message="Pedidos comerciais cadastrados aparecerão aqui." />
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

          <div className="mt-5">
            <SectionTitle icon={FileText}>Notas fiscais (saída)</SectionTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">Inclui notas importadas sem pedido vinculado.</p>
          </div>
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
             {semCondicoes && (
               <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={goEditar}>
                 <Edit className="h-3 w-3" /> Definir condição financeira
               </Button>
             )}
           </div>

           <div className="space-y-3">
             <SectionTitle>Lançamentos Recentes</SectionTitle>
             {financeiro.length === 0 ? (
               <DetailEmpty
                 icon={CreditCard}
                 title="Nenhum lançamento"
                 message="Quando houver contas a receber deste cliente, elas aparecerão aqui."
               />
             ) : (
               <div className="space-y-2">
                 {financeiro.map((f) => (
                   <div key={f.id} className="flex items-center justify-between p-2.5 rounded border bg-card text-xs">
                     <div>
                       <p className="font-medium truncate max-w-[180px]">{f.descricao}</p>
                       <p className="text-[10px] text-muted-foreground">Vencimento: {formatDate(f.data_vencimento)}</p>
                     </div>
                     <div className="text-right">
                     <p className={`font-bold ${f.status === 'pago' ? 'text-success' : (getEffectiveStatus(f.status ?? '', f.data_vencimento ?? '', new Date()) === 'vencido') ? 'text-destructive' : ''}`}>
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
             <DetailEmpty
               icon={MessageSquare}
               title="Nenhum contato registrado"
               message="Registros de comunicação aparecerão aqui."
               action={
                 <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={goEditar}>
                   <Plus className="h-3 w-3" /> Registrar contato
                 </Button>
               }
             />
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
             <DetailEmpty
               icon={Truck}
               title="Nenhuma transportadora vinculada"
               message="Defina transportadoras preferenciais para este cliente."
               action={
                 <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={goEditar}>
                   <Plus className="h-3 w-3" /> Vincular transportadora
                 </Button>
               }
             />
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
        description={`Tem certeza que deseja excluir "${selected?.nome_razao_social || ""}"? Esta ação não pode ser desfeita.`}
      />

      <PermanentDeleteDialog
        open={permDeleteOpen}
        onClose={() => setPermDeleteOpen(false)}
        table="clientes"
        id={id}
        entityLabel="cliente"
        recordName={selected?.nome_razao_social || id}
        warning="Ação administrativa. Remove o cliente do banco — não é inativação."
        sideEffects={[
          vendas.length > 0 || notasSaida.length > 0 || financeiro.length > 0
            ? "Há vendas, notas fiscais ou lançamentos vinculados. A exclusão será bloqueada."
            : "Nenhum vínculo operacional detectado.",
        ]}
        onDeleted={() => {
          invalidate(["clientes"]);
          clearStack();
        }}
      />
    </div>
  );
}

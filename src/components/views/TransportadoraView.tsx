import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { usePublishDrawerSlots } from "@/contexts/RelationalDrawerSlotsContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Truck, Edit, Trash2, MapPin, Phone, Mail, Building2,
  Star, Package, AlertTriangle, Users, FileText,
} from "lucide-react";
import { useDetailFetch } from "@/hooks/useDetailFetch";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { RecordIdentityCard } from "@/components/ui/RecordIdentityCard";
import { DetailLoading, DetailError, DetailEmpty } from "@/components/ui/DetailStates";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PermanentDeleteDialog } from "@/components/PermanentDeleteDialog";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";

interface Props {
  id: string;
}

interface TransportadoraRow {
  id: string;
  nome_razao_social: string;
  nome_fantasia: string | null;
  cpf_cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  modalidade: string | null;
  prazo_medio: string | null;
  observacoes: string | null;
  ativo: boolean;
}

interface ClienteVinculado {
  id: string;
  cliente_id: string;
  prioridade: number | null;
  modalidade: string | null;
  prazo_medio: string | null;
  clientes: { nome_razao_social: string; cpf_cnpj: string | null } | null;
}

interface RemessaVinculada {
  id: string;
  codigo_rastreio: string | null;
  status_transporte: string;
  data_postagem: string | null;
  previsao_entrega: string | null;
  servico: string | null;
  clientes: { nome_razao_social: string } | null;
}

interface TransportadoraDetail {
  transportadora: TransportadoraRow;
  clientes: ClienteVinculado[];
  remessas: RemessaVinculada[];
}

const MODALIDADE_LABEL: Record<string, string> = {
  rodoviario: "Rodoviário",
  aereo: "Aéreo",
  maritimo: "Marítimo",
  ferroviario: "Ferroviário",
  multimodal: "Multimodal",
};

const REMESSA_STATUS: Record<string, { label: string; classes: string }> = {
  pendente:    { label: "Pendente",    classes: "bg-warning/10 text-warning border-warning/20" },
  postado:     { label: "Postado",     classes: "bg-info/10 text-info border-info/20" },
  em_transito: { label: "Em Trânsito", classes: "bg-info/10 text-info border-info/20" },
  entregue:    { label: "Entregue",    classes: "bg-success/10 text-success border-success/20" },
  devolvido:   { label: "Devolvido",   classes: "bg-destructive/10 text-destructive border-destructive/20" },
};

export function TransportadoraView({ id }: Props) {
  const navigate = useNavigate();
  const { clearStack } = useRelationalNavigation();
  const { isAdmin } = useIsAdmin();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);

  const { data, loading, error } = useDetailFetch<TransportadoraDetail>(id, async (tId, signal) => {
    const { data: t, error: tErr } = await supabase
      .from("transportadoras")
      .select("*")
      .eq("id", tId)
      .abortSignal(signal)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!t) return null;

    const [clientesRes, remessasRes] = await Promise.all([
      supabase
        .from("cliente_transportadoras")
        .select("id, cliente_id, prioridade, modalidade, prazo_medio, clientes(nome_razao_social, cpf_cnpj)")
        .eq("transportadora_id", tId)
        .eq("ativo", true)
        .order("prioridade")
        .abortSignal(signal),
      supabase
        .from("remessas")
        .select("id, codigo_rastreio, status_transporte, data_postagem, previsao_entrega, servico, clientes(nome_razao_social)")
        .eq("transportadora_id", tId)
        .order("created_at", { ascending: false })
        .limit(30)
        .abortSignal(signal),
    ]);

    return {
      transportadora: t as TransportadoraRow,
      clientes: (clientesRes.data as ClienteVinculado[]) || [],
      remessas: (remessasRes.data as RemessaVinculada[]) || [],
    };
  });

  const transportadora = data?.transportadora ?? null;
  const clientes = data?.clientes ?? [];
  const remessas = data?.remessas ?? [];

  usePublishDrawerSlots(`transportadora:${id}`, {
    breadcrumb: transportadora ? `Transportadora · ${transportadora.nome_razao_social}` : undefined,
    summary: transportadora ? (
      <RecordIdentityCard
        icon={Truck}
        title={transportadora.nome_razao_social}
        meta={
          <>
            {transportadora.nome_fantasia && transportadora.nome_fantasia !== transportadora.nome_razao_social && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {transportadora.nome_fantasia}
              </span>
            )}
            {transportadora.cpf_cnpj && <span className="font-mono">{transportadora.cpf_cnpj}</span>}
            {transportadora.cidade && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {transportadora.cidade}{transportadora.uf ? `/${transportadora.uf}` : ""}
              </span>
            )}
          </>
        }
        badges={
          <>
            <StatusBadge status={transportadora.ativo ? "ativo" : "inativo"} />
            {transportadora.modalidade && (
              <Badge variant="secondary" className="text-[10px]">
                {MODALIDADE_LABEL[transportadora.modalidade] || transportadora.modalidade}
              </Badge>
            )}
          </>
        }
      />
    ) : undefined,
    actions: transportadora ? (
      <>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-label="Editar transportadora"
          onClick={() => {
            navigate(`/transportadoras?editId=${id}`);
            window.setTimeout(() => clearStack(), 0);
          }}
        >
          <Edit className="h-3.5 w-3.5" /> Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          aria-label="Inativar transportadora"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" /> Inativar
        </Button>
        {isAdmin && transportadora.ativo === false && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label="Excluir transportadora permanentemente"
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
  if (!transportadora) return <DetailEmpty title="Transportadora não encontrada" icon={Truck} />;

  const remessasResumo = {
    emTransito: remessas.filter(r => r.status_transporte === "em_transito").length,
    entregues: remessas.filter(r => r.status_transporte === "entregue").length,
    pendentes: remessas.filter(r => r.status_transporte === "pendente" || r.status_transporte === "postado").length,
    devolvidas: remessas.filter(r => r.status_transporte === "devolvido").length,
  };

  return (
    <div className="space-y-5">
      <DrawerSummaryGrid cols={4}>
        <DrawerSummaryCard
          label="Modalidade"
          value={MODALIDADE_LABEL[transportadora.modalidade || ""] || "—"}
        />
        <DrawerSummaryCard label="Prazo médio" value={transportadora.prazo_medio || "—"} />
        <DrawerSummaryCard label="Clientes" value={String(clientes.length)} />
        <DrawerSummaryCard
          label="Remessas"
          value={String(remessas.length)}
          tone={remessas.length > 0 ? "primary" : "neutral"}
        />
      </DrawerSummaryGrid>

      <Tabs defaultValue="resumo" className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="resumo" className="text-xs">Resumo</TabsTrigger>
          <TabsTrigger value="clientes" className="text-xs">Clientes ({clientes.length})</TabsTrigger>
          <TabsTrigger value="remessas" className="text-xs">Remessas ({remessas.length})</TabsTrigger>
          <TabsTrigger value="obs" className="text-xs">Obs.</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-4 mt-3 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Responsável</p>
              <p className="font-medium">{transportadora.contato || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Telefone</p>
              <p className="font-medium flex items-center gap-1">
                {transportadora.telefone ? (
                  <>
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {transportadora.telefone}
                  </>
                ) : "—"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">E-mail</p>
              <p className="font-medium flex items-center gap-1 break-all">
                {transportadora.email ? (
                  <>
                    <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                    {transportadora.email}
                  </>
                ) : "—"}
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="clientes" className="space-y-2 mt-3">
          {clientes.length === 0 ? (
            <DetailEmpty icon={Users} title="Nenhum cliente vinculado" message="Esta transportadora ainda não está atrelada a clientes." />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Cliente</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Prioridade</th>
                  </tr>
                </thead>
                <tbody>
                  {[...clientes].sort((a, b) => (a.prioridade ?? 99) - (b.prioridade ?? 99)).map((c, idx) => (
                    <tr key={c.id} className={idx % 2 === 0 ? "bg-muted/20" : ""}>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          {c.prioridade === 1 && <Star className="h-3 w-3 text-warning shrink-0" />}
                          <RelationalLink type="cliente" id={c.cliente_id}>
                            {c.clientes?.nome_razao_social || "—"}
                          </RelationalLink>
                        </div>
                        {c.clientes?.cpf_cnpj && (
                          <p className="text-[10px] text-muted-foreground font-mono">{c.clientes.cpf_cnpj}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-right text-muted-foreground">
                        {c.prioridade ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="remessas" className="space-y-3 mt-3">
          {remessas.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {remessasResumo.emTransito > 0 && (
                <Badge variant="outline" className="bg-info/10 text-info border-info/20 gap-1">
                  <Truck className="h-3 w-3" />{remessasResumo.emTransito} em trânsito
                </Badge>
              )}
              {remessasResumo.pendentes > 0 && (
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 gap-1">
                  <Package className="h-3 w-3" />{remessasResumo.pendentes} pendente{remessasResumo.pendentes > 1 ? "s" : ""}
                </Badge>
              )}
              {remessasResumo.entregues > 0 && (
                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                  {remessasResumo.entregues} entregue{remessasResumo.entregues > 1 ? "s" : ""}
                </Badge>
              )}
              {remessasResumo.devolvidas > 0 && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                  <AlertTriangle className="h-3 w-3" />{remessasResumo.devolvidas} devolvida{remessasResumo.devolvidas > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          )}
          {remessas.length === 0 ? (
            <DetailEmpty icon={Package} title="Nenhuma remessa" message="Nenhuma remessa foi vinculada a esta transportadora." />
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {remessas.map((r) => {
                const st = REMESSA_STATUS[r.status_transporte] ?? { label: r.status_transporte, classes: "bg-muted text-muted-foreground border-muted" };
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/30 border-b last:border-b-0 gap-2">
                    <div className="min-w-0 flex-1">
                      <RelationalLink type="remessa" id={r.id}>
                        {r.codigo_rastreio
                          ? <span className="font-mono text-xs">{r.codigo_rastreio}</span>
                          : <span className="text-xs text-muted-foreground italic">sem rastreio</span>}
                      </RelationalLink>
                      {r.clientes?.nome_razao_social && (
                        <p className="text-xs text-muted-foreground truncate">{r.clientes.nome_razao_social}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${st.classes}`}>{st.label}</Badge>
                      {r.previsao_entrega && (
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(r.previsao_entrega).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="obs" className="mt-3">
          {transportadora.observacoes ? (
            <p className="text-sm whitespace-pre-wrap">{transportadora.observacoes}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nenhuma observação registrada.</p>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true);
          try {
            const { error } = await supabase
              .from("transportadoras")
              .update({ ativo: false })
              .eq("id", id);
            if (error) throw error;
            toast.success("Transportadora inativada.");
            setDeleteOpen(false);
            clearStack();
          } catch (err) {
            notifyError(err);
          } finally {
            setDeleting(false);
          }
        }}
        title="Inativar transportadora"
        description={
          clientes.length > 0 || remessas.length > 0
            ? `Esta transportadora possui ${clientes.length} cliente(s) vinculado(s) e ${remessas.length} remessa(s). Ao inativar, ela deixará de aparecer em novas seleções; o histórico será preservado.`
            : `Tem certeza que deseja inativar "${transportadora.nome_razao_social}"? Você pode reativá-la a qualquer momento.`
        }
      />

      <PermanentDeleteDialog
        open={permDeleteOpen}
        onClose={() => setPermDeleteOpen(false)}
        table="transportadoras"
        id={id}
        entityLabel="transportadora"
        recordName={transportadora.nome_razao_social}
        warning={
          clientes.length > 0 || remessas.length > 0
            ? `Existem ${clientes.length} cliente(s) e ${remessas.length} remessa(s) vinculados. A exclusão será bloqueada se houver referências ativas.`
            : undefined
        }
        onDeleted={() => clearStack()}
      />
    </div>
  );
}

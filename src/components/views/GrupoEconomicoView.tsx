import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/format";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { usePublishDrawerSlots } from "@/contexts/RelationalDrawerSlotsContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Edit, Trash2, MapPin, Users, AlertTriangle, CheckCircle2, ShieldAlert, Star } from "lucide-react";
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

interface GrupoRow {
  id: string;
  nome: string;
  empresa_matriz_id: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
}

interface ClienteDoGrupo {
  id: string;
  nome_razao_social: string;
  nome_fantasia: string | null;
  cpf_cnpj: string | null;
  tipo_relacao_grupo: string | null;
  cidade: string | null;
  uf: string | null;
}

interface FinanceiroAggRow {
  cliente_id: string;
  status: string | null;
  saldo_restante: number | null;
  valor: number;
}

interface GrupoDetail {
  grupo: GrupoRow;
  empresas: ClienteDoGrupo[];
  financeiro: FinanceiroAggRow[];
}

const relacaoLabel: Record<string, string> = {
  matriz: "Matriz",
  filial: "Filial",
  coligada: "Coligada",
  independente: "Independente",
};

const relacaoOrder: Record<string, number> = {
  matriz: 0,
  filial: 1,
  coligada: 2,
  independente: 3,
};

export function GrupoEconomicoView({ id }: Props) {
  const navigate = useNavigate();
  const { clearStack } = useRelationalNavigation();
  const { isAdmin } = useIsAdmin();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);

  const { data, loading, error } = useDetailFetch<GrupoDetail>(id, async (gId, signal) => {
    const { data: g, error: gErr } = await supabase
      .from("grupos_economicos")
      .select("*")
      .eq("id", gId)
      .abortSignal(signal)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!g) return null;

    const { data: empresas } = await supabase
      .from("clientes")
      .select("id, nome_razao_social, nome_fantasia, cpf_cnpj, tipo_relacao_grupo, cidade, uf")
      .eq("grupo_economico_id", gId)
      .eq("ativo", true)
      .abortSignal(signal);

    const empresaIds = (empresas || []).map((e) => e.id);
    let financeiro: FinanceiroAggRow[] = [];
    if (empresaIds.length > 0) {
      const { data: fin } = await supabase
        .from("financeiro_lancamentos")
        .select("cliente_id, status, saldo_restante, valor")
        .in("cliente_id", empresaIds)
        .eq("tipo", "receber")
        .in("status", ["aberto", "vencido", "parcial"])
        .abortSignal(signal);
      financeiro = (fin as FinanceiroAggRow[]) || [];
    }

    return {
      grupo: g as GrupoRow,
      empresas: ((empresas as ClienteDoGrupo[]) || []).slice().sort((a, b) => {
        const oa = relacaoOrder[a.tipo_relacao_grupo || ""] ?? 99;
        const ob = relacaoOrder[b.tipo_relacao_grupo || ""] ?? 99;
        if (oa !== ob) return oa - ob;
        return a.nome_razao_social.localeCompare(b.nome_razao_social);
      }),
      financeiro,
    };
  });

  const grupo = data?.grupo ?? null;
  const empresas = data?.empresas ?? [];
  const financeiro = data?.financeiro ?? [];

  const saldoConsolidado = financeiro.reduce(
    (acc, f) => acc + (Number(f.saldo_restante ?? f.valor) || 0),
    0,
  );
  const titulosVencidos = financeiro.filter((f) => f.status === "vencido").length;

  const riskInfo = (() => {
    if (titulosVencidos > 0) {
      return { label: "Risco", icon: AlertTriangle, badgeClass: "bg-destructive/10 text-destructive border-destructive/30" };
    }
    if (saldoConsolidado > 0) {
      return { label: "Atenção", icon: ShieldAlert, badgeClass: "bg-warning/10 text-warning border-warning/30" };
    }
    return { label: "Saudável", icon: CheckCircle2, badgeClass: "bg-success/10 text-success border-success/30" };
  })();
  const RiskIcon = riskInfo.icon;

  usePublishDrawerSlots(`grupo_economico:${id}`, {
    breadcrumb: grupo ? `Grupo · ${grupo.nome}` : undefined,
    summary: grupo ? (
      <RecordIdentityCard
        icon={Building2}
        title={grupo.nome}
        meta={
          <>
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{empresas.length} empresa{empresas.length !== 1 ? "s" : ""}</span>
            {grupo.created_at && <span>desde {formatDate(grupo.created_at)}</span>}
          </>
        }
        badges={
          <>
            <StatusBadge status={grupo.ativo ? "ativo" : "inativo"} />
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${riskInfo.badgeClass}`}>
              <RiskIcon className="w-2.5 h-2.5 mr-1" />
              {riskInfo.label}
            </Badge>
          </>
        }
      />
    ) : undefined,
    actions: grupo ? (
      <>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-label="Editar grupo econômico"
          onClick={() => {
            navigate(`/grupos-economicos?editId=${id}`);
            window.setTimeout(() => clearStack(), 0);
          }}
        >
          <Edit className="h-3.5 w-3.5" /> Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          aria-label="Inativar grupo econômico"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" /> Inativar
        </Button>
        {isAdmin && grupo.ativo === false && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label="Excluir grupo econômico permanentemente"
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
  if (!grupo) return <DetailEmpty title="Grupo econômico não encontrado" icon={Building2} />;

  const matriz = empresas.find((e) => e.id === grupo.empresa_matriz_id) ||
    empresas.find((e) => e.tipo_relacao_grupo === "matriz") || null;

  return (
    <div className="space-y-5">
      <DrawerSummaryGrid cols={4}>
        <DrawerSummaryCard label="Empresas" value={String(empresas.length)} />
        <DrawerSummaryCard
          label="Saldo Aberto"
          value={formatCurrency(saldoConsolidado)}
          tone={saldoConsolidado > 0 ? "warning" : "neutral"}
        />
        <DrawerSummaryCard
          label="Vencidos"
          value={String(titulosVencidos)}
          tone={titulosVencidos > 0 ? "destructive" : "neutral"}
        />
        <DrawerSummaryCard label="Matriz" value={matriz?.nome_razao_social || "—"} mono={false} />
      </DrawerSummaryGrid>

      <Tabs defaultValue="empresas" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="empresas" className="text-xs">Empresas ({empresas.length})</TabsTrigger>
          <TabsTrigger value="financeiro" className="text-xs">Financeiro</TabsTrigger>
          <TabsTrigger value="observacoes" className="text-xs">Observações</TabsTrigger>
        </TabsList>

        <TabsContent value="empresas" className="space-y-2 mt-3">
          {empresas.length === 0 ? (
            <DetailEmpty icon={Users} title="Nenhuma empresa vinculada" message="Vincule clientes a este grupo na tela de Cadastros › Clientes." />
          ) : (
            <div className="space-y-1">
              {empresas.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 px-2 rounded-md border bg-card hover:bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {e.id === matriz?.id && <Star className="h-3 w-3 text-warning shrink-0" />}
                      <RelationalLink type="cliente" id={e.id}>
                        <span className="truncate">{e.nome_razao_social}</span>
                      </RelationalLink>
                    </div>
                    {e.cpf_cnpj && <p className="text-[10px] text-muted-foreground font-mono">{e.cpf_cnpj}</p>}
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0 ml-2 space-y-0.5">
                    {e.tipo_relacao_grupo && <Badge variant="outline" className="text-[9px]">{relacaoLabel[e.tipo_relacao_grupo] || e.tipo_relacao_grupo}</Badge>}
                    {(e.cidade || e.uf) && (
                      <p className="flex items-center gap-1 justify-end"><MapPin className="h-3 w-3" />{[e.cidade, e.uf].filter(Boolean).join("/")}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="financeiro" className="space-y-3 mt-3">
          <div className="rounded-lg border p-3 bg-muted/10 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Saldo Consolidado</p>
              <p className={`font-bold font-mono ${saldoConsolidado > 0 ? "text-warning" : "text-muted-foreground"}`}>{formatCurrency(saldoConsolidado)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Títulos Vencidos</p>
              <p className={`font-bold font-mono ${titulosVencidos > 0 ? "text-destructive" : "text-muted-foreground"}`}>{titulosVencidos}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Lanç. em Aberto</p>
              <p className="font-bold font-mono">{financeiro.length}</p>
            </div>
          </div>
          {financeiro.length === 0 && (
            <DetailEmpty icon={CheckCircle2} title="Sem títulos em aberto" message="Nenhuma empresa do grupo possui lançamentos a receber pendentes." />
          )}
        </TabsContent>

        <TabsContent value="observacoes" className="mt-3">
          {grupo.observacoes ? (
            <p className="text-sm whitespace-pre-wrap">{grupo.observacoes}</p>
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
              .from("grupos_economicos")
              .update({ ativo: false })
              .eq("id", id);
            if (error) throw error;
            toast.success("Grupo econômico inativado.");
            setDeleteOpen(false);
            clearStack();
          } catch (err) {
            notifyError(err);
          } finally {
            setDeleting(false);
          }
        }}
        title="Inativar grupo econômico"
        message={
          empresas.length > 0
            ? `Este grupo possui ${empresas.length} empresa(s) vinculada(s). Ao inativar, ele deixará de aparecer em novas seleções, mas as empresas continuam existindo.`
            : `Tem certeza que deseja inativar "${grupo.nome}"? Você pode reativá-lo a qualquer momento.`
        }
      />

      <PermanentDeleteDialog
        open={permDeleteOpen}
        onClose={() => setPermDeleteOpen(false)}
        table="grupos_economicos"
        id={id}
        entityLabel="grupo econômico"
        recordName={grupo.nome}
        warning={
          empresas.length > 0
            ? `Existem ${empresas.length} empresa(s) vinculada(s) a este grupo. A exclusão será bloqueada se houver referências.`
            : undefined
        }
        onDeleted={() => clearStack()}
      />
    </div>
  );
}
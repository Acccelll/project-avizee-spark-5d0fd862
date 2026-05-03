import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRelationalNavigation } from "@/contexts/RelationalNavigationContext";
import { usePublishDrawerSlots } from "@/contexts/RelationalDrawerSlotsContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, Edit, Trash2, DollarSign, CalendarDays, FileText,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { useDetailFetch } from "@/hooks/useDetailFetch";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { RecordIdentityCard } from "@/components/ui/RecordIdentityCard";
import { DetailLoading, DetailError, DetailEmpty } from "@/components/ui/DetailStates";
import { formatCurrency, formatDate } from "@/lib/format";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PermanentDeleteDialog } from "@/components/PermanentDeleteDialog";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";

interface Props {
  id: string;
}

interface FuncionarioRow {
  id: string;
  nome: string;
  cpf: string | null;
  cargo: string | null;
  departamento: string | null;
  data_admissao: string;
  data_demissao: string | null;
  salario_base: number;
  tipo_contrato: string;
  observacoes: string | null;
  ativo: boolean;
}

interface FolhaPagamento {
  id: string;
  competencia: string;
  salario_base: number;
  proventos: number;
  descontos: number;
  valor_liquido: number;
  observacoes: string | null;
  status: string;
  financeiro_gerado: boolean;
}

interface FinanceiroLanc {
  id: string;
  descricao: string | null;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: string | null;
}

interface FuncionarioDetail {
  funcionario: FuncionarioRow;
  folhas: FolhaPagamento[];
  lancamentos: FinanceiroLanc[];
}

const tipoContratoLabel: Record<string, string> = {
  clt: "CLT", pj: "PJ", estagio: "Estágio", temporario: "Temporário",
};

export function FuncionarioView({ id }: Props) {
  const navigate = useNavigate();
  const { clearStack } = useRelationalNavigation();
  const { isAdmin } = useIsAdmin();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);

  const { data, loading, error } = useDetailFetch<FuncionarioDetail>(id, async (fId, signal) => {
    const { data: f, error: fErr } = await supabase
      .from("funcionarios")
      .select("*")
      .eq("id", fId)
      .abortSignal(signal)
      .maybeSingle();
    if (fErr) throw fErr;
    if (!f) return null;

    const [folhasRes, lancRes] = await Promise.all([
      supabase
        .from("folha_pagamento")
        .select("id, competencia, salario_base, proventos, descontos, valor_liquido, observacoes, status, financeiro_gerado")
        .eq("funcionario_id", fId)
        .order("competencia", { ascending: false })
        .abortSignal(signal),
      supabase
        .from("financeiro_lancamentos")
        .select("id, descricao, valor, data_vencimento, data_pagamento, status")
        .eq("funcionario_id", fId)
        .order("data_vencimento", { ascending: false })
        .limit(50)
        .abortSignal(signal),
    ]);

    return {
      funcionario: f as FuncionarioRow,
      folhas: (folhasRes.data as FolhaPagamento[]) || [],
      lancamentos: (lancRes.data as FinanceiroLanc[]) || [],
    };
  });

  const funcionario = data?.funcionario ?? null;
  const folhas = data?.folhas ?? [];
  const lancamentos = data?.lancamentos ?? [];

  const ultimaFolha = folhas[0] ?? null;
  const folhasPendentes = folhas.filter(f => !f.financeiro_gerado);
  const lancamentosPendentes = lancamentos.filter(l => l.status === "aberto");

  let situacao: { label: string; tone: "neutral" | "warning" | "destructive" } = { label: "Ativo", tone: "neutral" };
  if (funcionario && !funcionario.ativo) situacao = { label: "Desligado", tone: "destructive" };
  else if (funcionario && folhas.length === 0) situacao = { label: "Sem folha", tone: "neutral" };
  else if (folhasPendentes.length > 0) situacao = { label: "Folha pendente", tone: "warning" };
  else if (lancamentosPendentes.length > 0) situacao = { label: "Financeiro pendente", tone: "warning" };

  usePublishDrawerSlots(`funcionario:${id}`, {
    breadcrumb: funcionario ? `Funcionário · ${funcionario.nome}` : undefined,
    summary: funcionario ? (
      <RecordIdentityCard
        icon={Users}
        title={funcionario.nome}
        meta={
          <>
            {funcionario.cargo && <span className="font-medium">{funcionario.cargo}</span>}
            {funcionario.departamento && <span>{funcionario.departamento}</span>}
            {funcionario.cpf && <span className="font-mono">{funcionario.cpf}</span>}
          </>
        }
        badges={
          <>
            <StatusBadge status={funcionario.ativo ? "ativo" : "inativo"} />
            <Badge variant="secondary" className="text-[10px]">
              {tipoContratoLabel[funcionario.tipo_contrato] || funcionario.tipo_contrato}
            </Badge>
            {situacao.label !== "Ativo" && (
              <Badge
                variant="outline"
                className={`text-[10px] gap-1 ${
                  situacao.tone === "warning"
                    ? "bg-warning/10 text-warning border-warning/20"
                    : situacao.tone === "destructive"
                    ? "bg-destructive/10 text-destructive border-destructive/20"
                    : ""
                }`}
              >
                {situacao.tone === "warning" && <AlertTriangle className="w-2.5 h-2.5" />}
                {situacao.label}
              </Badge>
            )}
          </>
        }
      />
    ) : undefined,
    actions: funcionario ? (
      <>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-label="Editar funcionário"
          onClick={() => {
            navigate(`/funcionarios?editId=${id}`);
            window.setTimeout(() => clearStack(), 0);
          }}
        >
          <Edit className="h-3.5 w-3.5" /> Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          aria-label="Inativar funcionário"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" /> Inativar
        </Button>
        {isAdmin && funcionario.ativo === false && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label="Excluir funcionário permanentemente"
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
  if (!funcionario) return <DetailEmpty title="Funcionário não encontrado" icon={Users} />;

  return (
    <div className="space-y-5">
      <DrawerSummaryGrid cols={4}>
        <DrawerSummaryCard
          label="Salário Base"
          value={formatCurrency(Number(funcionario.salario_base))}
        />
        <DrawerSummaryCard label="Admissão" value={formatDate(funcionario.data_admissao)} />
        <DrawerSummaryCard
          label="Última Comp."
          value={ultimaFolha ? ultimaFolha.competencia : "—"}
          tone={ultimaFolha ? "primary" : "neutral"}
        />
        <DrawerSummaryCard
          label="Líquido Recente"
          value={ultimaFolha ? formatCurrency(Number(ultimaFolha.valor_liquido)) : "—"}
        />
      </DrawerSummaryGrid>

      <Tabs defaultValue="resumo" className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="resumo" className="text-xs">Resumo</TabsTrigger>
          <TabsTrigger value="folha" className="text-xs">Folha ({folhas.length})</TabsTrigger>
          <TabsTrigger value="financeiro" className="text-xs">Financeiro ({lancamentos.length})</TabsTrigger>
          <TabsTrigger value="obs" className="text-xs">Obs.</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-4 mt-3 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">CPF</p>
              <p className="font-mono">{funcionario.cpf || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Tipo de contrato</p>
              <p className="font-medium">{tipoContratoLabel[funcionario.tipo_contrato] || funcionario.tipo_contrato}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Cargo</p>
              <p className="font-medium">{funcionario.cargo || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Departamento</p>
              <p className="font-medium">{funcionario.departamento || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Admissão</p>
              <p className="font-mono">{formatDate(funcionario.data_admissao)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Desligamento</p>
              <p className="font-mono">{funcionario.data_demissao ? formatDate(funcionario.data_demissao) : "—"}</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="folha" className="space-y-2 mt-3">
          {folhas.length === 0 ? (
            <DetailEmpty
              icon={FileText}
              title="Nenhuma folha registrada"
              message="Registre uma competência na página de Funcionários."
            />
          ) : (
            <div className="space-y-2">
              {folhas.map((f, idx) => {
                const isLatest = idx === 0;
                return (
                  <div
                    key={f.id}
                    className={`rounded-lg border p-3 space-y-2 ${
                      isLatest ? "border-primary/40 bg-primary/5" : "bg-accent/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isLatest && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                            Mais recente
                          </span>
                        )}
                        <span className="font-mono text-sm font-medium">{f.competencia}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={f.status} />
                        {f.financeiro_gerado && (
                          <span className="flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 className="w-3 h-3" /> Financeiro
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Base</p>
                        <p className="font-mono font-medium">{formatCurrency(Number(f.salario_base))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Proventos</p>
                        <p className="font-mono font-medium text-success">{formatCurrency(Number(f.proventos))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Descontos</p>
                        <p className="font-mono font-medium text-destructive">{formatCurrency(Number(f.descontos))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Líquido</p>
                        <p className="font-mono font-bold">{formatCurrency(Number(f.valor_liquido))}</p>
                      </div>
                    </div>
                    {f.observacoes && (
                      <p className="text-xs text-muted-foreground border-t pt-1">{f.observacoes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="financeiro" className="space-y-2 mt-3">
          {lancamentos.length === 0 ? (
            <DetailEmpty
              icon={DollarSign}
              title="Sem lançamentos"
              message="Nenhum lançamento financeiro vinculado a este funcionário."
            />
          ) : (
            <div className="space-y-2">
              {(() => {
                const hoje = new Date();
                return lancamentos.map((l) => {
                  const isPago = l.status === "pago" || l.status === "baixado";
                  const isVencido = !isPago && new Date(l.data_vencimento) < hoje;
                  return (
                    <div
                      key={l.id}
                      className={`rounded-lg border p-3 space-y-1 ${
                        isVencido
                          ? "border-destructive/40 bg-destructive/5"
                          : isPago
                          ? "bg-muted/20"
                          : "bg-accent/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{l.descricao || "—"}</p>
                        <StatusBadge status={l.status || "—"} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span>
                            Venc.:{" "}
                            <span className={`font-medium ${isVencido ? "text-destructive" : "text-foreground"}`}>
                              {formatDate(l.data_vencimento)}
                            </span>
                          </span>
                          {l.data_pagamento && (
                            <span>
                              Pago: <span className="font-medium text-foreground">{formatDate(l.data_pagamento)}</span>
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-bold">{formatCurrency(Number(l.valor))}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </TabsContent>

        <TabsContent value="obs" className="mt-3">
          {funcionario.observacoes ? (
            <p className="text-sm whitespace-pre-wrap">{funcionario.observacoes}</p>
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
              .from("funcionarios")
              .update({ ativo: false })
              .eq("id", id);
            if (error) throw error;
            toast.success("Funcionário inativado.");
            setDeleteOpen(false);
            clearStack();
          } catch (err) {
            notifyError(err);
          } finally {
            setDeleting(false);
          }
        }}
        title="Inativar funcionário"
        description={`Tem certeza que deseja inativar "${funcionario.nome}"? O histórico de folha e financeiro será preservado. Você pode reativar a qualquer momento na lista.`}
      />

      <PermanentDeleteDialog
        open={permDeleteOpen}
        onClose={() => setPermDeleteOpen(false)}
        table="funcionarios"
        id={id}
        entityLabel="funcionário"
        recordName={funcionario.nome}
        warning="Histórico de folha de pagamento e lançamentos vinculados podem impedir a exclusão."
        onDeleted={() => clearStack()}
      />
    </div>
  );
}

import { useState, useEffect } from "react";
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
  CreditCard, Edit, Trash2, Wallet, TrendingUp, Users,
  Banknote, FileText, QrCode, ArrowLeftRight, HelpCircle,
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

interface FormaRow {
  id: string;
  descricao: string;
  prazo_dias: number | null;
  parcelas: number | null;
  intervalos_dias: number[] | null;
  gera_financeiro: boolean | null;
  tipo: string | null;
  observacoes: string | null;
  ativo: boolean;
}

interface ClienteVinculado {
  id: string;
  nome_razao_social: string;
  prazo_preferencial: number | null;
}

interface FormaDetail {
  forma: FormaRow;
  clientes: ClienteVinculado[];
  usoLancamentos: number;
  usoCaixa: number;
}

const tipoLabel: Record<string, string> = {
  pix: "PIX", boleto: "Boleto", cartao: "Cartão",
  dinheiro: "Dinheiro", transferencia: "Transferência", outro: "Outro",
};

const tipoIcon: Record<string, React.ElementType> = {
  pix: QrCode, boleto: FileText, cartao: CreditCard,
  dinheiro: Banknote, transferencia: ArrowLeftRight, outro: HelpCircle,
};

export function FormaPagamentoView({ id }: Props) {
  const navigate = useNavigate();
  const { clearStack } = useRelationalNavigation();
  const { isAdmin } = useIsAdmin();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);

  const { data, loading, error } = useDetailFetch<FormaDetail>(id, async (fId, signal) => {
    const { data: f, error: fErr } = await supabase
      .from("formas_pagamento")
      .select("*")
      .eq("id", fId)
      .abortSignal(signal)
      .maybeSingle();
    if (fErr) throw fErr;
    if (!f) return null;

    const [clientesRes, lancamentosRes, caixaRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nome_razao_social, prazo_preferencial")
        .eq("forma_pagamento_id", fId)
        .eq("ativo", true)
        .order("nome_razao_social")
        .limit(50)
        .abortSignal(signal),
      supabase
        .from("financeiro_lancamentos")
        .select("id", { count: "exact", head: true })
        .eq("forma_pagamento_id", fId)
        .abortSignal(signal),
      f.tipo
        ? supabase
            .from("caixa_movimentos")
            .select("id", { count: "exact", head: true })
            .eq("forma_pagamento", f.tipo)
            .abortSignal(signal)
        : Promise.resolve({ count: 0 } as { count: number }),
    ]);

    return {
      forma: f as FormaRow,
      clientes: (clientesRes.data as ClienteVinculado[]) || [],
      usoLancamentos: lancamentosRes.count ?? 0,
      usoCaixa: caixaRes.count ?? 0,
    };
  });

  const forma = data?.forma ?? null;
  const clientes = data?.clientes ?? [];
  const usoLancamentos = data?.usoLancamentos ?? 0;
  const usoCaixa = data?.usoCaixa ?? 0;

  const TipoIcon = forma?.tipo ? tipoIcon[forma.tipo] : undefined;

  usePublishDrawerSlots(`forma_pagamento:${id}`, {
    breadcrumb: forma ? `Forma · ${forma.descricao}` : undefined,
    summary: forma ? (
      <RecordIdentityCard
        icon={CreditCard}
        title={forma.descricao}
        meta={
          <>
            {forma.tipo && (
              <span className="flex items-center gap-1">
                {TipoIcon && <TipoIcon className="h-3 w-3" />}
                {tipoLabel[forma.tipo] || forma.tipo}
              </span>
            )}
            <span>
              {forma.prazo_dias === 0 ? "À vista" : `${forma.prazo_dias}d`}
              {" · "}
              {Array.isArray(forma.intervalos_dias) && forma.intervalos_dias.length > 0
                ? `${forma.intervalos_dias.length}x`
                : `${forma.parcelas || 1}x`}
            </span>
          </>
        }
        badges={
          <>
            <StatusBadge status={forma.ativo ? "ativo" : "inativo"} />
            {forma.gera_financeiro && (
              <Badge variant="outline" className="text-[10px] gap-1 bg-success/10 text-success border-success/30">
                <Wallet className="w-2.5 h-2.5" />
                Gera financeiro
              </Badge>
            )}
          </>
        }
      />
    ) : undefined,
    actions: forma ? (
      <>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-label="Editar forma de pagamento"
          onClick={() => {
            navigate(`/formas-pagamento?editId=${id}`);
            window.setTimeout(() => clearStack(), 0);
          }}
        >
          <Edit className="h-3.5 w-3.5" /> Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          aria-label="Inativar forma de pagamento"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" /> Inativar
        </Button>
        {isAdmin && forma.ativo === false && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label="Excluir forma de pagamento permanentemente"
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
  if (!forma) return <DetailEmpty title="Forma de pagamento não encontrada" icon={CreditCard} />;

  const parcelasResolvidas = Array.isArray(forma.intervalos_dias) && forma.intervalos_dias.length > 0
    ? forma.intervalos_dias.length
    : (forma.parcelas || 1);

  return (
    <div className="space-y-5">
      <DrawerSummaryGrid cols={4}>
        <DrawerSummaryCard
          label="Prazo"
          value={forma.prazo_dias === 0 ? "À vista" : `${forma.prazo_dias}d`}
        />
        <DrawerSummaryCard label="Parcelas" value={`${parcelasResolvidas}x`} />
        <DrawerSummaryCard label="Clientes" value={String(clientes.length)} />
        <DrawerSummaryCard
          label="Uso (Lanç.)"
          value={String(usoLancamentos)}
          tone={usoLancamentos > 0 ? "primary" : "neutral"}
        />
      </DrawerSummaryGrid>

      <Tabs defaultValue="resumo" className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="resumo" className="text-xs">Resumo</TabsTrigger>
          <TabsTrigger value="clientes" className="text-xs">Clientes ({clientes.length})</TabsTrigger>
          <TabsTrigger value="uso" className="text-xs">Uso</TabsTrigger>
          <TabsTrigger value="observacoes" className="text-xs">Obs.</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-4 mt-3 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Tipo</p>
              <p className="flex items-center gap-1.5 font-medium">
                {TipoIcon && <TipoIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                {forma.tipo ? (tipoLabel[forma.tipo] || forma.tipo) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Gera financeiro</p>
              <p className="font-medium">{forma.gera_financeiro ? "Sim" : "Não"}</p>
            </div>
          </div>
          {Array.isArray(forma.intervalos_dias) && forma.intervalos_dias.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">Tabela de parcelas</p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-3 py-1.5 text-xs font-semibold text-muted-foreground">Parcela</th>
                      <th className="text-right px-3 py-1.5 text-xs font-semibold text-muted-foreground">Vencimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forma.intervalos_dias.map((d, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-muted/20" : ""}>
                        <td className="px-3 py-1.5 text-xs">{idx + 1}ª parcela</td>
                        <td className="px-3 py-1.5 text-xs font-mono text-right">{d} dias</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="clientes" className="space-y-2 mt-3">
          {clientes.length === 0 ? (
            <DetailEmpty icon={Users} title="Nenhum cliente vinculado" message="Nenhum cliente usa esta forma como padrão." />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Cliente</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Prazo pref.</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c, idx) => (
                    <tr key={c.id} className={idx % 2 === 0 ? "bg-muted/20" : ""}>
                      <td className="px-3 py-2 text-xs">
                        <RelationalLink type="cliente" id={c.id}>{c.nome_razao_social}</RelationalLink>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-right text-muted-foreground">
                        {c.prazo_preferencial ? `${c.prazo_preferencial}d` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="uso" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-wider">Lançamentos</p>
              </div>
              <p className="font-mono font-bold text-xl text-foreground">{usoLancamentos}</p>
              <p className="text-[11px] text-muted-foreground">vinculados a esta forma</p>
            </div>
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Wallet className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-wider">Caixa</p>
              </div>
              <p className="font-mono font-bold text-xl text-foreground">{usoCaixa}</p>
              <p className="text-[11px] text-muted-foreground">movimentações com tipo {forma.tipo ? (tipoLabel[forma.tipo] || forma.tipo) : "—"}</p>
            </div>
          </div>
          {usoLancamentos === 0 && usoCaixa === 0 && (
            <DetailEmpty
              title="Sem uso registrado"
              message="Esta forma ainda não foi utilizada em lançamentos ou movimentações."
              className="py-6"
            />
          )}
        </TabsContent>

        <TabsContent value="observacoes" className="mt-3">
          {forma.observacoes ? (
            <p className="text-sm whitespace-pre-wrap">{forma.observacoes}</p>
          ) : (
            <DetailEmpty title="Nenhuma observação registrada" className="py-6" />
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
              .from("formas_pagamento")
              .update({ ativo: false })
              .eq("id", id);
            if (error) throw error;
            toast.success("Forma de pagamento inativada.");
            setDeleteOpen(false);
            clearStack();
          } catch (err) {
            notifyError(err);
          } finally {
            setDeleting(false);
          }
        }}
        title="Inativar forma de pagamento"
        message={
          usoLancamentos > 0 || clientes.length > 0
            ? `Esta forma é usada em ${usoLancamentos} lançamento(s) e ${clientes.length} cliente(s). Ao inativar, ela deixará de aparecer em novas seleções, mas o histórico será preservado.`
            : `Tem certeza que deseja inativar "${forma.descricao}"? Você pode reativá-la a qualquer momento.`
        }
      />

      <PermanentDeleteDialog
        open={permDeleteOpen}
        onClose={() => setPermDeleteOpen(false)}
        table="formas_pagamento"
        id={id}
        entityLabel="forma de pagamento"
        recordName={forma.descricao}
        warning={
          usoLancamentos > 0 || clientes.length > 0
            ? `Em uso em ${usoLancamentos} lançamento(s) e ${clientes.length} cliente(s). A exclusão será bloqueada se houver referências.`
            : undefined
        }
        onDeleted={() => clearStack()}
      />
    </div>
  );
}
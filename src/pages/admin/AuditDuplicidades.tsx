import { useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { SummaryCard } from "@/components/SummaryCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { formatDateBr } from "@/lib/date";
import { notifyError } from "@/utils/errorMessages";
import {
  listAuditDups,
  scanDups,
  purgeDup,
  manterDup,
  type AuditDup,
} from "@/services/auditDups.service";
import { AlertTriangle, RefreshCw, Trash2, ShieldCheck, ScanSearch } from "lucide-react";

type StatusTab = "pendente" | "removido" | "mantido";

export default function AuditDuplicidades() {
  const [tab, setTab] = useState<StatusTab>("pendente");
  const [data, setData] = useState<AuditDup[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<AuditDup | null>(null);
  const [manterTarget, setManterTarget] = useState<AuditDup | null>(null);
  const [manterMotivo, setManterMotivo] = useState("");
  const [working, setWorking] = useState(false);

  const fetchData = async (status: StatusTab) => {
    setLoading(true);
    try {
      const rows = await listAuditDups(status);
      setData(rows);
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(tab);
  }, [tab]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await scanDups();
      toast.success(
        `Auditoria concluída: ${res.grupos_inseridos} grupos (${res.claros} claros, ${res.revisao_manual} para revisão)`,
      );
      await fetchData(tab);
    } catch (e) {
      notifyError(e);
    } finally {
      setScanning(false);
    }
  };

  const handleConfirmPurge = async () => {
    if (!purgeTarget) return;
    setWorking(true);
    try {
      const removed = await purgeDup(purgeTarget.id);
      toast.success(`${removed} lançamento(s) removido(s) definitivamente`);
      setPurgeTarget(null);
      fetchData(tab);
    } catch (e) {
      notifyError(e);
    } finally {
      setWorking(false);
    }
  };

  const handleConfirmManter = async () => {
    if (!manterTarget) return;
    if (!manterMotivo.trim()) {
      toast.error("Informe o motivo");
      return;
    }
    setWorking(true);
    try {
      await manterDup(manterTarget.id, manterMotivo.trim());
      toast.success("Grupo marcado como mantido");
      setManterTarget(null);
      setManterMotivo("");
      fetchData(tab);
    } catch (e) {
      notifyError(e);
    } finally {
      setWorking(false);
    }
  };

  const counts = useMemo(() => {
    const claros = data.filter((d) => d.classificacao === "clara").length;
    const revisao = data.filter((d) => d.classificacao === "manual_review").length;
    return { total: data.length, claros, revisao };
  }, [data]);

  const columns = [
    {
      key: "tipo",
      label: "Tipo",
      render: (r: AuditDup) => (
        <Badge variant="outline">{r.tipo === "pagar" ? "A Pagar" : "A Receber"}</Badge>
      ),
    },
    {
      key: "valor",
      label: "Valor",
      sortable: true,
      render: (r: AuditDup) => (
        <span className="font-mono text-sm">{formatCurrency(Number(r.valor))}</span>
      ),
    },
    {
      key: "venc",
      label: "Vencimento",
      sortable: true,
      render: (r: AuditDup) => formatDateBr(r.data_vencimento),
    },
    {
      key: "parcela",
      label: "Parcela",
      render: (r: AuditDup) =>
        r.parcela_numero ? <span className="text-xs">{r.parcela_numero}</span> : "—",
    },
    {
      key: "qtd",
      label: "Duplicatas",
      render: (r: AuditDup) => (
        <span className="font-semibold">{(r.ids as string[]).length}</span>
      ),
    },
    {
      key: "baixados",
      label: "Baixados",
      render: (r: AuditDup) => {
        const n = (r.ids_baixados as string[] | null)?.length ?? 0;
        return n > 0 ? (
          <Badge className="bg-success/15 text-success border-success/30">{n}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">0</span>
        );
      },
    },
    {
      key: "remover",
      label: "A remover",
      render: (r: AuditDup) => {
        const n = (r.ids_a_remover as string[] | null)?.length ?? 0;
        return n > 0 ? (
          <Badge className="bg-destructive/15 text-destructive border-destructive/30">{n}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">0</span>
        );
      },
    },
    {
      key: "classificacao",
      label: "Classificação",
      render: (r: AuditDup) =>
        r.classificacao === "clara" ? (
          <Badge className="bg-warning/15 text-warning border-warning/30">Clara</Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <AlertTriangle className="w-3 h-3" />
            Revisão manual
          </Badge>
        ),
    },
    {
      key: "acoes",
      label: "Ações",
      render: (r: AuditDup) =>
        tab === "pendente" ? (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={(r.ids_a_remover as string[] | null)?.length === 0}
              onClick={() => setPurgeTarget(r)}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Remover
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setManterTarget(r)}
            >
              <ShieldCheck className="w-3 h-3 mr-1" />
              Manter
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{r.motivo || "—"}</span>
        ),
    },
  ];

  return (
    <>
      <ModulePage
        title="Auditoria de Duplicidades"
        subtitle="Revisão de lançamentos financeiros potencialmente duplicados (apenas administradores)"
        actions={
          <Button onClick={handleScan} disabled={scanning} variant="outline">
            {scanning ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ScanSearch className="w-4 h-4 mr-2" />
            )}
            {scanning ? "Escaneando..." : "Escanear duplicidades"}
          </Button>
        }
        summaryCards={
          <>
            <SummaryCard title="Grupos" value={String(counts.total)} icon={ScanSearch} />
            <SummaryCard title="Claras" value={String(counts.claros)} icon={Trash2} variant="warning" />
            <SummaryCard
              title="Revisão manual"
              value={String(counts.revisao)}
              icon={AlertTriangle}
            />
          </>
        }
      >
        <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)} className="w-full">
          <TabsList>
            <TabsTrigger value="pendente">Pendentes</TabsTrigger>
            <TabsTrigger value="removido">Removidos</TabsTrigger>
            <TabsTrigger value="mantido">Mantidos</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-4">
            <DataTable
              columns={columns}
              data={data}
              loading={loading}
              moduleKey="audit-dups"
              emptyTitle="Nenhuma duplicidade encontrada"
              emptyDescription={
                tab === "pendente"
                  ? "Clique em 'Escanear duplicidades' para varrer os lançamentos."
                  : "Nenhum registro neste status."
              }
            />
          </TabsContent>
        </Tabs>
      </ModulePage>

      <AlertDialog open={!!purgeTarget} onOpenChange={(o) => !o && setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Confirmar remoção definitiva
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove permanentemente{" "}
              <strong>{(purgeTarget?.ids_a_remover as string[] | null)?.length ?? 0}</strong>{" "}
              lançamento(s) duplicado(s). Lançamentos baixados nunca são removidos pelo sistema.
              <br />
              <br />
              <span className="font-medium text-foreground">
                Valor: {purgeTarget && formatCurrency(Number(purgeTarget.valor))} — Vencimento:{" "}
                {purgeTarget && formatDateBr(purgeTarget.data_vencimento)}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPurge}
              disabled={working}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Remover definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!manterTarget} onOpenChange={(o) => !o && setManterTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como não-duplicidade</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo pelo qual este grupo deve ser preservado (ex: lançamentos legítimos
              de mesma data/valor).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 py-2 space-y-2">
            <Label htmlFor="manter-motivo">Motivo</Label>
            <Textarea
              id="manter-motivo"
              value={manterMotivo}
              onChange={(e) => setManterMotivo(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setManterMotivo("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmManter} disabled={working}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
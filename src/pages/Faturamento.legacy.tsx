import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ModulePage } from "@/components/ModulePage";
import { SummaryCard } from "@/components/SummaryCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  ListChecks,
  LayoutDashboard,
  ShieldCheck,
  Plus,
  BookOpen,
  Ban,
  Inbox,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { CertificadoValidadeAlert } from "@/components/fiscal/CertificadoValidadeAlert";
import { BacklogFaturamento } from "@/pages/faturamento/BacklogFaturamento";
import { ConsultaDocumentos } from "@/pages/faturamento/ConsultaDocumentos";
import { FiscalSefazStatusBadge } from "@/components/fiscal/FiscalStatusBadges";
import { InutilizacaoDrawer } from "@/pages/fiscal/components/InutilizacaoDrawer";
import { StatusSefazUFWidget } from "@/pages/fiscal/components/StatusSefazUFWidget";
import { ContingenciaSvcDrawer } from "@/pages/fiscal/components/ContingenciaSvcDrawer";
import { ManifestacaoDestinatarioDrawer } from "@/pages/fiscal/components/ManifestacaoDestinatarioDrawer";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Módulo /faturamento — Onda 1 do plano "Emissor estilo Sebrae".
 * Casca com 4 abas (Painel, Emitir, Backlog, Documentos), KPIs reais
 * sobre notas_fiscais e widget de status SEFAZ baseado nas últimas
 * transmissões. Wizard de emissão e backlog OV são placeholders das
 * Ondas 3 e 4.
 */

type TabKey = "painel" | "emitir" | "backlog" | "documentos";
const VALID_TABS: TabKey[] = ["painel", "emitir", "backlog", "documentos"];

function inicioDoDia(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function inicioDoMes(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

interface PainelKpis {
  autorizadasHoje: number;
  valorAutorizadoMes: number;
  rejeitadasMes: number;
  pendentes: number;
  ultimaTransmissao: { status: string | null; quando: string | null } | null;
}

async function fetchPainelKpis(): Promise<PainelKpis> {
  const hoje = inicioDoDia();
  const mes = inicioDoMes();

  const [{ count: autorizadasHoje }, mesAuth, { count: rejeitadasMes }, { count: pendentes }, ultima] =
    await Promise.all([
      supabase
        .from("notas_fiscais")
        .select("id", { count: "exact", head: true })
        .eq("status_sefaz", "autorizada")
        .gte("data_emissao", hoje),
      supabase
        .from("notas_fiscais")
        .select("valor_total")
        .eq("status_sefaz", "autorizada")
        .gte("data_emissao", mes),
      supabase
        .from("notas_fiscais")
        .select("id", { count: "exact", head: true })
        .eq("status_sefaz", "rejeitada")
        .gte("data_emissao", mes),
      supabase
        .from("notas_fiscais")
        .select("id", { count: "exact", head: true })
        .in("status_sefaz", ["pendente", "em_processamento", "aguardando_protocolo"]),
      supabase
        .from("notas_fiscais")
        .select("status_sefaz, updated_at")
        .not("status_sefaz", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const valorAutorizadoMes = (mesAuth.data ?? []).reduce(
    (sum, row: { valor_total: number | null }) => sum + Number(row.valor_total ?? 0),
    0,
  );

  return {
    autorizadasHoje: autorizadasHoje ?? 0,
    valorAutorizadoMes,
    rejeitadasMes: rejeitadasMes ?? 0,
    pendentes: pendentes ?? 0,
    ultimaTransmissao: ultima.data
      ? { status: ultima.data.status_sefaz, quando: ultima.data.updated_at }
      : null,
  };
}

interface DocResumo {
  id: string;
  numero: string | null;
  serie: string | null;
  data_emissao: string;
  valor_total: number | null;
  status_sefaz: string | null;
  cliente_nome?: string | null;
}

async function fetchUltimasNotas(): Promise<DocResumo[]> {
  const { data } = await supabase
    .from("notas_fiscais")
    .select("id, numero, serie, data_emissao, valor_total, status_sefaz, clientes:cliente_id(nome)")
    .eq("tipo", "saida")
    .order("data_emissao", { ascending: false })
    .limit(8);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    numero: row.numero,
    serie: row.serie,
    data_emissao: row.data_emissao,
    valor_total: row.valor_total,
    status_sefaz: row.status_sefaz,
    cliente_nome: (row as { clientes?: { nome?: string | null } | null }).clientes?.nome ?? null,
  }));
}

export default function Faturamento() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get("tab") as TabKey) || "painel";
  const [tab, setTab] = useState<TabKey>(VALID_TABS.includes(tabParam) ? tabParam : "painel");
  const [inutOpen, setInutOpen] = useState(false);
  const [contOpen, setContOpen] = useState(false);
  const [contCfg, setContCfg] = useState<{ modo: string | null; motivo: string | null } | null>(null);
  const [manifOpen, setManifOpen] = useState(false);
  const [manifHighlight, setManifHighlight] = useState<string | null>(null);
  const qc = useQueryClient();

  const handleTab = (next: string) => {
    const t = next as TabKey;
    setTab(t);
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", t);
    setSearchParams(sp, { replace: true });
  };

  // Deep-link: /faturamento?tab=manifestacao&nfe=<id>
  // Abre o drawer de Manifestação com a NF correspondente em destaque.
  useEffect(() => {
    const sp = searchParams;
    if (sp.get("tab") === "manifestacao") {
      const nfeId = sp.get("nfe");
      const returnTab = (sp.get("returnTab") as TabKey) || (VALID_TABS.includes(tab) ? tab : "painel");
      setManifHighlight(nfeId);
      setManifOpen(true);
      // Limpa o param "tab=manifestacao" para não reabrir em re-renders;
      // restaura a aba de origem (returnTab) se informada.
      const next = new URLSearchParams(sp);
      next.delete("tab");
      next.delete("nfe");
      next.delete("returnTab");
      next.set("tab", returnTab);
      setSearchParams(next, { replace: true });
    }
    // Apenas no mount/quando a query muda externamente.
  }, [searchParams, setSearchParams]);

  const kpisQuery = useQuery({
    queryKey: ["faturamento-kpis"],
    queryFn: fetchPainelKpis,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const ultimasQuery = useQuery({
    queryKey: ["faturamento-ultimas"],
    queryFn: fetchUltimasNotas,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const kpis = kpisQuery.data;

  const summaryCards = useMemo(
    () => (
      <>
        <SummaryCard
          title="Autorizadas hoje"
          value={kpisQuery.isLoading ? "…" : (kpis?.autorizadasHoje ?? 0)}
          icon={CheckCircle2}
          variant="success"
          density="compact"
        />
        <SummaryCard
          title="Valor autorizado (mês)"
          value={kpisQuery.isLoading ? "…" : formatCurrency(kpis?.valorAutorizadoMes ?? 0)}
          icon={FileText}
          variant="info"
          density="compact"
        />
        <SummaryCard
          title="Rejeitadas no mês"
          value={kpisQuery.isLoading ? "…" : (kpis?.rejeitadasMes ?? 0)}
          icon={XCircle}
          variant={kpis && kpis.rejeitadasMes > 0 ? "danger" : "default"}
          density="compact"
        />
        <SummaryCard
          title="Pendentes"
          value={kpisQuery.isLoading ? "…" : (kpis?.pendentes ?? 0)}
          icon={Clock}
          variant={kpis && kpis.pendentes > 0 ? "warning" : "default"}
          density="compact"
        />
      </>
    ),
    [kpis, kpisQuery.isLoading],
  );

  return (
    <ModulePage
      title="Faturamento"
      subtitle="Emissão, acompanhamento e gestão de documentos fiscais (estilo Emissor Sebrae)"
      summaryCards={summaryCards}
      headerActions={
        <Button onClick={() => navigate("/faturamento/emitir")} className="gap-2">
          <Plus className="h-4 w-4" />
          Emitir NF-e
        </Button>
      }
    >
      <CertificadoValidadeAlert />

      <Tabs value={tab} onValueChange={handleTab} className="mt-2">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-4">
          <TabsTrigger value="painel" className="gap-2">
            <LayoutDashboard className="h-4 w-4" /> Painel
          </TabsTrigger>
          <TabsTrigger value="emitir" className="gap-2">
            <Send className="h-4 w-4" /> Emitir
          </TabsTrigger>
          <TabsTrigger value="backlog" className="gap-2">
            <ListChecks className="h-4 w-4" /> Backlog
          </TabsTrigger>
          <TabsTrigger value="documentos" className="gap-2">
            <FileText className="h-4 w-4" /> Documentos
          </TabsTrigger>
        </TabsList>

        {/* PAINEL */}
        <TabsContent value="painel" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Últimas notas emitidas</CardTitle>
                </CardHeader>
                <CardContent>
                  {ultimasQuery.isLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : (ultimasQuery.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      Nenhuma nota emitida ainda. Use “Emitir NF-e” para começar.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {(ultimasQuery.data ?? []).map((n) => (
                        <li
                          key={n.id}
                          className="flex items-center justify-between gap-3 py-2 text-sm cursor-pointer hover:bg-accent/40 px-2 rounded"
                          onClick={() => navigate(`/fiscal/${n.id}`)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">
                              NF {n.numero ?? "—"}/{n.serie ?? "1"}{" "}
                              <span className="font-normal text-muted-foreground">
                                · {n.cliente_nome ?? "Sem destinatário"}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(n.data_emissao)} · {formatCurrency(Number(n.valor_total ?? 0))}
                            </p>
                          </div>
                          <FiscalSefazStatusBadge status={n.status_sefaz || "nao_enviada"} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              <StatusSefazUFWidget
                onAbrirContingencia={(cfg) => {
                  setContCfg({ modo: cfg.modo_emissao_nfe, motivo: cfg.contingencia_motivo });
                  setContOpen(true);
                }}
              />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Atalhos</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <Button variant="outline" className="justify-start" onClick={() => navigate("/fiscal?tipo=saida")}>
                    <FileText className="h-4 w-4 mr-2" /> Notas de saída
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate("/fiscal?tipo=entrada")}>
                    <FileText className="h-4 w-4 mr-2" /> Notas de entrada
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate("/administracao?tab=fiscal")}>
                    <ShieldCheck className="h-4 w-4 mr-2" /> Configurações fiscais
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate("/faturamento/cadastros")}>
                    <BookOpen className="h-4 w-4 mr-2" /> Cadastros (Naturezas/Matriz)
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => setInutOpen(true)}>
                    <Ban className="h-4 w-4 mr-2" /> Inutilizar numeração
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => setManifOpen(true)}>
                    <Inbox className="h-4 w-4 mr-2" /> Manifestação do destinatário
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* EMITIR */}
        <TabsContent value="emitir" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Emitir nova NF-e</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Wizard guiado em 5 passos (Identificação → Destinatário → Itens
                → Transporte/Pagamento → Revisão), com aplicação automática da
                matriz fiscal e resolução do código IBGE do destinatário.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate("/faturamento/emitir")} className="gap-2">
                  <Send className="h-4 w-4" /> Iniciar wizard NF-e
                </Button>
                <Button variant="outline" onClick={() => navigate("/fiscal/novo?tipo=entrada")} className="gap-2">
                  <Plus className="h-4 w-4" /> Nota de entrada (formulário clássico)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BACKLOG */}
        <TabsContent value="backlog" className="mt-4">
          <BacklogFaturamento />
        </TabsContent>

        {/* DOCUMENTOS */}
        <TabsContent value="documentos" className="mt-4">
          <ConsultaDocumentos />
        </TabsContent>
      </Tabs>

      <InutilizacaoDrawer open={inutOpen} onOpenChange={setInutOpen} />
      <ManifestacaoDestinatarioDrawer
        open={manifOpen}
        onOpenChange={(o) => {
          setManifOpen(o);
          if (!o) setManifHighlight(null);
        }}
        highlightNfeId={manifHighlight}
      />
      <ContingenciaSvcDrawer
        open={contOpen}
        onOpenChange={setContOpen}
        modoAtual={contCfg?.modo ?? null}
        motivoAtual={contCfg?.motivo ?? null}
        onSalvo={() => qc.invalidateQueries()}
      />
    </ModulePage>
  );
}
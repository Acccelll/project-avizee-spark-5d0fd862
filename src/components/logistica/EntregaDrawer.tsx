import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ViewDrawerV2, ViewField, ViewSection } from "@/components/ViewDrawerV2";
import { StatusBadge } from "@/components/StatusBadge";
import { RelationalLink } from "@/components/ui/RelationalLink";
import { Badge } from "@/components/ui/badge";
import { DrawerSummaryCard, DrawerSummaryGrid } from "@/components/ui/DrawerSummaryCard";
import { DrawerStatusBanner } from "@/components/ui/DrawerStatusBanner";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailEmpty } from "@/components/ui/DetailStates";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatNumber } from "@/lib/format";
import {
  Truck,
  Package,
  MapPin,
  AlertTriangle,
  Calendar,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { getEntregaStatusCfg } from "@/pages/logistica/logisticaStatus";
import { DrawerStickyFooter } from "@/components/ui/DrawerStickyFooter";
import { trackAndPersistEventos } from "@/services/logistica/remessas.service";

/* ────────────────────────────────────────────────
   Types
──────────────────────────────────────────────── */

export interface Entrega {
  id: string;
  numero_pedido: string;
  cliente: string;
  cidade_uf: string;
  transportadora: string;
  volumes: number;
  peso_total: number;
  previsao_envio: string | null;
  previsao_entrega: string | null;
  data_expedicao: string | null;
  status_logistico: string;
  responsavel: string;
  codigo_rastreio: string | null;
}

interface RemessaDetalhe {
  id: string;
  transportadora_id: string | null;
  servico: string | null;
  valor_frete: number | null;
  observacoes: string | null;
  nota_fiscal_id: string | null;
  cliente_id: string | null;
  transportadoras?: { nome_razao_social: string } | null;
}

interface OVItem {
  id: string;
  descricao_snapshot: string | null;
  codigo_snapshot: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  peso_total: number | null;
  unidade: string | null;
}

interface RemessaEvento {
  id: string;
  descricao: string;
  local: string | null;
  data_hora: string;
}

interface EntregaDrawerProps {
  open: boolean;
  onClose: () => void;
  entrega: Entrega | null;
}

function isAtrasado(previsao: string | null, status: string): boolean {
  if (!previsao) return false;
  if (status === "entregue" || status === "cancelado") return false;
  return new Date(previsao + "T00:00:00") < new Date();
}

/* ────────────────────────────────────────────────
   Component
──────────────────────────────────────────────── */

export function EntregaDrawer({ open, onClose, entrega }: EntregaDrawerProps) {
  const [remessa, setRemessa] = useState<RemessaDetalhe | null>(null);
  const [itens, setItens] = useState<OVItem[]>([]);
  const [eventos, setEventos] = useState<RemessaEvento[]>([]);
  const [loading, setLoading] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [isMockTracking, setIsMockTracking] = useState(false);

  useEffect(() => {
    if (!open || !entrega) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setRemessa(null);
      setItens([]);
      setEventos([]);

      const [remessaRes, itensRes] = await Promise.all([
        supabase
          .from("remessas")
          .select("id,transportadora_id,servico,valor_frete,observacoes,nota_fiscal_id,cliente_id,transportadoras(nome_razao_social)")
          .eq("ordem_venda_id", entrega.id)
          .eq("ativo", true)
          .maybeSingle(),
        supabase
          .from("ordens_venda_itens")
          .select("id,descricao_snapshot,codigo_snapshot,quantidade,valor_unitario,valor_total,peso_total,unidade")
          .eq("ordem_venda_id", entrega.id),
      ]);

      if (cancelled) return;

      const r = remessaRes.data as RemessaDetalhe | null;
      setRemessa(r);
      setItens((itensRes.data as OVItem[]) || []);

      if (r?.id) {
        const { data: evs } = await supabase
          .from("remessa_eventos")
          .select("id,descricao,local,data_hora")
          .eq("remessa_id", r.id)
          .order("data_hora", { ascending: false });
        if (!cancelled) setEventos((evs as RemessaEvento[]) || []);
      }

      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() captura entrega/setters via closure; rerodar quando o objeto entrega muda em referência causaria refetch desnecessário
  }, [open, entrega?.id]);

  if (!entrega) return <ViewDrawerV2 open={open} onClose={onClose} title="" />;

  const cfg = getEntregaStatusCfg(entrega.status_logistico);
  const atrasado = isAtrasado(entrega.previsao_entrega, entrega.status_logistico);
  const pesoTotal = entrega.peso_total;
  const transportadoraNome = remessa?.transportadoras?.nome_razao_social || entrega.transportadora;

  /* ── Summary strip ── */
  const summary = (
    <DrawerSummaryGrid cols={4}>
      <DrawerSummaryCard
        label="Pedido"
        value={entrega.numero_pedido}
        hint="origem"
        align="center"
      />
      <DrawerSummaryCard
        label="Status"
        value={cfg.label}
        mono={false}
        tone={atrasado ? "destructive" : entrega.status_logistico === "entregue" ? "success" : "neutral"}
        hint={atrasado ? "atrasado" : undefined}
        align="center"
      />
      <DrawerSummaryCard
        label="Prev. Entrega"
        value={entrega.previsao_entrega ? formatDate(entrega.previsao_entrega) : "—"}
        hint={entrega.data_expedicao ? `Exped: ${formatDate(entrega.data_expedicao)}` : "não expedido"}
        mono={false}
        align="center"
      />
      <DrawerSummaryCard
        label="Carga"
        value={entrega.volumes > 0 ? `${formatNumber(entrega.volumes)} vol.` : "—"}
        hint={pesoTotal > 0 ? `${formatNumber(pesoTotal)} kg` : "sem peso"}
        mono={false}
        align="center"
      />
    </DrawerSummaryGrid>
  );

  /* ── Aba Resumo ── */
  const tabResumo = (
    <div className="space-y-4">
      <ViewSection title="Situação logística">
        <p className="mb-2 text-[11px] text-muted-foreground">Esta visão é consolidada por pedido; para leitura detalhada de cada volume e transição de status, use também a aba de Remessas.</p>
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Status">
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusBadge status={cfg.badgeStatus} label={cfg.label} />
              {atrasado && (
                <Badge variant="outline" className="text-xs border-destructive/40 text-destructive gap-1">
                  <AlertTriangle className="h-3 w-3" />Atrasado
                </Badge>
              )}
            </div>
          </ViewField>
          <ViewField label="Pedido de Origem">
            <span className="font-mono font-semibold">{entrega.numero_pedido}</span>
          </ViewField>
          <ViewField label="Cliente">{entrega.cliente}</ViewField>
          <ViewField label="Cidade / UF">{entrega.cidade_uf || "—"}</ViewField>
        </div>
      </ViewSection>

      <ViewSection title="Datas">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Prev. Envio">
            {entrega.previsao_envio ? formatDate(entrega.previsao_envio) : "—"}
          </ViewField>
          <ViewField label="Data Expedição">
            {entrega.data_expedicao ? formatDate(entrega.data_expedicao) : "—"}
          </ViewField>
          <ViewField label="Prev. Entrega">
            {entrega.previsao_entrega ? (
              <span className={atrasado ? "text-destructive font-semibold" : ""}>
                {formatDate(entrega.previsao_entrega)}
              </span>
            ) : "—"}
          </ViewField>
        </div>
      </ViewSection>

      {remessa?.observacoes && (
        <ViewSection title="Observações">
          <p className="text-sm">{remessa.observacoes}</p>
        </ViewSection>
      )}
    </div>
  );

  /* ── Aba Carga / Itens ── */
  const tabCarga = (
    <div className="space-y-4">
      <ViewSection title="Resumo da Carga">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Volumes">{entrega.volumes > 0 ? formatNumber(entrega.volumes) : "—"}</ViewField>
          <ViewField label="Peso Total">{pesoTotal > 0 ? `${formatNumber(pesoTotal)} kg` : "—"}</ViewField>
        </div>
      </ViewSection>

      {loading ? (
        <div className="space-y-2 py-1" aria-busy="true" aria-label="Carregando itens">
          <Skeleton tone="card" className="h-12 w-full" />
          <Skeleton tone="card" className="h-12 w-full" />
        </div>
      ) : itens.length === 0 ? (
        <DetailEmpty icon={Package} title="Nenhum item vinculado ao pedido" className="py-8" />
      ) : (
        <ViewSection title={`Itens do Pedido (${itens.length})`}>
          <div className="space-y-2">
            {itens.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.descricao_snapshot || "Item sem descrição"}</p>
                  {item.codigo_snapshot && (
                    <p className="text-[11px] text-muted-foreground font-mono">{item.codigo_snapshot}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">
                    {formatNumber(item.quantidade)}{item.unidade ? ` ${item.unidade}` : ""}
                  </p>
                  {item.peso_total != null && item.peso_total > 0 && (
                    <p className="text-[11px] text-muted-foreground">{formatNumber(item.peso_total)} kg</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ViewSection>
      )}
    </div>
  );

  /* ── Aba Transporte ── */
  const handleRastrear = async () => {
    if (!entrega.codigo_rastreio || !remessa?.id) return;
    const codigo = entrega.codigo_rastreio.trim().toUpperCase().replace(/\s+/g, "");
    if (!codigo) { toast.error("Código de rastreio inválido"); return; }
    setTrackingLoading(true);
    setIsMockTracking(false);
    try {
      const { novos, isMock, eventos: evs } = await trackAndPersistEventos(codigo, remessa.id);
      setIsMockTracking(isMock);
      if (isMock) {
        toast.warning("Dados simulados — credenciais dos Correios não configuradas.");
        setEventos(
          evs.map((e, i) => ({
            id: `mock-${remessa.id}-${i}`,
            descricao: e.descricao,
            local: e.local,
            data_hora: e.data_hora,
          })),
        );
      } else {
        toast.success(`${novos} novo(s) evento(s).`);
        const { data: refreshed } = await supabase
          .from("remessa_eventos")
          .select("id,descricao,local,data_hora")
          .eq("remessa_id", remessa.id)
          .order("data_hora", { ascending: false });
        setEventos((refreshed as RemessaEvento[]) || []);
      }
    } catch (err: unknown) {
      notifyError(err);
    } finally {
      setTrackingLoading(false);
    }
  };

  const tabTransporte = (
    <div className="space-y-4">
      <ViewSection title="Transportadora">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Transportadora">
            {remessa?.transportadora_id ? (
              <RelationalLink type="fornecedor" id={remessa.transportadora_id}>
                {transportadoraNome}
              </RelationalLink>
            ) : (
              <span>{transportadoraNome !== "—" ? transportadoraNome : "Não informada"}</span>
            )}
          </ViewField>
          <ViewField label="Serviço / Modalidade">
            {remessa?.servico || "—"}
          </ViewField>
          <ViewField label="Valor do Frete">
            {remessa?.valor_frete != null ? `R$ ${formatNumber(remessa.valor_frete)}` : "—"}
          </ViewField>
        </div>
      </ViewSection>

      <ViewSection title="Rastreio">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <ViewField label="Código de Rastreio">
              <span className="font-mono">
                {entrega.codigo_rastreio || "—"}
              </span>
            </ViewField>
            {entrega.codigo_rastreio && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0"
                onClick={handleRastrear}
                disabled={trackingLoading || !remessa?.id}
              >
                <Search className="h-3.5 w-3.5 mr-1.5" />
                {trackingLoading ? "Consultando..." : "Rastrear"}
              </Button>
            )}
          </div>

          {eventos.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-2">
              {entrega.codigo_rastreio
                ? "Nenhum evento registrado. Clique em Rastrear para consultar."
                : "Código de rastreio não informado."}
            </p>
          ) : (
            <div className="space-y-3 pt-1">
              {isMockTracking && (
                <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
                  Dados simulados
                </Badge>
              )}
              {eventos.slice(0, 5).map((ev, i) => (
                <div key={ev.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-2 w-2 rounded-full mt-1 ${i === 0 ? "bg-primary" : "bg-muted-foreground/30"}`} />
                    {i < eventos.slice(0, 5).length - 1 && <div className="w-px flex-1 bg-border my-1" />}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-xs font-medium">{ev.descricao}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <Calendar className="h-2.5 w-2.5" />
                      <span>{formatDate(ev.data_hora)}</span>
                      {ev.local && <><MapPin className="h-2.5 w-2.5" /><span>{ev.local}</span></>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ViewSection>
    </div>
  );

  /* ── Aba Ocorrências ── */
  const ocorrencias = eventos.filter((ev) =>
    /atraso|devolu|parcial|problema|reentrega|falha|recusa|danif/i.test(ev.descricao)
  );
  const temOcorrencia = entrega.status_logistico === "ocorrencia" || atrasado || ocorrencias.length > 0;

  const tabOcorrencias = (
    <div className="space-y-4">
      {temOcorrencia && (
        <DrawerStatusBanner
          tone={entrega.status_logistico === "ocorrencia" || atrasado ? "destructive" : "warning"}
          icon={AlertTriangle}
          title={
            entrega.status_logistico === "ocorrencia"
              ? "Entrega com Ocorrência"
              : atrasado
                ? "Entrega em Atraso"
                : "Eventos de Atenção"
          }
          description={
            entrega.status_logistico === "ocorrencia"
              ? "Esta entrega foi marcada com ocorrência. Verifique os eventos de rastreio e entre em contato com a transportadora."
              : atrasado
                ? `Previsão de entrega era ${formatDate(entrega.previsao_entrega!)} e ainda não foi concluída.`
                : "Foram identificados eventos que podem indicar problemas na entrega."
          }
        />
      )}

      {ocorrencias.length > 0 ? (
        <ViewSection title={`Eventos de Atenção (${ocorrencias.length})`}>
          <div className="space-y-2">
            {ocorrencias.map((ev) => (
              <div key={ev.id} className="rounded-lg border bg-card p-3">
                <p className="text-sm font-medium">{ev.descricao}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                  <Calendar className="h-2.5 w-2.5" />
                  <span>{formatDate(ev.data_hora)}</span>
                  {ev.local && <><MapPin className="h-2.5 w-2.5" /><span>{ev.local}</span></>}
                </div>
              </div>
            ))}
          </div>
        </ViewSection>
      ) : (
        <DetailEmpty
          icon={AlertTriangle}
          title="Nenhuma ocorrência registrada"
          message="Ocorrências como atraso, devolução e entrega parcial aparecerão aqui."
          className="py-8"
        />
      )}
    </div>
  );

  /* ── Aba Vínculos ── */
  const tabVinculos = (
    <div className="space-y-4">
      <ViewSection title="Documentos Relacionados">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Pedido de Venda">
            <RelationalLink type="ordem_venda" id={entrega.id}>
              {entrega.numero_pedido}
            </RelationalLink>
          </ViewField>
          {remessa?.nota_fiscal_id && (
            <ViewField label="Nota Fiscal">
              <RelationalLink type="nota_fiscal" id={remessa.nota_fiscal_id}>
                NF vinculada
              </RelationalLink>
            </ViewField>
          )}
        </div>
      </ViewSection>

      <ViewSection title="Parceiros">
        <div className="grid grid-cols-2 gap-4">
          <ViewField label="Cliente">
            {remessa?.cliente_id ? (
              <RelationalLink type="cliente" id={remessa.cliente_id}>
                {entrega.cliente}
              </RelationalLink>
            ) : (
              <span>{entrega.cliente}</span>
            )}
          </ViewField>
          <ViewField label="Transportadora">
            {remessa?.transportadora_id ? (
              <RelationalLink type="fornecedor" id={remessa.transportadora_id}>
                {transportadoraNome}
              </RelationalLink>
            ) : (
              <span>{transportadoraNome !== "—" ? transportadoraNome : "Não informada"}</span>
            )}
          </ViewField>
        </div>
      </ViewSection>

      {remessa?.id && (
        <ViewSection title="Remessa">
          <ViewField label="Remessa Vinculada">
            <RelationalLink type="remessa" id={remessa.id}>
              Ver remessa / rastreio
            </RelationalLink>
          </ViewField>
        </ViewSection>
      )}
    </div>
  );

  return (
    <ViewDrawerV2
      open={open}
      onClose={onClose}
      title={`Entrega — Pedido ${entrega.numero_pedido}`}
      subtitle={
        <span className="flex items-center gap-2">
          <Truck className="h-3.5 w-3.5" />
          {entrega.cliente}
          {entrega.cidade_uf ? ` · ${entrega.cidade_uf}` : ""}
          {transportadoraNome && transportadoraNome !== "—" ? ` · ${transportadoraNome}` : ""}
        </span>
      }
      badge={
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={cfg.badgeStatus} label={cfg.label} />
          {atrasado && (
            <Badge variant="outline" className="text-xs border-destructive/40 text-destructive gap-1">
              <AlertTriangle className="h-3 w-3" />Atrasado
            </Badge>
          )}
          {temOcorrencia && entrega.status_logistico !== "ocorrencia" && !atrasado && (
            <Badge variant="outline" className="text-xs border-warning/40 text-warning gap-1">
              <AlertTriangle className="h-3 w-3" />Ocorrência
            </Badge>
          )}
        </div>
      }
      summary={summary}
      tabs={[
        { value: "resumo",      label: "Resumo",      content: tabResumo },
        { value: "carga",       label: "Carga / Itens", content: tabCarga },
        { value: "transporte",  label: "Transporte",  content: tabTransporte },
        { value: "ocorrencias", label: "Ocorrências", content: tabOcorrencias },
        { value: "vinculos",    label: "Vínculos",    content: tabVinculos },
      ]}
      defaultTab="resumo"
      variant="operational"
      footerSticky
      footer={
        entrega.codigo_rastreio ? (
          <DrawerStickyFooter
            hint={atrasado ? "Entrega em atraso — verificar com transportadora." : undefined}
            right={
              <Button
                size="lg"
                className="h-11 min-w-[160px] gap-2"
                onClick={handleRastrear}
                disabled={trackingLoading || !remessa?.id}
              >
                <Search className="h-4 w-4" />
                {trackingLoading ? "Consultando..." : "Rastrear Correios"}
              </Button>
            }
          />
        ) : undefined
      }
    />
  );
}

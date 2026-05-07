import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, MapPin, Truck, ExternalLink, Package, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  trackAndPersistEventos,
  fetchRemessasRastreioPorDocumento,
} from "@/services/logistica/remessas.service";
import { notifyError } from "@/utils/errorMessages";
import { getRastreioStatusConsistencyBadge } from "@/pages/logistica/logisticaStatus";

type Remessa = Tables<"remessas"> & {
  transportadoras?: { nome_razao_social: string };
};

type RemessaEvento = Tables<"remessa_eventos">;

interface Props {
  pedidoCompraId?: string;
  notaFiscalId?: string;
  remessaId?: string;
  ordemVendaId?: string;
}

export function LogisticaRastreioSection({ pedidoCompraId, notaFiscalId, remessaId, ordemVendaId }: Props) {
  const navigate = useNavigate();
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [eventos, setEventos] = useState<Record<string, RemessaEvento[]>>({});
  const [loading, setLoading] = useState(true);
  const [trackingLoading, setTrackingLoading] = useState<string | null>(null);
  const [mockWarning, setMockWarning] = useState<string | null>(null);

  const fetchLogistica = useCallback(async () => {
    setLoading(true);
    try {
      const { remessas: rs, eventos: ev } = await fetchRemessasRastreioPorDocumento({
        pedidoCompraId,
        notaFiscalId,
        remessaId,
        ordemVendaId,
      });
      setRemessas(rs as Remessa[]);
      setEventos(ev as Record<string, RemessaEvento[]>);
    } catch {
      // mantém estados anteriores em falha
    }
    setLoading(false);
  }, [pedidoCompraId, notaFiscalId, remessaId, ordemVendaId]);

  useEffect(() => {
    fetchLogistica();
  }, [fetchLogistica]);

  const handleRastrear = async (remessa: Remessa) => {
    if (!remessa.codigo_rastreio) return;
    setTrackingLoading(remessa.id);
    setMockWarning(null);
    try {
      const { novos, isMock, eventos: evs } = await trackAndPersistEventos(
        remessa.codigo_rastreio,
        remessa.id,
      );

      if (isMock) {
        setMockWarning(remessa.id);
        // Show mock events inline without persisting
        const mockEvs: RemessaEvento[] = evs.map((e, i) => ({
          id: `mock-${remessa.id}-${i}`,
          remessa_id: remessa.id,
          descricao: e.descricao,
          local: e.local,
          data_hora: e.data_hora,
          created_at: new Date().toISOString(),
          empresa_id: "",
        }));
        setEventos((prev) => ({ ...prev, [remessa.id]: mockEvs }));
        toast.warning("Dados simulados — credenciais dos Correios não configuradas.");
      } else if (novos > 0) {
        toast.success(`${novos} novo(s) evento(s) incluído(s)`);
        fetchLogistica();
      } else {
        toast.success("Rastreio consultado — nenhum evento novo.");
      }
    } catch (err: unknown) {
      notifyError(err);
    } finally {
      setTrackingLoading(null);
    }
  };

  if (loading) return <div className="py-4 text-center text-sm text-muted-foreground">Carregando informações logísticas...</div>;

  if (remessas.length === 0) {
    return (
      <div className="py-8 text-center border rounded-lg bg-muted/20">
        <Truck className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">Nenhuma remessa vinculada.</p>
        <Button variant="link" size="sm" className="mt-1" onClick={() => navigate('/logistica')}>
          Ir para Remessas
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {remessas.map((r) => (
        <div key={r.id} className="border rounded-xl p-4 bg-card shadow-sm space-y-4">
          {/* Mobile: layout vertical com pill no topo + ações full-width abaixo. Desktop: side-by-side. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm font-mono text-primary truncate">{r.codigo_rastreio || "Sem código"}</h4>
                <StatusBadge status={r.status_transporte} />
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {r.transportadoras?.nome_razao_social || "Transportadora não informada"} • {r.servico || "Serviço padrão"}
              </p>
            </div>
            <div className="flex gap-2 max-sm:w-full">
              {r.codigo_rastreio && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 max-sm:h-11 max-sm:flex-1"
                  onClick={() => handleRastrear(r)}
                  disabled={trackingLoading === r.id}
                >
                  <Search className="w-3.5 h-3.5 mr-1.5" />
                  {trackingLoading === r.id ? "Consultando..." : "Rastrear"}
                </Button>
              )}
              {!r.codigo_rastreio && (
                <span className="text-[10px] px-2 py-1 rounded border bg-muted text-muted-foreground max-sm:flex-1 max-sm:text-center">
                  Remessa não rastreável (sem código)
                </span>
              )}
              <Button size="sm" variant="ghost" className="h-8 max-sm:h-11 shrink-0" aria-label="Ir para Logística" onClick={() => navigate('/logistica')}>
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          {(() => {
            const consistency = getRastreioStatusConsistencyBadge(r.status_transporte || "", (eventos[r.id]?.length ?? 0) > 0);
            if (!consistency) return null;
            const Icon = consistency.icon;
            return (
              <div className={`text-[11px] flex items-center gap-1 ${consistency.className}`}>
                <Icon className="w-3 h-3" />
                {consistency.label}
              </div>
            );
          })()}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3 border-y bg-muted/10 -mx-4 px-4">
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Postagem</p>
              <p className="text-sm">{r.data_postagem ? format(new Date(r.data_postagem + "T00:00:00"), "dd/MM/yyyy") : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Previsão</p>
              <p className="text-sm">{r.previsao_entrega ? format(new Date(r.previsao_entrega + "T00:00:00"), "dd/MM/yyyy") : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Volumes</p>
              <p className="text-sm">{r.volumes || 1}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Peso</p>
              <p className="text-sm">{r.peso ? `${r.peso} kg` : "—"}</p>
            </div>
          </div>

          {mockWarning === r.id && (
            <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
              <p className="text-xs text-muted-foreground">
                <strong>Dados simulados</strong> — credenciais dos Correios não configuradas. Os eventos exibidos são fictícios e não foram persistidos.
              </p>
            </div>
          )}

          {eventos[r.id] && eventos[r.id].length > 0 ? (
            <div className="space-y-3 pt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                <Package className="w-3 h-3" /> Últimos Eventos
              </p>
              <div className="space-y-3">
                {eventos[r.id].slice(0, 3).map((ev, i) => (
                  <div key={ev.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`h-2 w-2 rounded-full ${i === 0 ? "bg-primary" : "bg-muted-foreground/30"}`} />
                      {i < 2 && <div className="w-px flex-1 bg-border my-1" />}
                    </div>
                    <div className="flex-1 -mt-1">
                      <p className="text-xs font-medium">{ev.descricao}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{format(new Date(ev.data_hora), "dd/MM/yyyy HH:mm")}</span>
                        {ev.local && <><MapPin className="h-2.5 w-2.5" /><span>{ev.local}</span></>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic text-center py-2">Nenhum evento registrado ainda.</p>
          )}
        </div>
      ))}
    </div>
  );
}

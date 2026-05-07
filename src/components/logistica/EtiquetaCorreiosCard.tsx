/**
 * EtiquetaCorreiosCard — Card embutido no RemessaForm para gerar,
 * baixar e cancelar etiquetas de pré-postagem dos Correios.
 *
 * Pré-requisitos validados antes de habilitar "Gerar":
 *   - remessa salva (id existente)
 *   - tipo_remessa = 'entrega'
 *   - serviço SEDEX/PAC informado
 *   - peso > 0
 *   - cliente vinculado
 *   - permissão `logistica.update`
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Send, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/hooks/useCan";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  baixarEtiqueta,
  cancelarEtiqueta,
  gerarEtiqueta,
  listEtiquetasByRemessa,
  type RemessaEtiqueta,
} from "@/services/logistica/prepostagem.service";

interface Props {
  remessaId: string | null;
  tipoRemessa: string;
  servico: string;
  peso: string;
  clienteId: string;
}

export function EtiquetaCorreiosCard({
  remessaId,
  tipoRemessa,
  servico,
  peso,
  clienteId,
}: Props) {
  const { can } = useCan();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [etiquetas, setEtiquetas] = useState<RemessaEtiqueta[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const podeEscrever = can("logistica:editar");

  useEffect(() => {
    if (!remessaId) return;
    setLoading(true);
    listEtiquetasByRemessa(remessaId)
      .then(setEtiquetas)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [remessaId]);

  const motivosBloqueio: string[] = [];
  if (!remessaId) motivosBloqueio.push("Salve a remessa antes de gerar a etiqueta.");
  if (tipoRemessa !== "entrega") motivosBloqueio.push("Disponível apenas para remessas de entrega.");
  const servicoUp = servico.toUpperCase();
  if (!servicoUp.includes("SEDEX") && !servicoUp.includes("PAC")) {
    motivosBloqueio.push("Informe o serviço SEDEX ou PAC.");
  }
  if (!peso || Number(peso) <= 0) motivosBloqueio.push("Informe o peso (kg) da remessa.");
  if (!clienteId) motivosBloqueio.push("Vincule um cliente à remessa.");
  if (!podeEscrever) motivosBloqueio.push("Sem permissão para emitir etiquetas.");

  const emitida = etiquetas.find((e) => e.status === "emitida");

  async function handleGerar() {
    if (!remessaId) return;
    setGenerating(true);
    try {
      const nova = await gerarEtiqueta(remessaId);
      toast.success("Etiqueta emitida com sucesso.");
      setEtiquetas((prev) => [nova, ...prev.filter((e) => e.id !== nova.id)]);
    } catch (e) {
      toast.error((e as Error).message);
      // Recarrega para refletir status erro/pendente
      listEtiquetasByRemessa(remessaId).then(setEtiquetas).catch(() => {});
    } finally {
      setGenerating(false);
    }
  }

  async function handleBaixar(et: RemessaEtiqueta) {
    if (!et.pdf_path) return;
    setDownloadingId(et.id);
    try {
      const url = await baixarEtiqueta(et.pdf_path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleCancelar(et: RemessaEtiqueta) {
    const ok = await confirm({
      title: "Cancelar pré-postagem?",
      description:
        "Esta ação só funciona se o objeto ainda não foi postado fisicamente nos Correios.",
      confirmLabel: "Cancelar pré-postagem",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    try {
      await cancelarEtiqueta(et);
      toast.success("Pré-postagem cancelada.");
      setEtiquetas((prev) => prev.map((e) => (e.id === et.id ? { ...e, status: "cancelada" } : e)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function statusBadge(status: RemessaEtiqueta["status"]) {
    const map: Record<RemessaEtiqueta["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      emitida: { label: "Emitida", variant: "default" },
      pendente: { label: "Pendente", variant: "secondary" },
      erro: { label: "Erro", variant: "destructive" },
      cancelada: { label: "Cancelada", variant: "outline" },
    };
    const cfg = map[status];
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Etiqueta Correios (pré-postagem)
        </CardTitle>
        <Button
          type="button"
          size="sm"
          onClick={handleGerar}
          disabled={motivosBloqueio.length > 0 || generating || !!emitida}
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Gerando...</>
          ) : (
            <><Send className="h-4 w-4 mr-1.5" /> Gerar etiqueta</>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {motivosBloqueio.length > 0 && !emitida && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/40 rounded-md p-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <ul className="space-y-0.5 list-disc list-inside">
              {motivosBloqueio.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">Carregando etiquetas...</div>
        ) : etiquetas.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Nenhuma etiqueta emitida ainda.
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {etiquetas.map((et) => (
              <li key={et.id} className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {statusBadge(et.status)}
                    {et.codigo_objeto && (
                      <span className="font-mono text-sm">{et.codigo_objeto}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(et.created_at).toLocaleString("pt-BR")}
                    {et.erro_mensagem && (
                      <span className="text-destructive ml-2">— {et.erro_mensagem}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {et.status === "emitida" && et.pdf_path && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleBaixar(et)}
                      disabled={downloadingId === et.id}
                    >
                      {downloadingId === et.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 mr-1" />
                      )}
                      PDF
                    </Button>
                  )}
                  {(et.status === "emitida" || et.status === "pendente") && podeEscrever && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCancelar(et)}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Cancelar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
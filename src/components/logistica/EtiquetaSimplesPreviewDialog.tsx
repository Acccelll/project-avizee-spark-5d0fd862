import { useEffect, useMemo, useState } from "react";
import { Loader2, Download, AlertTriangle, Printer, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  prepararEtiquetasSimples,
  type EtiquetaInvalida,
} from "@/services/logistica/etiquetasSimples.service";

interface Props {
  open: boolean;
  remessaIds: string[];
  onClose: () => void;
}

/**
 * Pré-visualização do PDF de etiquetas simples antes do download,
 * no mesmo padrão do dialog de orçamento. Exibe o PDF em iframe e
 * permite baixar/imprimir diretamente.
 */
export function EtiquetaSimplesPreviewDialog({ open, remessaIds, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [invalidas, setInvalidas] = useState<EtiquetaInvalida[]>([]);
  const [validCount, setValidCount] = useState(0);

  useEffect(() => {
    if (!open || remessaIds.length === 0) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);
    setInvalidas([]);
    setPdfUrl(null);
    setValidCount(0);

    prepararEtiquetasSimples(remessaIds)
      .then(({ itens, invalidas, blob }) => {
        if (cancelled) return;
        setInvalidas(invalidas);
        setValidCount(itens.length);
        if (blob) {
          createdUrl = URL.createObjectURL(blob);
          setPdfUrl(createdUrl);
        }
      })
      .catch((err) => {
        if (!cancelled) toast.error((err as Error).message || "Falha ao gerar etiquetas");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, remessaIds]);

  const fileName = useMemo(
    () => `etiquetas-simples-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`,
    [],
  );

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = fileName;
    a.click();
    toast.success(`${validCount} etiqueta(s) baixadas em PDF A4.`);
  };

  const handlePrint = () => {
    if (!pdfUrl) return;
    const win = window.open(pdfUrl, "_blank", "noopener");
    if (!win) toast.error("Pop-up bloqueado — use o botão Baixar.");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle className="text-base">Pré-visualização de etiquetas</DialogTitle>
            <DialogDescription className="text-xs">
              {loading
                ? "Gerando PDF…"
                : pdfUrl
                  ? `${validCount} etiqueta(s) — A4 retrato, 4 por página.`
                  : "Nenhuma etiqueta pôde ser gerada."}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              disabled={!pdfUrl}
              className="gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={!pdfUrl}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> Baixar PDF
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-muted/30 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Gerando pré-visualização…
            </div>
          )}

          {!loading && invalidas.length > 0 && (
            <div className="absolute top-3 left-3 right-3 z-10 rounded-md border border-warning/40 bg-warning/10 text-xs">
              <div className="flex items-center gap-2 px-3 py-2 font-medium text-warning-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                {invalidas.length} remessa(s) ignorada(s) por dados incompletos
              </div>
              <ScrollArea className="max-h-32">
                <ul className="px-4 pb-2 space-y-1 text-muted-foreground">
                  {invalidas.map((i) => (
                    <li key={i.remessaId}>
                      <span className="font-mono">{i.remessaRef ?? i.remessaId.slice(0, 8)}</span>{" "}
                      — {i.faltando.join("; ")}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          {!loading && pdfUrl && (
            <iframe
              key={pdfUrl}
              src={pdfUrl}
              title="Pré-visualização de etiquetas"
              className="w-full h-full border-0"
            />
          )}

          {!loading && !pdfUrl && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
              Não foi possível gerar nenhuma etiqueta. Corrija os dados listados e tente novamente.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
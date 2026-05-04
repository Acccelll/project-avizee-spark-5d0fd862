import { useEffect, useMemo, useState } from "react";
import { Loader2, Download, AlertTriangle, Printer, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  montarItensEtiqueta,
  validarEtiquetas,
  gerarPdfEtiquetasSimplesA4,
  type EtiquetaSimplesItem,
  type EtiquetaInvalida,
} from "@/services/logistica/etiquetasSimples.service";

interface Props {
  open: boolean;
  remessaIds: string[];
  onClose: () => void;
}

/**
 * Pré-visualização das etiquetas simples no mesmo padrão do orçamento:
 * renderiza um mock HTML A4 (210×297mm em grade 2x2) com as etiquetas
 * válidas e só gera o PDF (jsPDF) no clique de Baixar/Imprimir.
 *
 * Por que não iframe `blob:`: o Chrome bloqueia o plugin interno de PDF
 * em iframes blob: dentro de contextos embed/sandbox (ex.: Lovable
 * preview), resultando em ícone de "documento quebrado".
 */
export function EtiquetaSimplesPreviewDialog({ open, remessaIds, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [validas, setValidas] = useState<EtiquetaSimplesItem[]>([]);
  const [invalidas, setInvalidas] = useState<EtiquetaInvalida[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [busy, setBusy] = useState<null | "pdf" | "print">(null);

  useEffect(() => {
    if (!open || remessaIds.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setInvalidas([]);
    setValidas([]);
    setPageIdx(0);

    montarItensEtiqueta(remessaIds)
      .then((itens) => {
        if (cancelled) return;
        const { validas, invalidas } = validarEtiquetas(itens);
        setValidas(validas);
        setInvalidas(invalidas);
      })
      .catch((err) => {
        if (!cancelled) toast.error((err as Error).message || "Falha ao gerar etiquetas");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, remessaIds]);

  const fileName = useMemo(
    () => `etiquetas-simples-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`,
    [],
  );

  const PER_PAGE = 4;
  const totalPages = Math.max(1, Math.ceil(validas.length / PER_PAGE));
  const pageItems = useMemo(
    () => validas.slice(pageIdx * PER_PAGE, pageIdx * PER_PAGE + PER_PAGE),
    [validas, pageIdx],
  );

  async function buildBlob(): Promise<Blob | null> {
    if (validas.length === 0) return null;
    return await gerarPdfEtiquetasSimplesA4(validas);
  }

  const handleDownload = async () => {
    try {
      setBusy("pdf");
      const blob = await buildBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${validas.length} etiqueta(s) baixadas em PDF A4.`);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao gerar PDF");
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = async () => {
    try {
      setBusy("print");
      const blob = await buildBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener");
      if (!win) toast.error("Pop-up bloqueado — use o botão Baixar.");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao gerar PDF");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle className="text-base">Pré-visualização de etiquetas</DialogTitle>
            <DialogDescription className="text-xs">
              {loading
                ? "Gerando pré-visualização…"
                : validas.length > 0
                  ? `${validas.length} etiqueta(s) — A4 retrato, 4 por página${totalPages > 1 ? ` (página ${pageIdx + 1}/${totalPages})` : ""}.`
                  : "Nenhuma etiqueta pôde ser gerada."}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              disabled={busy !== null || validas.length === 0}
              className="gap-1.5"
            >
              {busy === "print" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}{" "}
              Imprimir
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={busy !== null || validas.length === 0}
              className="gap-1.5"
            >
              {busy === "pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}{" "}
              Baixar PDF
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-muted/30 relative overflow-auto">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Gerando pré-visualização…
            </div>
          )}

          {!loading && invalidas.length > 0 && (
            <div className="sticky top-0 z-10 mx-3 mt-3 rounded-md border border-warning/40 bg-warning/10 text-xs">
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

          {!loading && validas.length > 0 && (
            <div className="min-h-full flex flex-col items-center gap-3 py-6 px-4">
              <FolhaA4Preview itens={pageItems} />
              {totalPages > 1 && (
                <div className="flex items-center gap-2 sticky bottom-2 bg-background/80 backdrop-blur rounded-full border px-2 py-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
                    disabled={pageIdx === 0}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs tabular-nums px-1">
                    {pageIdx + 1} / {totalPages}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPageIdx((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={pageIdx >= totalPages - 1}
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {!loading && validas.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
              Não foi possível gerar nenhuma etiqueta. Corrija os dados listados e tente novamente.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatCepMask(cep?: string | null): string {
  const d = (cep ?? "").replace(/\D/g, "");
  if (d.length !== 8) return cep ?? "";
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/**
 * Folha A4 mock (210×297mm) com grade 2x2 idêntica em proporções ao PDF
 * gerado por jsPDF em `gerarPdfEtiquetasSimplesA4`.
 */
function FolhaA4Preview({ itens }: { itens: EtiquetaSimplesItem[] }) {
  const slots: Array<EtiquetaSimplesItem | null> = [...itens];
  while (slots.length < 4) slots.push(null);

  return (
    <div
      className="bg-white shadow-2xl border"
      style={{
        width: "210mm",
        height: "297mm",
        padding: "8mm",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: "4mm",
        boxSizing: "border-box",
      }}
    >
      {slots.map((it, i) =>
        it ? <EtiquetaCard key={i} item={it} /> : <div key={i} className="border border-dashed border-muted" />,
      )}
    </div>
  );
}

function EtiquetaCard({ item }: { item: EtiquetaSimplesItem }) {
  const rem = item.remetente;
  const dest = item.destinatario;
  return (
    <div
      className="border border-neutral-400 relative text-neutral-900 bg-white overflow-hidden"
      style={{ padding: "4mm", fontFamily: "Helvetica, Arial, sans-serif" }}
    >
      {item.logoDataUrl && (
        <img
          src={item.logoDataUrl}
          alt=""
          style={{ position: "absolute", top: "4mm", right: "4mm", width: "24mm", height: "10mm", objectFit: "contain" }}
        />
      )}

      {/* Remetente */}
      <div style={{ fontSize: "7pt", fontWeight: 700, color: "#666", letterSpacing: "0.04em" }}>REMETENTE</div>
      <div style={{ fontSize: "9pt", fontWeight: 700, marginTop: "1mm", paddingRight: "26mm" }}>{rem.nome || "—"}</div>
      {rem.documento && (
        <div style={{ fontSize: "7.5pt", color: "#444", marginTop: "0.5mm" }}>CNPJ: {rem.documento}</div>
      )}
      <div style={{ fontSize: "8pt", color: "#333", marginTop: "1mm", lineHeight: 1.25 }}>
        <div>
          {[rem.logradouro, rem.numero].filter(Boolean).join(", ")}
          {rem.complemento ? ` — ${rem.complemento}` : ""}
        </div>
        {rem.bairro && <div>{rem.bairro}</div>}
        <div>
          {formatCepMask(rem.cep)} {[rem.cidade, rem.uf].filter(Boolean).join("/")}
        </div>
        {rem.telefone && <div>Tel.: {rem.telefone}</div>}
      </div>

      <div style={{ borderTop: "1px solid #ccc", margin: "3mm 0" }} />

      {/* Destinatário */}
      <div style={{ fontSize: "8pt", fontWeight: 700, color: "#666", letterSpacing: "0.04em" }}>DESTINATÁRIO</div>
      <div style={{ fontSize: "13pt", fontWeight: 700, marginTop: "1mm", lineHeight: 1.15 }}>{dest.nome || "—"}</div>
      {dest.documento && <div style={{ fontSize: "9pt", color: "#444", marginTop: "1mm" }}>{dest.documento}</div>}
      <div style={{ fontSize: "11pt", color: "#222", marginTop: "1.5mm", lineHeight: 1.3 }}>
        <div>
          {[dest.logradouro, dest.numero].filter(Boolean).join(", ")}
          {dest.complemento ? ` — ${dest.complemento}` : ""}
        </div>
        {dest.bairro && <div>{dest.bairro}</div>}
        <div>{[dest.cidade, dest.uf].filter(Boolean).join("/")}</div>
        {dest.telefone && <div>Tel.: {dest.telefone}</div>}
      </div>
      {dest.cep && (
        <div
          style={{
            position: "absolute",
            left: "4mm",
            bottom: "3mm",
            fontSize: "12pt",
            fontWeight: 700,
          }}
        >
          CEP: {formatCepMask(dest.cep)}
        </div>
      )}
    </div>
  );
}

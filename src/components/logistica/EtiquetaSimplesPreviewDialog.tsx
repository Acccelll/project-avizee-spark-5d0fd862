import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Download,
  AlertTriangle,
  Printer,
  X,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Maximize2,
  Copy,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [copias, setCopias] = useState<Record<string, number>>({});
  // null = ajustar à tela (auto), número = zoom manual (0.25..1.5)
  const [zoom, setZoom] = useState<number | null>(null);
  const [autoScale, setAutoScale] = useState(0.5);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);

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
        // auto-fill: distribuir 4 vagas igualmente
        const n = validas.length;
        const padrao = n === 0 ? 1 : Math.max(1, Math.floor(4 / n));
        const map: Record<string, number> = {};
        for (const v of validas) map[v.remessaId] = padrao;
        setCopias(map);
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

  // expande aplicando o nº de cópias por remessa, mantendo ordem
  const expandidas = useMemo(() => {
    const out: EtiquetaSimplesItem[] = [];
    for (const it of validas) {
      const n = Math.max(0, Math.min(20, copias[it.remessaId] ?? 1));
      for (let i = 0; i < n; i++) out.push(it);
    }
    return out;
  }, [validas, copias]);

  const PER_PAGE = 4;
  const totalPages = Math.max(1, Math.ceil(expandidas.length / PER_PAGE));
  const safePageIdx = Math.min(pageIdx, totalPages - 1);
  const pageItems = useMemo(
    () => expandidas.slice(safePageIdx * PER_PAGE, safePageIdx * PER_PAGE + PER_PAGE),
    [expandidas, safePageIdx],
  );

  // Calcula escala "ajustar à tela" baseada no container
  useLayoutEffect(() => {
    const el = previewAreaRef.current;
    if (!el) return;
    const compute = () => {
      const cw = el.clientWidth - 48; // padding lateral
      const ch = el.clientHeight - 48;
      // 1mm ≈ 3.7795px @96dpi
      const MM = 3.7795275591;
      const fit = Math.min(cw / (210 * MM), ch / (297 * MM));
      setAutoScale(Math.max(0.2, Math.min(1.5, fit * 0.96)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const effectiveZoom = zoom ?? autoScale;

  async function buildBlob(): Promise<Blob | null> {
    if (expandidas.length === 0) return null;
    return await gerarPdfEtiquetasSimplesA4(expandidas);
  }

  const handleDownload = async () => {
    try {
      setBusy("pdf");
      const blob = await buildBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      // iOS Safari ignora `download` em blob: — abre em nova aba como fallback
      const isIOS =
        typeof navigator !== "undefined" &&
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !(window as unknown as { MSStream?: unknown }).MSStream;
      if (isIOS) {
        const win = window.open(url, "_blank", "noopener");
        if (!win) toast.error("Pop-up bloqueado — habilite pop-ups para baixar o PDF.");
        else toast.success(`${expandidas.length} etiqueta(s) abertas — toque em compartilhar para salvar.`);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success(`${expandidas.length} etiqueta(s) baixadas em PDF A4.`);
      }
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

  const setCopiasGlobal = (n: number) => {
    const v = Math.max(0, Math.min(20, n));
    setCopias((prev) => {
      const out: Record<string, number> = {};
      for (const r of validas) out[r.remessaId] = v;
      return out;
    });
    setPageIdx(0);
  };
  const autoFill = () => {
    const n = validas.length;
    const padrao = n === 0 ? 1 : Math.max(1, Math.floor(4 / n));
    const map: Record<string, number> = {};
    for (const v of validas) map[v.remessaId] = padrao;
    setCopias(map);
    setPageIdx(0);
  };

  // valor exibido no input global: comum se todos iguais, senão "—"
  const copiasComuns = (() => {
    if (validas.length === 0) return 1;
    const first = copias[validas[0].remessaId] ?? 1;
    return validas.every((r) => (copias[r.remessaId] ?? 1) === first) ? first : null;
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle className="text-base">Pré-visualização de etiquetas</DialogTitle>
            <DialogDescription className="text-xs">
              {loading
                ? "Gerando pré-visualização…"
                : expandidas.length > 0
                  ? `${expandidas.length} etiqueta(s) · ${validas.length} remessa(s) · folha ${safePageIdx + 1}/${totalPages}`
                  : "Nenhuma etiqueta pôde ser gerada."}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              disabled={busy !== null || expandidas.length === 0}
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
              disabled={busy !== null || expandidas.length === 0}
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

        {/* Barra de controles: cópias + zoom */}
        {!loading && validas.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b bg-background text-xs">
            <div className="flex items-center gap-2">
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="copias-input" className="text-xs">
                Cópias por remessa
              </Label>
              <Input
                id="copias-input"
                type="number"
                min={0}
                max={20}
                value={copiasComuns ?? ""}
                placeholder={copiasComuns === null ? "—" : ""}
                onChange={(e) => setCopiasGlobal(Number(e.target.value) || 0)}
                className="h-7 w-16 text-xs"
              />
              <Button size="sm" variant="outline" onClick={autoFill} className="h-7 text-xs">
                Auto preencher A4
              </Button>
              {validas.length > 1 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 text-xs">
                      Personalizar por remessa
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="start">
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Quantas cópias de cada remessa?</p>
                      <div className="max-h-64 overflow-auto space-y-1.5">
                        {validas.map((r) => (
                          <div key={r.remessaId} className="flex items-center gap-2">
                            <span className="flex-1 truncate text-xs" title={r.destinatario.nome}>
                              <span className="font-mono text-muted-foreground mr-1">
                                {r.remessaRef}
                              </span>
                              {r.destinatario.nome}
                            </span>
                            <Input
                              type="number"
                              min={0}
                              max={20}
                              value={copias[r.remessaId] ?? 0}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(20, Number(e.target.value) || 0));
                                setCopias((p) => ({ ...p, [r.remessaId]: v }));
                                setPageIdx(0);
                              }}
                              className="h-7 w-16 text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="flex items-center gap-1 ml-auto">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setZoom(Math.max(0.25, (zoom ?? autoScale) - 0.1))}
                aria-label="Diminuir zoom"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs tabular-nums w-12 text-center">
                {Math.round(effectiveZoom * 100)}%
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setZoom(Math.min(1.5, (zoom ?? autoScale) + 0.1))}
                aria-label="Aumentar zoom"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={() => setZoom(null)}
                title="Ajustar à tela"
              >
                <Maximize2 className="h-3.5 w-3.5" /> Ajustar
              </Button>
            </div>
          </div>
        )}

        <div ref={previewAreaRef} className="flex-1 min-h-0 bg-neutral-200 dark:bg-neutral-800 relative overflow-auto">
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

          {!loading && expandidas.length > 0 && (
            <div className="min-h-full flex flex-col items-center gap-3 py-6 px-4">
              <div
                style={{
                  width: `calc(210mm * ${effectiveZoom})`,
                  height: `calc(297mm * ${effectiveZoom})`,
                }}
                className="shrink-0"
              >
                <div
                  style={{
                    transform: `scale(${effectiveZoom})`,
                    transformOrigin: "top left",
                  }}
                >
                  <FolhaA4Preview itens={pageItems} />
                </div>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2 sticky bottom-2 bg-background/90 backdrop-blur rounded-full border px-2 py-1 shadow-md">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
                    disabled={safePageIdx === 0}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs tabular-nums px-1">
                    Folha {safePageIdx + 1} / {totalPages}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPageIdx((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={safePageIdx >= totalPages - 1}
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {!loading && expandidas.length === 0 && validas.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
              Não foi possível gerar nenhuma etiqueta. Corrija os dados listados e tente novamente.
            </div>
          )}
          {!loading && expandidas.length === 0 && validas.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
              Defina pelo menos 1 cópia para alguma remessa.
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
      className="bg-white shadow-2xl border border-neutral-300"
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

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Inbox,
  Plus,
  CheckCircle2,
  AlertTriangle,
  EyeOff,
  XCircle,
  Upload,
  Eye,
  PackagePlus,
  CheckCheck,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  enviarManifestacao,
  statusManifestacaoFromEvento,
  tipoEventoFiscalFromManifestacao,
  sincronizarDistDFe,
  type TipoManifestacao,
} from "@/services/fiscal/sefaz";
import {
  atualizarStatusManifestacao,
  getEmpresaSefazContext,
  insertNfeDistribuicaoPorChave,
  listFornecedoresAtivosMin,
  listNfeCapturadas,
  listNfeDistribuicaoItens,
  listProdutosAtivosMin,
  mapearProdutoNfeItem,
  processarNfeDistribuicao,
  registrarEventoManifestacao,
  upsertNfeFromXml,
  type FornecedorMinRow,
  type NfeCapturadaRow,
  type NfeDistItemRow,
  type ProdutoMinRow,
} from "@/services/fiscal/manifestacao.repository";
import { fiscalKeys } from "@/lib/queryKeys/fiscal";
import { notifyError } from "@/utils/errorMessages";
import { parseNFeXml, type NFeXmlItem } from "@/services/fiscal/nfeXmlParser.service";
import { formatCurrency } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Manifestação do Destinatário (Onda 8).
 *
 * Lista NF-e capturadas em `nfe_distribuicao` (entrada por chave) e permite:
 *  - Adicionar NF por chave de acesso (44 dígitos).
 *  - Manifestar Ciência / Confirmação / Desconhecimento / Operação Não Realizada.
 * Cada manifestação grava um evento em `eventos_fiscais` e atualiza o
 * `status_manifestacao` da NF capturada.
 */

interface ManifestacaoDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando informado, rola até a NF-e correspondente e a destaca visualmente. */
  highlightNfeId?: string | null;
}

type NfeCapturada = NfeCapturadaRow;

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  sem_manifestacao: { label: "Sem manifestação", variant: "outline" },
  ciencia: { label: "Ciência", variant: "secondary" },
  confirmada: { label: "Confirmada", variant: "default" },
  desconhecida: { label: "Desconhecida", variant: "destructive" },
  nao_realizada: { label: "Não realizada", variant: "destructive" },
};

function chaveValida(c: string): boolean {
  return /^\d{44}$/.test(c.replace(/\D/g, ""));
}

function extrairDoChave(chave: string): { cnpj: string; serie: string; numero: string; data: string | null } {
  // Layout NF-e: cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + numero(9) + tpEmis(1) + cNF(8) + cDV(1)
  const c = chave.replace(/\D/g, "");
  const aaMm = c.slice(2, 6);
  const cnpj = c.slice(6, 20);
  const serie = String(parseInt(c.slice(22, 25), 10));
  const numero = String(parseInt(c.slice(25, 34), 10));
  const ano = 2000 + parseInt(aaMm.slice(0, 2), 10);
  const mes = parseInt(aaMm.slice(2, 4), 10);
  let data: string | null = null;
  if (mes >= 1 && mes <= 12) {
    data = new Date(Date.UTC(ano, mes - 1, 1)).toISOString();
  }
  return { cnpj, serie, numero, data };
}

export function ManifestacaoDestinatarioDrawer({ open, onOpenChange, highlightNfeId }: ManifestacaoDrawerProps) {
  const qc = useQueryClient();
  const [novaChave, setNovaChave] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [manifestando, setManifestando] = useState<string | null>(null);
  const [naoRealizadaTarget, setNaoRealizadaTarget] = useState<NfeCapturada | null>(null);
  const [justNaoRealizada, setJustNaoRealizada] = useState("");
  const [importando, setImportando] = useState(false);
  const [verItensTarget, setVerItensTarget] = useState<NfeCapturada | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [processarTarget, setProcessarTarget] = useState<NfeCapturada | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const highlightRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!open || !highlightNfeId) return;
    // Aguarda render da lista antes de fazer scroll.
    const t = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
    return () => clearTimeout(t);
  }, [open, highlightNfeId, /* re-roda quando notas chegam: */]);

  const { data: notas = [], isLoading } = useQuery({
    queryKey: fiscalKeys.nfeDistribuicao(),
    queryFn: () => listNfeCapturadas(),
    enabled: open,
  });

  const handleAdicionar = async () => {
    const chave = novaChave.replace(/\D/g, "");
    if (!chaveValida(chave)) {
      toast.error("Chave de acesso inválida (44 dígitos).");
      return;
    }
    setSalvando(true);
    try {
      const { cnpj, serie, numero, data } = extrairDoChave(chave);
      const { duplicado } = await insertNfeDistribuicaoPorChave({
        chave_acesso: chave,
        cnpj_emitente: cnpj,
        numero,
        serie,
        data_emissao: data,
      });
      if (duplicado) {
        toast.error("Esta chave já está cadastrada.");
      } else {
        toast.success("NF-e adicionada para manifestação.");
        setNovaChave("");
        qc.invalidateQueries({ queryKey: fiscalKeys.nfeDistribuicao() });
      }
    } catch (e) {
      notifyError(e);
    } finally {
      setSalvando(false);
    }
  };

  const executarManifestacao = async (
    nf: NfeCapturada,
    tpEvento: TipoManifestacao,
    justificativa?: string,
  ) => {
    setManifestando(nf.id);
    try {
      const ctx = await getEmpresaSefazContext();
      const result = await enviarManifestacao(
        {
          chave: nf.chave_acesso,
          cnpjDestinatario: ctx.cnpj,
          tpEvento,
          ambiente: ctx.ambiente,
          justificativa,
        },
        { tipo: "A1", conteudo: "", senha: "" },
      );

      await registrarEventoManifestacao({
        nfe_distribuicao_id: nf.id,
        tipo_evento: tipoEventoFiscalFromManifestacao(tpEvento),
        codigo_evento: tpEvento,
        justificativa: justificativa ?? null,
        protocolo: result.protocolo ?? null,
        data_evento: result.dataRetorno ?? null,
        status_sefaz: result.sucesso ? "autorizado" : "rejeitado",
        motivo_retorno: result.motivo ?? null,
        xml_retorno: result.xmlRetorno ?? null,
      });

      if (result.sucesso) {
        await atualizarStatusManifestacao({
          nfeId: nf.id,
          status: statusManifestacaoFromEvento(tpEvento),
          dataManifestacao: result.dataRetorno ?? new Date().toISOString(),
        });
        toast.success(`Manifestação registrada — protocolo ${result.protocolo ?? "—"}`);
      } else {
        toast.error(`SEFAZ rejeitou: ${result.motivo ?? "—"}`);
      }
      qc.invalidateQueries({ queryKey: fiscalKeys.nfeDistribuicao() });
    } catch (e) {
      notifyError(e);
    } finally {
      setManifestando(null);
    }
  };

  const handleNaoRealizadaConfirm = async () => {
    if (!naoRealizadaTarget) return;
    if (justNaoRealizada.trim().length < 15 || justNaoRealizada.trim().length > 255) {
      toast.error("Justificativa deve ter de 15 a 255 caracteres.");
      return;
    }
    const target = naoRealizadaTarget;
    const just = justNaoRealizada.trim();
    setNaoRealizadaTarget(null);
    setJustNaoRealizada("");
    await executarManifestacao(target, "210240", just);
  };

  /**
   * Importa um XML autorizado (procNFe ou NFe nua) e faz upsert em
   * `nfe_distribuicao` + `nfe_distribuicao_itens`. Marca xml_importado=true.
   */
  const handleImportarXml = async (file: File) => {
    setImportando(true);
    try {
      const text = await file.text();
      const parsed = parseNFeXml(text);
      await upsertNfeFromXml({
        chave_acesso: parsed.chave,
        cnpj_emitente: parsed.cnpjEmitente,
        nome_emitente: parsed.nomeEmitente,
        numero: parsed.numero || null,
        serie: parsed.serie || null,
        data_emissao: parsed.dataEmissao,
        valor_total: parsed.valorTotal,
        valor_icms: parsed.valorIcms,
        valor_ipi: parsed.valorIpi,
        natureza_operacao: parsed.naturezaOperacao,
        uf_emitente: parsed.ufEmitente,
        ie_emitente: parsed.ieEmitente,
        protocolo: parsed.protocolo,
        xml: text,
        itens: parsed.itens,
      });

      toast.success(
        `XML importado — NF ${parsed.numero}/${parsed.serie} (${parsed.itens.length} ${parsed.itens.length === 1 ? "item" : "itens"})`,
      );
      qc.invalidateQueries({ queryKey: fiscalKeys.nfeDistribuicao() });
    } catch (e) {
      notifyError(e);
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSincronizar = async () => {
    setSincronizando(true);
    try {
      const r = await sincronizarDistDFe("2");
      if (!r.sucesso) {
        toast.error(r.erro ?? `Falha na sincronização (${r.cStat ?? "?"})`);
        return;
      }
      toast.success(
        `Sincronizado: ${r.novos} nova(s), ${r.duplicados} já existente(s). NSU ${r.ultNSU ?? "—"}/${r.maxNSU ?? "—"}`,
      );
      qc.invalidateQueries({ queryKey: fiscalKeys.nfeDistribuicao() });
    } catch (e) {
      notifyError(e);
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5" /> Manifestação do Destinatário
            </SheetTitle>
            <SheetDescription>
              Capture NF-e de fornecedores pela chave de acesso e registre Ciência,
              Confirmação, Desconhecimento ou Operação Não Realizada na SEFAZ.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="default"
                className="gap-2"
                disabled={sincronizando}
                onClick={handleSincronizar}
              >
                {sincronizando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sincronizar SEFAZ (DistDF-e)
              </Button>
              <span className="text-xs text-muted-foreground">
                Baixa automaticamente NF-e novas emitidas contra o CNPJ da empresa
                (Ambiente Nacional, mTLS via certificado A1).
              </span>
              <a
                href="/fiscal/distdfe-historico"
                className="text-xs text-primary hover:underline ml-auto"
              >
                Ver histórico de execuções →
              </a>
            </div>

            {/* Adicionar nova chave */}
            <div className="rounded-md border p-4 space-y-3">
              <Label htmlFor="nova-chave">Capturar NF-e por chave de acesso</Label>
              <div className="flex gap-2">
                <Input
                  id="nova-chave"
                  value={novaChave}
                  onChange={(e) => setNovaChave(e.target.value.replace(/\D/g, "").slice(0, 44))}
                  placeholder="44 dígitos"
                  className="font-mono text-xs"
                />
                <Button
                  onClick={handleAdicionar}
                  disabled={salvando || !chaveValida(novaChave)}
                  className="gap-2"
                >
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {novaChave.replace(/\D/g, "").length}/44 dígitos. Os dados básicos
                (CNPJ emitente, série, número e mês de emissão) são extraídos da chave.
              </p>
              <Separator className="my-2" />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xml,application/xml,text/xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportarXml(f);
                  }}
                />
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={importando}
                  onClick={() => fileRef.current?.click()}
                >
                  {importando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Importar XML autorizado
                </Button>
                <span className="text-xs text-muted-foreground">
                  Enriquece a NF-e com emitente, totais e itens (procNFe ou NFe).
                </span>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="mb-3 text-sm font-semibold">
                NF-e capturadas ({notas.length})
              </h3>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : notas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma NF-e capturada ainda. Adicione uma chave acima.
                </p>
              ) : (
                <ul className="space-y-3">
                  {notas.map((nf) => {
                    const st = STATUS_LABEL[nf.status_manifestacao] ?? STATUS_LABEL.sem_manifestacao;
                    const isLoading = manifestando === nf.id;
                    const isHighlighted = highlightNfeId === nf.id;
                    return (
                      <li
                        key={nf.id}
                        ref={isHighlighted ? highlightRef : undefined}
                        className={
                          "rounded-md border p-3 text-sm transition-colors " +
                          (isHighlighted ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "")
                        }
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">
                              NF {nf.numero ?? "—"}/{nf.serie ?? "—"}{" "}
                              <span className="font-normal text-muted-foreground">
                                · {nf.nome_emitente ?? `CNPJ ${nf.cnpj_emitente ?? "—"}`}
                              </span>
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground break-all">
                              {nf.chave_acesso}
                            </p>
                            {nf.valor_total != null && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Total: {formatCurrency(Number(nf.valor_total))}
                              </p>
                            )}
                            {nf.data_manifestacao && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Manifestada em{" "}
                                {format(new Date(nf.data_manifestacao), "dd/MM/yyyy HH:mm", {
                                  locale: ptBR,
                                })}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant={st.variant}>{st.label}</Badge>
                            {nf.xml_importado && (
                              <Badge variant="secondary" className="text-[10px]">XML</Badge>
                            )}
                            {nf.processado && (
                              <Badge variant="default" className="text-[10px] gap-1">
                                <CheckCheck className="h-3 w-3" /> Processada
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {nf.xml_importado && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setVerItensTarget(nf)}
                              className="gap-1"
                            >
                              <Eye className="h-3 w-3" /> Ver itens
                            </Button>
                          )}
                          {nf.xml_importado &&
                            nf.status_manifestacao === "confirmada" &&
                            !nf.processado && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => setProcessarTarget(nf)}
                                className="gap-1"
                              >
                                <PackagePlus className="h-3 w-3" /> Processar entrada
                              </Button>
                            )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLoading}
                            onClick={() => executarManifestacao(nf, "210210")}
                            className="gap-1"
                          >
                            {isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            Ciência
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            disabled={isLoading}
                            onClick={() => executarManifestacao(nf, "210200")}
                            className="gap-1"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isLoading}
                            onClick={() => executarManifestacao(nf, "210220")}
                            className="gap-1"
                          >
                            <EyeOff className="h-3 w-3" /> Desconhecer
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isLoading}
                            onClick={() => {
                              setNaoRealizadaTarget(nf);
                              setJustNaoRealizada("");
                            }}
                            className="gap-1"
                          >
                            <XCircle className="h-3 w-3" /> Não realizada
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <p className="text-xs text-muted-foreground rounded-md bg-muted/40 p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Após Confirmação ou Operação Não Realizada não é mais possível
              alterar a manifestação. Use Ciência quando ainda for analisar a operação.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!naoRealizadaTarget}
        onOpenChange={(o) => !o && setNaoRealizadaTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Operação Não Realizada</DialogTitle>
            <DialogDescription>
              Informe a justificativa (15 a 255 caracteres). Esta manifestação é
              irreversível e indica formalmente à SEFAZ que a operação não ocorreu.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={justNaoRealizada}
            onChange={(e) => setJustNaoRealizada(e.target.value.slice(0, 255))}
            placeholder="Ex.: Mercadoria não entregue / pedido cancelado pelo comprador antes do faturamento."
          />
          <p className="text-xs text-muted-foreground">
            {justNaoRealizada.trim().length}/255 (mín. 15)
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNaoRealizadaTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleNaoRealizadaConfirm}
              disabled={justNaoRealizada.trim().length < 15}
            >
              Confirmar manifestação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ItensDialog
        nf={verItensTarget}
        onClose={() => setVerItensTarget(null)}
      />

      <ProcessarEntradaDialog
        nf={processarTarget}
        onClose={() => setProcessarTarget(null)}
        onProcessed={() => {
          qc.invalidateQueries({ queryKey: fiscalKeys.nfeDistribuicao() });
          setProcessarTarget(null);
        }}
      />
    </>
  );
}

/**
 * Dialog que carrega e exibe os itens de uma NF-e capturada via XML.
 * Lazy-load: só faz fetch quando aberto.
 */
interface ItensDialogProps {
  nf: NfeCapturada | null;
  onClose: () => void;
}

function ItensDialog({ nf, onClose }: ItensDialogProps) {
  const { data: itens = [], isLoading } = useQuery({
    queryKey: fiscalKeys.nfeDistribuicaoItens(nf?.id),
    queryFn: async (): Promise<NFeXmlItem[]> => {
      if (!nf) return [];
      const rows = await listNfeDistribuicaoItens(nf.id);
      return rows.map((r) => ({
        numero: r.numero_item,
        codigo: r.codigo,
        descricao: r.descricao,
        ncm: r.ncm,
        cfop: r.cfop,
        unidade: r.unidade,
        quantidade: r.quantidade,
        valorUnitario: r.valor_unitario,
        valorTotal: r.valor_total,
      }));
    },
    enabled: !!nf,
  });

  return (
    <Dialog open={!!nf} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Itens da NF {nf?.numero ?? "—"}/{nf?.serie ?? "—"}
          </DialogTitle>
          <DialogDescription>
            {nf?.nome_emitente ?? `CNPJ ${nf?.cnpj_emitente ?? "—"}`} · Total{" "}
            {nf?.valor_total != null ? formatCurrency(Number(nf.valor_total)) : "—"}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Carregando itens…</p>
        ) : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhum item cadastrado.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Descrição</th>
                  <th className="px-2 py-2 text-left">NCM</th>
                  <th className="px-2 py-2 text-left">CFOP</th>
                  <th className="px-2 py-2 text-right">Qtd</th>
                  <th className="px-2 py-2 text-right">Vlr Unit</th>
                  <th className="px-2 py-2 text-right">Vlr Total</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => (
                  <tr key={it.numero} className="border-t">
                    <td className="px-2 py-1.5">{it.numero}</td>
                    <td className="px-2 py-1.5">
                      <div className="font-medium">{it.descricao}</div>
                      {it.codigo && (
                        <div className="text-[10px] text-muted-foreground">cód {it.codigo}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">{it.ncm ?? "—"}</td>
                    <td className="px-2 py-1.5">{it.cfop ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      {it.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}{" "}
                      <span className="text-muted-foreground">{it.unidade ?? ""}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right">{formatCurrency(it.valorUnitario)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(it.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dialog para processar entrada da NF-e: gera 1 título a pagar (consolidado)
 * + movimentações de estoque para os itens já vinculados a um produto.
 * O usuário escolhe fornecedor (sugerido pelo CNPJ emitente), data de
 * vencimento e mapeia produtos por linha de item.
 */
interface ProcessarEntradaProps {
  nf: NfeCapturada | null;
  onClose: () => void;
  onProcessed: () => void;
}

type ItemLinha = NfeDistItemRow;
type ProdutoOpt = ProdutoMinRow;
type FornecedorOpt = FornecedorMinRow;

function ProcessarEntradaDialog({ nf, onClose, onProcessed }: ProcessarEntradaProps) {
  const qc = useQueryClient();
  const [fornecedorId, setFornecedorId] = useState<string>("");
  const [vencimento, setVencimento] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [processando, setProcessando] = useState(false);

  // Reset quando troca de NF
  if (nf && !fornecedorId && nf) {
    // intentionally noop — initialization handled by useQuery onSuccess via select default
  }

  const { data: fornecedores = [] } = useQuery({
    queryKey: fiscalKeys.fornecedoresAtivosMin(),
    queryFn: () => listFornecedoresAtivosMin(),
    enabled: !!nf,
  });

  const { data: produtos = [] } = useQuery({
    queryKey: fiscalKeys.produtosAtivosMin(),
    queryFn: () => listProdutosAtivosMin(),
    enabled: !!nf,
  });

  const { data: itens = [], refetch: refetchItens } = useQuery({
    queryKey: fiscalKeys.nfeDistItensMapear(nf?.id),
    queryFn: async (): Promise<ItemLinha[]> => {
      if (!nf) return [];
      return listNfeDistribuicaoItens(nf.id);
    },
    enabled: !!nf,
  });

  // Sugere fornecedor pelo CNPJ emitente quando lista carrega
  if (
    nf?.cnpj_emitente &&
    !fornecedorId &&
    fornecedores.length > 0
  ) {
    const cnpjLimpo = nf.cnpj_emitente.replace(/\D/g, "");
    const match = fornecedores.find(
      (f) => (f.cpf_cnpj ?? "").replace(/\D/g, "") === cnpjLimpo,
    );
    if (match) {
      // setState dentro do render é seguro aqui pois é condicional e converge.
      setTimeout(() => setFornecedorId(match.id), 0);
    }
  }

  const handleMapearProduto = async (itemId: string, produtoId: string | null) => {
    try {
      await mapearProdutoNfeItem(itemId, produtoId);
      refetchItens();
    } catch (error) {
      notifyError(error);
    }
  };

  const itensComProduto = itens.filter((i) => i.produto_id).length;

  const handleProcessar = async () => {
    if (!nf || !fornecedorId) return;
    setProcessando(true);
    try {
      const r = await processarNfeDistribuicao({
        nfeId: nf.id,
        fornecedorId,
        dataVencimento: vencimento,
      });
      toast.success(
        `Entrada processada — ${r.itens_processados ?? 0}/${r.itens_total ?? 0} itens em estoque, 1 título a pagar gerado.`,
        r.itens_sem_produto && r.itens_sem_produto > 0
          ? { description: `${r.itens_sem_produto} item(ns) ficaram sem produto e não foram lançados em estoque.` }
          : undefined,
      );
      qc.invalidateQueries({ queryKey: ["financeiro_lancamentos"] });
      qc.invalidateQueries({ queryKey: ["estoque_movimentos"] });
      onProcessed();
      setFornecedorId("");
    } catch (e) {
      notifyError(e);
    } finally {
      setProcessando(false);
    }
  };

  return (
    <Dialog open={!!nf} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5" />
            Processar entrada — NF {nf?.numero ?? "—"}/{nf?.serie ?? "—"}
          </DialogTitle>
          <DialogDescription>
            Mapeie os produtos do XML para itens do seu cadastro e confirme para
            gerar o título a pagar e a movimentação de estoque.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fornecedor">Fornecedor</Label>
              <Select value={fornecedorId} onValueChange={setFornecedorId}>
                <SelectTrigger id="fornecedor">
                  <SelectValue placeholder="Selecione o fornecedor…" />
                </SelectTrigger>
                <SelectContent>
                  {fornecedores.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome_fantasia ?? f.nome_razao_social ?? "—"}
                      {f.cpf_cnpj ? ` · ${f.cpf_cnpj}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {nf?.cnpj_emitente && (
                <p className="text-[11px] text-muted-foreground">
                  Sugerido pelo CNPJ emitente {nf.cnpj_emitente}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="vencimento">Data de vencimento</Label>
              <Input
                id="vencimento"
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border max-h-[40vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Descrição</th>
                  <th className="px-2 py-2 text-right">Qtd</th>
                  <th className="px-2 py-2 text-right">Valor</th>
                  <th className="px-2 py-2 text-left">Produto cadastrado</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => (
                  <tr key={it.id} className="border-t align-top">
                    <td className="px-2 py-1.5">{it.numero_item}</td>
                    <td className="px-2 py-1.5">
                      <div>{it.descricao}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {it.ncm && `NCM ${it.ncm}`} {it.cfop && `· CFOP ${it.cfop}`}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {it.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-2 py-1.5 text-right">{formatCurrency(it.valor_total)}</td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={it.produto_id ?? "__none__"}
                        onValueChange={(v) =>
                          handleMapearProduto(it.id, v === "__none__" ? null : v)
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="— sem mapeamento —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— sem mapeamento —</SelectItem>
                          {produtos.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.sku ? `${p.sku} — ` : ""}{p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            {itensComProduto}/{itens.length} itens com produto mapeado. Itens sem
            mapeamento não geram movimentação de estoque, mas o título a pagar
            usa o valor total da nota.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={processando}>
            Cancelar
          </Button>
          <Button
            onClick={handleProcessar}
            disabled={!fornecedorId || processando}
            className="gap-2"
          >
            {processando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Processar entrada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
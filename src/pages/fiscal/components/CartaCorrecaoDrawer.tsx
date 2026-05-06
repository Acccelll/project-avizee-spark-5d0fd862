import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { enviarCartaCorrecao, resolverUrlSefaz } from "@/services/fiscal/sefaz";
import { registrarEventoFiscal } from "@/services/fiscal.service";
import {
  getEmpresaSefazContext,
  listCCeHistorico,
  registrarEventoCCe,
} from "@/services/fiscal/manifestacao.repository";
import { fiscalKeys } from "@/lib/queryKeys/fiscal";
import { notifyError } from "@/utils/errorMessages";
import type { NotaFiscal } from "@/types/domain";

interface CartaCorrecaoDrawerProps {
  nf: NotaFiscal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_CCE = 20;
const MIN_LEN = 15;
const MAX_LEN = 1000;

export function CartaCorrecaoDrawer({ nf, open, onOpenChange }: CartaCorrecaoDrawerProps) {
  const qc = useQueryClient();
  const [correcao, setCorrecao] = useState("");
  const [enviando, setEnviando] = useState(false);

  const { data: historico = [], isLoading } = useQuery({
    queryKey: fiscalKeys.cceHistorico(nf.id),
    queryFn: () => listCCeHistorico(nf.id),
    enabled: open,
  });

  const proximaSeq = (historico[0]?.sequencia ?? 0) + 1;
  const podeEnviar =
    nf.status_sefaz === "autorizada" &&
    !!nf.chave_acesso &&
    proximaSeq <= MAX_CCE &&
    correcao.trim().length >= MIN_LEN &&
    correcao.length <= MAX_LEN;

  const handleEnviar = async () => {
    if (!nf.chave_acesso) {
      toast.error("NF sem chave de acesso.");
      return;
    }
    setEnviando(true);
    try {
      const ctx = await getEmpresaSefazContext({ requireUf: true });
      const url = resolverUrlSefaz(ctx.uf, ctx.ambiente, "evento");
      const result = await enviarCartaCorrecao(
        {
          chave: nf.chave_acesso,
          correcao: correcao.trim(),
          cnpjEmitente: ctx.cnpj,
          sequencia: proximaSeq,
          ambiente: ctx.ambiente,
        },
        { tipo: "A1", conteudo: "", senha: "" },
        url,
      );

      await registrarEventoCCe({
        nota_fiscal_id: nf.id,
        sequencia: proximaSeq,
        correcao: correcao.trim(),
        protocolo: result.protocolo ?? null,
        data_evento: result.dataRetorno ?? null,
        status_sefaz: result.sucesso ? "autorizado" : "rejeitado",
        motivo_retorno: result.motivo ?? null,
        xml_retorno: result.xmlRetorno ?? null,
      });

      await registrarEventoFiscal({
        nota_fiscal_id: nf.id,
        tipo_evento: result.sucesso ? "cce_autorizada" : "cce_rejeitada",
        descricao: `CC-e #${proximaSeq}: ${correcao.trim().slice(0, 80)}`,
        payload_resumido: { protocolo: result.protocolo, motivo: result.motivo },
      });

      if (result.sucesso) {
        toast.success(`CC-e #${proximaSeq} autorizada — protocolo ${result.protocolo}`);
        setCorrecao("");
      } else {
        toast.error(`SEFAZ rejeitou: ${result.motivo ?? "—"}`);
      }
      qc.invalidateQueries({ queryKey: fiscalKeys.cceHistorico(nf.id) });
    } catch (e) {
      notifyError(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Carta de Correção (CC-e)
          </SheetTitle>
          <SheetDescription>
            Permite corrigir erros não relacionados a impostos, dados cadastrais
            do emitente/destinatário ou data de emissão. Máx. {MAX_CCE} por NF.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {nf.status_sefaz !== "autorizada" && (
            <p className="rounded-md bg-warning/10 p-3 text-sm text-warning-foreground">
              CC-e só é permitida para NF-e autorizada pela SEFAZ.
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="cce-texto">Texto da correção (sequência #{proximaSeq})</Label>
              <span className="text-xs text-muted-foreground">
                {correcao.length}/{MAX_LEN} (mín. {MIN_LEN})
              </span>
            </div>
            <Textarea
              id="cce-texto"
              rows={6}
              value={correcao}
              onChange={(e) => setCorrecao(e.target.value.slice(0, MAX_LEN))}
              placeholder="Descreva a correção a ser aplicada (ex: corrigir CFOP do item 2, número da NF de referência, etc)"
              disabled={nf.status_sefaz !== "autorizada" || proximaSeq > MAX_CCE}
            />
            <p className="text-xs text-muted-foreground">
              Não pode corrigir: valor de impostos, alíquotas, dados cadastrais que
              mudem emitente/destinatário, ou data de emissão/saída.
            </p>
          </div>

          <Button
            className="w-full gap-2"
            disabled={!podeEnviar || enviando}
            onClick={handleEnviar}
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Transmitir CC-e à SEFAZ
          </Button>

          <Separator />

          <div>
            <h3 className="mb-3 text-sm font-semibold">Histórico ({historico.length}/{MAX_CCE})</h3>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : historico.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma CC-e enviada ainda.</p>
            ) : (
              <ul className="space-y-3">
                {historico.map((ev) => (
                  <li key={ev.id} className="rounded-md border p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium">CC-e #{ev.sequencia}</span>
                      <Badge variant={ev.status_sefaz === "autorizado" ? "default" : "destructive"}>
                        {ev.status_sefaz}
                      </Badge>
                    </div>
                    <p className="mb-2 whitespace-pre-wrap text-muted-foreground">{ev.correcao}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {ev.protocolo && <span>Protocolo: {ev.protocolo}</span>}
                      <span>
                        {format(new Date(ev.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                      {ev.motivo_retorno && <span>{ev.motivo_retorno}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
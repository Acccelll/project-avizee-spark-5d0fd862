import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Ban } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { inutilizarNumeracao, resolverUrlSefaz } from "@/services/fiscal/sefaz";
import {
  getEmpresaSefazContext,
  listInutilizacoesHistorico,
  registrarInutilizacao,
} from "@/services/fiscal/manifestacao.repository";
import { fiscalKeys } from "@/lib/queryKeys/fiscal";
import { notifyError } from "@/utils/errorMessages";

interface InutilizacaoDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InutilizacaoDrawer({ open, onOpenChange }: InutilizacaoDrawerProps) {
  const qc = useQueryClient();
  const [serie, setSerie] = useState("1");
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [numIni, setNumIni] = useState("");
  const [numFim, setNumFim] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);

  const { data: historico = [], isLoading } = useQuery({
    queryKey: fiscalKeys.inutilizacoesHistorico(),
    queryFn: () => listInutilizacoesHistorico(),
    enabled: open,
  });

  const ini = Number(numIni);
  const fim = Number(numFim);
  const podeEnviar =
    Number(serie) > 0 &&
    Number(ano) >= 2000 &&
    ini > 0 &&
    fim >= ini &&
    justificativa.trim().length >= 15;

  const handleEnviar = async () => {
    setEnviando(true);
    try {
      const ctx = await getEmpresaSefazContext({ requireUf: true });
      const url = resolverUrlSefaz(ctx.uf, ctx.ambiente, "inutilizacao");
      const result = await inutilizarNumeracao(
        {
          cnpj: ctx.cnpj,
          ano: Number(ano),
          serie: Number(serie),
          numInicial: ini,
          numFinal: fim,
          justificativa: justificativa.trim(),
          uf: ctx.uf,
          ambiente: ctx.ambiente,
        },
        { tipo: "A1", conteudo: "", senha: "" },
        url,
      );

      await registrarInutilizacao({
        serie: Number(serie),
        ano: Number(ano),
        numero_inicial: ini,
        numero_final: fim,
        justificativa: justificativa.trim(),
        protocolo: result.protocolo ?? null,
        data_evento: result.dataRetorno ?? null,
        status_sefaz: result.sucesso ? "autorizado" : "rejeitado",
        motivo_retorno: result.motivo ?? null,
      });

      if (result.sucesso) {
        toast.success(`Faixa ${ini}-${fim} inutilizada — protocolo ${result.protocolo}`);
        setNumIni("");
        setNumFim("");
        setJustificativa("");
      } else {
        toast.error(`SEFAZ rejeitou: ${result.motivo ?? "—"}`);
      }
      qc.invalidateQueries({ queryKey: fiscalKeys.inutilizacoesHistorico() });
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
            <Ban className="h-5 w-5" /> Inutilizar numeração NF-e
          </SheetTitle>
          <SheetDescription>
            Use para descartar uma faixa de numeração que <strong>não foi
            autorizada</strong> pela SEFAZ (ex: salto de número por erro). Os
            números inutilizados não podem ser reaproveitados.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inu-serie">Série</Label>
              <Input id="inu-serie" type="number" value={serie} onChange={(e) => setSerie(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="inu-ano">Ano</Label>
              <Input id="inu-ano" type="number" value={ano} onChange={(e) => setAno(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="inu-ini">Nº inicial</Label>
              <Input id="inu-ini" type="number" value={numIni} onChange={(e) => setNumIni(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="inu-fim">Nº final</Label>
              <Input id="inu-fim" type="number" value={numFim} onChange={(e) => setNumFim(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="inu-just">Justificativa</Label>
              <span className="text-xs text-muted-foreground">{justificativa.length}/15 mín.</span>
            </div>
            <Textarea
              id="inu-just"
              rows={4}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Motivo da inutilização (mín. 15 caracteres)"
            />
          </div>

          <Button className="w-full gap-2" disabled={!podeEnviar || enviando} onClick={handleEnviar}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Transmitir inutilização
          </Button>

          <Separator />

          <div>
            <h3 className="mb-3 text-sm font-semibold">Histórico</h3>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : historico.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma inutilização registrada.</p>
            ) : (
              <ul className="space-y-2">
                {historico.map((it) => (
                  <li key={it.id} className="rounded-md border p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium">
                        Série {it.serie} • {it.numero_inicial}–{it.numero_final} ({it.ano})
                      </span>
                      <Badge variant={it.status_sefaz === "autorizado" ? "default" : "destructive"}>
                        {it.status_sefaz}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{it.justificativa}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                      {it.protocolo && <span>Protocolo: {it.protocolo}</span>}
                      <span>
                        {format(new Date(it.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
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
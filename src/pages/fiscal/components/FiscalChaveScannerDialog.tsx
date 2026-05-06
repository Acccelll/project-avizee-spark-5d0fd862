/**
 * FiscalChaveScannerDialog
 *
 * Lê a chave de acesso de uma NF-e (CODE-128 do DANFE) ou NFC-e (QR Code)
 * por três caminhos: digitar/colar, câmera ao vivo e upload de imagem.
 *
 * Princípio: este componente NÃO consulta SEFAZ nem importa XML. Apenas
 * obtém e valida a chave. Após detecção bem-sucedida, exibe um resumo e
 * delega para os fluxos canônicos:
 *   - "Consultar situação" → callback `onConsultarSituacao(chave)` que deve
 *     usar NFeConsultaProtocolo4 (sem assinar `infNFe`).
 *   - "Buscar XML via DistDFe" → callback `onBuscarXml(chave)` que abre o
 *     `BuscarPorChaveDialog` (NFeDistribuicaoDFe / consChNFe).
 *
 * Lib de leitura: `@zxing/browser` (BrowserMultiFormatReader) — cobre
 * CODE-128 e QR-Code em uma única lib, sem WASM, MIT.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ImageUp,
  KeyRound,
  Loader2,
  ScanLine,
  X,
  AlertTriangle,
  CheckCircle2,
  Search,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormModal } from "@/components/FormModal";
import {
  lerChaveDeEntrada,
  type ChaveAcessoExtracao,
} from "@/services/fiscal/chaveAcesso.parser";

interface FiscalChaveScannerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Chamado quando o usuário clica "Consultar situação" — NFeConsultaProtocolo4. */
  onConsultarSituacao?: (chave: string) => void;
  /** Chamado quando o usuário clica "Buscar XML via DistDFe". */
  onBuscarXml?: (chave: string) => void;
}

type Tab = "digitar" | "camera" | "upload";

export function FiscalChaveScannerDialog({
  open,
  onClose,
  onConsultarSituacao,
  onBuscarXml,
}: FiscalChaveScannerDialogProps) {
  const [tab, setTab] = useState<Tab>("digitar");
  const [textoBruto, setTextoBruto] = useState("");
  const [resultado, setResultado] = useState<ChaveAcessoExtracao | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  // Câmera
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [iniciandoCamera, setIniciandoCamera] = useState(false);

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      pararCamera();
      setTextoBruto("");
      setResultado(null);
      setErroLeitura(null);
      setTab("digitar");
    }
  }, [open]);

  const pararCamera = () => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* ignora */
    }
    controlsRef.current = null;
    setCameraAtiva(false);
  };

  const aplicarConteudo = (conteudo: string) => {
    const lido = lerChaveDeEntrada(conteudo);
    if (!lido) {
      setResultado(null);
      setErroLeitura(
        "Conteúdo lido, mas não foi possível extrair uma chave de acesso válida (44 dígitos com DV).",
      );
      return false;
    }
    setResultado(lido);
    setErroLeitura(null);
    return true;
  };

  // ── Câmera ────────────────────────────────────────────────────
  const iniciarCamera = async () => {
    setErroLeitura(null);
    setResultado(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErroLeitura("Este navegador não suporta acesso à câmera.");
      return;
    }
    // Hints: focar nos formatos do DANFE/NFC-e e ativar TRY_HARDER.
    // CODE-128 de 44 dígitos é longo e exige mais esforço de decodificação.
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.ITF,
      BarcodeFormat.DATA_MATRIX,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 80,
      delayBetweenScanSuccess: 400,
    });
    setIniciandoCamera(true);
    try {
      // Pede a maior resolução viável — CODE-128 longo precisa de muitos
      // pixels para que cada barra fina seja distinguível.
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        setIniciandoCamera(false);
        return;
      }
      const controls = await reader.decodeFromStream(
        stream,
        videoRef.current,
        (result, _err, ctrl) => {
          if (result) {
            const texto = result.getText();
            const ok = aplicarConteudo(texto);
            if (ok) {
              ctrl.stop();
              setCameraAtiva(false);
              toast.success("Chave detectada.");
            }
          }
        },
      );
      controlsRef.current = controls;
      setCameraAtiva(true);
    } catch (e) {
      const err = e as Error;
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErroLeitura(
          "Permissão de câmera negada. Habilite o acesso nas configurações do navegador e tente novamente.",
        );
      } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        setErroLeitura("Nenhuma câmera disponível neste dispositivo.");
      } else {
        setErroLeitura(`Falha ao iniciar câmera: ${err.message}`);
      }
    } finally {
      setIniciandoCamera(false);
    }
  };

  // Para câmera quando trocar de tab
  useEffect(() => {
    if (tab !== "camera") pararCamera();
  }, [tab]);

  // ── Upload ────────────────────────────────────────────────────
  const handleArquivo = async (file: File) => {
    setErroLeitura(null);
    setResultado(null);
    if (file.type === "application/pdf") {
      setErroLeitura(
        "PDF ainda não suportado diretamente. Envie um print/foto do DANFE (PNG/JPG) ou cole a chave manualmente.",
      );
      return;
    }
    if (!file.type.startsWith("image/")) {
      setErroLeitura("Envie um arquivo de imagem (PNG, JPG, WEBP).");
      return;
    }
    setProcessando(true);
    try {
      const url = URL.createObjectURL(file);
      try {
        const reader = new BrowserMultiFormatReader();
        const result = await reader.decodeFromImageUrl(url);
        const ok = aplicarConteudo(result.getText());
        if (ok) toast.success("Chave detectada na imagem.");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErroLeitura(
        `Não foi possível detectar código de barras/QR Code na imagem (${msg}). ` +
          `Tente uma foto mais nítida e bem iluminada do DANFE.`,
      );
    } finally {
      setProcessando(false);
    }
  };

  // ── Digitar/Colar ─────────────────────────────────────────────
  const handleAplicarTexto = () => {
    if (!textoBruto.trim()) {
      setErroLeitura("Cole a chave, URL do QR Code ou conteúdo lido.");
      return;
    }
    aplicarConteudo(textoBruto);
  };

  const handleClose = () => {
    pararCamera();
    onClose();
  };

  const podeAcionarCtas = !!resultado;

  const resumo = useMemo(() => {
    if (!resultado) return null;
    const { chave, tipo, info } = resultado;
    return { chave, tipo, info };
  }, [resultado]);

  return (
    <FormModal
      open={open}
      onClose={handleClose}
      title="Ler chave por código de barras / QR Code"
      size="md"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Fechar
          </Button>
          <Button
            variant="secondary"
            disabled={!podeAcionarCtas || !onBuscarXml}
            onClick={() => resultado && onBuscarXml?.(resultado.chave)}
            className="gap-2"
            title="NFeDistribuicaoDFe (consChNFe) — só retorna XML destinado ao CNPJ do certificado."
          >
            <Download className="h-4 w-4" />
            Buscar XML (DistDFe)
          </Button>
          <Button
            disabled={!podeAcionarCtas || !onConsultarSituacao}
            onClick={() => resultado && onConsultarSituacao?.(resultado.chave)}
            className="gap-2"
            title="NFeConsultaProtocolo4 — situação atual e protocolo."
          >
            <Search className="h-4 w-4" />
            Consultar situação
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="digitar" className="gap-1.5">
              <KeyRound className="h-4 w-4" /> Digitar
            </TabsTrigger>
            <TabsTrigger value="camera" className="gap-1.5">
              <Camera className="h-4 w-4" /> Câmera
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-1.5">
              <ImageUp className="h-4 w-4" /> Imagem
            </TabsTrigger>
          </TabsList>

          <TabsContent value="digitar" className="space-y-3 pt-3">
            <Label htmlFor="chave-bruta" className="text-sm">
              Chave (44 dígitos), URL de QR Code NFC-e ou texto contendo a chave
            </Label>
            <Input
              id="chave-bruta"
              value={textoBruto}
              onChange={(e) => setTextoBruto(e.target.value)}
              placeholder="ex.: 35260412345678000190550010000000011000000019 ou https://www.nfce.fazenda.sp.gov.br/qrcode?p=..."
              className="font-mono text-xs"
            />
            <Button onClick={handleAplicarTexto} className="gap-2">
              <ScanLine className="h-4 w-4" /> Extrair chave
            </Button>
          </TabsContent>

          <TabsContent value="camera" className="space-y-3 pt-3">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
              />
              {!cameraAtiva && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
                  Câmera desligada
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              {cameraAtiva ? (
                <Button variant="outline" onClick={pararCamera} className="gap-2">
                  <X className="h-4 w-4" /> Parar câmera
                </Button>
              ) : (
                <Button onClick={iniciarCamera} disabled={iniciandoCamera} className="gap-2">
                  {iniciandoCamera ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Iniciando…
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4" /> Iniciar câmera
                    </>
                  )}
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Aponte para o código de barras (NF-e) ou QR Code (NFC-e) do DANFE.
              Para CODE-128 longo do DANFE, mantenha a câmera <strong>paralela</strong>
              ao código, com boa iluminação e a barra ocupando toda a largura do quadro.
              Em celular, a câmera traseira é selecionada automaticamente.
            </p>
          </TabsContent>

          <TabsContent value="upload" className="space-y-3 pt-3">
            <Label htmlFor="img-upload" className="text-sm">
              Imagem do DANFE (PNG, JPG, WEBP)
            </Label>
            <Input
              id="img-upload"
              type="file"
              accept="image/*"
              disabled={processando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleArquivo(f);
              }}
            />
            {processando && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando imagem…
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Envie um print ou foto nítida do DANFE. PDFs ainda não são lidos
              diretamente — gere uma imagem ou cole a chave manualmente.
            </p>
          </TabsContent>
        </Tabs>

        {erroLeitura && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{erroLeitura}</span>
          </div>
        )}

        {resumo && (
          <div className="rounded-md border border-success/30 bg-success/5 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" /> Chave válida
              <Badge variant={resumo.tipo === "NF-e" ? "default" : "secondary"} className="ml-1">
                {resumo.tipo}
              </Badge>
            </div>
            <div className="font-mono break-all text-foreground">{resumo.chave}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-muted-foreground">
              <div><span className="font-medium text-foreground">UF:</span> {resumo.info.uf}</div>
              <div><span className="font-medium text-foreground">Modelo:</span> {resumo.info.modelo}</div>
              <div><span className="font-medium text-foreground">Série:</span> {resumo.info.serie}</div>
              <div><span className="font-medium text-foreground">Número:</span> {resumo.info.numero}</div>
              <div className="col-span-2"><span className="font-medium text-foreground">CNPJ emitente:</span> {resumo.info.cnpj}</div>
              <div><span className="font-medium text-foreground">Ano/mês:</span> {resumo.info.anoMes}</div>
              <div><span className="font-medium text-foreground">tpEmis:</span> {resumo.info.tipoEmissao}</div>
            </div>
            <p className="text-[11px] text-muted-foreground italic pt-1">
              A leitura apenas obtém a chave. Use os botões abaixo para consultar
              situação na SEFAZ ou tentar baixar o XML via DistDFe.
            </p>
          </div>
        )}
      </div>
    </FormModal>
  );
}
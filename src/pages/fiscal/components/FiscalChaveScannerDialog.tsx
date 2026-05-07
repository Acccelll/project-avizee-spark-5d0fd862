/**
 * FiscalChaveScannerDialog
 *
 * Lê a chave de acesso de uma NF-e (CODE-128 do DANFE) ou NFC-e (QR Code)
 * por três caminhos: digitar/colar, câmera ao vivo e upload de imagem.
 *
 * Toda a lógica de câmera/decodificação foi extraída para `useQrScanner`.
 * Este componente apenas orquestra UI e delega callbacks finais.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Aperture,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormModal } from "@/components/FormModal";
import {
  lerChaveDeEntrada,
  type ChaveAcessoExtracao,
} from "@/services/fiscal/chaveAcesso.parser";
import { useQrScanner } from "@/pages/fiscal/hooks/useQrScanner";

interface FiscalChaveScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onConsultarSituacao?: (chave: string) => void;
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
  const fotoInputRef = useRef<HTMLInputElement | null>(null);

  const aplicarConteudo = (conteudo: string, sucessoToast?: string) => {
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
    if (sucessoToast) toast.success(sucessoToast);
    return true;
  };

  const scanner = useQrScanner({
    onDetect: (texto) => aplicarConteudo(texto, "Chave detectada."),
    onError: (m) => setErroLeitura(m),
  });

  const {
    videoRef,
    cameraAtiva,
    iniciandoCamera,
    capturandoFoto,
    processandoArquivo,
    camerasDisponiveis,
    cameraSelecionadaId,
    iniciarCamera,
    selecionarCamera,
    pararCamera,
    tirarFoto,
    decodificarArquivo,
    carregarCameras,
    reset,
  } = scanner;

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      reset();
      setTextoBruto("");
      setResultado(null);
      setErroLeitura(null);
      setTab("digitar");
    }
  }, [open, reset]);

  // Para câmera ao trocar de tab
  useEffect(() => {
    if (tab !== "camera") pararCamera();
  }, [tab, pararCamera]);

  useEffect(() => {
    if (!open || tab !== "camera") return;
    void carregarCameras();
  }, [open, tab, carregarCameras]);

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

  const abrirCapturaNativa = () => fotoInputRef.current?.click();

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
            {camerasDisponiveis.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="camera-select" className="text-sm">
                  Câmera
                </Label>
                <Select value={cameraSelecionadaId} onValueChange={selecionarCamera}>
                  <SelectTrigger id="camera-select">
                    <SelectValue placeholder="Selecione uma câmera" />
                  </SelectTrigger>
                  <SelectContent>
                    {camerasDisponiveis.map((camera) => (
                      <SelectItem key={camera.deviceId} value={camera.deviceId}>
                        {camera.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                autoPlay
              />
              {!cameraAtiva && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
                  Câmera desligada
                </div>
              )}
            </div>
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void decodificarArquivo(f);
                e.currentTarget.value = "";
              }}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={cameraAtiva ? tirarFoto : abrirCapturaNativa}
                disabled={capturandoFoto || processandoArquivo}
                className="gap-2"
                title={
                  cameraAtiva
                    ? "Captura um quadro da câmera e tenta decodificar."
                    : "Abre a câmera do aparelho para tirar uma foto e tentar ler o código."
                }
              >
                {capturandoFoto || processandoArquivo ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Analisando…
                  </>
                ) : (
                  <>
                    <Aperture className="h-4 w-4" /> Tirar foto
                  </>
                )}
              </Button>

              {cameraAtiva ? (
                <Button variant="outline" onClick={() => pararCamera()} className="gap-2">
                  <X className="h-4 w-4" /> Parar câmera
                </Button>
              ) : (
                <Button onClick={() => void iniciarCamera()} disabled={iniciandoCamera} className="gap-2">
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
              Em celular, se o ao vivo falhar, use <strong>Tirar foto</strong> para abrir a câmera nativa do aparelho.
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
              disabled={processandoArquivo}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void decodificarArquivo(f);
              }}
            />
            {processandoArquivo && (
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

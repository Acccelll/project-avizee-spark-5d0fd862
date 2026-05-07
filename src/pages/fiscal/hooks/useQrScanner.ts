import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

export interface UseQrScannerOptions {
  /** Callback chamado quando o decoder produz texto (câmera, foto, upload). */
  onDetect: (text: string) => void;
  /** Callback chamado para mensagens de erro legíveis ao usuário. */
  onError?: (message: string) => void;
}

export interface UseQrScannerApi {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  cameraAtiva: boolean;
  iniciandoCamera: boolean;
  capturandoFoto: boolean;
  processandoArquivo: boolean;
  camerasDisponiveis: CameraDeviceOption[];
  cameraSelecionadaId: string;
  iniciarCamera: (deviceIdPreferido?: string) => Promise<void>;
  selecionarCamera: (deviceId: string) => void;
  pararCamera: () => void;
  tirarFoto: () => Promise<void>;
  decodificarArquivo: (file: File) => Promise<void>;
  carregarCameras: () => Promise<CameraDeviceOption[]>;
  reset: () => void;
}

function criarHints() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.ITF,
    BarcodeFormat.DATA_MATRIX,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return hints;
}

function montarVideoConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    ...(deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: { ideal: "environment" } }),
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
}

function escolherCameraPadrao(devices: CameraDeviceOption[]) {
  if (!devices.length) return "";
  const traseira = devices.find((d) =>
    /back|rear|environment|traseira/i.test(d.label),
  );
  return traseira?.deviceId ?? devices[0].deviceId;
}

/**
 * Hook que encapsula leitura de QR Code / Code-128 via câmera, foto in-place
 * ou upload de imagem. Cobre permissões iOS (NotAllowed/NotReadable) e
 * fallback de câmera traseira.
 */
export function useQrScanner({ onDetect, onError }: UseQrScannerOptions): UseQrScannerApi {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [iniciandoCamera, setIniciandoCamera] = useState(false);
  const [capturandoFoto, setCapturandoFoto] = useState(false);
  const [processandoArquivo, setProcessandoArquivo] = useState(false);
  const [camerasDisponiveis, setCamerasDisponiveis] = useState<CameraDeviceOption[]>([]);
  const [cameraSelecionadaId, setCameraSelecionadaId] = useState("");

  const emitErro = useCallback((m: string) => onError?.(m), [onError]);

  const pararCamera = useCallback((preservarCarregando = false) => {
    try { controlsRef.current?.stop(); } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    controlsRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraAtiva(false);
    if (!preservarCarregando) setIniciandoCamera(false);
  }, []);

  const carregarCameras = useCallback(async (): Promise<CameraDeviceOption[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCamerasDisponiveis([]);
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices
      .filter((d) => d.kind === "videoinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label?.trim() || `Câmera ${i + 1}`,
      }));
    setCamerasDisponiveis(cameras);
    setCameraSelecionadaId((atual) => {
      if (atual && cameras.some((c) => c.deviceId === atual)) return atual;
      return escolherCameraPadrao(cameras);
    });
    return cameras;
  }, []);

  const iniciarCamera = useCallback(async (deviceIdPreferido?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      emitErro("Este navegador não suporta acesso à câmera.");
      return;
    }
    const reader = new BrowserMultiFormatReader(criarHints(), {
      delayBetweenScanAttempts: 80,
      delayBetweenScanSuccess: 400,
    });
    setIniciandoCamera(true);
    pararCamera(true);
    try {
      const constraints: MediaStreamConstraints = {
        video: montarVideoConstraints(deviceIdPreferido || cameraSelecionadaId || undefined),
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (!videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        setIniciandoCamera(false);
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);

      const carregarPromise = carregarCameras();
      const controls = await reader.decodeFromStream(
        stream,
        videoRef.current,
        (result, _err, ctrl) => {
          if (result) {
            const texto = result.getText();
            ctrl.stop();
            setCameraAtiva(false);
            onDetect(texto);
          }
        },
      );
      controlsRef.current = controls;
      setCameraAtiva(true);

      const cameras = await carregarPromise;
      const cameraAtualId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
      if (cameraAtualId && cameras.some((c) => c.deviceId === cameraAtualId)) {
        setCameraSelecionadaId(cameraAtualId);
      } else if (!cameraSelecionadaId && cameras.length) {
        setCameraSelecionadaId(escolherCameraPadrao(cameras));
      }
    } catch (e) {
      const err = e as Error;
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        emitErro("Permissão de câmera negada. Habilite o acesso nas configurações do navegador e tente novamente.");
      } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        if (deviceIdPreferido || cameraSelecionadaId) {
          setCameraSelecionadaId("");
          emitErro("Não foi possível abrir essa câmera. Tente outra opção ou use Tirar foto.");
        } else {
          emitErro("Nenhuma câmera disponível neste dispositivo.");
        }
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        emitErro("Câmera ocupada por outro app. Feche outras abas/apps que usam a câmera e tente novamente.");
      } else if (err.name === "SecurityError") {
        emitErro("Acesso à câmera bloqueado. Abra esta página em HTTPS e permita o acesso.");
      } else {
        emitErro(`Falha ao iniciar câmera: ${err.message}`);
      }
    } finally {
      setIniciandoCamera(false);
    }
  }, [cameraSelecionadaId, carregarCameras, emitErro, onDetect, pararCamera]);

  const selecionarCamera = useCallback((deviceId: string) => {
    setCameraSelecionadaId(deviceId);
    if (cameraAtiva || iniciandoCamera) {
      void iniciarCamera(deviceId);
    }
  }, [cameraAtiva, iniciandoCamera, iniciarCamera]);

  const tirarFoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !cameraAtiva) {
      emitErro("Inicie a câmera antes de tirar foto.");
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      emitErro("Câmera ainda não está pronta. Aguarde alguns instantes.");
      return;
    }
    setCapturandoFoto(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas indisponível");
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/png");
      const reader = new BrowserMultiFormatReader(criarHints());
      const result = await reader.decodeFromImageUrl(dataUrl);
      pararCamera();
      onDetect(result.getText());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      emitErro(
        `Não foi possível ler o código na foto (${msg}). ` +
          `Aproxime mais, mantenha a câmera paralela ao código e tente novamente.`,
      );
    } finally {
      setCapturandoFoto(false);
    }
  }, [cameraAtiva, emitErro, onDetect, pararCamera]);

  const decodificarArquivo = useCallback(async (file: File) => {
    if (file.type === "application/pdf") {
      emitErro("PDF ainda não suportado diretamente. Envie um print/foto do DANFE (PNG/JPG) ou cole a chave manualmente.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      emitErro("Envie um arquivo de imagem (PNG, JPG, WEBP).");
      return;
    }
    setProcessandoArquivo(true);
    try {
      const url = URL.createObjectURL(file);
      try {
        const reader = new BrowserMultiFormatReader(criarHints());
        const result = await reader.decodeFromImageUrl(url);
        onDetect(result.getText());
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      emitErro(
        `Não foi possível detectar código de barras/QR Code na imagem (${msg}). ` +
          `Tente uma foto mais nítida e bem iluminada do DANFE.`,
      );
    } finally {
      setProcessandoArquivo(false);
    }
  }, [emitErro, onDetect]);

  const reset = useCallback(() => {
    pararCamera();
  }, [pararCamera]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => { pararCamera(); };
  }, [pararCamera]);

  return {
    videoRef,
    cameraAtiva,
    iniciandoCamera,
    capturandoFoto,
    processandoArquivo,
    camerasDisponiveis,
    cameraSelecionadaId,
    iniciarCamera,
    selecionarCamera,
    pararCamera: () => pararCamera(),
    tirarFoto,
    decodificarArquivo,
    carregarCameras,
    reset,
  };
}

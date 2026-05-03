/**
 * InstallPwaButton — captura o evento `beforeinstallprompt` (Chrome/Edge,
 * Android) e exibe um botão discreto que dispara o prompt nativo de
 * instalação. Em iOS Safari (sem suporte ao evento) o botão não aparece —
 * a instalação manual via "Adicionar à tela inicial" é guiada por outra UI.
 */

import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "avizee.pwa.install.dismissed";

/** Detecta iOS (iPhone/iPad/iPod) — único caminho de instalação no Safari,
 *  já que iOS não dispara `beforeinstallprompt`. */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS 13+ aparece como "MacIntel" — checamos touch points também.
  const iPadOS = /Mac/.test(ua) && typeof (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints === "number"
    && ((navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
}

/** True quando o app já está rodando como PWA instalado. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari expõe a flag legada `navigator.standalone`.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mql || iosStandalone);
}

/**
 * Variantes:
 * - `inline`: botão padrão, para incluir em headers/configurações.
 * - `floating` (default): card flutuante no canto inferior direito,
 *   monta-se sozinho quando o navegador oferece o prompt.
 */
export function InstallPwaButton({ className, variant = "floating" }: { className?: string; variant?: "inline" | "floating" }) {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const [ios] = useState(() => isIOS() && !isStandalone());

  useEffect(() => {
    function onBefore(e: Event) {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setEvt(null);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* no-op */ }
    }
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Caminho iOS: sem prompt nativo, oferecemos guia "Adicionar à Tela de Início".
  if (ios && !evt) {
    if (dismissed) return null;
    return (
      <>
        {variant === "inline" ? (
          <Button
            variant="outline"
            size="sm"
            className={className}
            onClick={() => setIosGuideOpen(true)}
            title="Como instalar no iPhone"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="ml-1.5">Instalar no iPhone</span>
          </Button>
        ) : (
          <div
            role="dialog"
            aria-label="Instalar aplicativo AviZee no iPhone"
            className="fixed bottom-4 right-4 z-[90] max-w-xs rounded-lg border bg-background shadow-lg p-3 flex items-start gap-3 animate-in slide-in-from-bottom-2"
          >
            <Download className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Instalar AviZee no iPhone</p>
              <p className="text-xs text-muted-foreground mt-0.5">Adicione à Tela de Início pelo Safari para abrir como app.</p>
              <div className="flex gap-2 mt-2">
                <Button size="sm" className="h-7 text-xs" onClick={() => setIosGuideOpen(true)}>Ver como</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* no-op */ }
                    setDismissed(true);
                  }}
                >
                  Agora não
                </Button>
              </div>
            </div>
          </div>
        )}

        <Dialog open={iosGuideOpen} onOpenChange={setIosGuideOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Instalar AviZee no iPhone</DialogTitle>
              <DialogDescription>
                No Safari, siga 3 passos para adicionar o app à Tela de Início.
              </DialogDescription>
            </DialogHeader>
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">1</span>
                <span className="flex-1">
                  Toque no ícone <Share className="inline h-4 w-4 align-text-bottom mx-1" aria-label="Compartilhar" /> <strong>Compartilhar</strong> na barra do Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">2</span>
                <span className="flex-1">
                  Role e toque em <Plus className="inline h-4 w-4 align-text-bottom mx-1" aria-label="Adicionar" /> <strong>Adicionar à Tela de Início</strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">3</span>
                <span className="flex-1">
                  Confirme em <strong>Adicionar</strong>. O ícone do AviZee vai aparecer na sua Tela de Início.
                </span>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Importante: o passo só funciona no <strong>Safari</strong>. Se você abriu este link em outro navegador (Chrome, etc.), copie o endereço e cole no Safari.
            </p>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (!evt || dismissed) return null;

  const handleInstall = async () => {
    if (!evt) return;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome !== "accepted") {
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* no-op */ }
      setDismissed(true);
    }
    setEvt(null);
  };

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* no-op */ }
    setDismissed(true);
  };

  if (variant === "inline") {
    return (
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={handleInstall}
        title="Instalar o app na tela inicial"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="ml-1.5">Instalar app</span>
      </Button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Instalar aplicativo AviZee"
      className="fixed bottom-4 right-4 z-[90] max-w-xs rounded-lg border bg-background shadow-lg p-3 flex items-start gap-3 animate-in slide-in-from-bottom-2"
    >
      <Download className="h-5 w-5 mt-0.5 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Instalar AviZee</p>
        <p className="text-xs text-muted-foreground mt-0.5">Acesse offline e abra mais rápido na tela inicial.</p>
        <div className="flex gap-2 mt-2">
          <Button size="sm" className="h-7 text-xs" onClick={handleInstall}>Instalar</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleDismiss}>Agora não</Button>
        </div>
      </div>
    </div>
  );
}
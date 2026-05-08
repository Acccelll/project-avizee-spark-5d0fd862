import { useEffect, useLayoutEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useHelp } from '@/contexts/HelpContext';
import { useHelpProgress } from '@/hooks/useHelpProgress';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { HelpTourStep } from '@/help/types';

/**
 * Resolve o seletor de um step. Aceita tanto valor cru de `data-help-id`
 * (`orcamentos.novoBtn`) quanto seletor CSS arbitrário (`header.global-period`).
 */
function resolveTarget(target: string): Element | null {
  // 1. Caso comum: target é um valor de `data-help-id` (ex.: `dashboard.fiscal`).
  //    Usamos CSS.escape para suportar pontos, dois pontos e outros caracteres
  //    que, sem escape, seriam interpretados como combinadores CSS.
  try {
    const byAttr = document.querySelector(`[data-help-id="${CSS.escape(target)}"]`);
    if (byAttr) return byAttr;
  } catch {
    /* noop */
  }
  // 2. Fallback: trata como seletor CSS bruto apenas quando o início indica isso
  //    (`[`, `#`, `.`, `:`, `*` ou letra de tag). Evita disparar querySelector
  //    com `dashboard.fiscal` (que é seletor inválido) e cair silenciosamente.
  if (/^[\[#.:*a-z]/i.test(target)) {
    try {
      const byCss = document.querySelector(target);
      if (byCss) return byCss;
    } catch {
      /* noop */
    }
  }
  // Em dev, alerta sobre anchors stale (target não-vazio sem match).
  // Step "fantasma" intencional usa target = '' e não dispara o warn.
  if (target && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn('[CoachTour] anchor não encontrado:', target);
  }
  return null;
}

const PADDING = 8;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getRect(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Overlay de tour guiado. Destaca o alvo via clip-path e exibe um popover com
 * navegação. Quando o alvo não é encontrado, o passo é exibido como "fantasma"
 * centralizado, sem destaque.
 */
export function CoachTour() {
  const { tourEntry, tourSteps, endTour } = useHelp();
  const { markSeen } = useHelpProgress();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tick, setTick] = useState(0);

  const steps = useMemo<HelpTourStep[]>(() => tourSteps ?? [], [tourSteps]);
  const step = steps[stepIndex];

  // Reset quando o tour é (re)iniciado.
  useEffect(() => {
    if (tourEntry) setStepIndex(0);
  }, [tourEntry]);

  // Recalcula a posição do alvo após o passo mudar e em scroll/resize.
  useLayoutEffect(() => {
    if (!step) return;
    const update = () => {
      const el = resolveTarget(step.target);
      if (el && 'scrollIntoView' in el) {
        try {
          (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        } catch {
          /* noop */
        }
      }
      setRect(getRect(el));
    };
    update();
    const t = setTimeout(update, 350); // após o scroll suave
    const onResize = () => setTick((n) => n + 1);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [step, tick]);

  // Esc fecha; setas navegam.
  useEffect(() => {
    if (!tourEntry) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        endTour();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStepIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tourEntry, endTour, steps.length]);

  const finish = useCallback(() => {
    if (tourEntry) markSeen(tourEntry.route, tourEntry.version);
    endTour();
  }, [tourEntry, markSeen, endTour]);

  if (!tourEntry || !step) return null;

  const total = steps.length;
  const isLast = stepIndex === total - 1;
  const isFirst = stepIndex === 0;

  // posicionamento do popover: se há rect, ancora abaixo; senão, centro da tela.
  const popoverStyle: React.CSSProperties = rect
    ? (() => {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const popoverWidth = Math.min(360, vw - 24);
        const below = rect.top + rect.height + PADDING + 12;
        const fitsBelow = below + 220 < vh;
        const top = fitsBelow ? below : Math.max(12, rect.top - 220 - 12);
        let left = rect.left + rect.width / 2 - popoverWidth / 2;
        left = Math.max(12, Math.min(left, vw - popoverWidth - 12));
        return { top, left, width: popoverWidth };
      })()
    : {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(360px, calc(100vw - 24px))',
      };

  // backdrop com recorte do alvo
  const clipStyle: React.CSSProperties = rect
    ? {
        clipPath: `polygon(
          0 0, 100% 0, 100% 100%, 0 100%, 0 0,
          ${rect.left - PADDING}px ${rect.top - PADDING}px,
          ${rect.left - PADDING}px ${rect.top + rect.height + PADDING}px,
          ${rect.left + rect.width + PADDING}px ${rect.top + rect.height + PADDING}px,
          ${rect.left + rect.width + PADDING}px ${rect.top - PADDING}px,
          ${rect.left - PADDING}px ${rect.top - PADDING}px
        )`,
      }
    : {};

  const ringStyle: React.CSSProperties | null = rect
    ? {
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      }
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={`Tour: ${tourEntry.title}`}>
      {/* backdrop com recorte */}
      <div
        className="absolute inset-0 bg-foreground/60 backdrop-blur-[1px] transition-[clip-path] duration-300"
        style={clipStyle}
        onClick={endTour}
      />
      {/* anel ao redor do alvo */}
      {ringStyle ? (
        <div
          className="pointer-events-none absolute rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background/0 transition-all duration-300"
          style={ringStyle}
        />
      ) : null}

      {/* popover */}
      <div
        className="absolute rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
        style={popoverStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Passo {stepIndex + 1} de {total}
            </p>
            <h4 className="mt-0.5 text-sm font-semibold leading-tight">{step.title}</h4>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={endTour}
            aria-label="Fechar tour"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          {!rect && (
            <p className="mt-2 text-xs text-warning">
              Esta área não foi encontrada na tela atual. Você pode pular ou navegar para a tela correspondente.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" size="sm" onClick={endTour}>
            Pular
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isFirst}
              onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            {isLast ? (
              <Button size="sm" onClick={finish}>
                Concluir
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setStepIndex((i) => Math.min(i + 1, total - 1))}
                className="gap-1"
              >
                Próximo <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
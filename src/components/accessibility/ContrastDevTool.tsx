import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { contrastRatio, MIN_CONTRAST_AA } from "@/utils/contrast";

interface ContrastIssue {
  id: string;
  text: string;
  ratio: number;
}

export function ContrastDevTool() {
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState<ContrastIssue[]>([]);

  useEffect(() => {
    const runAudit = () => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>("main p, main span, main a, main button, main label, main h1, main h2, main h3, main h4"));
      const next = nodes
        .map((node, index) => {
          const style = window.getComputedStyle(node);
          const text = node.textContent?.trim() || "";
          if (!text) return null;
          const ratio = contrastRatio(style.color, style.backgroundColor === "rgba(0, 0, 0, 0)" ? window.getComputedStyle(document.body).backgroundColor : style.backgroundColor);
          if (!ratio || ratio >= MIN_CONTRAST_AA) return null;
          return { id: `${index}-${text.slice(0, 16)}`, text: text.slice(0, 72), ratio };
        })
        .filter((item): item is ContrastIssue => Boolean(item))
        .slice(0, 20);
      setIssues(next);
    };

    runAudit();
    window.addEventListener("resize", runAudit);
    return () => window.removeEventListener("resize", runAudit);
  }, []);

  const badgeText = useMemo(() => (issues.length > 0 ? `${issues.length} contraste(s)` : "Contraste OK"), [issues.length]);

  return (
    <div className="fixed bottom-3 left-3 z-[120] hidden sm:block">
      <button
        type="button"
        aria-label="Abrir auditoria de contraste"
        title="Verificação de contraste WCAG (dev)"
        className="rounded-full border bg-card px-3 py-1.5 text-xs shadow-sm"
        onClick={() => setOpen((value) => !value)}
      >
        {badgeText}
      </button>
      {open && (
        <div className="mt-2 w-[320px] rounded-lg border bg-card p-3 shadow-lg">
          <p className="mb-2 text-sm font-semibold">Verificação de contraste (WCAG AA)</p>
          {issues.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum texto com contraste abaixo de 4.5:1 no recorte avaliado.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {issues.map((issue) => (
                <li key={issue.id} className="flex items-start gap-2 rounded border p-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-warning" />
                  <div>
                    <p className="font-medium leading-snug">{issue.text}</p>
                    <p className="text-muted-foreground">Contraste: {issue.ratio.toFixed(2)}:1</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

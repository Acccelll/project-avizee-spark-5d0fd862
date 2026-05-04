import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, KeyRound, ScanLine } from "lucide-react";
import { toast } from "sonner";

interface FiscalToolbarActionsProps {
  onXmlChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImportClick: () => void;
}

/**
 * Ações do header do módulo Fiscal:
 * - Buscar por chave (em breve)
 * - Ler QR/Código (em breve)
 * - Importar XML
 * Extraído de Fiscal.tsx (Fase 6) — preserva markup/aria.
 */
export const FiscalToolbarActions = forwardRef<HTMLInputElement, FiscalToolbarActionsProps>(
  ({ onXmlChange, onImportClick }, ref) => {
    return (
      <>
        <input ref={ref} type="file" accept=".xml" className="hidden" onChange={onXmlChange} />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 min-h-11 md:min-h-9 px-3 opacity-60"
          onClick={() =>
            toast.info("Buscar por chave — em breve.", {
              description: "Integração SEFAZ em construção.",
            })
          }
          aria-label="Buscar NF-e pela chave de acesso"
          aria-disabled
        >
          <KeyRound className="h-4 w-4 md:h-3.5 md:w-3.5" />{" "}
          <span className="hidden xs:inline">Buscar por </span>chave
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 min-h-11 md:min-h-9 px-3 opacity-60"
          onClick={() =>
            toast.info("Leitor de QR/Código — em breve.", {
              description: "Captura por câmera em construção.",
            })
          }
          aria-label="Ler chave por código de barras ou QR Code"
          aria-disabled
        >
          <ScanLine className="h-4 w-4 md:h-3.5 md:w-3.5" />{" "}
          <span className="hidden xs:inline">Ler </span>QR/Código
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 min-h-11 md:min-h-9 px-3"
          onClick={onImportClick}
          aria-label="Importar XML de NF-e"
        >
          <Upload className="h-4 w-4 md:h-3.5 md:w-3.5" />{" "}
          <span className="hidden xs:inline">Importar </span>XML
        </Button>
      </>
    );
  }
);

FiscalToolbarActions.displayName = "FiscalToolbarActions";
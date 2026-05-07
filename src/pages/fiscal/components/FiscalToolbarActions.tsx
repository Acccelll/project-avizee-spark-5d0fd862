import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, KeyRound, ScanLine } from "lucide-react";

interface FiscalToolbarActionsProps {
  onXmlChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImportClick: () => void;
  onBuscarChaveClick: () => void;
  onScannerClick: () => void;
}

/**
 * Kill-switch (Sprint 7.1 P0) para a busca por chave via API pública.
 * Default = habilitado. Para desativar em runtime, defina
 *   VITE_FEATURE_BUSCA_CHAVE=false
 * em build secret. Quando desligado, escondemos os botões de busca-por-chave
 * e scanner — `consultadanfe-proxy` não é mais acessível pela UI.
 */
const BUSCA_CHAVE_ENABLED =
  String(import.meta.env.VITE_FEATURE_BUSCA_CHAVE ?? "true").toLowerCase() !== "false";

/**
 * Ações do header do módulo Fiscal:
 * - Buscar por chave (API consultadanfe.com)
 * - Ler QR/Código (scanner local — extrai chave e abre o diálogo de busca)
 * - Importar XML
 */
export const FiscalToolbarActions = forwardRef<HTMLInputElement, FiscalToolbarActionsProps>(
  ({ onXmlChange, onImportClick, onBuscarChaveClick, onScannerClick }, ref) => {
    return (
      <>
        <input ref={ref} type="file" accept=".xml" className="hidden" onChange={onXmlChange} />
        {BUSCA_CHAVE_ENABLED && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 min-h-11 md:min-h-9 px-3"
              onClick={onBuscarChaveClick}
              aria-label="Buscar NF-e pela chave de acesso"
            >
              <KeyRound className="h-4 w-4 md:h-3.5 md:w-3.5" />{" "}
              <span className="hidden xs:inline">Buscar por </span>chave
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 min-h-11 md:min-h-9 px-3"
              onClick={onScannerClick}
              aria-label="Ler chave por código de barras ou QR Code"
            >
              <ScanLine className="h-4 w-4 md:h-3.5 md:w-3.5" />{" "}
              <span className="hidden xs:inline">Ler </span>QR/Código
            </Button>
          </>
        )}
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
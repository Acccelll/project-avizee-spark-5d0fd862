/**
 * Busca de NF-e por chave de acesso (44 dígitos).
 *
 * Estratégia OFICIAL em 2 níveis (mem://features/fiscal-consulta-por-chave):
 *   1. Cache local — `nfe_distribuicao.xml_nfe` (alimentado por DistDFe cron).
 *   2. SEFAZ — edge `sefaz-distdfe` action `consultar-chave` (consChNFe via
 *      mTLS com o A1 do Vault). Limitação legal: só devolve XML cuja NF é
 *      destinada ao CNPJ do certificado (cStat 137/138 caso contrário).
 *
 * Fallback opcional `consultadanfe-proxy` (API paga de terceiro) é exposto
 * apenas se `VITE_FEATURE_FALLBACK_CONSULTADANFE=true` e usado quando o
 * destinatário do XML não é o CNPJ do A1.
 */

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Search, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormModal } from "@/components/FormModal";
import { consultarNFePorChave } from "@/services/fiscal/sefaz/distdfe.service";

const FALLBACK_CONSULTADANFE_ENABLED =
  import.meta.env.VITE_FEATURE_FALLBACK_CONSULTADANFE === "true";

interface BuscarPorChaveDialogProps {
  open: boolean;
  onClose: () => void;
  /** Chave inicial (vinda do scanner, por exemplo). */
  chaveInicial?: string;
  /** Callback chamado quando o XML foi obtido. Recebe o conteúdo bruto do XML. */
  onXmlObtido: (xml: string, origem: "cache" | "sefaz" | "api") => void;
}

const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Decodifica base64 (UTF-8) para string. */
function fromBase64Utf8(b64: string): string {
  try {
    const bin = atob(b64.replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

/** Extrai o XML do payload da API consultadanfe. */
function extrairXml(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  // Formato canônico: xml_base64
  if (typeof obj.xml_base64 === "string" && obj.xml_base64.length > 0) {
    const decoded = fromBase64Utf8(obj.xml_base64);
    if (decoded.includes("<")) return decoded;
  }
  // Fallbacks: xml já decodificado
  const candidatos = [obj.xml, obj.xmlNfe, obj.xml_nfe];
  for (const c of candidatos) {
    if (typeof c === "string" && c.includes("<")) return c;
  }
  return null;
}

function extrairMensagem(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const m = obj.message ?? obj.error ?? obj.mensagem;
  return typeof m === "string" ? m : null;
}

export function BuscarPorChaveDialog({
  open,
  onClose,
  chaveInicial,
  onXmlObtido,
}: BuscarPorChaveDialogProps) {
  const [chave, setChave] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && chaveInicial) setChave(chaveInicial);
    if (!open) {
      setChave("");
      setLoading(false);
    }
  }, [open, chaveInicial]);

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  const handleBuscar = async () => {
    const chaveLimpa = onlyDigits(chave);
    if (chaveLimpa.length !== 44) {
      toast.error("A chave de acesso deve ter exatamente 44 dígitos.");
      return;
    }

    setLoading(true);
    try {
      // Caminho oficial: cache local + DistDFe.
      const result = await consultarNFePorChave({ chave: chaveLimpa });
      if (result.sucesso && result.xml) {
        const origemLabel = result.origem === "cache"
          ? "cache local (DistDFe)"
          : "DistDFe SEFAZ";
        toast.success(`XML obtido via ${origemLabel}.`);
        onXmlObtido(result.xml, result.origem);
        onClose();
        return;
      }

      // Falha no caminho oficial: oferece fallback opcional somente se
      // habilitado e a falha for do tipo "documento não destinado ao CNPJ".
      const podeFallback =
        FALLBACK_CONSULTADANFE_ENABLED &&
        (result.cStat === "138" || result.cStat === "137");
      if (!podeFallback) {
        toast.error(result.erro ?? "Falha ao consultar a NF-e.", { duration: 10000 });
        return;
      }

      // Fallback: consultadanfe-proxy (API paga, sem restrição de destinatário).
      const { data, error } = await supabase.functions.invoke("consultadanfe-proxy", {
        body: { action: "consulta", chave: chaveLimpa },
      });
      if (error) throw new Error(error.message ?? "Falha ao chamar API de fallback.");
      const resp = data as { ok?: boolean; status?: number; data?: unknown; error?: string };
      if (!resp?.ok) {
        const msg = extrairMensagem(resp?.data) ?? resp?.error ?? `Status ${resp?.status}`;
        toast.error(`Fallback falhou: ${msg}`, { duration: 10000 });
        return;
      }
      const xmlFallback = extrairXml(resp.data);
      if (!xmlFallback) {
        toast.error("Fallback respondeu sem XML.");
        return;
      }
      toast.success("XML obtido via consultadanfe (fallback).");
      onXmlObtido(xmlFallback, "api");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro na consulta: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const chaveDigits = onlyDigits(chave);
  const chaveValida = chaveDigits.length === 44;

  return (
    <FormModal
      open={open}
      onClose={handleClose}
      title="Consultar NF-e por chave de acesso"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleBuscar} disabled={loading || !chaveValida} className="gap-2">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Consultando…
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Buscar
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <Label htmlFor="chave-acesso" className="flex items-center gap-2 text-sm">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Chave de acesso (44 dígitos)
          </Label>
          <Input
            id="chave-acesso"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
            maxLength={60}
            inputMode="numeric"
            autoFocus
            disabled={loading}
            className="font-mono tracking-tight"
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {chaveDigits.length}/44 dígitos
              {chaveValida && <span className="ml-2 text-success">✓ válido</span>}
            </span>
            {chaveDigits.length > 0 && chaveDigits.length !== 44 && (
              <span className="text-warning">Faltam {44 - chaveDigits.length}</span>
            )}
          </div>
        </div>

        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-xs text-foreground space-y-1.5">
          <p className="font-semibold flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-info" />
            Como funciona (caminho oficial)
          </p>
          <p className="text-muted-foreground">
            Consultamos primeiro o <strong>cache local</strong> (alimentado pelo
            DistDFe automático) e, em seguida, a <strong>SEFAZ via mTLS</strong>{" "}
            usando o certificado A1 da empresa.
          </p>
          <p className="flex items-start gap-1.5 text-warning">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            A SEFAZ só devolve o XML quando a NF-e é destinada ao CNPJ do
            certificado A1. Se não for, peça o XML ao emissor.
          </p>
          {FALLBACK_CONSULTADANFE_ENABLED && (
            <p className="text-muted-foreground">
              Fallback <strong>consultadanfe</strong> habilitado — usado apenas
              quando a SEFAZ retorna cStat 137/138.
            </p>
          )}
        </div>
      </div>
    </FormModal>
  );
}
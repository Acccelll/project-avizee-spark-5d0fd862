/**
 * Busca de NF-e por chave de acesso (44 dígitos) via API consultadanfe.com.
 *
 * Estratégia única (simples, sem certificado A1):
 *  1. Chama a edge function `consultadanfe-proxy` (action `consulta`),
 *     que devolve o XML autorizado da NF-e (modelo 55).
 *  2. O XML é entregue ao chamador via `onXmlObtido(xml, "api")` para
 *     reutilizar o pipeline padrão de importação do módulo Fiscal.
 *
 * Limitação da API: chaves do mês corrente (e do anterior nos primeiros
 * dias do mês). Para chaves antigas, a API retorna erro com mensagem
 * humana — exibimos ao usuário.
 */

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormModal } from "@/components/FormModal";

interface BuscarPorChaveDialogProps {
  open: boolean;
  onClose: () => void;
  /** Chave inicial (vinda do scanner, por exemplo). */
  chaveInicial?: string;
  /** Callback chamado quando o XML foi obtido. Recebe o conteúdo bruto do XML. */
  onXmlObtido: (xml: string, origem: "api") => void;
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
      const { data, error } = await supabase.functions.invoke("consultadanfe-proxy", {
        body: { action: "consulta", chave: chaveLimpa },
      });
      if (error) throw new Error(error.message ?? "Falha ao chamar a API.");

      const resp = data as {
        ok?: boolean;
        status?: number;
        errorCode?: string | null;
        data?: unknown;
        error?: string;
      };

      if (!resp?.ok) {
        const msg =
          extrairMensagem(resp?.data) ??
          resp?.error ??
          `API retornou status ${resp?.status ?? "desconhecido"}.`;
        toast.error(msg, { duration: 10000 });
        return;
      }

      const xml = extrairXml(resp.data);
      if (!xml) {
        toast.error("API respondeu, mas não foi possível extrair o XML do retorno.");
        return;
      }

      toast.success("XML obtido pela API consultadanfe.");
      onXmlObtido(xml, "api");
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
          <p className="font-semibold">Como funciona</p>
          <p className="text-muted-foreground">
            A consulta é feita pela API <strong>consultadanfe.com</strong>, que
            localiza o XML autorizado da NF-e (modelo 55) e devolve o documento
            para importação direta no ERP — sem necessidade de certificado
            digital A1.
          </p>
          <p className="flex items-start gap-1.5 text-warning">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            A API atende chaves do mês corrente (e do anterior, nos primeiros
            dias do mês). Para chaves mais antigas, peça o XML ao emissor.
          </p>
        </div>
      </div>
    </FormModal>
  );
}
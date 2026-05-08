import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, XCircle, ShieldAlert, Settings } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { obterCertificadoConfigurado } from "@/services/fiscal/certificado.service";
import { useAuth } from "@/contexts/AuthContext";
import { useCan } from "@/hooks/useCan";
import { useUserPreference } from "@/hooks/useUserPreference";
import { X } from "lucide-react";

/**
 * Exibe um alerta sobre a validade do certificado digital configurado.
 *
 * - ≤ 0 dias: crítico — emissão bloqueada
 * - ≤ 7 dias: vermelho — renovação urgente
 * - ≤ 30 dias: amarelo — aviso de vencimento próximo
 */
export function CertificadoValidadeAlert({ dismissible = false }: { dismissible?: boolean } = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = useCan();
  const allowed = can("faturamento_fiscal:visualizar");
  const { data: certificado, isLoading } = useQuery({
    queryKey: ["certificado-digital"],
    queryFn: obterCertificadoConfigurado,
    staleTime: 60 * 60 * 1000,
    enabled: allowed,
  });

  // Dismiss persistido por chave (validadeFim) — ao renovar, key muda e o alerta volta.
  const dismissKey = certificado ? `cert_dismissed_${certificado.validadeFim}` : "cert_dismissed_none";
  const { value: dismissedKey, set: setDismissedKey } = useUserPreference<string | null>(
    user?.id ?? null,
    "fiscal_cert_alert_dismissed",
    null,
  );

  if (!allowed) return null;
  if (isLoading || !certificado) return null;

  const { diasRestantes, razaoSocial, validadeFim } = certificado;
  if (diasRestantes > 30) return null;
  // Só permite dismiss em janela amarela (8..30). Vermelho/expirado nunca.
  const canDismiss = dismissible && diasRestantes > 7;
  if (canDismiss && dismissedKey === dismissKey) return null;

  const ConfigButton = (
    <Button
      size="sm"
      variant="outline"
      className="mt-3 min-h-11 gap-2"
      onClick={() => navigate("/configuracao-fiscal")}
    >
      <Settings className="h-4 w-4" /> Configurar Certificado
    </Button>
  );

  const DismissButton = canDismiss ? (
    <Button
      size="icon"
      variant="ghost"
      aria-label="Dispensar aviso"
      className="absolute right-2 top-2 h-7 w-7"
      onClick={() => setDismissedKey(dismissKey)}
    >
      <X className="h-4 w-4" />
    </Button>
  ) : null;

  if (diasRestantes <= 0) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Certificado Digital EXPIRADO</AlertTitle>
        <AlertDescription>
          O certificado digital de <strong>{razaoSocial}</strong> está expirado desde{" "}
          {new Date(validadeFim).toLocaleDateString("pt-BR")}.
          A emissão de novos documentos fiscais está bloqueada. Renove o certificado imediatamente.
          {ConfigButton}
        </AlertDescription>
      </Alert>
    );
  }

  if (diasRestantes <= 7) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Certificado Digital expira em {diasRestantes} dia(s)!</AlertTitle>
        <AlertDescription>
          O certificado digital de <strong>{razaoSocial}</strong> vence em{" "}
          {new Date(validadeFim).toLocaleDateString("pt-BR")}. Renove urgentemente para não
          interromper a emissão de documentos fiscais.
          {ConfigButton}
        </AlertDescription>
      </Alert>
    );
  }

  if (diasRestantes <= 30) {
    return (
      <Alert className="relative border-warning/50 bg-warning/5 text-warning [&>svg]:text-warning">
        {DismissButton}
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Certificado Digital expira em {diasRestantes} dias</AlertTitle>
        <AlertDescription>
          O certificado digital de <strong>{razaoSocial}</strong> vence em{" "}
          {new Date(validadeFim).toLocaleDateString("pt-BR")}. Providencie a renovação em breve.
          {ConfigButton}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

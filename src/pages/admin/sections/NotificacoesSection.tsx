/**
 * NotificacoesSection — política global de notificações automáticas.
 * Persiste em `app_configuracoes['notificacoes']`.
 */

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionShell } from "@/pages/admin/components/SectionShell";
import { useSectionConfig } from "@/pages/admin/hooks/useSectionConfig";
import { EmBreve } from "@/components/EmBreve";
import { Info } from "lucide-react";

const DEFAULTS = {
  resumoDiario: true,
  alertasOperacionais: true,
  avisosSeguranca: true,
  canalPadrao: "email",
};

export function NotificacoesSection() {
  const { values, lastSaved, save, isSaving } = useSectionConfig("notificacoes", DEFAULTS);
  const [draft, setDraft] = useState(values);

  useEffect(() => setDraft(values), [values]);

  const update = <K extends keyof typeof DEFAULTS>(key: K, value: (typeof DEFAULTS)[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <SectionShell
      title="Notificações globais"
      description="Políticas administrativas de comunicação automática do sistema."
      saveCta="Salvar notificações globais"
      lastSavedAt={lastSaved.at}
      isSaving={isSaving}
      onSave={() => save(draft)}
    >
      <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-medium flex items-center gap-2">
            Disparo automático
            <EmBreve />
          </p>
          <p className="text-xs">
            As preferências definidas aqui são persistidas como política global, mas o cron de envio (resumo diário, alertas) ainda não está ativo. Avisos críticos continuam saindo apenas pelos fluxos transacionais existentes.
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />Política global de notificações
          </CardTitle>
          <CardDescription>
            Estas opções definem notificações automáticas em nível de sistema — não são preferências pessoais de usuário.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">Resumo diário operacional</p>
              <p className="text-sm text-muted-foreground">
                Envia panorama diário para perfis administrativos.
              </p>
            </div>
            <Switch
              checked={draft.resumoDiario}
              onCheckedChange={(checked) => update("resumoDiario", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">Alertas operacionais críticos</p>
              <p className="text-sm text-muted-foreground">
                Falhas de integração, filas e indisponibilidades relevantes.
              </p>
            </div>
            <Switch
              checked={draft.alertasOperacionais}
              onCheckedChange={(checked) => update("alertasOperacionais", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">Avisos de segurança</p>
              <p className="text-sm text-muted-foreground">
                Mudanças sensíveis, tentativas de acesso e revogações.
              </p>
            </div>
            <Switch
              checked={draft.avisosSeguranca}
              onCheckedChange={(checked) => update("avisosSeguranca", checked)}
            />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <Label>Canal padrão das notificações globais</Label>
            <Select
              value={draft.canalPadrao}
              onValueChange={(v) => update("canalPadrao", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="painel">Painel interno</SelectItem>
                <SelectItem value="email-painel">E-mail + painel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </SectionShell>
  );
}
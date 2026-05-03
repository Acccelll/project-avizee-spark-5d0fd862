/**
 * BackupSection — política global de backup. Persiste em
 * `app_configuracoes['backup']`.
 *
 * NOTA: esta tela apenas armazena política. A execução real depende da
 * infraestrutura de backup (cron Supabase) — implementação prevista na
 * Fase 11 do roadmap administrativo.
 */

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, HardDrive, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionShell } from "@/pages/admin/components/SectionShell";
import { useSectionConfig } from "@/pages/admin/hooks/useSectionConfig";
import { EmBreve } from "@/components/EmBreve";

const DEFAULTS = {
  frequencia: "diario",
  retencaoDias: "30",
  destino: "storage-interno",
  ultimaExecucao: "",
  ultimoStatus: "nao-executado",
};

export function BackupSection() {
  const { values, lastSaved, save, isSaving } = useSectionConfig("backup", DEFAULTS);
  const [draft, setDraft] = useState(values);

  useEffect(() => setDraft(values), [values]);

  const update = <K extends keyof typeof DEFAULTS>(key: K, value: (typeof DEFAULTS)[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <SectionShell
      title="Backup e retenção"
      description="Políticas globais de proteção de dados, agendamento e histórico operacional."
      saveCta="Salvar política de backup"
      lastSavedAt={lastSaved.at}
      isSaving={isSaving}
      onSave={() => save(draft)}
    >
      <div className="space-y-6">
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium flex items-center gap-2">
              Execução automática
              <EmBreve />
            </p>
            <p className="text-xs">
              A política definida abaixo é persistida, mas a execução agendada (cron) ainda não está ativa. Backups manuais devem continuar sendo realizados pela infraestrutura.
            </p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />Política de backup global
            </CardTitle>
            <CardDescription>
              Define frequência, retenção e destino. Esta tela configura política; a execução real depende da infraestrutura de backup.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Frequência</Label>
              <Select value={draft.frequencia} onValueChange={(v) => update("frequencia", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diario">Diário</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Retenção (dias)</Label>
              <Input
                value={draft.retencaoDias}
                onChange={(e) => update("retencaoDias", e.target.value.replace(/\D/g, ""))}
                placeholder="30"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Destino</Label>
              <Select value={draft.destino} onValueChange={(v) => update("destino", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="storage-interno">Storage interno</SelectItem>
                  <SelectItem value="s3-externo">Bucket externo (S3)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status operacional</CardTitle>
            <CardDescription>Leitura do último ciclo conhecido e do próximo passo previsto.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Última execução</p>
              <p className="text-sm font-medium">{draft.ultimaExecucao || "Sem execução registrada"}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Status</p>
              <p className="text-sm font-medium flex items-center gap-1.5">
                {draft.ultimoStatus === "sucesso" ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : draft.ultimoStatus === "falha" ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <Info className="h-4 w-4 text-muted-foreground" />
                )}
                {draft.ultimoStatus}
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Próximo agendamento</p>
              <p className="text-sm font-medium">
                Calculado pela infraestrutura ({draft.frequencia})
              </p>
            </div>
            <div className="md:col-span-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                Esta interface não dispara backup manual nem valida execução remota. Ela mantém a política global para consumo dos serviços de infraestrutura.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </SectionShell>
  );
}
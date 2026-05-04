/**
 * FinanceiroSection — parâmetros financeiros globais (condição padrão,
 * forma de pagamento, banco padrão, baixa parcial). Persiste em
 * `app_configuracoes['financeiro']`.
 */

import { useEffect, useState } from "react";
import { Calendar, CheckCircle2, Globe, Info, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { SectionShell } from "@/pages/admin/components/SectionShell";
import { useSectionConfig } from "@/pages/admin/hooks/useSectionConfig";

const DEFAULTS = {
  condicaoPadrao: "30 dias",
  formaPagamentoPadrao: "boleto_dda",
  bancoPadrao: "Inter",
  permitirBaixaParcial: true,
};

export function FinanceiroSection() {
  const { values, lastSaved, save, isSaving } = useSectionConfig("financeiro", DEFAULTS);
  const [draft, setDraft] = useState(values);

  useEffect(() => setDraft(values), [values]);

  const update = <K extends keyof typeof DEFAULTS>(key: K, value: (typeof DEFAULTS)[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <SectionShell
      title="Parâmetros financeiros"
      description="Regras e defaults financeiros globais da operação."
      saveCta="Salvar parâmetros financeiros"
      lastSavedAt={lastSaved.at}
      isSaving={isSaving}
      onSave={() => save(draft)}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Wallet className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <CardTitle>Padrões de títulos</CardTitle>
                <CardDescription>
                  Valores base utilizados como ponto de partida na geração de títulos, lançamentos e baixas financeiras. Podem ser complementados por parametrizações específicas por documento ou operação.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Condição de pagamento padrão</Label>
              <Input
                value={draft.condicaoPadrao}
                onChange={(e) => update("condicaoPadrao", e.target.value)}
                placeholder="Ex.: 30 dias"
              />
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />Sugerida como condição inicial na geração de títulos a pagar e a receber.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pagamento padrão</Label>
              <Input
                value={draft.formaPagamentoPadrao}
                onChange={(e) => update("formaPagamentoPadrao", e.target.value)}
                placeholder="Ex.: Boleto"
              />
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />Aplicada como preenchimento inicial em lançamentos e baixas financeiras.
              </p>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Banco / conta padrão</Label>
              <Input
                value={draft.bancoPadrao}
                onChange={(e) => update("bancoPadrao", e.target.value)}
                placeholder="Ex.: Inter — Conta Corrente"
              />
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />Conta financeira sugerida para operações de pagamento e recebimento.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <CardTitle>Regras operacionais financeiras</CardTitle>
                <CardDescription>
                  Define como o ERP se comporta em operações financeiras. Diferente dos padrões acima, estas opções controlam fluxos e permissões globais do sistema.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between rounded-lg border p-4 gap-4">
              <div className="space-y-1">
                <p className="font-medium text-sm">Permitir baixa parcial por padrão</p>
                <p className="text-sm text-muted-foreground">
                  Quando ativo, o sistema permite registrar baixas parciais em contas a pagar e a receber por padrão. A regra é global e se aplica a todos os usuários do sistema.
                </p>
              </div>
              <Switch
                checked={draft.permitirBaixaParcial}
                onCheckedChange={(checked) => update("permitirBaixaParcial", checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Globe className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <CardTitle>Contexto de aplicação</CardTitle>
                <CardDescription>
                  Padrões financeiros globais usados como base em títulos, baixas e lançamentos gerados pelo sistema.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Esta configuração serve como referência para
              </p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {[
                  "Geração de títulos a pagar e a receber",
                  "Baixas financeiras manuais e automáticas",
                  "Lançamentos financeiros de contas a pagar",
                  "Lançamentos financeiros de contas a receber",
                  "Integrações oriundas de compras e vendas",
                  "Documentos com geração financeira automática",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Separator />
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                Esses valores são <strong>parâmetros armazenados</strong> e ainda não são consumidos automaticamente por todos os módulos financeiros. Servem como referência e base para futuras integrações.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <CardTitle>Governança e uso no sistema</CardTitle>
                <CardDescription>
                  Rastreabilidade desta configuração e visibilidade do seu alcance nos fluxos financeiros do ERP.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border bg-muted/30 p-3 space-y-0.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Última atualização
                </p>
                <p className="text-sm font-medium">
                  {lastSaved.at
                    ? new Date(lastSaved.at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—"}
                </p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 space-y-0.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Alterado por
                </p>
                <p className="text-sm font-medium">{lastSaved.by ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SectionShell>
  );
}
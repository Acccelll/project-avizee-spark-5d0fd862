import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { getEmpresaConfig, upsertEmpresaConfig } from "@/services/fiscal.service";

const configuracaoSchema = z.object({
  crt: z.string().min(1, "CRT obrigatório"),
  cnae: z.string().optional(),
  regime_tributario: z.string().optional(),
  inscricao_estadual: z.string().optional(),
  codigo_ibge_municipio: z.string().optional(),
  email_fiscal: z.string().email("E-mail inválido").or(z.literal("")).optional(),
  serie_padrao_nfe: z.string().min(1, "Série obrigatória"),
  proximo_numero_nfe: z.coerce.number().min(1, "Número inválido"),
  ambiente_padrao: z.enum(["homologacao", "producao"]),
  sefazUrlNFe: z.string().url("URL inválida").or(z.literal("")).optional(),
  certificadoTipo: z.enum(["A1", "A3"]),
  certificadoSenha: z.string().optional(),
});

type FormData = z.infer<typeof configuracaoSchema>;

export default function ConfiguracaoFiscal() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [ambienteAtual, setAmbienteAtual] = useState<"homologacao" | "producao">("homologacao");
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const form = useForm<FormData>({
    resolver: zodResolver(configuracaoSchema),
    defaultValues: {
      crt: "1",
      cnae: "",
      regime_tributario: "simples_nacional",
      inscricao_estadual: "",
      codigo_ibge_municipio: "",
      email_fiscal: "",
      serie_padrao_nfe: "1",
      proximo_numero_nfe: 1,
      ambiente_padrao: "homologacao",
      sefazUrlNFe: "",
      certificadoTipo: "A1",
      certificadoSenha: "",
    },
  });

  useEffect(() => {
    (async () => {
      const data = await getEmpresaConfig();
      if (data) {
        setConfigId(data.id);
        setAmbienteAtual((data.ambiente_padrao as "homologacao" | "producao") || "homologacao");
        form.reset({
          crt: data.crt || "1",
          cnae: data.cnae || "",
          regime_tributario: data.regime_tributario || "simples_nacional",
          inscricao_estadual: data.inscricao_estadual || "",
          codigo_ibge_municipio: data.codigo_ibge_municipio || "",
          email_fiscal: data.email_fiscal || "",
          serie_padrao_nfe: data.serie_padrao_nfe || "1",
          proximo_numero_nfe: data.proximo_numero_nfe || 1,
          ambiente_padrao: (data.ambiente_padrao as "homologacao" | "producao") || "homologacao",
          sefazUrlNFe: "",
          certificadoTipo: "A1",
          certificadoSenha: "",
        });
      }
      setLoading(false);
    })();
  }, [form]);

  async function handleSalvar(values: FormData) {
    // Confirmação extra ao migrar para Produção (emissão fiscal real).
    if (values.ambiente_padrao === "producao" && ambienteAtual !== "producao") {
      const ok = await confirm({
        title: "Ativar ambiente de Produção?",
        description:
          "Você está prestes a ativar a emissão real de NF-e na SEFAZ. As notas emitidas terão valor fiscal e contábil, e poderão gerar obrigações tributárias. Confirme apenas se o certificado digital e a configuração fiscal estiverem corretos.",
        confirmLabel: "Sim, ativar Produção",
        confirmVariant: "destructive",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      // Mapeia o ambiente legível ("homologacao"/"producao") para o formato
      // SEFAZ ("2"/"1") usado pelos serviços de emissão de XML.
      const ambienteSefaz = values.ambiente_padrao === "producao" ? "1" : "2";
      const payload = {
        crt: values.crt,
        cnae: values.cnae || null,
        regime_tributario: values.regime_tributario || null,
        inscricao_estadual: values.inscricao_estadual || null,
        codigo_ibge_municipio: values.codigo_ibge_municipio || null,
        email_fiscal: values.email_fiscal || null,
        serie_padrao_nfe: values.serie_padrao_nfe,
        proximo_numero_nfe: values.proximo_numero_nfe,
        ambiente_padrao: values.ambiente_padrao,
        ambiente_sefaz: ambienteSefaz,
        // NOTE: sefazUrlNFe, certificadoTipo, and certificadoSenha are collected
        // in this form but are NOT persisted yet (empresa_config does not have those
        // columns). They are kept in the schema so the UI can be wired up when the
        // backend supports them.
      };

      const savedId = await upsertEmpresaConfig(payload as never, configId);
      if (!configId) setConfigId(savedId);
      setAmbienteAtual(values.ambiente_padrao);
      toast.success("Configurações fiscais salvas");
    } catch (err) {
      console.error(err);
      notifyError(err);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {confirmDialog}
      <h1 className="text-2xl font-bold">Configuração Fiscal</h1>

      <div className="max-w-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSalvar)} className="space-y-6">
          <Tabs defaultValue="empresa" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
              <TabsTrigger value="empresa">Empresa Fiscal</TabsTrigger>
              <TabsTrigger value="certificado">Certificado A1</TabsTrigger>
              <TabsTrigger value="numeracao">Numeração</TabsTrigger>
              <TabsTrigger value="distdfe">DistDFe</TabsTrigger>
            </TabsList>

            <TabsContent value="empresa" className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Regime Tributário</h2>
              <Separator className="my-2" />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="crt" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CRT</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="1">1 – Simples Nacional</SelectItem>
                        <SelectItem value="2">2 – Simples Nacional (excesso)</SelectItem>
                        <SelectItem value="3">3 – Regime Normal</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="regime_tributario" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Regime</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                        <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                        <SelectItem value="lucro_real">Lucro Real</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cnae" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNAE Principal</FormLabel>
                    <FormControl><Input {...field} placeholder="Ex: 4711-3/01" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="inscricao_estadual" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inscrição Estadual</FormLabel>
                    <FormControl><Input {...field} placeholder="Ex: 123.456.789.000" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="codigo_ibge_municipio" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código IBGE Município</FormLabel>
                    <FormControl><Input {...field} placeholder="Ex: 3550308" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email_fiscal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail Fiscal</FormLabel>
                    <FormControl><Input {...field} type="email" placeholder="fiscal@empresa.com" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
            </TabsContent>

            <TabsContent value="numeracao" className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Numeração NF-e</h2>
              <Separator className="my-2" />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="serie_padrao_nfe" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Série Padrão</FormLabel>
                    <FormControl><Input {...field} placeholder="1" className="font-mono" /></FormControl>
                    <FormDescription>Série usada na emissão de NF-e</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="proximo_numero_nfe" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Próximo Número NF-e</FormLabel>
                    <FormControl><Input {...field} type="number" min={1} className="font-mono" /></FormControl>
                    <FormDescription>Número sequencial da próxima nota</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold">Integração SEFAZ</h2>
              <Separator className="my-2" />
              <div className="space-y-4">
                <FormField control={form.control} name="ambiente_padrao" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ambiente Padrão</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="homologacao">Homologação (testes)</SelectItem>
                        <SelectItem value="producao">Produção</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>Use Homologação para testes; Produção somente com certificado válido.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
            </TabsContent>

            <TabsContent value="certificado" className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Certificado Digital</h2>
              <Separator className="my-2" />
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 mb-4 text-xs text-warning">
                ⚠️ Os campos abaixo ainda <strong>não são persistidos</strong> no banco de dados.
                Eles estão disponíveis para configuração futura quando a integração com certificado digital for implementada.
              </div>
              <div className="grid grid-cols-2 gap-4 opacity-70">
                <FormField control={form.control} name="certificadoTipo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Certificado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="A1">A1 – Arquivo .pfx</SelectItem>
                        <SelectItem value="A3">A3 – Token/Smartcard</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>Configuração futura — não persistida ainda.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="certificadoSenha" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha do Certificado</FormLabel>
                    <FormControl><Input {...field} type="password" placeholder="Senha do arquivo .pfx" disabled /></FormControl>
                    <FormDescription>Configuração futura — não persistida ainda.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
            </TabsContent>

            <TabsContent value="distdfe" className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">Manifestação do Destinatário (DistDFe)</h2>
                <Separator className="my-2" />
                <div className="rounded-lg border border-muted bg-muted/20 p-4 text-sm text-muted-foreground space-y-2">
                  <p>
                    A consulta automática de NF-e contra o CNPJ desta empresa roda via{" "}
                    <code className="font-mono text-xs">process-distdfe-cron</code>.
                  </p>
                  <p>
                    Throttle ativo: <strong>18 chamadas/hora</strong> por ação. Para acompanhar o
                    histórico e as ciências enviadas, acesse{" "}
                    <a href="/fiscal/distdfe" className="text-primary underline">
                      Fiscal → Manifestação (DistDFe)
                    </a>.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

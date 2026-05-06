import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm, useFieldArray, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Send,
  Plus,
  Trash2,
  Sparkles,
  AlertCircle,
  FileText,
  User,
  Package,
  Truck,
  ListChecks,
} from "lucide-react";
import { ModulePage } from "@/components/ModulePage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { notifyError } from "@/utils/errorMessages";
import { useDebounce } from "@/hooks/useDebounce";
import { useMunicipioIbge } from "@/hooks/useMunicipioIbge";

/**
 * /faturamento/emitir — Wizard NF-e em 5 passos (Onda 3).
 *
 * Salva como rascunho em `notas_fiscais` (status_sefaz='nao_enviada')
 * e redireciona para `/fiscal/:id` onde o usuário transmite via
 * `SefazAcoesPanel` já existente. Não duplica a lógica de XML/SEFAZ —
 * apenas guia a entrada de dados aplicando matriz fiscal e IBGE.
 */

const itemSchema = z.object({
  produto_id: z.string().nullable(),
  codigo_produto: z.string().optional(),
  descricao: z.string().min(1, "Descrição obrigatória"),
  ncm: z.string().regex(/^\d{8}$/, "NCM deve ter 8 dígitos"),
  cfop: z.string().regex(/^\d{4}$/, "CFOP deve ter 4 dígitos"),
  cst: z.string().min(2),
  origem_mercadoria: z.string().default("0"),
  unidade: z.string().min(1).default("UN"),
  quantidade: z.coerce.number().positive(),
  valor_unitario: z.coerce.number().nonnegative(),
  valor_total: z.coerce.number().nonnegative(),
  icms_aliquota: z.coerce.number().min(0).max(100).default(0),
  icms_base: z.coerce.number().min(0).default(0),
  icms_valor: z.coerce.number().min(0).default(0),
  ipi_aliquota: z.coerce.number().min(0).max(100).default(0),
  ipi_valor: z.coerce.number().min(0).default(0),
  pis_aliquota: z.coerce.number().min(0).max(100).default(0),
  pis_valor: z.coerce.number().min(0).default(0),
  cofins_aliquota: z.coerce.number().min(0).max(100).default(0),
  cofins_valor: z.coerce.number().min(0).default(0),
  matriz_aplicada: z.boolean().default(false),
});
type WizardItem = z.infer<typeof itemSchema>;

const wizardSchema = z.object({
  // Passo 1
  serie: z.string().default("1"),
  data_emissao: z.string().min(1),
  natureza_codigo: z.string().min(1, "Selecione a natureza de operação"),
  natureza_descricao: z.string().min(1),
  finalidade: z.enum(["1", "2", "3", "4"]).default("1"),
  tipo_operacao: z.enum(["saida", "entrada"]).default("saida"),
  indicador_presenca: z.enum(["0", "1", "2", "3", "4", "9"]).default("0"),
  data_saida: z.string().optional(),
  hora_saida: z.string().optional(),
  via_intermediador: z.boolean().default(false),
  intermediador_cnpj: z.string().optional(),
  intermediador_identificador: z.string().optional(),
  // Passo 2
  cliente_id: z.string().min(1, "Selecione um destinatário"),
  cliente_nome: z.string(),
  cliente_uf: z.string().length(2),
  cliente_municipio_ibge: z.string().min(7, "Município IBGE obrigatório"),
  // Passo 3
  itens: z.array(itemSchema).min(1, "Adicione ao menos um item"),
  // Passo 4
  frete_modalidade: z.enum(["0", "1", "2", "3", "4", "9"]).default("9"),
  frete_valor: z.coerce.number().min(0).default(0),
  outras_despesas: z.coerce.number().min(0).default(0),
  desconto_valor: z.coerce.number().min(0).default(0),
  transportadora_id: z.string().nullable().optional(),
  transportadora_nome: z.string().optional(),
  transportadora_cnpj: z.string().optional(),
  veiculo_placa: z.string().optional(),
  veiculo_uf: z.string().optional(),
  forma_pagamento: z.string().default("01"),
  observacoes: z.string().optional(),
  // Vínculo opcional com Ordem de Venda (Onda 4)
  ordem_venda_id: z.string().nullable().optional(),
  ordem_venda_numero: z.string().nullable().optional(),
  // Vínculo opcional com NF-e referenciada (Onda 5: devolução/complementar)
  nf_referenciada_id: z.string().nullable().optional(),
  nf_referenciada_chave: z.string().nullable().optional(),
}).refine(
  (v) => !v.data_saida || v.data_saida >= v.data_emissao,
  { message: "Data de saída não pode ser anterior à emissão.", path: ["data_saida"] },
);
type WizardData = z.infer<typeof wizardSchema>;

const STEPS = [
  { key: "identificacao", label: "Identificação", icon: FileText },
  { key: "destinatario", label: "Destinatário", icon: User },
  { key: "itens", label: "Itens", icon: Package },
  { key: "transporte", label: "Transporte/Pagamento", icon: Truck },
  { key: "revisao", label: "Revisão", icon: ListChecks },
] as const;

const FORMA_PAGAMENTO = [
  { value: "01", label: "01 — Dinheiro" },
  { value: "02", label: "02 — Cheque" },
  { value: "03", label: "03 — Cartão de crédito" },
  { value: "04", label: "04 — Cartão de débito" },
  { value: "15", label: "15 — Boleto bancário" },
  { value: "17", label: "17 — PIX" },
  { value: "99", label: "99 — Outros" },
];

// ============ Stepper ============

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex w-full overflow-x-auto pb-2">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className="flex items-center min-w-fit">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                  done && "bg-success text-success-foreground border-success",
                  active && "bg-primary text-primary-foreground border-primary",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={cn(
                  "text-sm hidden sm:inline",
                  active ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("mx-3 h-px w-12 sm:w-16", done ? "bg-success" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============ Passo 1 — Identificação ============

interface Natureza {
  codigo: string;
  descricao: string;
  cfop_dentro_uf: string | null;
  cfop_fora_uf: string | null;
  finalidade: string;
  tipo_operacao: string;
}

function Step1Identificacao() {
  const { register, watch, setValue, formState } = useFormContext<WizardData>();
  const { data: naturezas } = useQuery({
    queryKey: ["naturezas-operacao", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("naturezas_operacao")
        .select("codigo, descricao, cfop_dentro_uf, cfop_fora_uf, finalidade, tipo_operacao")
        .eq("ativo", true)
        .order("descricao");
      if (error) throw error;
      return data as Natureza[];
    },
  });

  const codigoSel = watch("natureza_codigo");

  const handleNaturezaChange = (codigo: string) => {
    const n = naturezas?.find((x) => x.codigo === codigo);
    if (!n) return;
    setValue("natureza_codigo", codigo, { shouldDirty: true });
    setValue("natureza_descricao", n.descricao, { shouldDirty: true });
    setValue("finalidade", n.finalidade as WizardData["finalidade"], { shouldDirty: true });
    setValue("tipo_operacao", n.tipo_operacao as "saida" | "entrada", { shouldDirty: true });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Identificação da NF-e</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Natureza da operação *</Label>
          <Select value={codigoSel || ""} onValueChange={handleNaturezaChange}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {(naturezas ?? []).map((n) => (
                <SelectItem key={n.codigo} value={n.codigo}>
                  {n.codigo} — {n.descricao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {formState.errors.natureza_codigo && (
            <p className="text-xs text-destructive">{formState.errors.natureza_codigo.message}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Tipo de operação</Label>
          <Select value={watch("tipo_operacao")} onValueChange={(v) => setValue("tipo_operacao", v as "saida" | "entrada")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="saida">Saída</SelectItem>
              <SelectItem value="entrada">Entrada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Finalidade</Label>
          <Select value={watch("finalidade")} onValueChange={(v) => setValue("finalidade", v as WizardData["finalidade"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 — NF-e Normal</SelectItem>
              <SelectItem value="2">2 — Complementar</SelectItem>
              <SelectItem value="3">3 — Ajuste</SelectItem>
              <SelectItem value="4">4 — Devolução</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Série</Label>
          <Input {...register("serie")} placeholder="1" />
          <p className="text-xs text-muted-foreground">
            Numeração será gerada automaticamente na transmissão.
          </p>
        </div>
        <div className="space-y-1">
          <Label>Data de emissão *</Label>
          <Input type="date" {...register("data_emissao")} />
        </div>
        <div className="space-y-1">
          <Label>Indicador de presença *</Label>
          <Select
            value={watch("indicador_presenca")}
            onValueChange={(v) => setValue("indicador_presenca", v as WizardData["indicador_presenca"], { shouldDirty: true })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0 — Não se aplica</SelectItem>
              <SelectItem value="1">1 — Operação presencial</SelectItem>
              <SelectItem value="2">2 — Não presencial, internet</SelectItem>
              <SelectItem value="3">3 — Não presencial, teleatendimento</SelectItem>
              <SelectItem value="4">4 — NFC-e em entrega a domicílio</SelectItem>
              <SelectItem value="9">9 — Não presencial, outros</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Data de saída</Label>
          <Input type="date" {...register("data_saida")} />
          {formState.errors.data_saida && (
            <p className="text-xs text-destructive">{formState.errors.data_saida.message}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Hora de saída</Label>
          <Input type="time" step={1} {...register("hora_saida")} placeholder="HH:MM:SS" />
        </div>
        <div className="sm:col-span-2 rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Operação via intermediador (marketplace)</Label>
              <p className="text-xs text-muted-foreground">
                Ative para vendas via plataforma digital (NT 2020.006).
              </p>
            </div>
            <Switch
              checked={watch("via_intermediador") ?? false}
              onCheckedChange={(v) => setValue("via_intermediador", v, { shouldDirty: true })}
            />
          </div>
          {watch("via_intermediador") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">CNPJ do intermediador *</Label>
                <Input
                  {...register("intermediador_cnpj")}
                  placeholder="00000000000000"
                  maxLength={14}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Identificador do pedido na plataforma</Label>
                <Input {...register("intermediador_identificador")} placeholder="ex.: ML123456789" />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============ Passo 2 — Destinatário ============

interface ClienteRow {
  id: string;
  nome_razao_social: string;
  cpf_cnpj: string | null;
  uf: string | null;
  cidade: string | null;
  codigo_ibge_municipio: string | null;
  inscricao_estadual: string | null;
  ativo: boolean;
}

function Step2Destinatario() {
  const { setValue, watch, formState } = useFormContext<WizardData>();
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [resolvendoIbge, setResolvendoIbge] = useState(false);
  const debouncedBusca = useDebounce(busca, 300);
  const { buscar: buscarIbge } = useMunicipioIbge();

  const clienteId = watch("cliente_id");
  const clienteNome = watch("cliente_nome");
  const clienteIbge = watch("cliente_municipio_ibge");

  const { data: clientes, isFetching } = useQuery({
    queryKey: ["clientes-busca-wizard", debouncedBusca],
    queryFn: async () => {
      let q = supabase
        .from("clientes")
        .select("id, nome_razao_social, cpf_cnpj, uf, cidade, codigo_ibge_municipio, inscricao_estadual, ativo")
        .eq("ativo", true)
        .order("nome_razao_social")
        .limit(20);
      if (debouncedBusca) {
        q = q.or(`nome_razao_social.ilike.%${debouncedBusca}%,cpf_cnpj.ilike.%${debouncedBusca}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as ClienteRow[];
    },
    enabled: open,
  });

  const selecionar = async (c: ClienteRow) => {
    setValue("cliente_id", c.id, { shouldDirty: true });
    setValue("cliente_nome", c.nome_razao_social, { shouldDirty: true });
    setValue("cliente_uf", (c.uf ?? "").toUpperCase(), { shouldDirty: true });
    setValue("cliente_municipio_ibge", c.codigo_ibge_municipio ?? "", { shouldDirty: true });
    setOpen(false);

    // Resolve IBGE automaticamente se cliente não tiver
    if (!c.codigo_ibge_municipio && c.cidade && c.uf) {
      setResolvendoIbge(true);
      try {
        const m = await buscarIbge(c.cidade, c.uf);
        if (m) {
          setValue("cliente_municipio_ibge", m.codigo_ibge, { shouldDirty: true });
          // Persiste no cliente para próximas vezes
          await supabase
            .from("clientes")
            .update({ codigo_ibge_municipio: m.codigo_ibge, municipio_nome: m.nome })
            .eq("id", c.id);
          toast.success(`Código IBGE ${m.codigo_ibge} (${m.nome}) preenchido automaticamente`);
        } else {
          toast.warning("Não foi possível resolver o código IBGE — preencha manualmente.");
        }
      } finally {
        setResolvendoIbge(false);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Destinatário</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Cliente *</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                {clienteNome || "Selecionar cliente…"}
                <User className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Buscar por nome ou CNPJ…" value={busca} onValueChange={setBusca} />
                <CommandList>
                  {isFetching && <p className="p-3 text-xs text-muted-foreground">Buscando…</p>}
                  <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                  <CommandGroup>
                    {(clientes ?? []).map((c) => (
                      <CommandItem key={c.id} value={c.id} onSelect={() => selecionar(c)}>
                        <div className="flex flex-col">
                          <span className="font-medium">{c.nome_razao_social}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.cpf_cnpj ?? "—"} · {c.cidade ?? "?"}/{c.uf ?? "?"}
                            {!c.codigo_ibge_municipio && " · ⚠ sem IBGE"}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {formState.errors.cliente_id && (
            <p className="text-xs text-destructive">{formState.errors.cliente_id.message}</p>
          )}
        </div>

        {clienteId && (
          <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">UF destino</p>
              <p className="font-mono">{watch("cliente_uf") || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Código IBGE</p>
              <p className="font-mono">
                {resolvendoIbge ? "Resolvendo…" : clienteIbge || (
                  <span className="text-destructive">— pendente</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              {clienteIbge && clienteIbge.length >= 7 ? (
                <Badge variant="default">Pronto para emissão</Badge>
              ) : (
                <Badge variant="destructive">Bloqueado</Badge>
              )}
            </div>
          </div>
        )}

        {formState.errors.cliente_municipio_ibge && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Código IBGE obrigatório</AlertTitle>
            <AlertDescription>
              Atualize o cadastro do cliente com o código IBGE do município
              ({" "}
              <a className="underline" href="/clientes" target="_blank" rel="noreferrer">
                abrir cadastro
              </a>
              ).
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ============ Passo 3 — Itens ============

interface ProdutoRow {
  id: string;
  codigo_interno: string | null;
  descricao: string;
  ncm: string | null;
  unidade_medida: string | null;
  preco_venda: number | null;
  variacoes?: unknown;
}

function ItemRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const { register, watch, setValue, formState } = useFormContext<WizardData>();
  const item = watch(`itens.${index}`);
  const ufDestino = watch("cliente_uf");

  const recalc = () => {
    const q = Number(item.quantidade || 0);
    const v = Number(item.valor_unitario || 0);
    const total = +(q * v).toFixed(2);
    setValue(`itens.${index}.valor_total`, total, { shouldDirty: true });
    setValue(`itens.${index}.icms_base`, total, { shouldDirty: true });
    setValue(
      `itens.${index}.icms_valor`,
      +((total * Number(item.icms_aliquota || 0)) / 100).toFixed(2),
      { shouldDirty: true },
    );
    setValue(
      `itens.${index}.pis_valor`,
      +((total * Number(item.pis_aliquota || 0)) / 100).toFixed(2),
      { shouldDirty: true },
    );
    setValue(
      `itens.${index}.cofins_valor`,
      +((total * Number(item.cofins_aliquota || 0)) / 100).toFixed(2),
      { shouldDirty: true },
    );
    setValue(
      `itens.${index}.ipi_valor`,
      +((total * Number(item.ipi_aliquota || 0)) / 100).toFixed(2),
      { shouldDirty: true },
    );
  };

  const aplicarMatriz = async () => {
    if (!item.produto_id) {
      toast.warning("Vincule a um produto para aplicar a matriz fiscal.");
      return;
    }
    if (!ufDestino) {
      toast.warning("Selecione o destinatário antes.");
      return;
    }
    const { data, error } = await supabase.rpc("aplicar_matriz_fiscal", {
      p_produto_id: item.produto_id,
      p_uf_destino: ufDestino,
      p_tipo_operacao: "saida",
    });
    if (error) {
      notifyError(error);
      return;
    }
    const r = data as { matched?: boolean; cfop?: string; cst_csosn?: string; origem_mercadoria?: string; aliquota_icms?: number; aliquota_pis?: number; aliquota_cofins?: number; aliquota_ipi?: number; matriz_nome?: string };
    if (!r?.matched) {
      toast.warning("Nenhuma regra fiscal cadastrada para essa combinação.");
      return;
    }
    setValue(`itens.${index}.cfop`, r.cfop ?? item.cfop, { shouldDirty: true });
    setValue(`itens.${index}.cst`, r.cst_csosn ?? item.cst, { shouldDirty: true });
    setValue(`itens.${index}.origem_mercadoria`, r.origem_mercadoria ?? "0", { shouldDirty: true });
    setValue(`itens.${index}.icms_aliquota`, Number(r.aliquota_icms ?? 0), { shouldDirty: true });
    setValue(`itens.${index}.pis_aliquota`, Number(r.aliquota_pis ?? 0), { shouldDirty: true });
    setValue(`itens.${index}.cofins_aliquota`, Number(r.aliquota_cofins ?? 0), { shouldDirty: true });
    setValue(`itens.${index}.ipi_aliquota`, Number(r.aliquota_ipi ?? 0), { shouldDirty: true });
    setValue(`itens.${index}.matriz_aplicada`, true, { shouldDirty: true });
    setTimeout(recalc, 0);
    toast.success(`Matriz "${r.matriz_nome}" aplicada`);
  };

  const itemErrors = formState.errors.itens?.[index];

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Item {index + 1}</span>
          {item.matriz_aplicada && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" /> Matriz aplicada
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={aplicarMatriz}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Aplicar matriz
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-12">
        <div className="sm:col-span-5 space-y-1">
          <Label className="text-xs">Descrição *</Label>
          <Input {...register(`itens.${index}.descricao`)} />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label className="text-xs">NCM *</Label>
          <Input {...register(`itens.${index}.ncm`)} maxLength={8} placeholder="00000000" />
          {itemErrors?.ncm && <p className="text-xs text-destructive">{itemErrors.ncm.message}</p>}
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label className="text-xs">CFOP *</Label>
          <Input {...register(`itens.${index}.cfop`)} maxLength={4} placeholder="5102" />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label className="text-xs">CST/CSOSN *</Label>
          <Input {...register(`itens.${index}.cst`)} maxLength={3} />
        </div>
        <div className="sm:col-span-1 space-y-1">
          <Label className="text-xs">UN</Label>
          <Input {...register(`itens.${index}.unidade`)} maxLength={6} />
        </div>

        <div className="sm:col-span-2 space-y-1">
          <Label className="text-xs">Qtd *</Label>
          <Input
            type="number"
            step="0.0001"
            {...register(`itens.${index}.quantidade`, { onChange: () => setTimeout(recalc, 0) })}
          />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label className="text-xs">Vlr unitário *</Label>
          <Input
            type="number"
            step="0.01"
            {...register(`itens.${index}.valor_unitario`, { onChange: () => setTimeout(recalc, 0) })}
          />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label className="text-xs">Total</Label>
          <Input value={Number(item.valor_total || 0).toFixed(2)} readOnly className="bg-muted" />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label className="text-xs">ICMS %</Label>
          <Input
            type="number"
            step="0.01"
            {...register(`itens.${index}.icms_aliquota`, { onChange: () => setTimeout(recalc, 0) })}
          />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label className="text-xs">PIS %</Label>
          <Input
            type="number"
            step="0.0001"
            {...register(`itens.${index}.pis_aliquota`, { onChange: () => setTimeout(recalc, 0) })}
          />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label className="text-xs">COFINS %</Label>
          <Input
            type="number"
            step="0.0001"
            {...register(`itens.${index}.cofins_aliquota`, { onChange: () => setTimeout(recalc, 0) })}
          />
        </div>
      </div>
    </div>
  );
}

function Step3Itens() {
  const { control, setValue, getValues, formState } = useFormContext<WizardData>();
  const { fields, append, remove } = useFieldArray({ control, name: "itens" });
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedBusca = useDebounce(busca, 300);

  // M-02: CST/CSOSN default depende do CRT da empresa
  const { data: empresaCrt } = useQuery({
    queryKey: ["empresa-config-crt"],
    queryFn: async () => {
      const { data } = await supabase.from("empresa_config").select("crt").maybeSingle();
      return (data?.crt as string | null) ?? "3";
    },
    staleTime: 5 * 60_000,
  });
  const cstDefault = (empresaCrt === "1" || empresaCrt === "2") ? "102" : "00";

  const { data: produtos } = useQuery({
    queryKey: ["produtos-busca-wizard", debouncedBusca],
    queryFn: async () => {
      let q = supabase
        .from("produtos")
        .select("id, codigo_interno, descricao, ncm, unidade_medida, preco_venda")
        .eq("ativo", true)
        .order("descricao")
        .limit(20);
      if (debouncedBusca) {
        q = q.or(`descricao.ilike.%${debouncedBusca}%,codigo_interno.ilike.%${debouncedBusca}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as ProdutoRow[];
    },
    enabled: open,
  });

  const adicionarProduto = (p: ProdutoRow) => {
    const qtd = 1;
    const vu = Number(p.preco_venda || 0);
    append({
      produto_id: p.id,
      codigo_produto: p.codigo_interno ?? "",
      descricao: p.descricao,
      ncm: (p.ncm ?? "").padStart(8, "0").slice(0, 8) || "00000000",
      cfop: "",
      cst: cstDefault,
      origem_mercadoria: "0",
      unidade: p.unidade_medida ?? "UN",
      quantidade: qtd,
      valor_unitario: vu,
      valor_total: +(qtd * vu).toFixed(2),
      icms_aliquota: 0,
      icms_base: +(qtd * vu).toFixed(2),
      icms_valor: 0,
      ipi_aliquota: 0,
      ipi_valor: 0,
      pis_aliquota: 0,
      pis_valor: 0,
      cofins_aliquota: 0,
      cofins_valor: 0,
      matriz_aplicada: false,
    });
    setOpen(false);
    setBusca("");
  };

  const adicionarVazio = () => {
    append({
      produto_id: null,
      codigo_produto: "",
      descricao: "",
      ncm: "",
      cfop: "",
      cst: cstDefault,
      origem_mercadoria: "0",
      unidade: "UN",
      quantidade: 1,
      valor_unitario: 0,
      valor_total: 0,
      icms_aliquota: 0,
      icms_base: 0,
      icms_valor: 0,
      ipi_aliquota: 0,
      ipi_valor: 0,
      pis_aliquota: 0,
      pis_valor: 0,
      cofins_aliquota: 0,
      cofins_valor: 0,
      matriz_aplicada: false,
    });
  };

  const totalItens = fields.reduce(
    (s, _, i) => s + Number(getValues(`itens.${i}.valor_total`) || 0),
    0,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Itens da nota</CardTitle>
        <div className="flex gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Buscar produto
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="end">
              <Command shouldFilter={false}>
                <CommandInput value={busca} onValueChange={setBusca} placeholder="Código ou descrição…" />
                <CommandList>
                  <CommandEmpty>Nenhum produto.</CommandEmpty>
                  <CommandGroup>
                    {(produtos ?? []).map((p) => (
                      <CommandItem key={p.id} value={p.id} onSelect={() => adicionarProduto(p)}>
                        <div className="flex flex-col">
                          <span className="font-medium">{p.descricao}</span>
                          <span className="text-xs text-muted-foreground">
                            {p.codigo_interno ?? "—"} · NCM {p.ncm ?? "?"} · {formatCurrency(Number(p.preco_venda ?? 0))}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" onClick={adicionarVazio}>
            <Plus className="h-4 w-4 mr-1" /> Item livre
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Adicione produtos para compor a nota.
          </p>
        ) : (
          fields.map((f, i) => <ItemRow key={f.id} index={i} onRemove={() => remove(i)} />)
        )}
        {formState.errors.itens && typeof formState.errors.itens.message === "string" && (
          <p className="text-xs text-destructive">{formState.errors.itens.message}</p>
        )}
        {fields.length > 0 && (
          <div className="flex justify-end pt-2 text-sm">
            <span className="text-muted-foreground mr-2">Total dos itens:</span>
            <span className="font-semibold tabular-nums">{formatCurrency(totalItens)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ Passo 4 — Transporte e Pagamento ============

interface TransportadoraRow {
  id: string;
  nome_razao_social: string;
  cpf_cnpj: string | null;
  uf: string | null;
}

function TransportadoraPicker() {
  const { setValue, watch } = useFormContext<WizardData>();
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(busca, 300);

  const transportadoraNome = watch("transportadora_nome");

  const { data, isFetching } = useQuery({
    queryKey: ["transportadoras-busca", debounced],
    queryFn: async () => {
      let q = supabase
        .from("fornecedores")
        .select("id, nome_razao_social, cpf_cnpj, uf")
        .eq("ativo", true)
        .eq("transportadora", true)
        .order("nome_razao_social")
        .limit(20);
      if (debounced) {
        q = q.or(`nome_razao_social.ilike.%${debounced}%,cpf_cnpj.ilike.%${debounced}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as TransportadoraRow[];
    },
    enabled: open,
  });

  const selecionar = (t: TransportadoraRow) => {
    setValue("transportadora_id", t.id, { shouldDirty: true });
    setValue("transportadora_nome", t.nome_razao_social, { shouldDirty: true });
    setValue("transportadora_cnpj", t.cpf_cnpj ?? "", { shouldDirty: true });
    setOpen(false);
  };

  const limpar = () => {
    setValue("transportadora_id", null, { shouldDirty: true });
    setValue("transportadora_nome", "", { shouldDirty: true });
    setValue("transportadora_cnpj", "", { shouldDirty: true });
  };

  return (
    <div className="space-y-1 sm:col-span-2">
      <Label>Transportadora</Label>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="flex-1 justify-between">
              {transportadoraNome || "Selecionar transportadora…"}
              <Truck className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Nome ou CNPJ…" value={busca} onValueChange={setBusca} />
              <CommandList>
                {isFetching && <p className="p-3 text-xs text-muted-foreground">Buscando…</p>}
                <CommandEmpty>
                  Nenhuma transportadora cadastrada. Marque o flag “transportadora” no fornecedor.
                </CommandEmpty>
                <CommandGroup>
                  {(data ?? []).map((t) => (
                    <CommandItem key={t.id} value={t.id} onSelect={() => selecionar(t)}>
                      <div className="flex flex-col">
                        <span className="font-medium">{t.nome_razao_social}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.cpf_cnpj ?? "—"} · {t.uf ?? "?"}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {transportadoraNome && (
          <Button variant="ghost" size="sm" onClick={limpar}>Limpar</Button>
        )}
      </div>
    </div>
  );
}

function Step4Transporte() {
  const { register, watch, setValue } = useFormContext<WizardData>();
  const modal = watch("frete_modalidade");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transporte e pagamento</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Modalidade do frete</Label>
          <Select value={watch("frete_modalidade")} onValueChange={(v) => setValue("frete_modalidade", v as WizardData["frete_modalidade"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0 — Por conta do emitente</SelectItem>
              <SelectItem value="1">1 — Por conta do destinatário</SelectItem>
              <SelectItem value="2">2 — Por conta de terceiros</SelectItem>
              <SelectItem value="3">3 — Transp. próprio do emitente</SelectItem>
              <SelectItem value="4">4 — Transp. próprio do destinatário</SelectItem>
              <SelectItem value="9">9 — Sem transporte</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Valor do frete</Label>
          <Input type="number" step="0.01" {...register("frete_valor")} />
        </div>
        {modal !== "9" && (
          <>
            <TransportadoraPicker />
            <div className="space-y-1">
              <Label>Placa do veículo</Label>
              <Input
                {...register("veiculo_placa")}
                placeholder="ABC1D23"
                maxLength={8}
                style={{ textTransform: "uppercase" }}
              />
            </div>
            <div className="space-y-1">
              <Label>UF do veículo</Label>
              <Input
                {...register("veiculo_uf")}
                placeholder="SP"
                maxLength={2}
                style={{ textTransform: "uppercase" }}
              />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label>Outras despesas</Label>
          <Input type="number" step="0.01" {...register("outras_despesas")} />
        </div>
        <div className="space-y-1">
          <Label>Desconto</Label>
          <Input type="number" step="0.01" {...register("desconto_valor")} />
        </div>
        <div className="space-y-1">
          <Label>Forma de pagamento</Label>
          <Select value={watch("forma_pagamento")} onValueChange={(v) => setValue("forma_pagamento", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FORMA_PAGAMENTO.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Observações / Informações complementares</Label>
          <Textarea rows={3} {...register("observacoes")} placeholder="Texto livre que entra em infCpl…" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============ Passo 5 — Revisão ============

function Step5Revisao({
  totalNF,
  onSalvarRascunho,
  saving,
}: {
  totalNF: number;
  onSalvarRascunho: () => void;
  saving: boolean;
}) {
  const { getValues } = useFormContext<WizardData>();
  const data = getValues();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo da NF-e</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Natureza</p>
            <p>{data.natureza_codigo} — {data.natureza_descricao}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tipo / Finalidade</p>
            <p className="capitalize">{data.tipo_operacao} · Finalidade {data.finalidade}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Data emissão / Série</p>
            <p>{data.data_emissao} · Série {data.serie}</p>
          </div>
          <div className="sm:col-span-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">Destinatário</p>
            <p>{data.cliente_nome} · IBGE {data.cliente_municipio_ibge} · UF {data.cliente_uf}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Itens</p>
            <p>{data.itens.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Frete / Outras / Desconto</p>
            <p>
              {formatCurrency(data.frete_valor)} · {formatCurrency(data.outras_despesas)} ·{" "}
              {formatCurrency(data.desconto_valor)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total da NF</p>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(totalNF)}</p>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Próxima etapa</AlertTitle>
        <AlertDescription>
          Ao salvar, a nota será criada como <strong>rascunho</strong> e você
          será redirecionado para a tela de detalhe, onde poderá transmitir à
          SEFAZ pelo painel de ações fiscais.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button onClick={onSalvarRascunho} disabled={saving} size="lg" className="gap-2">
          {saving ? "Salvando…" : (
            <>
              <Send className="h-4 w-4" /> Salvar e ir para transmissão
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ============ Página principal ============

export default function EmitirNFeWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const form = useForm<WizardData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      serie: "1",
      data_emissao: new Date().toISOString().split("T")[0],
      natureza_codigo: "",
      natureza_descricao: "",
      finalidade: "1",
      tipo_operacao: "saida",
      indicador_presenca: "0",
      data_saida: "",
      hora_saida: "",
      via_intermediador: false,
      intermediador_cnpj: "",
      intermediador_identificador: "",
      cliente_id: "",
      cliente_nome: "",
      cliente_uf: "",
      cliente_municipio_ibge: "",
      itens: [],
      frete_modalidade: "9",
      frete_valor: 0,
      outras_despesas: 0,
      desconto_valor: 0,
      transportadora_id: null,
      transportadora_nome: "",
      transportadora_cnpj: "",
      veiculo_placa: "",
      veiculo_uf: "",
      forma_pagamento: "01",
      observacoes: "",
    },
  });

  const itens = form.watch("itens");
  const frete = form.watch("frete_valor") ?? 0;
  const desconto = form.watch("desconto_valor") ?? 0;
  const outras = form.watch("outras_despesas") ?? 0;

  const totalProdutos = useMemo(
    () => (itens || []).reduce((s, i) => s + Number(i.valor_total || 0), 0),
    [itens],
  );
  const totalNF = useMemo(
    () => +(totalProdutos + Number(frete) + Number(outras) - Number(desconto)).toFixed(2),
    [totalProdutos, frete, outras, desconto],
  );

  // Pre-seleção via querystring (?cliente_id=…) — preparado para Onda 4 (Backlog)
  useEffect(() => {
    const cid = searchParams.get("cliente_id");
    if (cid && !form.getValues("cliente_id")) {
      supabase
        .from("clientes")
        .select("id, nome_razao_social, uf, codigo_ibge_municipio")
        .eq("id", cid)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          form.setValue("cliente_id", data.id);
          form.setValue("cliente_nome", data.nome_razao_social);
          form.setValue("cliente_uf", (data.uf ?? "").toUpperCase());
          form.setValue("cliente_municipio_ibge", data.codigo_ibge_municipio ?? "");
        });
    }
    // Onda 4 — pré-preencher a partir de uma Ordem de Venda
    const ovId = searchParams.get("ovId");
    if (ovId && !form.getValues("ordem_venda_id")) {
      void carregarOrdemVenda(ovId);
    }
    // Onda 5 — pré-preencher a partir de uma NF autorizada (devolução/complementar)
    const refNFeId = searchParams.get("refNFeId");
    const finalidadeQS = searchParams.get("finalidade");
    if (refNFeId) {
      const fin = (finalidadeQS === "2" || finalidadeQS === "3" || finalidadeQS === "4")
        ? finalidadeQS as WizardData["finalidade"]
        : "4";
      void carregarNFReferenciada(refNFeId, fin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregarOrdemVenda = async (ovId: string) => {
    try {
      const { data: ov, error } = await supabase
        .from("ordens_venda")
        .select(`
          id, numero, observacoes, frete_tipo, frete_valor,
          cliente:cliente_id(id, nome_razao_social, uf, codigo_ibge_municipio, cidade),
          itens:ordens_venda_itens(
            id, produto_id, codigo_snapshot, descricao_snapshot,
            quantidade, quantidade_faturada, unidade, valor_unitario, valor_total,
            produto:produto_id(ncm)
          )
        `)
        .eq("id", ovId)
        .maybeSingle();
      if (error) throw error;
      if (!ov) {
        toast.error("Ordem de venda não encontrada.");
        return;
      }
      const cli = (ov as { cliente?: { id: string; nome_razao_social: string; uf: string | null; codigo_ibge_municipio: string | null; cidade: string | null } | null }).cliente;
      form.setValue("ordem_venda_id", ov.id);
      form.setValue("ordem_venda_numero", ov.numero);
      if (cli) {
        form.setValue("cliente_id", cli.id);
        form.setValue("cliente_nome", cli.nome_razao_social);
        form.setValue("cliente_uf", (cli.uf ?? "").toUpperCase());
        form.setValue("cliente_municipio_ibge", cli.codigo_ibge_municipio ?? "");
      }
      const freteMap: Record<string, WizardData["frete_modalidade"]> = {
        cif: "0", fob: "1", terceiros: "2", proprio: "3", sem_frete: "9",
      };
      if (ov.frete_tipo) form.setValue("frete_modalidade", freteMap[ov.frete_tipo] ?? "9");
      form.setValue("frete_valor", Number(ov.frete_valor ?? 0));
      const obsBase = `Ref. Pedido de Venda nº ${ov.numero}`;
      form.setValue("observacoes", ov.observacoes ? `${obsBase}. ${ov.observacoes}` : obsBase);

      const itensOv = (ov as { itens?: Array<{
        produto_id: string | null;
        codigo_snapshot: string | null;
        descricao_snapshot: string | null;
        quantidade: number | null;
        quantidade_faturada: number | null;
        unidade: string | null;
        valor_unitario: number | null;
        valor_total: number | null;
        produto?: { ncm: string | null } | null;
      }> }).itens ?? [];

      const itensWizard = itensOv
        .map((it) => {
          const restante = Number(it.quantidade ?? 0) - Number(it.quantidade_faturada ?? 0);
          if (restante <= 0) return null;
          const vu = Number(it.valor_unitario ?? 0);
          const total = +(restante * vu).toFixed(2);
          return {
            produto_id: it.produto_id,
            codigo_produto: it.codigo_snapshot ?? "",
            descricao: it.descricao_snapshot ?? "",
            ncm: (it.produto?.ncm ?? "").replace(/\D/g, "").padStart(8, "0").slice(-8),
            cfop: "5102",
            cst: "00",
            origem_mercadoria: "0",
            unidade: it.unidade ?? "UN",
            quantidade: restante,
            valor_unitario: vu,
            valor_total: total,
            icms_aliquota: 0, icms_base: total, icms_valor: 0,
            ipi_aliquota: 0, ipi_valor: 0,
            pis_aliquota: 0, pis_valor: 0,
            cofins_aliquota: 0, cofins_valor: 0,
            matriz_aplicada: false,
          } as WizardItem;
        })
        .filter((x): x is WizardItem => x !== null);

      form.setValue("itens", itensWizard);
      toast.success(
        `Pedido ${ov.numero} carregado: ${itensWizard.length} ${itensWizard.length === 1 ? "item" : "itens"} prontos para faturar. Aplique a matriz fiscal nos itens.`,
      );

      // A-03: aplicar matriz fiscal automaticamente em cada item
      const ufDestino = form.getValues("cliente_uf");
      if (ufDestino && itensWizard.length > 0) {
        toast.info("Aplicando matriz fiscal automaticamente…");
        let aplicadas = 0;
        for (let i = 0; i < itensWizard.length; i++) {
          const it = itensWizard[i];
          if (!it.produto_id) continue;
          try {
            const { data: m } = await supabase.rpc("aplicar_matriz_fiscal", {
              p_produto_id: it.produto_id,
              p_uf_destino: ufDestino,
              p_tipo_operacao: "saida",
            });
            const mr = m as { matched?: boolean; cfop?: string; cst_csosn?: string; aliquota_icms?: number; aliquota_pis?: number; aliquota_cofins?: number } | null;
            if (mr?.matched) {
              if (mr.cfop) form.setValue(`itens.${i}.cfop`, mr.cfop);
              if (mr.cst_csosn) form.setValue(`itens.${i}.cst`, mr.cst_csosn);
              form.setValue(`itens.${i}.icms_aliquota`, Number(mr.aliquota_icms ?? 0));
              form.setValue(`itens.${i}.pis_aliquota`, Number(mr.aliquota_pis ?? 0));
              form.setValue(`itens.${i}.cofins_aliquota`, Number(mr.aliquota_cofins ?? 0));
              form.setValue(`itens.${i}.matriz_aplicada`, true);
              aplicadas++;
            }
          } catch {
            /* segue: matriz pode ser ajustada manualmente */
          }
        }
        if (aplicadas > 0) {
          toast.success(`Matriz fiscal aplicada em ${aplicadas} de ${itensWizard.length} itens.`);
        }
      }
    } catch (err) {
      notifyError(err);
    }
  };

  /**
   * Onda 5 — Carrega uma NF-e autorizada como referência para devolução
   * (finalidade 4) ou complementar (finalidade 2). Inverte CFOP de saída
   * (5xxx/6xxx) para entrada (1xxx/2xxx) no caso de devolução.
   */
  const carregarNFReferenciada = async (
    nfId: string,
    finalidade: WizardData["finalidade"],
  ) => {
    try {
      const { data: nfRef, error } = await supabase
        .from("notas_fiscais")
        .select(`
          id, numero, serie, chave_acesso, observacoes, valor_total, frete_valor,
          cliente:cliente_id(id, nome_razao_social, uf, codigo_ibge_municipio),
          itens:notas_fiscais_itens(
            produto_id, codigo_produto, descricao, ncm, cfop, cst, origem_mercadoria,
            unidade, quantidade, valor_unitario, valor_total,
            icms_base, icms_aliquota, icms_valor,
            ipi_aliquota, ipi_valor, pis_aliquota, pis_valor, cofins_aliquota, cofins_valor
          )
        `)
        .eq("id", nfId)
        .maybeSingle();
      if (error) throw error;
      if (!nfRef) {
        toast.error("NF de referência não encontrada.");
        return;
      }

      const ehDevolucao = finalidade === "4";
      form.setValue("finalidade", finalidade);
      // Devolução de venda → entrada na empresa; complementar mantém saída
      if (ehDevolucao) {
        form.setValue("tipo_operacao", "entrada");
      }
      form.setValue("nf_referenciada_id", nfRef.id);
      form.setValue("nf_referenciada_chave", nfRef.chave_acesso ?? "");

      const cli = (nfRef as { cliente?: { id: string; nome_razao_social: string; uf: string | null; codigo_ibge_municipio: string | null } | null }).cliente;
      if (cli) {
        form.setValue("cliente_id", cli.id);
        form.setValue("cliente_nome", cli.nome_razao_social);
        form.setValue("cliente_uf", (cli.uf ?? "").toUpperCase());
        form.setValue("cliente_municipio_ibge", cli.codigo_ibge_municipio ?? "");
      }

      const obsRef = `Ref. NF-e nº ${nfRef.numero}/${nfRef.serie} chave ${nfRef.chave_acesso ?? "—"}`;
      const obsAtual = nfRef.observacoes ?? "";
      form.setValue("observacoes", obsAtual ? `${obsRef}. ${obsAtual}` : obsRef);

      const inverterCfop = (cfop: string | null): string => {
        if (!cfop || cfop.length !== 4) return cfop ?? "1202";
        if (cfop.startsWith("5")) return "1" + cfop.slice(1);
        if (cfop.startsWith("6")) return "2" + cfop.slice(1);
        return cfop;
      };

      const itensRef = (nfRef as { itens?: Array<Record<string, unknown>> }).itens ?? [];
      const itensWizard = itensRef.map((it) => {
        const cfopOriginal = (it.cfop as string | null) ?? null;
        return {
          produto_id: (it.produto_id as string | null) ?? null,
          codigo_produto: (it.codigo_produto as string | null) ?? "",
          descricao: (it.descricao as string | null) ?? "",
          ncm: ((it.ncm as string | null) ?? "").replace(/\D/g, "").padStart(8, "0").slice(-8),
          cfop: ehDevolucao ? inverterCfop(cfopOriginal) : (cfopOriginal ?? "5102"),
          cst: (it.cst as string | null) ?? "00",
          origem_mercadoria: (it.origem_mercadoria as string | null) ?? "0",
          unidade: (it.unidade as string | null) ?? "UN",
          quantidade: Number(it.quantidade ?? 0),
          valor_unitario: Number(it.valor_unitario ?? 0),
          valor_total: Number(it.valor_total ?? 0),
          icms_aliquota: Number(it.icms_aliquota ?? 0),
          icms_base: Number(it.icms_base ?? 0),
          icms_valor: Number(it.icms_valor ?? 0),
          ipi_aliquota: Number(it.ipi_aliquota ?? 0),
          ipi_valor: Number(it.ipi_valor ?? 0),
          pis_aliquota: Number(it.pis_aliquota ?? 0),
          pis_valor: Number(it.pis_valor ?? 0),
          cofins_aliquota: Number(it.cofins_aliquota ?? 0),
          cofins_valor: Number(it.cofins_valor ?? 0),
          matriz_aplicada: false,
        } as WizardItem;
      });

      form.setValue("itens", itensWizard);
      toast.success(
        ehDevolucao
          ? `NF ${nfRef.numero} carregada como devolução (CFOP invertido). Revise quantidades e tributos.`
          : `NF ${nfRef.numero} carregada como complementar.`,
      );
    } catch (err) {
      notifyError(err);
    }
  };

  const validarStep = async (n: number): Promise<boolean> => {
    const fields: Record<number, (keyof WizardData)[]> = {
      0: ["natureza_codigo", "natureza_descricao", "data_emissao"],
      1: ["cliente_id", "cliente_uf", "cliente_municipio_ibge"],
      2: ["itens"],
      3: [],
    };
    const ok = await form.trigger(fields[n]);
    if (!ok) toast.error("Corrija os campos destacados antes de avançar.");
    return ok;
  };

  const next = async () => {
    if (await validarStep(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const salvarRascunho = async () => {
    const ok = await form.trigger();
    if (!ok) {
      toast.error("Há erros nos passos anteriores. Revise e tente novamente.");
      return;
    }
    const data = form.getValues();
    setSaving(true);
    try {
      const totaisIcms = data.itens.reduce((s, i) => s + Number(i.icms_valor || 0), 0);
      const totaisIpi = data.itens.reduce((s, i) => s + Number(i.ipi_valor || 0), 0);
      const totaisPis = data.itens.reduce((s, i) => s + Number(i.pis_valor || 0), 0);
      const totaisCofins = data.itens.reduce((s, i) => s + Number(i.cofins_valor || 0), 0);
      const valorProdutos = data.itens.reduce((s, i) => s + Number(i.valor_total || 0), 0);

      const finalidadeMap: Record<string, string> = {
        "1": "normal",
        "2": "complementar",
        "3": "ajuste",
        "4": "devolucao",
      };

      const { data: nfRow, error: nfErr } = await supabase
        .from("notas_fiscais")
        .insert([{
          tipo: data.tipo_operacao,
          tipo_operacao: data.tipo_operacao,
          serie: data.serie,
          data_emissao: data.data_emissao,
          natureza_operacao: data.natureza_descricao,
          finalidade_nfe: finalidadeMap[data.finalidade] ?? "normal",
          cliente_id: data.cliente_id,
          forma_pagamento: data.forma_pagamento,
          frete_modalidade: data.frete_modalidade,
          frete_valor: data.frete_valor,
          outras_despesas: data.outras_despesas,
          desconto_valor: data.desconto_valor,
          observacoes: data.observacoes ?? null,
          indicador_presenca: data.indicador_presenca,
          data_saida: data.data_saida || null,
          hora_saida: data.hora_saida || null,
          transportadora_id: data.transportadora_id ?? null,
          veiculo_placa: data.veiculo_placa ? data.veiculo_placa.toUpperCase() : null,
          veiculo_uf: data.veiculo_uf ? data.veiculo_uf.toUpperCase() : null,
          via_intermediador: data.via_intermediador ?? false,
          intermediador_cnpj: data.via_intermediador ? (data.intermediador_cnpj || null) : null,
          intermediador_identificador: data.via_intermediador ? (data.intermediador_identificador || null) : null,
          valor_produtos: valorProdutos,
          valor_total: totalNF,
          icms_valor: totaisIcms,
          ipi_valor: totaisIpi,
          pis_valor: totaisPis,
          cofins_valor: totaisCofins,
          status: "pendente",
          status_sefaz: "nao_enviada",
          ordem_venda_id: data.ordem_venda_id ?? null,
          nf_referenciada_id: data.nf_referenciada_id ?? null,
          nf_referenciada_chave: data.nf_referenciada_chave ?? null,
        } as never])
        .select("id")
        .single();
      if (nfErr) throw nfErr;

      const itensPayload = data.itens.map((it) => ({
        nota_fiscal_id: nfRow!.id,
        produto_id: it.produto_id,
        codigo_produto: it.codigo_produto || null,
        descricao: it.descricao,
        ncm: it.ncm,
        cfop: it.cfop,
        cst: it.cst,
        csosn: it.cst,
        origem_mercadoria: it.origem_mercadoria,
        unidade: it.unidade,
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario,
        valor_total: it.valor_total,
        icms_base: it.icms_base,
        icms_aliquota: it.icms_aliquota,
        icms_valor: it.icms_valor,
        ipi_aliquota: it.ipi_aliquota,
        ipi_valor: it.ipi_valor,
        pis_aliquota: it.pis_aliquota,
        pis_valor: it.pis_valor,
        cofins_aliquota: it.cofins_aliquota,
        cofins_valor: it.cofins_valor,
      }));
      const { error: itErr } = await supabase
        .from("notas_fiscais_itens")
        .insert(itensPayload as never);
      if (itErr) throw itErr;

      // Onda 4 — marcar OV como faturada (parcial/total)
      if (data.ordem_venda_id) {
        try {
          await supabase
            .from("ordens_venda")
            .update({ status_faturamento: "faturado" })
            .eq("id", data.ordem_venda_id);
        } catch {
          /* não bloqueia: status pode ser ajustado posteriormente */
        }
      }

      toast.success("Rascunho salvo. Pronto para transmitir!");
      navigate(`/fiscal/${nfRow!.id}`);
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModulePage
      title="Emitir NF-e"
      subtitle="Wizard guiado em 5 passos com aplicação automática da matriz fiscal"
      headerActions={
        <Button variant="outline" onClick={() => navigate("/faturamento")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      }
    >
      <FormProvider {...form}>
        <div className="space-y-4">
          <Stepper current={step} />

          {step === 0 && <Step1Identificacao />}
          {step === 1 && <Step2Destinatario />}
          {step === 2 && <Step3Itens />}
          {step === 3 && <Step4Transporte />}
          {step === 4 && (
            <Step5Revisao totalNF={totalNF} onSalvarRascunho={salvarRascunho} saving={saving} />
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" onClick={prev} disabled={step === 0} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Total parcial: <strong className="tabular-nums">{formatCurrency(totalNF)}</strong>
            </span>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} className="gap-2">
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <span />
            )}
          </div>
        </div>
      </FormProvider>
    </ModulePage>
  );
}
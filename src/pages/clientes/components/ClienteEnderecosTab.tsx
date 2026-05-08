import { useEffect, useState } from "react";
import {
  listEnderecosEntrega,
  createEnderecoEntrega,
  updateEnderecoEntrega,
  setEnderecoPrincipal,
  softDeleteEnderecoEntrega,
} from "@/services/clientes.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Home, Plus, Trash2, Star, FileText, MapPin, Loader2, Search } from "lucide-react";
import { useViaCep } from "@/hooks/useViaCep";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UF_OPTIONS } from "@/constants/brasil";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";

interface EnderecoEntrega {
  id: string;
  cliente_id: string;
  identificacao: string;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  contato: string | null;
  telefone: string | null;
  principal: boolean;
  ativo: boolean;
  observacoes: string | null;
}

type EnderecoFormData = Omit<EnderecoEntrega, "id" | "cliente_id">;

const emptyEnderecoForm: EnderecoFormData = {
  identificacao: "Endereço de Entrega",
  logradouro: "", numero: "", complemento: "", bairro: "",
  cidade: "", uf: "", cep: "", contato: "", telefone: "",
  principal: false, ativo: true, observacoes: "",
};

interface Props {
  clienteId: string;
  fallbackEndereco?: {
    logradouro?: string; numero?: string; complemento?: string;
    bairro?: string; cidade?: string; uf?: string; cep?: string;
  };
  onCountChange?: (count: number) => void;
}

export function ClienteEnderecosTab({ clienteId, fallbackEndereco, onCountChange }: Props) {
  const [enderecos, setEnderecos] = useState<EnderecoEntrega[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EnderecoFormData>({ ...emptyEnderecoForm });
  const [saving, setSaving] = useState(false);
  const { buscarCep, loading: cepLoading } = useViaCep();
  const { confirm: confirmRemove, dialog: confirmRemoveDialog } = useConfirmDialog();

  const load = async () => {
    setLoading(true);
    try {
      const list = (await listEnderecosEntrega(clienteId)) as unknown as EnderecoEntrega[];
      setEnderecos(list);
      onCountChange?.(list.length);
    } catch (err) {
      console.error("[clientes] erro ao carregar endereços:", err);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- load() depende só de clienteId via closure; recriar a função a cada render dispararia refetch
  useEffect(() => { void load(); }, [clienteId]);

  const handleSave = async () => {
    if (!form.identificacao.trim()) { toast.error("Identificação do endereço é obrigatória"); return; }
    setSaving(true);
    try {
      if (editId) {
        await updateEnderecoEntrega(editId, { ...form, cliente_id: clienteId });
        toast.success("Endereço atualizado");
      } else {
        await createEnderecoEntrega({ ...form, cliente_id: clienteId });
        toast.success("Endereço de entrega adicionado");
      }
      setDialogOpen(false);
      setEditId(null);
      await load();
    } catch (err) {
      console.error("[clientes] erro ao salvar endereço:", err);
      notifyError(err);
    }
    setSaving(false);
  };

  const handleSetPrincipal = async (enderecoId: string) => {
    try {
      await setEnderecoPrincipal(clienteId, enderecoId);
      await load();
      toast.success("Endereço principal definido");
    } catch (err) {
      console.error("[clientes] erro ao definir principal:", err);
      notifyError(err);
    }
  };

  const handleRemove = async (enderecoId: string) => {
    const ok = await confirmRemove({
      title: "Remover endereço",
      description: "Esta ação removerá este endereço de entrega. Deseja continuar?",
      confirmLabel: "Remover",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    try {
      await softDeleteEnderecoEntrega(enderecoId);
      await load();
      toast.success("Endereço removido");
    } catch (err) {
      console.error("[clientes] erro ao remover endereço:", err);
      notifyError(err);
    }
  };

  const fb = fallbackEndereco;

  const openCreateEndereco = () => {
    setForm({ ...emptyEnderecoForm, principal: enderecos.length === 0 });
    setEditId(null);
    setDialogOpen(true);
  };

  return (
    <>
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Home className="w-4 h-4 text-primary/70" />
          <h3 className="font-semibold text-sm">Endereços de Entrega</h3>
          {enderecos.length > 0 && <Badge variant="secondary" className="text-xs">{enderecos.length}</Badge>}
        </div>
        <Button
          type="button" size="sm" variant="outline" className="gap-1.5 h-8"
          onClick={openCreateEndereco}
        >
          <Plus className="h-3.5 w-3.5" /> Incluir
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Endereços alternativos de entrega para este cliente. Um pode ser marcado como principal.
      </p>
      {loading ? (
        <div className="h-20 bg-muted/30 rounded-lg animate-pulse" />
      ) : enderecos.length === 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-3 border border-dashed text-xs text-muted-foreground">
            <Home className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            <div>
              <p className="font-medium text-foreground/80 mb-0.5">Usando endereço de faturamento como padrão</p>
              <p>Enquanto não houver endereços de entrega alternativos cadastrados, o endereço principal do cliente será usado automaticamente como endereço de entrega.</p>
            </div>
          </div>
          {fb && (fb.logradouro || fb.cidade) && (
            <div className="rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground text-xs mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> Endereço de faturamento (padrão de entrega)</p>
              <p>{[fb.logradouro, fb.numero, fb.complemento].filter(Boolean).join(", ")}{fb.bairro ? ` — ${fb.bairro}` : ""}</p>
              <p>{[fb.cidade, fb.uf].filter(Boolean).join("/")} {fb.cep ? `(${fb.cep})` : ""}</p>
            </div>
          )}
          <Button
            type="button"
            onClick={openCreateEndereco}
            className="w-full sm:w-auto gap-1.5"
          >
            <Plus className="h-4 w-4" /> Incluir endereço de entrega
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          {enderecos.map((end) => (
            <div key={end.id} className="group rounded-lg border bg-card p-3 hover:bg-muted/20 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {end.principal && <span title="Principal"><Star className="h-3.5 w-3.5 text-warning shrink-0" /></span>}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{end.identificacao}</span>
                      {end.principal && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-warning border-warning/30">Principal</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[end.logradouro, end.numero, end.complemento].filter(Boolean).join(", ")}
                      {end.bairro ? ` — ${end.bairro}` : ""}
                      {end.cidade ? ` — ${end.cidade}` : ""}
                      {end.uf ? `/${end.uf}` : ""}
                      {end.cep ? ` (${end.cep})` : ""}
                    </p>
                    {(end.contato || end.telefone) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[end.contato, end.telefone].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!end.principal && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                          aria-label="Marcar como principal"
                          onClick={() => handleSetPrincipal(end.id)}>
                          <Star className="h-3.5 w-3.5 text-warning" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Marcar como principal</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                        aria-label="Editar endereço"
                        onClick={() => {
                          setForm({
                            identificacao: end.identificacao,
                            logradouro: end.logradouro || "", numero: end.numero || "",
                            complemento: end.complemento || "", bairro: end.bairro || "",
                            cidade: end.cidade || "", uf: end.uf || "", cep: end.cep || "",
                            contato: end.contato || "", telefone: end.telefone || "",
                            principal: end.principal, ativo: end.ativo,
                            observacoes: end.observacoes || "",
                          });
                          setEditId(end.id);
                          setDialogOpen(true);
                        }}>
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Editar</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                        aria-label="Remover endereço"
                        onClick={() => handleRemove(end.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remover</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); setEditId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Endereço de Entrega" : "Novo Endereço de Entrega"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-2">
              <Label>Identificação <span className="text-destructive">*</span></Label>
              <Input
                value={form.identificacao}
                onChange={(e) => setForm({ ...form, identificacao: e.target.value })}
                placeholder="Ex: Filial SP, Depósito Central"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Label>CEP</Label>
                <div className="flex gap-2">
                  <MaskedInput
                    mask="cep"
                    value={form.cep || ""}
                    onChange={(v) => setForm({ ...form, cep: v })}
                    placeholder="00000-000"
                    className="flex-1"
                  />
                  <Button
                    type="button" variant="outline" size="sm"
                    disabled={cepLoading || (form.cep || "").replace(/\D/g, "").length < 8}
                    onClick={async () => {
                      const result = await buscarCep(form.cep || "");
                      if (result) setForm({ ...form, logradouro: result.logradouro, bairro: result.bairro, cidade: result.localidade, uf: result.uf });
                    }}
                    aria-label="Buscar CEP"
                  >
                    {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="w-24 space-y-2">
                <Label>Número</Label>
                <Input value={form.numero || ""} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="Nº" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Logradouro</Label>
              <Input value={form.logradouro || ""} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} placeholder="Rua, Avenida..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Complemento</Label>
                <Input value={form.complemento || ""} onChange={(e) => setForm({ ...form, complemento: e.target.value })} placeholder="Sala, Bloco..." />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input value={form.bairro || ""} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input value={form.cidade || ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <Select value={form.uf || undefined} onValueChange={(v) => setForm({ ...form, uf: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {UF_OPTIONS.map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contato</Label>
                <Input value={form.contato || ""} onChange={(e) => setForm({ ...form, contato: e.target.value })} placeholder="Nome do responsável" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <MaskedInput
                  mask="telefone"
                  value={form.telefone || ""}
                  onChange={(v) => setForm({ ...form, telefone: v })}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} placeholder="Instruções de entrega, restrições de acesso..." />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditId(null); }}>Cancelar</Button>
              <Button type="button" disabled={saving} onClick={handleSave}>
                {saving ? "Salvando..." : "Salvar Endereço"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {confirmRemoveDialog}
    </>
  );
}

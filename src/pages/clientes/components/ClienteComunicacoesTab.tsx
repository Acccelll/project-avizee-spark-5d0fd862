import { useEffect, useState } from "react";
import {
  listRegistrosComunicacao,
  createRegistroComunicacao,
} from "@/services/clientes.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, MessageSquarePlus, Clock } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/utils/errorMessages";

interface ComunicacaoCliente {
  id: string;
  cliente_id: string;
  tipo: string | null;
  assunto: string | null;
  conteudo: string | null;
  data_registro: string;
  data_hora: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  retorno_previsto: string | null;
  status: string;
}

type ComunicacaoFormData = {
  tipo: string;
  assunto: string;
  conteudo: string;
  responsavel_nome: string;
  retorno_previsto: string;
  status: string;
};

const emptyComunicacaoForm: ComunicacaoFormData = {
  tipo: "ligacao", assunto: "", conteudo: "", responsavel_nome: "", retorno_previsto: "", status: "registrado",
};

const COMUNICACAO_TIPO_LABEL: Record<string, string> = {
  ligacao: "Ligação", email: "E-mail", reuniao: "Reunião",
  whatsapp: "WhatsApp", visita: "Visita", proposta: "Proposta", outros: "Outros",
};

const COMUNICACAO_STATUS_LABEL: Record<string, string> = {
  registrado: "Registrado", em_andamento: "Em andamento",
  aguardando_retorno: "Aguardando retorno", concluido: "Concluído", cancelado: "Cancelado",
};

interface Props {
  clienteId: string;
  onCountChange?: (count: number) => void;
}

export function ClienteComunicacoesTab({ clienteId, onCountChange }: Props) {
  const [comunicacoes, setComunicacoes] = useState<ComunicacaoCliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ComunicacaoFormData>({ ...emptyComunicacaoForm });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = (await listRegistrosComunicacao(clienteId)) as unknown as ComunicacaoCliente[];
      setComunicacoes(list);
      onCountChange?.(list.length);
    } catch (err) {
      console.error("[clientes] erro ao carregar comunicações:", err);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- load() depende só de clienteId via closure; recriar a função a cada render dispararia refetch
  useEffect(() => { void load(); }, [clienteId]);

  const handleSave = async () => {
    if (!form.assunto.trim()) { toast.error("Assunto é obrigatório"); return; }
    setSaving(true);
    try {
      await createRegistroComunicacao({
        cliente_id: clienteId,
        tipo: form.tipo,
        assunto: form.assunto,
        conteudo: form.conteudo || null,
        responsavel_nome: form.responsavel_nome || null,
        retorno_previsto: form.retorno_previsto || null,
        status: form.status,
        data_registro: new Date().toISOString().split("T")[0],
        data_hora: new Date().toISOString(),
      });
      setDialogOpen(false);
      setForm({ ...emptyComunicacaoForm });
      await load();
      toast.success("Comunicação registrada");
    } catch (err) {
      console.error("[clientes] erro ao salvar comunicação:", err);
      notifyError(err);
    }
    setSaving(false);
  };

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary/70" />
          <h3 className="font-semibold text-sm">Histórico de Comunicações</h3>
          {comunicacoes.length > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5">{comunicacoes.length}</Badge>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="gap-1.5 h-8 w-full sm:w-auto"
          aria-label="Registrar nova comunicação"
          onClick={() => { setForm({ ...emptyComunicacaoForm }); setDialogOpen(true); }}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Nova Comunicação
        </Button>
      </div>
      {loading ? (
        <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
      ) : comunicacoes.length === 0 ? (
        <div className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-3 text-xs text-muted-foreground border border-dashed">
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span>Nenhuma comunicação registrada. Clique em <strong>Nova Comunicação</strong> para registrar a primeira interação.</span>
        </div>
      ) : (
        <div className="space-y-1 max-h-[360px] overflow-y-auto">
          {comunicacoes.map((com) => (
            <div key={com.id} className="flex items-start justify-between py-2 px-2 rounded-md hover:bg-muted/30 border-b last:border-b-0 gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">{com.assunto || "—"}</span>
                  {com.tipo && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {COMUNICACAO_TIPO_LABEL[com.tipo] || com.tipo}
                    </Badge>
                  )}
                </div>
                {com.conteudo && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{com.conteudo}</p>
                )}
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  <span>{new Date(com.data_hora || com.data_registro).toLocaleString("pt-BR")}</span>
                  {com.responsavel_nome && <span>· {com.responsavel_nome}</span>}
                  {com.retorno_previsto && (
                    <span className="text-warning">· Retorno: {new Date(com.retorno_previsto + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
                  {COMUNICACAO_STATUS_LABEL[com.status] || com.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Registrar Comunicação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(COMUNICACAO_TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(COMUNICACAO_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assunto <span className="text-destructive">*</span></Label>
              <Input value={form.assunto} onChange={(e) => setForm({ ...form, assunto: e.target.value })} placeholder="Resumo da comunicação" />
            </div>
            <div className="space-y-2">
              <Label>Descrição / Conteúdo</Label>
              <Textarea
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                rows={3}
                placeholder="Detalhes da comunicação, pontos discutidos, conclusões..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Input value={form.responsavel_nome} onChange={(e) => setForm({ ...form, responsavel_nome: e.target.value })} placeholder="Nome do responsável" />
              </div>
              <div className="space-y-2">
                <Label>Retorno Previsto</Label>
                <Input type="date" value={form.retorno_previsto} onChange={(e) => setForm({ ...form, retorno_previsto: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="button" disabled={saving} onClick={handleSave}>
                {saving ? "Registrando..." : "Registrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

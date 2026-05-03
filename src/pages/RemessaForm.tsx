/**
 * RemessaForm — Dedicated edit/create page for a Remessa record.
 *
 * Route: /remessas/new  (create)
 *        /remessas/:id  (edit)
 *
 * This page elevates the modal-only form from Logistica.tsx into a full-screen
 * page to allow deeper editing, direct linking, and better back-navigation.
 * Logistica.tsx remains the primary list/dispatch page.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRemessas, getRemessaById } from "@/services/logistica/remessas.service";
import type { Remessa } from "@/services/logistica/remessas.service";
import {
  listClientesAtivos,
  listTransportadorasAtivas,
  listOrdensVendaAtivas,
  listPedidosCompraAtivos,
  listNotasFiscaisAtivas,
  type LookupRef,
  type DocumentoRef,
  type NotaFiscalRef,
} from "@/services/logistica/lookups.service";
import { statusRemessa } from "@/lib/statusSchema";
import { toast } from "sonner";
import { Save, Truck, Plus } from "lucide-react";
import { notifyError } from "@/utils/errorMessages";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { PageShell } from "@/components/PageShell";
import { EtiquetaCorreiosCard } from "@/components/logistica/EtiquetaCorreiosCard";
import { QuickAddTransportadoraModal } from "@/components/QuickAddTransportadoraModal";

type Cliente = LookupRef;
type Transportadora = LookupRef;
type OrdemVenda = DocumentoRef;
type PedidoCompra = DocumentoRef;
type NotaFiscal = NotaFiscalRef;

interface RemessaForm {
  tipo_remessa: string;
  cliente_id: string;
  transportadora_id: string;
  servico: string;
  codigo_rastreio: string;
  data_postagem: string;
  previsao_entrega: string;
  status_transporte: string;
  peso: string;
  volumes: string;
  valor_frete: string;
  observacoes: string;
  ordem_venda_id: string;
  pedido_compra_id: string;
  nota_fiscal_id: string;
}

const emptyForm: RemessaForm = {
  tipo_remessa: "entrega",
  cliente_id: "", transportadora_id: "", servico: "", codigo_rastreio: "",
  data_postagem: "", previsao_entrega: "", status_transporte: "pendente",
  peso: "", volumes: "1", valor_frete: "", observacoes: "",
  ordem_venda_id: "", pedido_compra_id: "", nota_fiscal_id: "",
};

function remessaToForm(r: Remessa): RemessaForm {
  return {
    tipo_remessa: r.tipo_remessa ?? "entrega",
    cliente_id: r.cliente_id ?? "", transportadora_id: r.transportadora_id ?? "",
    servico: r.servico ?? "", codigo_rastreio: r.codigo_rastreio ?? "",
    data_postagem: r.data_postagem ?? "", previsao_entrega: r.previsao_entrega ?? "",
    status_transporte: r.status_transporte ?? "pendente",
    peso: r.peso?.toString() ?? "", volumes: r.volumes?.toString() ?? "1",
    valor_frete: r.valor_frete?.toString() ?? "", observacoes: r.observacoes ?? "",
    ordem_venda_id: r.ordem_venda_id ?? "",
    pedido_compra_id: r.pedido_compra_id ?? "", nota_fiscal_id: r.nota_fiscal_id ?? "",
  };
}

export default function RemessaFormPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const { create, update, isSaving } = useRemessas();

  const [form, setForm] = useState<RemessaForm>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  // Snapshot do baseline para detecção de dirty (deep-compare via JSON).
  const baselineRef = useRef<RemessaForm>(emptyForm);
  const [, forceRerender] = useState(0);
  const isDirty = JSON.stringify(form) !== JSON.stringify(baselineRef.current);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  // Bloqueia fechar/recarregar a aba se houver mudanças não salvas.
  useBeforeUnloadGuard(isDirty);

  // Lookup data
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
  const [ordensVenda, setOrdensVenda] = useState<OrdemVenda[]>([]);
  const [pedidosCompra, setPedidosCompra] = useState<PedidoCompra[]>([]);
  const [notasFiscais, setNotasFiscais] = useState<NotaFiscal[]>([]);
  const [quickAddTranspOpen, setQuickAddTranspOpen] = useState(false);

  useEffect(() => {
    const loadLookups = async () => {
      const [c, t, ov, pc, nf] = await Promise.all([
        listClientesAtivos(),
        listTransportadorasAtivas(),
        listOrdensVendaAtivas(),
        listPedidosCompraAtivos(),
        listNotasFiscaisAtivas(),
      ]);
      setClientes(c);
      setTransportadoras(t);
      setOrdensVenda(ov);
      setPedidosCompra(pc);
      setNotasFiscais(nf);
    };
    loadLookups().catch((err) => notifyError(err));
  }, []);

  useEffect(() => {
    if (isNew) {
      baselineRef.current = emptyForm;
      forceRerender((n) => n + 1);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const data = await getRemessaById(id!);
        if (!data) {
          toast.error("Remessa não encontrada");
          navigate("/logistica");
          return;
        }
        const next = remessaToForm(data);
        baselineRef.current = next;
        setForm(next);
      } catch (err) {
        notifyError(err);
        navigate("/logistica");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isNew, navigate]);

  const setF = (patch: Partial<RemessaForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleCancel = async () => {
    if (isDirty) {
      const ok = await confirm();
      if (!ok) return;
    }
    navigate("/logistica");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.transportadora_id) { toast.error("Transportadora é obrigatória"); return; }
    const payload = {
      tipo_remessa: form.tipo_remessa,
      cliente_id: form.cliente_id || null,
      transportadora_id: form.transportadora_id || null,
      servico: form.servico || null,
      codigo_rastreio: form.codigo_rastreio || null,
      data_postagem: form.data_postagem || null,
      previsao_entrega: form.previsao_entrega || null,
      status_transporte: form.status_transporte || "pendente",
      peso: form.peso ? Number(form.peso) : null,
      volumes: form.volumes ? Number(form.volumes) : 1,
      valor_frete: form.valor_frete ? Number(form.valor_frete) : null,
      observacoes: form.observacoes || null,
      ordem_venda_id: form.ordem_venda_id || null,
      pedido_compra_id: form.pedido_compra_id || null,
      nota_fiscal_id: form.nota_fiscal_id || null,
    };
    try {
      if (isNew) {
        const created = await create(payload);
        baselineRef.current = form;
        const newId = (created as { id?: string } | null)?.id;
        if (newId) navigate(`/remessas/${newId}?created=1`, { replace: true });
        else navigate("/logistica");
      } else {
        await update(id!, payload);
        baselineRef.current = form;
        navigate("/logistica");
      }
    } catch (err: unknown) {
      notifyError(err);
    }
  };

  return (
    <PageShell
      backTo={handleCancel}
      maxWidth="3xl"
      title={
        <span className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          {isNew ? "Nova Remessa" : "Editar Remessa"}
        </span>
      }
    >

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Informações Básicas</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de Remessa *</Label>
                    <Select value={form.tipo_remessa} onValueChange={(v) => setF({ tipo_remessa: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrega">Entrega (Saída)</SelectItem>
                        <SelectItem value="recebimento">Recebimento (Entrada)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status_transporte} onValueChange={(v) => setF({ status_transporte: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusRemessa).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Transportadora *</Label>
                    <div className="flex gap-1">
                      <Select value={form.transportadora_id} onValueChange={(v) => setF({ transportadora_id: v })}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {transportadoras.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.nome_razao_social}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setQuickAddTranspOpen(true)}
                        aria-label="Cadastrar nova transportadora"
                        title="Cadastrar nova"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Cliente</Label>
                    <Select value={form.cliente_id || "none"} onValueChange={(v) => setF({ cliente_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Opcional..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {clientes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.nome_razao_social}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Serviço</Label>
                    <Input value={form.servico} onChange={(e) => setF({ servico: e.target.value })} placeholder="Ex: SEDEX, PAC..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Código de Rastreio</Label>
                    <Input value={form.codigo_rastreio} onChange={(e) => setF({ codigo_rastreio: e.target.value.toUpperCase() })} placeholder="Ex: BR123456789BR" className="font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Postagem</Label>
                    <Input type="date" value={form.data_postagem} onChange={(e) => setF({ data_postagem: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Previsão de Entrega</Label>
                    <Input type="date" value={form.previsao_entrega} onChange={(e) => setF({ previsao_entrega: e.target.value })} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Peso (kg)</Label>
                    <Input type="number" step="0.01" min="0" value={form.peso} onChange={(e) => setF({ peso: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Volumes</Label>
                    <Input type="number" min="1" value={form.volumes} onChange={(e) => setF({ volumes: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor do Frete (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={form.valor_frete} onChange={(e) => setF({ valor_frete: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={form.observacoes} onChange={(e) => setF({ observacoes: e.target.value })} rows={3} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Vínculos Operacionais</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Pedido de Venda</Label>
                    <Select value={form.ordem_venda_id || "none"} onValueChange={(v) => setF({ ordem_venda_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Opcional..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {ordensVenda.map((ov) => (
                          <SelectItem key={ov.id} value={ov.id}>{ov.numero}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Pedido de Compra</Label>
                    <Select value={form.pedido_compra_id || "none"} onValueChange={(v) => setF({ pedido_compra_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Opcional..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {pedidosCompra.map((pc) => (
                          <SelectItem key={pc.id} value={pc.id}>{pc.numero}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <Label>Nota Fiscal</Label>
                    <Select value={form.nota_fiscal_id || "none"} onValueChange={(v) => setF({ nota_fiscal_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Opcional..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {notasFiscais.map((nf) => (
                          <SelectItem key={nf.id} value={nf.id}>
                            {nf.numero} ({nf.tipo === "entrada" ? "Entr." : "Saída"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!isNew && id && (
              <EtiquetaCorreiosCard
                remessaId={id}
                tipoRemessa={form.tipo_remessa}
                servico={form.servico}
                peso={form.peso}
                clienteId={form.cliente_id}
              />
            )}

            <div className="hidden md:flex justify-end gap-3 pb-6">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                <Save className="h-4 w-4 mr-1.5" />
                {isSaving ? "Salvando..." : isNew ? "Criar Remessa" : "Salvar Alterações"}
              </Button>
            </div>

            {/* Spacer mobile para não cobrir conteúdo com o footer sticky */}
            {(isDirty || isNew) && <div className="h-24 md:hidden" aria-hidden />}

            {/* Footer sticky mobile — sempre visível em new; em edit só quando dirty */}
            {(isDirty || isNew) && (
              <div
                className="md:hidden fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t z-40 px-3 py-3 flex flex-col-reverse gap-2"
                style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
              >
                <Button type="button" variant="outline" onClick={handleCancel} className="w-full min-h-11">
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving} className="w-full min-h-11">
                  <Save className="h-4 w-4 mr-1.5" />
                  {isSaving ? "Salvando..." : isNew ? "Criar Remessa" : "Salvar Alterações"}
                </Button>
              </div>
            )}
          </form>
        )}
      {confirmDialog}
      <QuickAddTransportadoraModal
        open={quickAddTranspOpen}
        onClose={() => setQuickAddTranspOpen(false)}
        onCreated={async (id) => {
          const updated = await listTransportadorasAtivas();
          setTransportadoras(updated);
          setF({ transportadora_id: id });
        }}
      />
    </PageShell>
  );
}

/**
 * FreteSimuladorCard — orquestrador do simulador de frete.
 *
 * Toda a lógica de estado/serviço foi extraída para `useFreteSimulador.ts`.
 * A UI foi dividida em: FreteSimuladorForm e FreteOpcoesList (FreteSimuladorResultados).
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Loader2, Package, Truck, Plus, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useFreteSimulador, type UseFreteSimuladorProps } from './useFreteSimulador';
import { FreteSimuladorForm } from './FreteSimuladorForm';
import { FreteOpcoesList } from './FreteSimuladorResultados';
import type { FreteSelecaoPayload } from '@/services/freteSimulacao.service';

interface FreteSimuladorCardProps {
  orcamentoId: string | null;
  clienteId: string;
  cepDestino: string;
  pesoTotal: number;
  valorMercadoria: number;
  simulacaoId?: string | null;
  onSelect: (payload: FreteSelecaoPayload) => void;
  onEmbalagemPesoChange?: (peso: number) => void;
}

export function FreteSimuladorCard(props: FreteSimuladorCardProps) {
  const {
    volumes, setVolumes, alturaCm, setAlturaCm, larguraCm, setLarguraCm, comprimentoCm, setComprimentoCm,
    opcoes, opcaoSelecionadaId, desatualizado, loadingCorreios, loadingTransp, salvandoOpcao, cepOrigem, loadingConfig,
    clienteTransp, cepDestinoClean, canSimulate,
    opcoesCorreios, opcoesTransp, opcoesManual,
    transpForm, setTranspForm, transpFormFor, manualForm, setManualForm,
    caixas, gerenciarCaixasOpen, setGerenciarCaixasOpen, novaCaixa, setNovaCaixa, salvandoCaixa, editandoCaixaId,
    handleConsultarCorreios, handleSalvarTransportadora, handleSalvarManual,
    handleRemoverOpcao, handleSelecionarOpcao,
    handleSelecionarCaixa, handleAdicionarCaixa, handleRemoverCaixa, handleEditarCaixa, handleCancelarEdicaoCaixa,
  } = useFreteSimulador(props);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4" />
          Simulador de Frete
        </CardTitle>

        {props.simulacaoId && (
          <div className="mt-2 flex items-center gap-1.5 text-xs rounded-md bg-success/10 text-success px-2 py-1">
            <CheckCircle2 className="h-3 w-3" />
            <span className="truncate">Cotação aplicada ao orçamento</span>
          </div>
        )}

        {!loadingConfig && cepOrigem.length !== 8 && (
          <p className="text-xs text-destructive mt-1">⚠ CEP de origem não configurado. Vá em Administração → Empresa.</p>
        )}
        {!props.clienteId && <p className="text-xs text-muted-foreground mt-1">Selecione um cliente para habilitar o simulador.</p>}
        {props.clienteId && cepDestinoClean.length !== 8 && <p className="text-xs text-muted-foreground mt-1">O cliente não possui CEP válido.</p>}
        {props.pesoTotal <= 0 && <p className="text-xs text-muted-foreground mt-1">Adicione itens com peso para simular o frete.</p>}

        {desatualizado && opcoes.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-warning bg-warning/10 rounded-md px-2 py-1 mt-2">
            <AlertTriangle className="h-3 w-3" /> Simulação desatualizada. Itens ou destino mudaram.
          </div>
        )}

        {cepOrigem.length === 8 && cepDestinoClean.length === 8 && (
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
            <span>Origem: <strong className="text-foreground">{cepOrigem}</strong></span>
            <span>Destino: <strong className="text-foreground">{cepDestinoClean}</strong></span>
            <span>Peso: <strong className="text-foreground">{props.pesoTotal.toFixed(3)} kg</strong></span>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <FreteSimuladorForm
          volumes={volumes} setVolumes={setVolumes}
          alturaCm={alturaCm} setAlturaCm={setAlturaCm}
          larguraCm={larguraCm} setLarguraCm={setLarguraCm}
          comprimentoCm={comprimentoCm} setComprimentoCm={setComprimentoCm}
          caixas={caixas} gerenciarCaixasOpen={gerenciarCaixasOpen} setGerenciarCaixasOpen={setGerenciarCaixasOpen}
          novaCaixa={novaCaixa} setNovaCaixa={setNovaCaixa} salvandoCaixa={salvandoCaixa} editandoCaixaId={editandoCaixaId}
          onSelecionarCaixa={handleSelecionarCaixa} onAdicionarCaixa={handleAdicionarCaixa} onRemoverCaixa={handleRemoverCaixa}
          onEditarCaixa={handleEditarCaixa} onCancelarEdicaoCaixa={handleCancelarEdicaoCaixa}
        />

        <Separator />

        <Tabs defaultValue="correios">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="correios" className="text-xs">Correios {opcoesCorreios.length > 0 && `(${opcoesCorreios.length})`}</TabsTrigger>
            <TabsTrigger value="transportadoras" className="text-xs">Transportadoras {opcoesTransp.length > 0 && `(${opcoesTransp.length})`}</TabsTrigger>
            <TabsTrigger value="manual" className="text-xs">Manual {opcoesManual.length > 0 && `(${opcoesManual.length})`}</TabsTrigger>
          </TabsList>

          {/* Correios */}
          <TabsContent value="correios" className="space-y-3 mt-3">
            <Button size="sm" variant="outline" onClick={handleConsultarCorreios} disabled={loadingCorreios || !canSimulate} className="gap-2">
              {loadingCorreios ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
              {loadingCorreios ? 'Consultando...' : desatualizado ? 'Reconsultar Correios' : 'Consultar Correios'}
              {desatualizado && !loadingCorreios && <RefreshCw className="h-3.5 w-3.5 text-warning" />}
            </Button>
            {opcoesCorreios.length > 0 && <FreteOpcoesList opcoes={opcoesCorreios} opcaoSelecionadaId={opcaoSelecionadaId} onSelect={handleSelecionarOpcao} onRemove={handleRemoverOpcao} />}
            {opcoesCorreios.length === 0 && !loadingCorreios && <p className="text-xs text-muted-foreground">Clique em "Consultar Correios" para buscar opções de frete.</p>}
          </TabsContent>

          {/* Transportadoras */}
          <TabsContent value="transportadoras" className="space-y-4 mt-3">
            {loadingTransp && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando transportadoras...</div>
            )}
            {!loadingTransp && clienteTransp.length === 0 && (
              <p className="text-xs text-muted-foreground">Este cliente não possui transportadoras vinculadas. Cadastre-as em Cadastros → Clientes → Transportadoras.</p>
            )}
            {clienteTransp.map((vt) => {
              const form = transpFormFor(vt.id);
              const nomeTransp = vt.transportadoras.nome_fantasia || vt.transportadoras.nome_razao_social;
              return (
                <div key={vt.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{nomeTransp}</p>
                      <p className="text-xs text-muted-foreground">
                        {vt.modalidade && <span>Modalidade: {vt.modalidade} · </span>}
                        {vt.prazo_medio && <span>Prazo médio: {vt.prazo_medio} · </span>}
                        Prioridade: {vt.prioridade ?? '—'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Valor (R$)*</Label>
                      <Input type="number" min={0} placeholder="0,00" value={form.valor} onChange={(e) => setTranspForm((p) => ({ ...p, [vt.id]: { ...transpFormFor(vt.id), valor: e.target.value } }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Prazo (dias)</Label>
                      <Input type="number" min={0} placeholder="—" value={form.prazo} onChange={(e) => setTranspForm((p) => ({ ...p, [vt.id]: { ...transpFormFor(vt.id), prazo: e.target.value } }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Serviço</Label>
                      <Input placeholder="Ex.: Padrão" value={form.servico} onChange={(e) => setTranspForm((p) => ({ ...p, [vt.id]: { ...transpFormFor(vt.id), servico: e.target.value } }))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Obs.</Label>
                      <Input placeholder="—" value={form.obs} onChange={(e) => setTranspForm((p) => ({ ...p, [vt.id]: { ...transpFormFor(vt.id), obs: e.target.value } }))} className="h-8 text-sm" />
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => handleSalvarTransportadora(vt)} disabled={salvandoOpcao} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Adicionar proposta
                  </Button>
                </div>
              );
            })}
            {opcoesTransp.length > 0 && (
              <>
                <Separator />
                <p className="text-xs font-medium text-muted-foreground">Propostas adicionadas</p>
                <FreteOpcoesList opcoes={opcoesTransp} opcaoSelecionadaId={opcaoSelecionadaId} onSelect={handleSelecionarOpcao} onRemove={handleRemoverOpcao} />
              </>
            )}
          </TabsContent>

          {/* Manual */}
          <TabsContent value="manual" className="space-y-3 mt-3">
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-xs font-medium">Nova opção manual</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Valor (R$)*</Label>
                  <Input type="number" min={0} placeholder="0,00" value={manualForm.valor} onChange={(e) => setManualForm((p) => ({ ...p, valor: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Prazo (dias)</Label>
                  <Input type="number" min={0} placeholder="—" value={manualForm.prazo} onChange={(e) => setManualForm((p) => ({ ...p, prazo: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Serviço / Descrição</Label>
                  <Input placeholder="Ex.: Motoboy" value={manualForm.servico} onChange={(e) => setManualForm((p) => ({ ...p, servico: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Modalidade</Label>
                  <Input placeholder="Ex.: Rodoviário" value={manualForm.modalidade} onChange={(e) => setManualForm((p) => ({ ...p, modalidade: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Observação</Label>
                  <Textarea placeholder="—" value={manualForm.obs} onChange={(e) => setManualForm((p) => ({ ...p, obs: e.target.value }))} className="min-h-[60px] text-sm" />
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={handleSalvarManual} disabled={salvandoOpcao} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Adicionar opção manual
              </Button>
            </div>
            {opcoesManual.length > 0 && (
              <>
                <Separator />
                <p className="text-xs font-medium text-muted-foreground">Opções manuais</p>
                <FreteOpcoesList opcoes={opcoesManual} opcaoSelecionadaId={opcaoSelecionadaId} onSelect={handleSelecionarOpcao} onRemove={handleRemoverOpcao} />
              </>
            )}
          </TabsContent>
        </Tabs>

        {opcoes.length > 1 && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Comparativo de opções</p>
              <FreteOpcoesList opcoes={[...opcoes].sort((a, b) => a.valor_total - b.valor_total)} opcaoSelecionadaId={opcaoSelecionadaId} onSelect={handleSelecionarOpcao} onRemove={handleRemoverOpcao} showFonte />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

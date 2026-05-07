import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { ModulePage } from '@/components/ModulePage';
import { Button } from '@/components/ui/button';
import { useCan } from '@/hooks/useCan';
import {
  aprovarEGerarFinal,
  atualizarComentario,
  atualizarStatusEditorial,
  downloadApresentacao,
  downloadBlob,
  executarCadenciaAgora,
  gerarApresentacao,
  incluirTemplateApresentacao,
  listarApresentacaoCadencias,
  listarApresentacaoGeracoes,
  listarApresentacaoTemplates,
  listarComentarios,
  removerApresentacaoCadencia,
  salvarApresentacaoCadencia,
  salvarPreferenciasApresentacao,
  registrarTelemetriaSlides,
} from '@/services/apresentacaoService';
import { ApresentacaoGeracaoDialog } from '@/components/apresentacao/ApresentacaoGeracaoDialog';
import { ApresentacaoSlidesPreview } from '@/components/apresentacao/ApresentacaoSlidesPreview';
import { ApresentacaoHistoricoTable } from '@/components/apresentacao/ApresentacaoHistoricoTable';
import { ApresentacaoComentariosEditor } from '@/components/apresentacao/ApresentacaoComentariosEditor';
import { ApresentacaoTemplateManager } from '@/components/apresentacao/ApresentacaoTemplateManager';
import { ApresentacaoAprovacaoBar } from '@/components/apresentacao/ApresentacaoAprovacaoBar';
import { ApresentacaoCadenciaManager } from '@/components/apresentacao/ApresentacaoCadenciaManager';
import { ApresentacaoTelemetriaPanel } from '@/components/apresentacao/ApresentacaoTelemetriaPanel';
import type { ApresentacaoGeracao, SlideCodigo } from '@/types/apresentacao';

export default function ApresentacaoGerencial() {
  const { can } = useCan();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedGeracaoId, setSelectedGeracaoId] = useState<string | null>(null);

  const canVisualizar = can('apresentacao:visualizar');
  const canGerar = can('apresentacao:gerar');
  const canEditarComentarios = can('apresentacao:editar_comentarios');
  const canDownload = can('apresentacao:download');
  const canIncluirTemplate = can('apresentacao:gerenciar_templates') || can('apresentacao:criar');
  const canAprovar = can('apresentacao:aprovar');

  const { data: templates = [] } = useQuery({ queryKey: ['apresentacao-templates'], queryFn: listarApresentacaoTemplates, enabled: canVisualizar });
  const { data: geracoes = [], refetch, isLoading } = useQuery({ queryKey: ['apresentacao-geracoes'], queryFn: listarApresentacaoGeracoes, enabled: canVisualizar });
  const { data: comentarios = [] } = useQuery({ queryKey: ['apresentacao-comentarios', selectedGeracaoId], queryFn: () => listarComentarios(selectedGeracaoId!), enabled: !!selectedGeracaoId });
  const { data: cadencias = [] } = useQuery({ queryKey: ['apresentacao-cadencias'], queryFn: listarApresentacaoCadencias, enabled: canVisualizar });

  const selectedGeracao = useMemo<ApresentacaoGeracao | null>(() => geracoes.find((g) => g.id === selectedGeracaoId) ?? null, [geracoes, selectedGeracaoId]);
  const selectedSlides = useMemo<SlideCodigo[]>(() => (selectedGeracao?.slides_json as any)?.ativos ?? [], [selectedGeracao]);

  const gerarMutation = useMutation({
    mutationFn: gerarApresentacao,
    onSuccess: ({ blob, geracaoId, aguardandoAprovacao }, variables) => {
      if (blob) downloadBlob(blob, `apresentacao_gerencial_${geracaoId.slice(0, 8)}.pptx`);
      toast.success(aguardandoAprovacao ? 'Rascunho criado. Envie para aprovação para gerar versão final.' : 'Apresentação gerada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['apresentacao-geracoes'] });
      setSelectedGeracaoId(geracaoId);
      setDialogOpen(false);

      // Persiste preferências e registra telemetria (best-effort)
      const enabledSlides = (variables.slideConfig ?? []).filter((s) => s.enabled).map((s) => s.codigo);
      void salvarPreferenciasApresentacao({
        ultimo_template_id: variables.templateId,
        ultimo_modo_geracao: variables.modoGeracao,
        ultimos_slides_codigos: enabledSlides,
        ultima_competencia_inicial: variables.competenciaInicial,
        ultima_competencia_final: variables.competenciaFinal,
        exigir_revisao_padrao: variables.exigirRevisao ?? true,
      }).catch(() => undefined);
      void registrarTelemetriaSlides(enabledSlides, 'gerado', geracaoId).catch(() => undefined);
    },
    onError: (err) => toast.error(`Falha ao gerar apresentação: ${err instanceof Error ? err.message : String(err)}`),
  });

  const aprovarMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGeracaoId) throw new Error('Selecione uma geração.');
      return aprovarEGerarFinal(selectedGeracaoId);
    },
    onSuccess: (blob) => {
      if (selectedGeracaoId) downloadBlob(blob, `apresentacao_gerencial_final_${selectedGeracaoId.slice(0, 8)}.pptx`);
      queryClient.invalidateQueries({ queryKey: ['apresentacao-geracoes'] });
      toast.success('Versão final aprovada e gerada.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  const templateMutation = useMutation({
    mutationFn: incluirTemplateApresentacao,
    onSuccess: () => {
      toast.success('Template incluído com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['apresentacao-templates'] });
    },
    onError: (err) => toast.error(`Falha ao incluir template: ${err instanceof Error ? err.message : String(err)}`),
  });

  const cadenciaSaveMutation = useMutation({
    mutationFn: salvarApresentacaoCadencia,
    onSuccess: () => {
      toast.success('Cadência salva.');
      queryClient.invalidateQueries({ queryKey: ['apresentacao-cadencias'] });
    },
    onError: (err) => toast.error(`Falha ao salvar cadência: ${err instanceof Error ? err.message : String(err)}`),
  });

  if (!canVisualizar) {
    return (
      <ModulePage title="Apresentação Gerencial">
        <div className="rounded-md border border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Sem permissão para visualizar.
        </div>
      </ModulePage>
    );
  }

  return (
    <><ModulePage
        title="Apresentação Gerencial"
        headerActions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-11 sm:h-9"
            >
              <RefreshCcw className="h-4 w-4 mr-1" />
              Atualizar
            </Button>
            {canGerar && (
              <Button
                size="sm"
                onClick={() => setDialogOpen(true)}
                className="h-11 sm:h-9"
              >
                <Plus className="h-4 w-4 mr-1" />
                Novo rascunho
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <ApresentacaoAprovacaoBar
            geracao={selectedGeracao}
            canAprovar={canAprovar}
            onEnviarRevisao={async () => {
              if (!selectedGeracaoId) return;
              await atualizarStatusEditorial(selectedGeracaoId, 'revisao');
              queryClient.invalidateQueries({ queryKey: ['apresentacao-geracoes'] });
            }}
            onAprovarGerar={async () => { await aprovarMutation.mutateAsync(); }}
          />

          {(canAprovar || canIncluirTemplate) && <ApresentacaoTelemetriaPanel />}

          {canIncluirTemplate && (
            <ApresentacaoTemplateManager
              templates={templates}
              isSaving={templateMutation.isPending}
              onCreate={async (draft, file) => {
                await templateMutation.mutateAsync({
                  nome: draft.nome,
                  codigo: draft.codigo,
                  versao: draft.versao,
                  descricao: draft.descricao,
                  arquivo: file,
                });
              }}
            />
          )}

          <ApresentacaoCadenciaManager
            cadencias={cadencias}
            templates={templates}
            canManage={canIncluirTemplate}
            isSaving={cadenciaSaveMutation.isPending}
            onSave={async (input) => { await cadenciaSaveMutation.mutateAsync(input); }}
            onRemove={async (id) => {
              await removerApresentacaoCadencia(id);
              queryClient.invalidateQueries({ queryKey: ['apresentacao-cadencias'] });
            }}
            onRunNow={async (id) => {
              await executarCadenciaAgora(id);
              queryClient.invalidateQueries({ queryKey: ['apresentacao-cadencias'] });
              queryClient.invalidateQueries({ queryKey: ['apresentacao-geracoes'] });
            }}
          />

          <ApresentacaoSlidesPreview
            activeSlides={selectedSlides.length ? selectedSlides : undefined}
            dataAvailability={dataAvailability}
          />

          {canEditarComentarios && !!selectedGeracaoId && (
            <ApresentacaoComentariosEditor comentarios={comentarios} onChange={(id, value) => atualizarComentario(id, value).catch(() => toast.error('Falha ao salvar comentário.'))} />
          )}

          <ApresentacaoHistoricoTable
            geracoes={geracoes}
            isLoading={isLoading}
            canDownload={canDownload}
            onDownload={async (g) => {
              setSelectedGeracaoId(g.id);
              const blob = await downloadApresentacao(g);
              downloadBlob(blob, `apresentacao_gerencial_${g.id.slice(0, 8)}.pptx`);
            }}
          />
        </div>
      </ModulePage>

      {canGerar && (
        <ApresentacaoGeracaoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          templates={templates}
          isGenerating={gerarMutation.isPending}
          onGerar={async (p) => {
            await gerarMutation.mutateAsync({
              templateId: p.templateId,
              competenciaInicial: p.competenciaInicial,
              competenciaFinal: p.competenciaFinal,
              modoGeracao: p.modoGeracao,
              slideConfig: p.slideConfig,
              exigirRevisao: p.exigirRevisao,
            });
          }}
        />
      )}
    </>
  );
}

/**
 * Centraliza o estado de URL do workspace de Relatórios.
 *
 * Responsabilidades:
 * - Validar `?tipo` contra `reportConfigs` (redireciona ao catálogo se inválido).
 * - Expor `dataInicio` / `dataFim` derivados de `?di` / `?df`.
 * - Materializar `FiltrosRelatorioState` a partir dos demais query params.
 * - Oferecer `setFiltrosState` que serializa de volta para a URL.
 *
 * Extraído de `Relatorios.tsx` (Fase 5 do roadmap) para reduzir o tamanho do
 * componente e permitir testes isolados do contrato URL ↔ filtros.
 */

import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { reportConfigs } from '@/config/relatoriosConfig';
import type { TipoRelatorio } from '@/services/relatorios.service';
import type { FiltrosRelatorioState } from '@/pages/relatorios/components/Filtros/FiltrosRelatorio';

export interface RelatorioUrlState {
  tipo: TipoRelatorio | '';
  dataInicio: string;
  dataFim: string;
  filtrosState: FiltrosRelatorioState;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  setDataInicio: (v: string) => void;
  setDataFim: (v: string) => void;
  setFiltrosState: (partial: Partial<FiltrosRelatorioState>) => void;
  updateParams: (patch: Record<string, string | string[] | undefined>) => void;
}

export function useRelatorioUrlState(): RelatorioUrlState {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTipo = searchParams.get('tipo') || '';
  const isValidTipo =
    rawTipo !== '' && Object.prototype.hasOwnProperty.call(reportConfigs, rawTipo);
  const tipo = (isValidTipo ? rawTipo : '') as TipoRelatorio | '';

  // Reset URL when ?tipo is invalid (e.g. ?tipo=hack) so the catalog renders
  // instead of an empty workspace.
  useEffect(() => {
    if (rawTipo !== '' && !isValidTipo) {
      setSearchParams({});
      toast.warning(`Relatório "${rawTipo}" não existe. Voltando ao catálogo.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSearchParams é estável (react-router); incluí-lo causaria warnings sem efeito
  }, [rawTipo, isValidTipo]);

  const dataInicio = searchParams.get('di') || '';
  const dataFim = searchParams.get('df') || '';

  const filtrosState = useMemo<FiltrosRelatorioState>(
    () => ({
      clienteIds: searchParams.get('cli') ? searchParams.get('cli')!.split(',') : [],
      fornecedorIds: searchParams.get('for') ? searchParams.get('for')!.split(',') : [],
      grupoIds: searchParams.get('grp') ? searchParams.get('grp')!.split(',') : [],
      statusFiltro: searchParams.get('st') || 'todos',
      agrupamento:
        (searchParams.get('ag') as FiltrosRelatorioState['agrupamento']) || 'padrao',
      tipos: searchParams.get('tp') ? searchParams.get('tp')!.split(',') : [],
      dreCompetencia:
        (searchParams.get('drc') as FiltrosRelatorioState['dreCompetencia']) || 'mes',
      dreMes: searchParams.get('drm') || new Date().toISOString().slice(0, 7),
      dreModo:
        (searchParams.get('drmo') as FiltrosRelatorioState['dreModo']) || 'caixa',
    }),
    [searchParams],
  );

  const updateParams = (patch: Record<string, string | string[] | undefined>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) {
          next.delete(k);
        } else {
          next.set(k, Array.isArray(v) ? v.join(',') : v);
        }
      }
      return next;
    });
  };

  const setDataInicio = (v: string) => updateParams({ di: v });
  const setDataFim = (v: string) => updateParams({ df: v });

  const setFiltrosState = (partial: Partial<FiltrosRelatorioState>) => {
    const patch: Record<string, string | string[] | undefined> = {};
    if ('clienteIds' in partial) patch.cli = partial.clienteIds;
    if ('fornecedorIds' in partial) patch.for = partial.fornecedorIds;
    if ('grupoIds' in partial) patch.grp = partial.grupoIds;
    if ('statusFiltro' in partial)
      patch.st = partial.statusFiltro === 'todos' ? undefined : partial.statusFiltro;
    if ('agrupamento' in partial)
      patch.ag = partial.agrupamento === 'padrao' ? undefined : partial.agrupamento;
    if ('tipos' in partial) patch.tp = partial.tipos;
    if ('dreCompetencia' in partial)
      patch.drc = partial.dreCompetencia === 'mes' ? undefined : partial.dreCompetencia;
    if ('dreMes' in partial) patch.drm = partial.dreMes;
    if ('dreModo' in partial)
      patch.drmo = partial.dreModo === 'caixa' ? undefined : partial.dreModo;
    updateParams(patch);
  };

  return {
    tipo,
    dataInicio,
    dataFim,
    filtrosState,
    searchParams,
    setSearchParams,
    setDataInicio,
    setDataFim,
    setFiltrosState,
    updateParams,
  };
}
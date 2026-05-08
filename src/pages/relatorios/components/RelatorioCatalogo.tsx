/**
 * Catálogo de relatórios — exibido quando `?tipo` está vazio.
 *
 * Renderiza:
 * - Faixa de relatórios prioritários (cards menores).
 * - Categorias (`reportCategoryMeta`) com seus relatórios.
 *
 * Extraído de `Relatorios.tsx` (Fase 5 do roadmap). Sem mudança visual.
 */

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Layers, Search, SearchX, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import {
  reportConfigs,
  reportCategoryMeta,
  type ReportCategory,
} from '@/config/relatoriosConfig';
import type { TipoRelatorio } from '@/services/relatorios.service';

interface RelatorioCatalogoProps {
  onSelect: (tipo: TipoRelatorio) => void;
}

export function RelatorioCatalogo({ onSelect }: RelatorioCatalogoProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<ReportCategory | 'all'>('all');

  const groupedReports = useMemo(() => {
    const all = Object.values(reportConfigs);
    return Object.entries(reportCategoryMeta).map(([cat, meta]) => ({
      category: cat as ReportCategory,
      ...meta,
      items: all.filter((r) => r.category === cat),
    }));
  }, []);

  const prioritized = Object.values(reportConfigs).filter((r) => r.priority);

  const normalizedSearch = search.trim().toLowerCase();
  const matches = (text: string | undefined) =>
    !normalizedSearch || (text ?? '').toLowerCase().includes(normalizedSearch);

  const filteredGroups = useMemo(() => {
    return groupedReports
      .filter((g) => activeCategory === 'all' || g.category === activeCategory)
      .map((g) => ({
        ...g,
        // Onda 9.3 (M-04) — busca também casa título da categoria, então
        // procurar "comercial" lista todos os relatórios de Comercial.
        items: matches(g.title)
          ? g.items
          : g.items.filter((r) => matches(r.title) || matches(r.description)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groupedReports, activeCategory, normalizedSearch]);

  const showPrioritized = !normalizedSearch && activeCategory === 'all';

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-primary" />
          Selecione um Relatório
        </CardTitle>
        <CardDescription>
          Escolha o contexto de negócio e o relatório desejado para acessar filtros,
          análises e exportações.
        </CardDescription>
        {/* Busca + chips de categoria */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar relatório..."
              className="pl-9 pr-9 h-11 sm:h-9"
              aria-label="Buscar relatório"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
            <Button
              type="button"
              size="sm"
              variant={activeCategory === 'all' ? 'default' : 'outline'}
              onClick={() => setActiveCategory('all')}
              className="h-8 flex-shrink-0 text-xs"
            >
              Todos
            </Button>
            {groupedReports.map((g) => (
              <Button
                key={g.category}
                type="button"
                size="sm"
                variant={activeCategory === g.category ? 'default' : 'outline'}
                onClick={() => setActiveCategory(g.category)}
                className="h-8 flex-shrink-0 gap-1.5 text-xs"
              >
                <g.icon className="h-3.5 w-3.5" />
                {g.title}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {showPrioritized && (
          <div>
            <p className="text-sm font-medium mb-2">Relatórios prioritários</p>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              {prioritized.map((card) => (
                <button
                  key={card.id}
                  onClick={() => onSelect(card.id)}
                  aria-label={`Abrir relatório: ${card.title}`}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-all min-h-14',
                    'active:bg-muted hover:border-primary/30 bg-card',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <card.icon className="h-5 w-5 text-primary flex-shrink-0" />
                    <p className="text-sm font-semibold leading-tight truncate">{card.title}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-4">
          {filteredGroups.length === 0 && (
            <div className="rounded-lg border border-dashed">
              <EmptyState
                variant="noResults"
                icon={SearchX}
                title="Nenhum relatório encontrado"
                description={`Nenhum resultado para "${search}". Tente outro termo.`}
                className="py-8"
              />
            </div>
          )}
          {filteredGroups.map((group) => (
            <div key={group.category} className="rounded-lg border p-4">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                <group.icon className="h-4 w-4 text-muted-foreground" />
                {group.title}
              </p>
              <div className="grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
                {group.items.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => onSelect(card.id)}
                    aria-label={`Abrir relatório: ${card.title}`}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-all min-h-16',
                      'active:bg-muted hover:border-primary/30 bg-card',
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <card.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">{card.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{card.description}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
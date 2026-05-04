import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Search, Sparkles } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { flatNavItems, quickActions, navSections } from '@/lib/navigation';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { useCan } from '@/hooks/useCan';
import { useVisibleNavSections } from '@/hooks/useVisibleNavSections';
import { toast } from 'sonner';
import { useRelationalNavigation, type EntityType } from '@/contexts/RelationalNavigationContext';

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type EntityCategory = 'Clientes' | 'Produtos' | 'Orçamentos' | 'Notas';
interface EntityResult {
  id: string;
  entityId: string;
  entityType: EntityType;
  title: string;
  subtitle: string;
  category: EntityCategory;
}

const CATEGORY_LABEL: Record<string, EntityCategory> = {
  cliente: 'Clientes',
  produto: 'Produtos',
  orcamento: 'Orçamentos',
  nota_fiscal: 'Notas',
};

const CATEGORY_PERMISSION: Record<string, string> = {
  cliente: 'clientes:visualizar',
  produto: 'produtos:visualizar',
  orcamento: 'orcamentos:visualizar',
  nota_fiscal: 'faturamento_fiscal:visualizar',
};

const RECENT_KEY = 'erp:global-search:recent';

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function highlight(text: string, term: string) {
  if (!term.trim()) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return (
    <>
      {parts.map((part, idx) =>
        part.toLowerCase() === term.toLowerCase() ? <mark key={`${part}-${idx}`} className="rounded bg-warning/35 px-0.5">{part}</mark> : part
      )}
    </>
  );
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const navigate = useNavigate();
  const { can } = useCan();
  const visibleSections = useVisibleNavSections();
  const visibleSectionKeys = useMemo(() => new Set(visibleSections.map((s) => s.key)), [visibleSections]);
  // Mapa path-base → leaf, para checar `disabled` rapidamente sem percorrer árvore.
  const disabledPaths = useMemo(() => {
    const set = new Set<string>();
    for (const sec of navSections) {
      if (sec.disabled && sec.directPath) set.add(sec.directPath.split('?')[0]);
      for (const grp of sec.items) {
        for (const it of grp.items) {
          if (it.disabled) set.add(it.path.split('?')[0]);
        }
      }
    }
    return set;
  }, []);
  const isPathDisabled = (path: string) => {
    const base = path.split('?')[0];
    if (disabledPaths.has(base)) return true;
    // Marca também sub-rotas de path desabilitado (ex.: /faturamento/cadastros).
    for (const d of disabledPaths) {
      if (base === d || base.startsWith(`${d}/`)) return true;
    }
    return false;
  };
  const { pushView } = useRelationalNavigation();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [entityResults, setEntityResults] = useState<EntityResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (debouncedSearch.trim().length < 2) {
      setEntityResults([]);
      return;
    }

    const term = debouncedSearch.trim();
    let active = true;

    // RPC unificada que respeita RLS — uma chamada em vez de 4 selects.
    supabase
      .rpc('global_search', { search_term: term, max_per_category: 4 })
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        const merged: EntityResult[] = (data as Array<{ category: string; entity_id: string; title: string; subtitle: string }>)
          .filter((row) => {
            // Filtra por permissão no front, mesmo que a RLS já barrasse —
            // evita mostrar resultados que abririam um drawer com erro.
            const perm = CATEGORY_PERMISSION[row.category];
            return perm ? can(perm as never) : true;
          })
          .map((row) => ({
            id: `${row.category}-${row.entity_id}`,
            entityId: row.entity_id,
            entityType: row.category as EntityType,
            title: row.title,
            subtitle: row.subtitle,
            category: CATEGORY_LABEL[row.category] ?? 'Clientes',
          }));
        setEntityResults(merged);
      });

    return () => {
      active = false;
    };
  }, [debouncedSearch, can]);

  const navigationResults = useMemo(
    () =>
      flatNavItems
        .filter((item) => !item.sectionKey || visibleSectionKeys.has(item.sectionKey))
        .map((item) => ({
        id: item.path,
        title: item.title,
        category: 'Navegação',
        subtitle: item.section ? `${item.section} · ${item.subgroup}` : 'Navegação',
        path: item.path,
        disabled: isPathDisabled(item.path),
      })),
    [visibleSectionKeys, disabledPaths],
  );

  const filteredNavigation = useMemo(() => {
    if (!search.trim()) return navigationResults;
    const term = search.toLowerCase();
    return navigationResults.filter((item) => `${item.title} ${item.subtitle}`.toLowerCase().includes(term));
  }, [navigationResults, search]);

  const filteredActions = useMemo(() => {
    const enriched = [
      ...quickActions,
      { id: 'nova-venda', title: 'Novo Pedido', description: 'Ver pedidos e faturamento', path: '/pedidos', shortcut: '⌃⇧N' },
      { id: 'nova-nota', title: 'Nova Nota Fiscal', description: 'Abrir emissão fiscal', path: '/fiscal?tipo=saida', shortcut: '⌃⇧N', requires: 'faturamento_fiscal:editar' as const },
      { id: 'novo-produto-atalho', title: 'Novo Produto', description: 'Ir para cadastro de produto', path: '/produtos', shortcut: '⌃⇧P' },
    ] as Array<typeof quickActions[number] & { requires?: string }>;
    if (!search.trim()) return enriched;
    const term = search.toLowerCase();
    return enriched.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(term));
  }, [search]);

  // Aplica filtro de permissão (`requires`) e oculta ações apontando para módulos "Em breve".
  const allowedActions = useMemo(
    () =>
      filteredActions.filter((item) => {
        if (item.requires && !can(item.requires as never)) return false;
        if (isPathDisabled(item.path)) return false;
        return true;
      }),
    [filteredActions, can, disabledPaths],
  );

  const groupedEntities = useMemo(() => {
    const groups: Record<string, EntityResult[]> = {};
    for (const item of entityResults) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [entityResults]);

  const persistRecent = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const next = [trimmed, ...recentSearches.filter((x) => x !== trimmed)].slice(0, 6);
    setRecentSearches(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  };

  const handleSelect = (path: string) => {
    if (isPathDisabled(path)) {
      toast.info('Recurso em breve', { description: 'Este módulo está em construção.' });
      onOpenChange(false);
      return;
    }
    persistRecent(search);
    onOpenChange(false);
    navigate(path);
  };

  const handleSelectEntity = (entity: EntityResult) => {
    persistRecent(search);
    onOpenChange(false);
    // Notas fiscais não estão na lista de drawers — fallback para a tela.
    if (entity.entityType === 'nota_fiscal') {
      navigate('/fiscal');
      return;
    }
    pushView(entity.entityType, entity.entityId);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar módulos, registros e ações..." value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        {recentSearches.length > 0 && !search.trim() && (
          <CommandGroup heading="Buscas recentes">
            {recentSearches.map((term) => (
              <CommandItem key={term} onSelect={() => setSearch(term)}>
                <History className="mr-2 h-4 w-4" />
                {term}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {allowedActions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Ações rápidas">
              {allowedActions.map((item) => (
                <CommandItem key={item.id} onSelect={() => handleSelect(item.path)}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span>{highlight(item.title, search)}</span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  </div>
                  {item.shortcut && <span className="ml-auto text-[10px] text-muted-foreground">{item.shortcut}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {Object.entries(groupedEntities).map(([category, items]) => (
          <div key={category}>
            <CommandSeparator />
            <CommandGroup heading={category}>
              {items.map((item) => (
                <CommandItem key={item.id} onSelect={() => handleSelectEntity(item)}>
                  <Search className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span>{highlight(item.title, search)}</span>
                    <span className="text-xs text-muted-foreground">{highlight(item.subtitle, search)}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}

        <CommandSeparator />
        <CommandGroup heading="Navegação">
          {filteredNavigation.map((item) => (
            <CommandItem key={item.id} onSelect={() => handleSelect(item.path)}>
              <Search className="mr-2 h-4 w-4" />
              <div className="flex flex-col">
                <span>
                  {highlight(item.title, search)}
                  {item.disabled && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">Em breve</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{highlight(item.subtitle, search)}</span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

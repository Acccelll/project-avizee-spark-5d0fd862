/**
 * Ações secundárias do header de Relatórios (Atualizar + Salvar/Aplicar
 * favoritos). Extraído de `Relatorios.tsx` em 9.5 — D-01.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BookmarkPlus, BookOpen, RefreshCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface FavoritoItem {
  id: string;
  nome: string;
  params: string;
}

interface Props {
  isLoading: boolean;
  onRefetch: () => void;
  favoritos: FavoritoItem[];
  onSalvar: (nome: string) => Promise<boolean | void>;
  onAplicar: (params: string) => void;
  onRemover: (id: string) => void;
}

export function RelatorioHeaderActions({
  isLoading,
  onRefetch,
  favoritos,
  onSalvar,
  onAplicar,
  onRemover,
}: Props) {
  const [saveNameOpen, setSaveNameOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const handleSalvar = async () => {
    const name = saveName.trim();
    if (!name) return;
    const ok = await onSalvar(name);
    setSaveName('');
    setSaveNameOpen(false);
    if (ok) toast.success(`Configuração "${name}" salva com sucesso!`);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRefetch}
        className="gap-1.5"
        disabled={isLoading}
        aria-label="Atualizar dados do relatório"
      >
        <RefreshCcw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        Atualizar
      </Button>

      <Popover open={saveNameOpen} onOpenChange={setSaveNameOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5" aria-label="Salvar configuração de filtros">
            <BookmarkPlus className="h-3.5 w-3.5" />
            Salvar favorito
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Salvar configuração atual</p>
          <Input
            placeholder="Nome da configuração"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSalvar(); }}
            className="h-8 text-sm"
            autoFocus
          />
          <Button size="sm" className="w-full" onClick={handleSalvar} disabled={!saveName.trim()}>Salvar</Button>
        </PopoverContent>
      </Popover>

      {favoritos.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" aria-label="Carregar configuração favorita">
              <BookOpen className="h-3.5 w-3.5" />
              Aplicar favorito
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3">
            <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Favoritos salvos</p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {favoritos.map((fav) => (
                <div key={fav.id} className="flex items-center justify-between rounded-md hover:bg-muted/50 px-2 py-1.5 gap-2">
                  <button
                    className="flex-1 text-left text-sm truncate"
                    onClick={() => { onAplicar(fav.params); toast.success('Favorito aplicado aos filtros atuais.'); }}
                  >
                    {fav.nome}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    aria-label={`Remover favorito "${fav.nome}"`}
                    onClick={() => { onRemover(fav.id); toast.success(`"${fav.nome}" removido.`); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
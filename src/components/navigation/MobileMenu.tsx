import { ChevronRight, Moon, Search, Settings, Sun, User, X } from 'lucide-react';
import { Fragment, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { quickActions } from '@/lib/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibleNavSections } from '@/hooks/useVisibleNavSections';
import { useCan } from '@/hooks/useCan';
import type { Permission } from '@/utils/permissions';

interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSearch: () => void;
}

const BOTTOM_TAB_KEYS = new Set(['comercial', 'cadastros', 'financeiro']);

export function MobileMenu({ open, onOpenChange, onOpenSearch }: MobileMenuProps) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { profile, signOut } = useAuth();
  const visibleSections = useVisibleNavSections();
  const { can } = useCan();

  const allowedQuickActions = useMemo(
    () => quickActions.filter((a) => !a.requires || can(a.requires as Permission)),
    [can],
  );

  const handleNavigate = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88vh] rounded-t-[20px] px-0 md:hidden">
        <DrawerHeader className="px-4 pb-2 text-left">
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle>Menu</DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </div>
          <DrawerDescription>Navegue pelos módulos e atalhos do ERP AviZee.</DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto px-3 pb-28">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenSearch();
            }}
            className="mb-4 flex h-11 w-full items-center gap-2 rounded-lg bg-muted/50 px-3 text-sm text-muted-foreground transition hover:bg-muted"
          >
            <Search className="h-4 w-4" />
            <span>Buscar módulos, cadastros e páginas</span>
          </button>

          {/* Atalhos rápidos — lista compacta */}
          <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Atalhos rápidos
          </p>
          <div className="mb-4 space-y-0.5">
            {allowedQuickActions.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum atalho disponível para o seu perfil.</p>
            )}
            {allowedQuickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleNavigate(action.path)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{action.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{action.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              </button>
            ))}
          </div>

          {/* Módulos — lista única.
              Seções já presentes na barra inferior (Comercial/Cadastros/Financeiro)
              só aparecem aqui se tiverem sub-itens — evita duplicar o link raiz. */}
          {visibleSections
            .filter((section) => {
              if (!BOTTOM_TAB_KEYS.has(section.key)) return true;
              // Se a seção é só um link direto (sem sub-itens), o bottom-nav já cobre.
              if (section.directPath) return false;
              const hasItems = section.items.some((g) => g.items.length > 0);
              return hasItems;
            })
            .map((section) => (
            <Fragment key={section.key}>
              <div className="flex items-baseline gap-2 px-2 pb-1 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
                {BOTTOM_TAB_KEYS.has(section.key) && (
                  <span className="text-[10px] text-muted-foreground/70">• também na barra inferior</span>
                )}
              </div>
              <div className="mb-1 space-y-0.5">
                {section.directPath ? (
                  <button
                    type="button"
                    onClick={() => handleNavigate(section.directPath!)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent"
                  >
                    <section.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">Abrir {section.title}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                  </button>
                ) : (
                  section.items.flatMap((group) =>
                    group.items.map((item) => {
                      const Icon = item.icon ?? section.icon;
                      return (
                        <button
                          key={item.path}
                          type="button"
                          onClick={() => handleNavigate(item.path)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{item.title}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                        </button>
                      );
                    }),
                  )
                )}
              </div>
            </Fragment>
          ))}

          <Separator className="my-4" />

          {/* Perfil */}
          <div className="rounded-lg bg-muted/40 px-3 py-3">
            <p className="text-sm font-semibold">{profile?.nome || 'Admin'}</p>
            <p className="text-xs text-muted-foreground">{profile?.cargo || 'Administrador'}</p>
          </div>
          <div className="mt-2 space-y-0.5">
            <button
              type="button"
              onClick={() => handleNavigate('/configuracoes')}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent"
            >
              <User className="h-4 w-4 text-muted-foreground" /> Minha conta
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('/configuracoes?tab=aparencia')}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent"
            >
              <Settings className="h-4 w-4 text-muted-foreground" /> Aparência
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
              Tema {theme === 'dark' ? 'claro' : 'escuro'}
            </button>
            <Separator className="my-2" />
            <Button
              variant="ghost"
              className="h-11 w-full justify-start rounded-lg text-destructive hover:text-destructive"
              onClick={async () => {
                onOpenChange(false);
                await signOut();
              }}
            >
              Sair
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

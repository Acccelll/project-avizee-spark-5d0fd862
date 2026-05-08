import { useNavigate } from 'react-router-dom';
import { FileText, UserPlus, Package, ShoppingCart, Receipt, DollarSign } from 'lucide-react';
import { quickActions } from '@/lib/navigation';

const ICONS: Record<string, typeof FileText> = {
  'nova-cotacao': FileText,
  'novo-cliente': UserPlus,
  'novo-produto': Package,
  'novo-pedido-compra': ShoppingCart,
  'nova-nota-saida': Receipt,
  'baixa-financeira': DollarSign,
};

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className="bg-card rounded-xl border p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Ações Rápidas
      </h3>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {quickActions.map((action) => {
          const Icon = ICONS[action.id] ?? FileText;
          return (
            <button
              key={action.id}
              onClick={() => navigate(action.path)}
              aria-label={action.description}
              title={action.description}
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border border-border/60 bg-background px-1.5 py-2 text-center transition-colors hover:bg-muted/40 hover:border-primary/30 active:scale-[0.98]"
            >
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-medium leading-tight text-foreground line-clamp-2">
                {action.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

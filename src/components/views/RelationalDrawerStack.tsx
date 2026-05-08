import { memo } from "react";
import { useRelationalNavigation, EntityType, ViewState } from "@/contexts/RelationalNavigationContext";
import { useDrawerSlots } from "@/contexts/RelationalDrawerSlotsContext";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, X, AlertTriangle, Layers } from "lucide-react";
import { DrawerHeaderShell } from "@/components/ui/DrawerHeaderShell";
import { DrawerStackBreadcrumb } from "@/components/navigation/DrawerStackBreadcrumb";
import { ProdutoView } from "./ProdutoView";
import { ClienteView } from "./ClienteView";
import { FornecedorView } from "./FornecedorView";
import { OrcamentoView } from "./OrcamentoView";
import { PedidoCompraView } from "./PedidoCompraView";
import { NotaFiscalView } from "./NotaFiscalView";
import { RemessaView } from "./RemessaView";
import { OrdemVendaView } from "./OrdemVendaView";
import { GrupoEconomicoView } from "./GrupoEconomicoView";
import { FormaPagamentoView } from "./FormaPagamentoView";
import { TransportadoraView } from "./TransportadoraView";
import { FuncionarioView } from "./FuncionarioView";

const ViewBody = memo(function ViewBody({ view }: { view: ViewState }) {
  switch (view.type) {
    case "produto": return <ProdutoView id={view.id} />;
    case "cliente": return <ClienteView id={view.id} />;
    case "fornecedor": return <FornecedorView id={view.id} />;
    case "orcamento": return <OrcamentoView id={view.id} />;
    case "pedido_compra": return <PedidoCompraView id={view.id} />;
    case "nota_fiscal": return <NotaFiscalView id={view.id} />;
    case "remessa": return <RemessaView id={view.id} />;
    case "ordem_venda": return <OrdemVendaView id={view.id} />;
    case "grupo_economico": return <GrupoEconomicoView id={view.id} />;
    case "forma_pagamento": return <FormaPagamentoView id={view.id} />;
    case "transportadora": return <TransportadoraView id={view.id} />;
    case "funcionario": return <FuncionarioView id={view.id} />;
    default: return <div className="p-4">Visualização não implementada para {view.type}</div>;
  }
});

const TYPE_LABELS: Record<EntityType, string> = {
  produto: "Detalhes do Produto",
  cliente: "Detalhes do Cliente",
  fornecedor: "Detalhes do Fornecedor",
  orcamento: "Cotação / Orçamento",
  pedido_compra: "Pedido de Compra",
  nota_fiscal: "Nota Fiscal",
  remessa: "Remessa / Rastreio",
  ordem_venda: "Pedido",
  grupo_economico: "Grupo Econômico",
  forma_pagamento: "Forma de Pagamento",
  transportadora: "Transportadora",
  funcionario: "Funcionário",
};

const TYPE_BREADCRUMB: Record<EntityType, string> = {
  produto: "Cadastros › Produtos",
  cliente: "Cadastros › Clientes",
  fornecedor: "Cadastros › Fornecedores",
  orcamento: "Comercial › Cotações",
  pedido_compra: "Compras › Pedidos",
  nota_fiscal: "Fiscal › Notas",
  remessa: "Logística › Remessas",
  ordem_venda: "Comercial › Pedidos",
  grupo_economico: "Cadastros › Grupos Econômicos",
  forma_pagamento: "Cadastros › Formas de Pagamento",
  transportadora: "Cadastros › Transportadoras",
  funcionario: "Cadastros › Funcionários",
};

const getTitle = (type: EntityType) => TYPE_LABELS[type] || "Detalhes";

interface DrawerSlotProps {
  view: ViewState;
  index: number;
  total: number;
  isTop: boolean;
  atLimit: boolean;
  onPop: () => void;
  onClear: () => void;
  prevTitle?: string;
}

const DrawerSlot = memo(function DrawerSlot({
  view, index, total, isTop, atLimit, onPop, onClear, prevTitle,
}: DrawerSlotProps) {
  const slots = useDrawerSlots(`${view.type}:${view.id}`);

  const breadcrumbBase = TYPE_BREADCRUMB[view.type] || "";
  // Quando há mais de 1 drawer no stack, mostra a trilha encadeada
  // (Ex.: "Pedido OV-123 › Nota Fiscal NF-567"). Para stacks de 1 drawer,
  // mantém o formato simples ("Comercial › Pedidos · Pedido OV-123").
  const breadcrumbContent = total > 1 ? (
    <DrawerStackBreadcrumb />
  ) : (
    <span className="inline-flex items-center gap-1.5 truncate">
      <span className="truncate">{breadcrumbBase}</span>
      {slots?.breadcrumb && (
        <>
          <span className="text-muted-foreground/50">·</span>
          <span className="truncate">{slots.breadcrumb}</span>
        </>
      )}
    </span>
  );

  const globalControls = (
    <>
      {isTop && atLimit && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center justify-center h-7 w-7 text-warning" aria-label="Limite atingido">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Limite de drawers atingido: novas aberturas pedem confirmação.</TooltipContent>
        </Tooltip>
      )}
      {total > 1 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1" onClick={onClear}>
              <Layers className="h-3.5 w-3.5" />
              Fechar todos
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Fechar todos os drawers</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:ring-1"
            onClick={onPop}
            aria-label="Fechar drawer"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Fechar drawer</TooltipContent>
      </Tooltip>
    </>
  );

  const navigationBar = index > 0 ? (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 -ml-1 text-xs text-muted-foreground hover:text-foreground"
      onClick={onPop}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span className="truncate">Voltar para {prevTitle || "anterior"}</span>
    </Button>
  ) : undefined;

  return (
    <Sheet open onOpenChange={(open) => !open && onPop()}>
      <SheetContent
        side="right"
        className="w-screen h-[100dvh] sm:h-auto sm:max-w-xl rounded-none sm:rounded-l-lg overflow-y-auto p-0 flex flex-col focus-visible:outline-none transition-all duration-300 ease-out sm:border-l"
        style={{
          zIndex: 50 + index,
          transform:
            typeof window !== "undefined" && window.innerWidth >= 640
              ? `translateX(${Math.max(0, (total - 1 - index) * -8)}px)`
              : undefined,
          boxShadow:
            typeof window !== "undefined" && window.innerWidth >= 640
              ? `${(index + 1) * -6}px 0 ${(index + 1) * 16}px rgba(15, 23, 42, 0.12)`
              : undefined,
          borderLeftColor: `hsl(var(--primary) / ${Math.min(0.18 + index * 0.06, 0.45)})`,
        }}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{getTitle(view.type)}</SheetTitle>
          <SheetDescription>Visualização de {getTitle(view.type)}</SheetDescription>
        </SheetHeader>

        <DrawerHeaderShell
          title={getTitle(view.type)}
          breadcrumb={breadcrumbContent}
          counter={{ index, total }}
          globalControls={globalControls}
          navigationBar={navigationBar}
          recordSummary={slots?.summary}
          recordActions={slots?.actions}
        />

        <div className="flex-1 px-3 sm:px-6 pt-3 pb-24 sm:pb-4">
          <ViewBody view={view} />
        </div>
      </SheetContent>
    </Sheet>
  );
});

export function RelationalDrawerStack() {
  const { stack, pendingPush, confirmPendingPush, cancelPendingPush, popView, clearStack, maxDepth } = useRelationalNavigation();
  const atLimit = stack.length >= maxDepth;

  return (
    <>
      <AlertDialog open={!!pendingPush}>
        <AlertDialogContent
          onEscapeKeyDown={(e) => {
            // Não fechar drawers abaixo: trata o ESC como cancelamento do push pendente.
            e.preventDefault();
            cancelPendingPush();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Limite de drawers atingido</AlertDialogTitle>
            <AlertDialogDescription>
              Você atingiu o limite de drawers abertos. Fechar o drawer mais antigo para abrir este novo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPendingPush}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingPush}>Fechar mais antigo e abrir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {stack.map((view, index) => (
        <DrawerSlot
          key={`${view.type}-${view.id}-${index}`}
          view={view}
          index={index}
          total={stack.length}
          isTop={index === stack.length - 1}
          atLimit={atLimit}
          onPop={popView}
          onClear={clearStack}
          prevTitle={index > 0 ? getTitle(stack[index - 1].type) : undefined}
        />
      ))}
    </>
  );
}

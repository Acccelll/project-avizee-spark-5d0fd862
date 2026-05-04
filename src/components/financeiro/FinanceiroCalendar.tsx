import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getEffectiveStatus } from "@/services/financeiro.service";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { BaixaParcialDialog } from "@/components/financeiro/BaixaParcialDialog";
import { useFinanceiroAuxiliares } from "@/pages/financeiro/hooks/useFinanceiroAuxiliares";

interface Lancamento {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  saldo_restante?: number | null;
  data_vencimento: string;
  status: string;
  clientes?: { nome_razao_social: string } | null;
  fornecedores?: { nome_razao_social: string } | null;
  // Allow extra fields used elsewhere — kept loose for the sheet pass-through.
  [key: string]: unknown;
}

interface Props {
  data: Lancamento[];
  onBaixaSuccess?: () => void;
}

export function FinanceiroCalendar({ data, onBaixaSuccess }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [baixaTarget, setBaixaTarget] = useState<Lancamento | null>(null);
  const { contasBancarias, cartoes } = useFinanceiroAuxiliares();

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Lancamento[]>();
    data.forEach((l) => {
      if (!l.data_vencimento) return;
      const key = l.data_vencimento.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    return map;
  }, [data]);

  const selectedDateStr = selectedDate
    ? selectedDate.toISOString().slice(0, 10)
    : null;
  const selectedItems = selectedDateStr
    ? eventsByDate.get(selectedDateStr) || []
    : [];

  const hoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const modifiers = useMemo(() => {
    const receber: Date[] = [];
    const pagar: Date[] = [];
    const vencido: Date[] = [];

    eventsByDate.forEach((items, dateStr) => {
      const d = new Date(dateStr + "T12:00:00");
      const hasVencido = items.some(
        (i) => getEffectiveStatus(i.status, i.data_vencimento, hoje) === "vencido"
      );
      if (hasVencido) {
        vencido.push(d);
      } else {
        const hasReceber = items.some((i) => i.tipo === "receber");
        const hasPagar = items.some((i) => i.tipo === "pagar");
        if (hasReceber) receber.push(d);
        if (hasPagar) pagar.push(d);
      }
    });

    return { receber, pagar, vencido };
  }, [eventsByDate, hoje]);

  const handleSelectDate = (date: Date | undefined) => {
    setSelectedDate(date);
    if (isMobile && date) setSheetOpen(true);
  };

  const renderItemList = (items: Lancamento[], compact = false) => (
    <div className="space-y-2">
      {items.map((l) => {
        const es = getEffectiveStatus(l.status, l.data_vencimento, hoje);
        const podeBaixar = es !== "pago" && es !== "cancelado";
        return (
          <div
            key={l.id}
            className="rounded-lg border p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{l.descricao}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {l.tipo === "receber"
                    ? l.clientes?.nome_razao_social
                    : l.fornecedores?.nome_razao_social || "—"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge
                  variant="outline"
                  className={
                    l.tipo === "receber"
                      ? "border-success/40 text-success bg-success/5"
                      : "border-destructive/40 text-destructive bg-destructive/5"
                  }
                >
                  {l.tipo === "receber" ? "Receber" : "Pagar"}
                </Badge>
                <span className="text-sm font-mono font-semibold whitespace-nowrap">
                  {formatCurrency(Number(l.valor))}
                </span>
              </div>
            </div>
            {!compact && podeBaixar && (
              <Button
                size="sm"
                className="w-full h-11 gap-2"
                onClick={() => {
                  setBaixaTarget(l);
                }}
              >
                <CreditCard className="h-4 w-4" /> Baixar
              </Button>
            )}
          </div>
        );
      })}
      <div className="border-t pt-2 mt-2 text-right">
        <span className="text-sm font-semibold">
          Total:{" "}
          {formatCurrency(
            items.reduce(
              (s, l) => s + Number(l.saldo_restante ?? l.valor ?? 0),
              0
            )
          )}
        </span>
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
      <Card>
        <CardContent className="p-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelectDate}
            className={cn("p-3 pointer-events-auto")}
            modifiers={modifiers}
            modifiersClassNames={{
              receber: "bg-success/20 text-success font-bold rounded-full",
              pagar: "bg-destructive/20 text-destructive font-bold rounded-full",
              vencido:
                "bg-warning/30 text-warning font-bold rounded-full ring-2 ring-warning/40",
            }}
          />
          <div className="flex gap-4 mt-3 px-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-success" /> Receber
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive" />{" "}
              Pagar
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-warning" /> Vencido
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Desktop side panel */}
      <Card className="max-md:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {selectedDate
              ? `Vencimentos em ${selectedDate.toLocaleDateString("pt-BR")}`
              : "Selecione um dia"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {selectedDate
                ? "Nenhum vencimento nesta data."
                : "Clique em um dia no calendário para ver os títulos."}
            </p>
          ) : (
            renderItemList(selectedItems, true)
          )}
        </CardContent>
      </Card>

      {/* Mobile: bottom-sheet com lista + ação "Baixar" por linha */}
      <Sheet open={sheetOpen && isMobile} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85svh] overflow-y-auto rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)]"
        >
          <SheetHeader>
            <SheetTitle className="text-left">
              {selectedDate
                ? `Vencimentos em ${selectedDate.toLocaleDateString("pt-BR")}`
                : "Vencimentos"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3">
            {selectedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum vencimento nesta data.
              </p>
            ) : (
              renderItemList(selectedItems)
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Baixa parcial — chamada a partir do calendário (desktop ou mobile) */}
      <BaixaParcialDialog
        open={!!baixaTarget}
        onClose={() => setBaixaTarget(null)}
        lancamento={baixaTarget as never}
        contasBancarias={contasBancarias}
        cartoes={cartoes}
        onSuccess={() => {
          setBaixaTarget(null);
          setSheetOpen(false);
          onBaixaSuccess?.();
        }}
      />
    </div>
  );
}

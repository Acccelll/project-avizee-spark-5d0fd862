import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import type { Column } from "@/components/DataTable";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Lancamento } from "@/types/domain";
import { displayDescricao } from "@/lib/displayLancamento";
import { getOrigemLabel } from "@/lib/financeiro";

/**
 * Mapa visual de origem (Fase 6) — usa tokens semânticos da paleta.
 * Mantém alinhamento com `origem_tipo` do modelo canônico.
 */
const ORIGEM_BADGE_CLASSES: Record<string, string> = {
  fiscal_nota: "border-info/40 text-info bg-info/5",
  comercial: "border-primary/40 text-primary bg-primary/5",
  compras: "border-warning/40 text-warning bg-warning/5",
  parcelamento: "border-muted-foreground/30 text-muted-foreground bg-muted/40",
  manual: "border-border text-muted-foreground bg-transparent",
  sistemica: "border-accent/50 text-accent-foreground bg-accent/30",
  societario: "border-success/40 text-success bg-success/5",
};

interface Params {
  getLancamentoStatus: (l: Lancamento) => string;
  hoje: Date;
  hojeStr: string;
}

export function buildFinanceiroColumns({ getLancamentoStatus, hoje, hojeStr }: Params) {
  return [
    {
      key: "tipo",
      mobileCard: true,
      label: "Tipo",
      sortable: true,
      render: (l: Lancamento) => (
        <Badge
          variant="outline"
          className={
            l.tipo === "receber"
              ? "border-success/40 text-success bg-success/5 whitespace-nowrap"
              : "border-destructive/40 text-destructive bg-destructive/5 whitespace-nowrap"
          }
        >
          {l.tipo === "receber" ? "Receber" : "Pagar"}
        </Badge>
      ),
    },
    {
      key: "parceiro",
      mobilePrimary: true,
      label: "Pessoa",
      sortable: true,
      render: (l: Lancamento) => {
        const nome = l.tipo === "receber" ? l.clientes?.nome_razao_social : l.fornecedores?.nome_razao_social;
        if (!nome) {
          // Fallbacks: lançamento de fatura de cartão ou conta bancária
          const banco = l.contas_bancarias?.bancos?.nome;
          const conta = l.contas_bancarias?.descricao;
          if (banco || conta) {
            return <span className="text-muted-foreground text-xs italic">{[banco, conta].filter(Boolean).join(" · ")}</span>;
          }
          if ((l as Lancamento & { cartao_id?: string | null }).cartao_id) {
            return <span className="text-muted-foreground text-xs italic">Fatura de cartão</span>;
          }
          return <span className="text-muted-foreground text-xs">—</span>;
        }
        return <span className="font-medium text-sm">{nome}</span>;
      },
    },
    {
      key: "descricao",
      mobileCard: true,
      label: "Descrição",
      sortable: true,
      render: (l: Lancamento) => (
        <div className="space-y-0.5">
          <span className="text-sm">{displayDescricao(l)}</span>
          {(l.parcela_numero ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground font-mono block">
              Parcela {l.parcela_numero}/{l.parcela_total}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "data_vencimento",
      mobileCard: true,
      label: "Vencimento",
      sortable: true,
      render: (l: Lancamento) => {
        const es = getLancamentoStatus(l);
        const isOverdue = es === "vencido";
        const isToday = l.data_vencimento === hojeStr;
        const [y, m, d] = l.data_vencimento.split("-").map(Number);
        const venc = new Date(y, m - 1, d);
        const diasAtraso = isOverdue
          ? Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        return (
          <div className="space-y-0.5">
            <span
              className={cn(
                "text-sm",
                isOverdue ? "text-destructive font-semibold" : isToday ? "text-warning font-semibold" : "",
              )}
            >
              {venc.toLocaleDateString("pt-BR")}
            </span>
            {isOverdue && diasAtraso > 0 && (
              <span className="text-[10px] text-destructive font-medium block">{diasAtraso}d em atraso</span>
            )}
            {isToday && !isOverdue && (
              <span className="text-[10px] text-warning font-medium block">Vence hoje</span>
            )}
          </div>
        );
      },
    },
    {
      key: "valor",
      mobileCard: true,
      label: "Valor Total",
      sortable: true,
      render: (l: Lancamento) => (
        <span className="font-semibold font-mono text-sm">{formatCurrency(Number(l.valor))}</span>
      ),
    },
    {
      key: "saldo_restante",
      label: "Saldo em Aberto",
      render: (l: Lancamento) => {
        const es = getLancamentoStatus(l);
        if (es === "pago" || es === "cancelado") return <span className="text-muted-foreground text-xs">—</span>;
        const saldo = l.saldo_restante != null ? Number(l.saldo_restante) : Number(l.valor);
        if (saldo <= 0) return <span className="text-success text-xs font-mono font-semibold">Quitado</span>;
        return (
          <span
            className={cn(
              "font-mono text-sm font-semibold",
              es === "vencido" ? "text-destructive" : es === "parcial" ? "text-warning" : "",
            )}
          >
            {formatCurrency(saldo)}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (l: Lancamento) => <StatusBadge status={getLancamentoStatus(l)} />,
    },
    {
      key: "origem",
      label: "Origem",
      hidden: true,
      render: (l: Lancamento) => {
        const tipoRaw = (l as Lancamento & { origem_tipo?: string | null }).origem_tipo
          ?? (l.nota_fiscal_id ? "fiscal_nota" : l.documento_pai_id ? "parcelamento" : "manual");
        const cls = ORIGEM_BADGE_CLASSES[tipoRaw] ?? ORIGEM_BADGE_CLASSES.manual;
        return (
          <Badge variant="outline" className={cn("text-xs whitespace-nowrap", cls)}>
            {getOrigemLabel(l)}
          </Badge>
        );
      },
    },
    {
      key: "forma_pagamento",
      label: "Forma Pgto",
      hidden: true,
      render: (l: Lancamento) =>
        l.forma_pagamento ? <span className="text-xs">{l.forma_pagamento}</span> : <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      key: "conta_bancaria",
      label: "Banco/Conta",
      hidden: true,
      render: (l: Lancamento) => {
        if (!l.contas_bancarias) return <span className="text-muted-foreground text-xs">—</span>;
        return <span className="text-xs">{l.contas_bancarias.bancos?.nome} - {l.contas_bancarias.descricao}</span>;
      },
    },
  ] satisfies Column<Lancamento>[];
}

import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { AlertCircle, CheckCircle2, Clock3, Trophy } from "lucide-react";
import type { CotacaoCompra, CotacaoSummary } from "./cotacaoCompraTypes";
import { statusLabels } from "./cotacaoCompraTypes";
import { canonicalCotacaoStatus } from "./comprasStatus";
import { calculateDaysBetween, formatDate } from "@/lib/format";

interface CotacaoCompraTableProps {
  data: CotacaoCompra[];
  loading: boolean;
  summaries: Record<string, CotacaoSummary>;
  onView: (c: CotacaoCompra) => void;
  onEdit: (c: CotacaoCompra) => void;
}

export function CotacaoCompraTable({ data, loading, summaries, onView, onEdit }: CotacaoCompraTableProps) {
  const isExpired = (validade: string | null) => !!validade && calculateDaysBetween(new Date(), validade) < 0;
  const columns = [
    {
      key: "numero",
      label: "Cotação",
      render: (c: CotacaoCompra) => (
        <div>
          <span className="font-mono text-xs font-semibold text-primary">{c.numero}</span>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {formatDate(c.data_cotacao)}
          </p>
        </div>
      ),
    },
    {
      key: "itens",
      label: "Itens",
      render: (c: CotacaoCompra) => {
        const s = summaries[c.id];
        if (!s) return <span className="text-muted-foreground/40 text-xs font-mono">—</span>;
        return <span className="font-mono text-sm font-semibold">{s.itens_count}</span>;
      },
    },
    {
      key: "fornecedores",
      label: "Fornecedores / Propostas",
      render: (c: CotacaoCompra) => {
        const s = summaries[c.id];
        if (!s) return <span className="text-muted-foreground/40 text-xs">—</span>;
        if (s.fornecedores_count === 0 && s.propostas_count === 0) {
          return (
            <span className="text-xs text-muted-foreground italic">
              Sem fornecedores · sem propostas
            </span>
          );
        }
        return (
          <div className="space-y-0.5">
            <span className="text-xs font-mono font-medium">
              {s.fornecedores_count} {s.fornecedores_count === 1 ? "fornecedor" : "fornecedores"} ·{" "}
              {s.propostas_count} {s.propostas_count === 1 ? "proposta" : "propostas"}
            </span>
            {s.vencedor_nome ? (
              <p className="text-[10px] text-success dark:text-success flex items-center gap-0.5 mt-0.5">
                <Trophy className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate max-w-[140px]">{s.vencedor_nome}</span>
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground mt-0.5">Sem vencedor definido</p>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (c: CotacaoCompra) => <StatusBadge status={c.status} label={statusLabels[c.status] || c.status} />,
    },
    {
      key: "prontidao",
      label: "Próxima ação",
      render: (c: CotacaoCompra) => {
        const s = summaries[c.id];
        const status = canonicalCotacaoStatus(c.status);
        if (!s) return <span className="text-xs text-muted-foreground">Carregando…</span>;
        if (status === "convertida") return <StatusBadge status="recebido" label="Pedido gerado" />;
        if (status === "cancelada") return <StatusBadge status="cancelado" label="Cancelada" />;
        if (status === "rejeitada") return <StatusBadge status="cancelado" label="Rejeitada" />;
        if (status === "aguardando_aprovacao") return <StatusBadge status="aguardando" label="Aprovar cotação" />;
        if (s.itens_count === 0) return <StatusBadge status="rascunho" label="Adicionar itens" />;
        if (s.propostas_count === 0) return <StatusBadge status="rascunho" label="Adicionar proposta" />;
        if (s.tem_vencedor) return <StatusBadge status="aprovado" label="Pronta p/ aprovação" />;
        return <StatusBadge status="aguardando" label="Selecionar fornecedor" />;
      },
    },
    {
      key: "data_validade",
      label: "Validade",
      render: (c: CotacaoCompra) => {
        if (!c.data_validade) return "—";
        if (isExpired(c.data_validade)) {
          return (
            <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
              <AlertCircle className="h-3 w-3" /> {formatDate(c.data_validade)}
            </span>
          );
        }
        const dias = calculateDaysBetween(new Date(), c.data_validade);
        if (dias <= 2) {
          return (
            <span className="inline-flex items-center gap-1 text-warning text-xs">
              <Clock3 className="h-3 w-3" /> {formatDate(c.data_validade)}
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 text-xs">
            <CheckCircle2 className="h-3 w-3 text-success" /> {formatDate(c.data_validade)}
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      loading={loading}
      moduleKey="cotacoes_compra"
      showColumnToggle={true}
      onView={onView}
      onEdit={onEdit}
      mobileStatusKey="status"
      emptyTitle="Nenhuma cotação de compra encontrada"
      emptyDescription="Tente ajustar os filtros ou crie uma nova cotação de compra."
    />
  );
}

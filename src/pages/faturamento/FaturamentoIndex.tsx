import { useNavigate } from "react-router-dom";
import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { BACKLOG_OV_STATUSES } from "@/lib/comercialStatuses";

/**
 * Página /faturamento — atalho operacional.
 *
 * O módulo Faturamento ainda não tem grid própria; por enquanto
 * encaminhamos o usuário para `/pedidos` já com o filtro de status
 * aprovada/em_separacao/separado aplicado, que é o backlog elegível
 * para gerar NF.
 */
export default function FaturamentoIndex() {
  const navigate = useNavigate();
  const url = `/pedidos?status=${BACKLOG_OV_STATUSES.join(",")}`;

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <EmptyState
        icon={Receipt}
        title="Faturamento"
        description="A grid dedicada de faturamento será disponibilizada em breve. Enquanto isso, use a tela de Pedidos com o filtro de backlog de faturamento aplicado."
        variant="firstUse"
        action={
          <Button onClick={() => navigate(url)} size="sm">
            Ir para Pedidos (backlog de faturamento)
          </Button>
        }
      />
    </div>
  );
}
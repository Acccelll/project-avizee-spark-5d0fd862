import { ModulePage } from "@/components/ModulePage";
import { EmptyState } from "@/components/ui/empty-state";
import { Clock } from "lucide-react";

/**
 * Página Faturamento — temporariamente desativada (Em breve).
 * O conteúdo operacional anterior foi preservado em `Faturamento.legacy.tsx`
 * e voltará no momento adequado. Notas de Saída continuam em `/fiscal?tipo=saida`.
 */
const Faturamento = () => {
  return (
    <ModulePage title="Faturamento" subtitle="Em breve">
      <EmptyState
        icon={Clock}
        title="Faturamento em breve"
        description="Este módulo está temporariamente indisponível. Para emitir notas de saída, utilize Fiscal → Notas de Saída."
      />
    </ModulePage>
  );
};

export default Faturamento;
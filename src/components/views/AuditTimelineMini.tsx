/**
 * AuditTimelineMini — exibe as últimas N entradas de `auditoria_logs` para uma
 * entidade específica (filtrando por `tabela` + `registro_id`). Visível apenas
 * para admins (a tabela `auditoria_logs` é admin-only via RLS).
 *
 * Uso típico: drawers de Orçamento/Pedido para mostrar histórico recente.
 */
import { useQuery } from "@tanstack/react-query";
import { Clock, FileEdit, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditTimelineMiniProps {
  tabela: string;
  registroId: string;
  limit?: number;
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  INSERT: Plus,
  UPDATE: FileEdit,
  DELETE: Trash2,
};

const ACTION_LABEL: Record<string, string> = {
  INSERT: "Criado",
  UPDATE: "Alterado",
  DELETE: "Excluído",
};

export function AuditTimelineMini({ tabela, registroId, limit = 5 }: AuditTimelineMiniProps) {
  const { isAdmin } = useIsAdmin();

  const { data, isLoading } = useQuery({
    queryKey: ["audit-mini", tabela, registroId, limit],
    enabled: isAdmin && !!registroId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auditoria_logs")
        .select("id, acao, created_at, usuario_id, dados_novos")
        .eq("tabela", tabela)
        .eq("registro_id", registroId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (!isAdmin) return null;

  return (
    <section className="rounded-md border border-border bg-card/40 p-3" aria-busy={isLoading}>
      <header className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <Clock className="h-4 w-4 text-muted-foreground" />
        Histórico recente
      </header>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem alterações registradas.</p>
      ) : (
        <ol className="space-y-2">
          {data.map((row) => {
            const Icon = ACTION_ICONS[row.acao] ?? FileEdit;
            const label = ACTION_LABEL[row.acao] ?? row.acao;
            const ts = row.created_at
              ? formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: ptBR })
              : "—";
            return (
              <li key={row.id} className="flex items-start gap-2 text-xs">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{label}</span>
                  <span className="text-muted-foreground"> · {ts}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
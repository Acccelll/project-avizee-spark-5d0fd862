import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface EmBreveProps {
  modulo: string;
  descricao?: string;
}

/**
 * Tela placeholder para módulos marcados como "Em breve".
 * Mantém a rota viva (não quebra deep links) sem expor funcionalidade real.
 */
export function EmBreve({ modulo, descricao }: EmBreveProps) {
  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardContent className="flex flex-col items-center text-center gap-4 py-12">
          <div className="rounded-full bg-muted p-4">
            <Construction className="h-8 w-8 text-muted-foreground" aria-hidden />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">{modulo} — Em breve</h1>
            <p className="text-sm text-muted-foreground max-w-md">
              {descricao ??
                "Este módulo está em construção. Acompanhe as próximas atualizações para disponibilidade."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default EmBreve;

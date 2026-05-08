import { useNavigate } from "react-router-dom";
import {
  Send,
  PackageCheck,
  FolderCog,
  FileSearch,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/useCan";

/**
 * Hub do módulo Faturamento.
 *
 * Substitui o antigo placeholder "Em breve" por 4 atalhos canônicos cobertos
 * por permissão `faturamento_fiscal:*`. Cards desabilitados (sem permissão)
 * permanecem visíveis para preservar a estrutura de navegação.
 */
interface HubCard {
  title: string;
  description: string;
  icon: LucideIcon;
  path: string;
  action: "visualizar" | "criar" | "editar";
  cta: string;
}

const CARDS: HubCard[] = [
  {
    title: "Emitir NF-e",
    description:
      "Wizard de emissão de NF-e a partir de pedidos aprovados ou notas avulsas, com pré-validação e transmissão SEFAZ.",
    icon: Send,
    path: "/faturamento/emitir",
    action: "criar",
    cta: "Iniciar emissão",
  },
  {
    title: "Backlog de faturamento",
    description:
      "Pedidos aprovados elegíveis para gerar NF-e — fila ordenada por SLA com atalho direto para o wizard.",
    icon: PackageCheck,
    path: "/faturamento/backlog",
    action: "visualizar",
    cta: "Abrir backlog",
  },
  {
    title: "Cadastros fiscais",
    description:
      "Configuração de empresa emitente, certificado A1, ambiente SEFAZ e DistDF-e.",
    icon: FolderCog,
    path: "/faturamento/cadastros",
    action: "editar",
    cta: "Configurar",
  },
  {
    title: "Consulta de documentos",
    description:
      "Busca de NF-e por chave, número, cliente ou status SEFAZ — com replicação de XML/DANFE.",
    icon: FileSearch,
    path: "/faturamento/documentos",
    action: "visualizar",
    cta: "Consultar",
  },
];

export default function FaturamentoIndex() {
  const navigate = useNavigate();
  const { can } = useCan();

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Faturamento</h1>
        <p className="text-sm text-muted-foreground">
          Centralize emissão, backlog e consulta de notas fiscais eletrônicas.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((card) => {
          const allowed = can(`faturamento_fiscal:${card.action}` as never);
          const Icon = card.icon;
          return (
            <Card key={card.path} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">{card.title}</CardTitle>
                </div>
                <CardDescription className="pt-2">{card.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button
                  variant="secondary"
                  className="w-full justify-between"
                  disabled={!allowed}
                  onClick={() => navigate(card.path)}
                >
                  {allowed ? card.cta : "Sem permissão"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

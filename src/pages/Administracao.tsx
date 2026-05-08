/**
 * Administracao — orquestrador da página de administração.
 *
 * Responsabilidade única: roteamento entre seções (sidebar agrupada).
 * Cada seção é um componente autônomo em `src/pages/admin/sections/*`,
 * com seu próprio estado, validação e botão de salvar via
 * `useSectionConfig` / `useEmpresaConfig`.
 *
 * Itens externos (Migração, Auditoria) navegam para fora — nunca alteram
 * a `?tab=` interna nem disparam render-time side-effects.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Activity, Building, Building2, Database, HardDrive, Mail, Menu, Plug, Bell, Receipt, Shield, Users, Wallet, KeyRound, Webhook } from "lucide-react";
import { ModulePage } from "@/components/ModulePage";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AdminSidebar, type SideNavGroup } from "@/pages/admin/components/AdminSidebar";
import { DashboardAdmin } from "@/pages/admin/components/DashboardAdmin";
import { UsuariosTab } from "@/components/usuarios/UsuariosTab";
import { EmpresaSection } from "@/pages/admin/sections/EmpresaSection";
import { EmailSection } from "@/pages/admin/sections/EmailSection";
import { IntegracoesSection } from "@/pages/admin/sections/IntegracoesSection";
import { NotificacoesSection } from "@/pages/admin/sections/NotificacoesSection";
import { BackupSection } from "@/pages/admin/sections/BackupSection";
import { FiscalSection } from "@/pages/admin/sections/FiscalSection";
import { FinanceiroSection } from "@/pages/admin/sections/FinanceiroSection";
import { PerfisCatalogoSection } from "@/pages/admin/sections/PerfisCatalogoSection";
import { SaudeSistemaSection } from "@/pages/admin/sections/SaudeSistemaSection";
import { WebhooksSection } from "@/pages/admin/sections/WebhooksSection";
import { EmpresasSection } from "@/pages/admin/sections/EmpresasSection";
import { RequireStrictAdmin } from "@/components/admin/RequireStrictAdmin";

/** Seções renderizadas internamente (não inclui atalhos externos). */
const VALID_SECTION_KEYS = new Set([
  "empresa",
  "empresas",
  "dashboard",
  "usuarios",
  "perfis",
  "email",
  "integracoes",
  "notificacoes",
  "webhooks",
  "backup",
  "fiscal",
  "financeiro",
  "saude",
]);

const sideNavGroups: SideNavGroup[] = [
  {
    key: "empresa",
    label: "Empresa",
    items: [
      { key: "empresa", label: "Dados da Empresa", icon: Building2 },
      { key: "empresas", label: "Empresas e vínculos", icon: Building },
    ],
  },
  {
    key: "acesso",
    label: "Acesso & Segurança",
    items: [
      { key: "dashboard", label: "Dashboard de Segurança", icon: Shield },
      { key: "usuarios", label: "Usuários e Permissões", icon: Users },
      { key: "perfis", label: "Perfis e Catálogo", icon: KeyRound },
    ],
  },
  {
    key: "configuracoes",
    label: "Configurações",
    items: [
      { key: "email", label: "E-mails", icon: Mail },
      { key: "integracoes", label: "Integrações", icon: Plug },
      { key: "notificacoes", label: "Notificações globais", icon: Bell },
      { key: "webhooks", label: "Webhooks de saída", icon: Webhook },
      { key: "backup", label: "Backup", icon: HardDrive },
      { key: "fiscal", label: "Parâmetros Fiscais", icon: Receipt },
      { key: "financeiro", label: "Parâmetros Financeiros", icon: Wallet },
    ],
  },
  {
    key: "dados",
    label: "Dados & Auditoria",
    items: [
      { key: "saude", label: "Saúde do sistema", icon: Activity },
      { key: "migracao", label: "Migração de Dados", icon: Database, behavior: "external" },
      { key: "auditoria", label: "Auditoria", icon: Shield, behavior: "external" },
    ],
  },
];

const EXTERNAL_ROUTES: Record<string, string> = {
  migracao: "/migracao-dados",
  auditoria: "/auditoria",
};

export default function Administracao() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") || "empresa";
  const activeSection = VALID_SECTION_KEYS.has(rawTab) ? rawTab : "empresa";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Encontra o item ativo para exibir título no header sticky mobile.
  const activeItem = useMemo(() => {
    for (const g of sideNavGroups) {
      const found = g.items.find((i) => i.key === activeSection);
      if (found) return found;
    }
    return null;
  }, [activeSection]);

  // Atalhos externos: redireciona em useEffect — nunca em render.
  useEffect(() => {
    if (rawTab in EXTERNAL_ROUTES) {
      navigate(EXTERNAL_ROUTES[rawTab], { replace: true });
    }
  }, [rawTab, navigate]);

  const handleSectionChange = (key: string) => {
    if (key in EXTERNAL_ROUTES) {
      navigate(EXTERNAL_ROUTES[key]);
      return;
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", key);
      return next;
    });
    // Em mobile, fecha o Sheet após selecionar.
    setMobileNavOpen(false);
  };

  return (
    <ModulePage title="Administração" subtitle="Governança, parâmetros globais e gestão do sistema.">
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <AdminSidebar groups={sideNavGroups} activeKey={activeSection} onSelect={handleSectionChange} />
        <div className="space-y-4 min-w-0">
          {/* Header sticky mobile com nome da seção e gatilho do Sheet */}
          <div className="lg:hidden sticky top-0 z-20 -mx-4 px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1.5"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir menu de administração"
            >
              <Menu className="h-4 w-4" />
              Menu
            </Button>
            {activeItem && (
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <activeItem.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{activeItem.label}</span>
              </div>
            )}
          </div>
          <SectionContent section={activeSection} />
        </div>
      </div>

      {/* Sheet lateral com a navegação completa em mobile */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Administração</SheetTitle>
            <SheetDescription>Selecione uma seção</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <AdminSidebar
              groups={sideNavGroups}
              activeKey={activeSection}
              onSelect={handleSectionChange}
              inSheet
            />
          </div>
        </SheetContent>
      </Sheet>
    </ModulePage>
  );
}

function SectionContent({ section }: { section: string }) {
  // Dashboard é somente leitura — acesso delegável.
  if (section === "dashboard") return <DashboardAdmin />;

  // Demais seções escrevem em app_configuracoes/empresa_config ou expõem
  // gestão sensível (usuários, perfis, webhooks). Reverificamos `useIsAdmin`
  // estrito porque `AdminRoute` aceita o override `administracao:visualizar`.
  const guarded: Record<string, { node: JSX.Element; label: string }> = {
    empresa: { node: <EmpresaSection />, label: "Dados da Empresa" },
    empresas: { node: <EmpresasSection />, label: "Empresas e vínculos" },
    usuarios: { node: <UsuariosTab />, label: "Usuários e Permissões" },
    perfis: { node: <PerfisCatalogoSection />, label: "Perfis e Catálogo" },
    email: { node: <EmailSection />, label: "Configurações de E-mail" },
    integracoes: { node: <IntegracoesSection />, label: "Integrações" },
    notificacoes: { node: <NotificacoesSection />, label: "Notificações globais" },
    webhooks: { node: <WebhooksSection />, label: "Webhooks de saída" },
    backup: { node: <BackupSection />, label: "Política de Backup" },
    fiscal: { node: <FiscalSection />, label: "Parâmetros Fiscais" },
    financeiro: { node: <FinanceiroSection />, label: "Parâmetros Financeiros" },
    saude: { node: <SaudeSistemaSection />, label: "Saúde do Sistema" },
  };
  const entry = guarded[section] ?? { node: <EmpresaSection />, label: "Dados da Empresa" };
  return <RequireStrictAdmin resourceLabel={entry.label}>{entry.node}</RequireStrictAdmin>;
}
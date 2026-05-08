/**
 * Auditoria — trilha unificada (operacional + governança).
 *
 * Lê `v_admin_audit_unified` (UNION de `auditoria_logs` + `permission_audit`)
 * via `useAdminAuditUnificada`, com filtros server-side, paginação por range
 * e exportação Excel/PDF dos eventos da página atual.
 *
 * Filtros são serializados em URL via `useUrlListState` para deep-link.
 */

import { useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/ModulePage";
import { DataTable } from "@/components/DataTable";
import { ViewDrawerV2, ViewField, ViewSection } from "@/components/ViewDrawerV2";
import { SummaryCard } from "@/components/SummaryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PeriodFilter } from "@/components/filters/PeriodFilter";
import type { Period } from "@/components/filters/periodTypes";
import { periodToDateFrom } from "@/lib/periodFilter";
import { supabase } from "@/integrations/supabase/client";
import {
  ActionBadge,
  CriticalityBadge,
  DiffViewer,
  OrigemBadge,
  CRITICALITY_STYLE,
  KNOWN_ACOES,
  KNOWN_TABLES,
  getAcaoMeta,
  getCriticality,
  getTableMeta,
  summarizeUserAgent,
} from "@/lib/audit";
import {
  ADMIN_AUDIT_PAGE_SIZE,
  type AdminAuditRow,
  useAdminAuditUnificada,
} from "@/pages/admin/hooks/useAdminAuditUnificada";
import { useUrlListState } from "@/hooks/useUrlListState";
import { exportarParaExcel, exportarParaPdf } from "@/services/export.service";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit,
  Plus,
  Shield,
  Trash2,
  User,
} from "lucide-react";

interface Profile {
  id: string;
  nome: string;
  email: string | null;
  cargo: string | null;
}

const AUDIT_PERIODS: { value: Period; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "todos", label: "Todos" },
];

const URL_SCHEMA = {
  periodo: { type: "string" as const },
  origem: { type: "string" as const },
  entidade: { type: "string" as const },
  tipo_acao: { type: "string" as const, aliases: ["acao"] },
  ator: { type: "string" as const, aliases: ["usuario"] },
  alvo: { type: "string" as const },
  ip: { type: "string" as const },
  registro: { type: "string" as const },
  criticidade: { type: "string" as const },
  q: { type: "string" as const },
  page: { type: "number" as const },
};

export default function Auditoria() {
  const { value, set, clear } = useUrlListState({ schema: URL_SCHEMA });

  const period = (value.periodo || "30d") as Period;
  const origem = (value.origem || "todas") as
    | "todas"
    | "permission_audit"
    | "auditoria_logs";
  const entidade = value.entidade || "todas";
  const tipoAcao = value.tipo_acao || "todas";
  const atorId = value.ator || "todos";
  const targetUserId = value.alvo || "todos";
  const ipAddress = value.ip || "";
  const registroId = value.registro || "";
  const criticidade = value.criticidade || "todas";
  const searchTerm = value.q || "";
  const page = value.page ?? 1;

  const [searchInput, setSearchInput] = useState(searchTerm);
  useEffect(() => setSearchInput(searchTerm), [searchTerm]);

  // Debounce de busca
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== searchTerm) {
        set({ q: searchInput, page: 1 });
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce intencional só sobre searchInput; set/searchTerm refletem URL e iriam re-disparar o timer
  }, [searchInput]);

  const dateFrom = useMemo(() => {
    if (period === "todos") return null;
    return new Date(periodToDateFrom(period)).toISOString();
  }, [period]);

  const { rows, totalCount, totalPages, isLoading, isFetching } =
    useAdminAuditUnificada({
      dateFrom,
      origem: origem === "todas" ? null : origem,
      tipoAcao: tipoAcao === "todas" ? null : tipoAcao,
      entidade: entidade === "todas" ? null : entidade,
      atorId: atorId === "todos" ? null : atorId,
      targetUserId: targetUserId === "todos" ? null : targetUserId,
      ipAddress: ipAddress || null,
      registroId: registroId || null,
      // Criticidade resolvida no servidor — antes era filtrada apenas sobre
      // a página atual, escondendo eventos críticos das próximas páginas.
      criticidade: (criticidade as "todas" | "alta" | "media" | "baixa") || "todas",
      page,
    });

  // Carrega profiles (lookup de nomes) — limitado mas adequado para o universo de atores
  const [profiles, setProfiles] = useState<Profile[]>([]);
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, nome, email, cargo")
      .order("nome", { ascending: true })
      .then(({ data }) => setProfiles(data ?? []));
  }, []);

  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  function getProfile(userId: string | null | undefined): Profile | null {
    if (!userId) return null;
    return profileMap.get(userId) ?? null;
  }

  // Filtro client-side: apenas busca textual sobre a página atual.
  // Criticidade agora é server-side (ver `useAdminAuditUnificada`).
  const visibleRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return rows.filter((r) => {
      if (!q) return true;
      const ator = getProfile(r.ator_id);
      const alvo = getProfile(r.target_user_id);
      const meta = getTableMeta(r.entidade);
      const hay = [
        r.tipo_acao,
        r.entidade,
        r.entidade_id,
        r.ip_address,
        r.motivo,
        ator?.nome,
        ator?.email,
        alvo?.nome,
        alvo?.email,
        meta.modulo,
        meta.entidade,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchTerm, profileMap]);

  // KPIs (página atual)
  const kpis = useMemo(() => {
    const inserts = rows.filter((r) =>
      ["INSERT", "permission_grant", "role_grant"].includes(r.tipo_acao ?? ""),
    ).length;
    const updates = rows.filter((r) =>
      ["UPDATE", "config_update", "branding_update", "permission_update", "role_update"].includes(
        r.tipo_acao ?? "",
      ),
    ).length;
    const deletes = rows.filter((r) =>
      ["DELETE", "permission_revoke", "role_revoke"].includes(r.tipo_acao ?? ""),
    ).length;
    const sensiveis = rows.filter(
      (r) =>
        getCriticality({ acao: r.tipo_acao, entidade: r.entidade }) === "alta",
    ).length;
    const atoresUnicos = new Set(
      rows.map((r) => r.ator_id).filter((id): id is string => !!id),
    ).size;
    return { inserts, updates, deletes, sensiveis, atoresUnicos };
  }, [rows]);

  const [selected, setSelected] = useState<AdminAuditRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Exportações (sobre a página atual)
  const [exporting, setExporting] = useState(false);
  function rowsForExport() {
    return visibleRows.map((r) => {
      const meta = getTableMeta(r.entidade);
      const acaoMeta = getAcaoMeta(r.tipo_acao);
      const ator = getProfile(r.ator_id);
      const alvo = getProfile(r.target_user_id);
      const crit = getCriticality({ acao: r.tipo_acao, entidade: r.entidade });
      return {
        "Data/Hora": r.created_at
          ? new Date(r.created_at).toLocaleString("pt-BR")
          : "",
        Origem: r.origem === "permission_audit" ? "Governança" : "Operacional",
        Ação: acaoMeta.label,
        Módulo: meta.modulo,
        Entidade: meta.entidade,
        "Registro/Entidade ID": r.entidade_id ?? "",
        Ator: ator?.nome ?? r.ator_id ?? "",
        Alvo: alvo?.nome ?? r.target_user_id ?? "",
        Motivo: r.motivo ?? "",
        IP: r.ip_address ?? "",
        Criticidade: CRITICALITY_STYLE[crit].label,
      };
    });
  }
  async function handleExportarExcel() {
    setExporting(true);
    try {
      await exportarParaExcel({
        titulo: "auditoria-trilha-unificada",
        rows: rowsForExport(),
      });
    } finally {
      setExporting(false);
    }
  }
  async function handleExportarPdf() {
    setExporting(true);
    try {
      await exportarParaPdf({
        titulo: "Trilha de Auditoria",
        rows: rowsForExport(),
      });
    } finally {
      setExporting(false);
    }
  }

  const truncated = totalCount > rows.length && rows.length > 0;

  // ── Colunas ───────────────────────────────────────────────────────────────

  const columns = [
    {
      key: "created_at",
      label: "Data/Hora",
      sortable: true,
      render: (r: AdminAuditRow) => (
        <span className="text-xs font-mono whitespace-nowrap">
          {r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—"}
        </span>
      ),
    },
    {
      key: "origem",
      label: "Origem",
      render: (r: AdminAuditRow) =>
        r.origem ? (
          <OrigemBadge origem={r.origem as "permission_audit" | "auditoria_logs"} />
        ) : null,
    },
    {
      key: "ator_id",
      label: "Ator",
      render: (r: AdminAuditRow) => {
        const p = getProfile(r.ator_id);
        return p ? (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium truncate">{p.nome}</span>
            {p.email && (
              <span className="text-xs text-muted-foreground truncate">
                {p.email}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground font-mono">
            {r.ator_id ? r.ator_id.slice(0, 8) + "…" : "—"}
          </span>
        );
      },
    },
    {
      key: "target_user_id",
      label: "Alvo",
      render: (r: AdminAuditRow) => {
        if (!r.target_user_id) return <span className="text-muted-foreground">—</span>;
        const p = getProfile(r.target_user_id);
        return p ? (
          <span className="text-sm">{p.nome}</span>
        ) : (
          <span className="text-xs text-muted-foreground font-mono">
            {r.target_user_id.slice(0, 8) + "…"}
          </span>
        );
      },
    },
    {
      key: "modulo",
      label: "Módulo",
      render: (r: AdminAuditRow) => {
        const { modulo } = getTableMeta(r.entidade);
        return (
          <Badge variant="secondary" className="text-xs whitespace-nowrap">
            {modulo}
          </Badge>
        );
      },
    },
    {
      key: "entidade",
      label: "Entidade",
      render: (r: AdminAuditRow) => (
        <span className="text-sm">{getTableMeta(r.entidade).entidade}</span>
      ),
    },
    {
      key: "tipo_acao",
      label: "Ação",
      render: (r: AdminAuditRow) => <ActionBadge acao={r.tipo_acao} />,
    },
    {
      key: "criticidade",
      label: "Criticidade",
      render: (r: AdminAuditRow) => (
        <CriticalityBadge
          level={getCriticality({ acao: r.tipo_acao, entidade: r.entidade })}
        />
      ),
    },
  ];

  const selectedAtor = selected ? getProfile(selected.ator_id) : null;
  const selectedAlvo = selected ? getProfile(selected.target_user_id) : null;
  const selectedMeta = selected ? getTableMeta(selected.entidade) : null;
  const selectedCrit = selected
    ? getCriticality({ acao: selected.tipo_acao, entidade: selected.entidade })
    : null;

  return (
    <>
      <ModulePage
        title="Trilha de Auditoria"
        subtitle="Trilha unificada — operações em tabelas (CRUD) e eventos de governança (papéis, permissões, configurações)"
        count={totalCount}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Buscar por ator, alvo, módulo, motivo, IP..."
        summaryCards={
          <>
            <SummaryCard
              title="Eventos no Período"
              value={String(totalCount)}
              icon={Shield}
              variationType="neutral"
              variant="info"
            />
            <SummaryCard
              title="Criações / Concessões"
              value={String(kpis.inserts)}
              icon={Plus}
              variationType="positive"
              variant="success"
            />
            <SummaryCard
              title="Edições / Atualizações"
              value={String(kpis.updates)}
              icon={Edit}
              variationType="neutral"
            />
            <SummaryCard
              title="Exclusões / Revogações"
              value={String(kpis.deletes)}
              icon={Trash2}
              variationType="negative"
              variant="danger"
            />
            <SummaryCard
              title="Eventos Sensíveis"
              value={String(kpis.sensiveis)}
              icon={AlertTriangle}
              variationType="negative"
              variant="warning"
            />
            <SummaryCard
              title="Atores na Página"
              value={String(kpis.atoresUnicos)}
              icon={User}
              variationType="neutral"
            />
          </>
        }
        filters={
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
            <Select
              value={origem}
              onValueChange={(v) => set({ origem: v === "todas" ? "" : v, page: 1 })}
            >
              <SelectTrigger className="h-9 w-full md:w-[170px]">
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as origens</SelectItem>
                <SelectItem value="permission_audit">Governança</SelectItem>
                <SelectItem value="auditoria_logs">Operacional</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={entidade}
              onValueChange={(v) =>
                set({ entidade: v === "todas" ? "" : v, page: 1 })
              }
            >
              <SelectTrigger className="h-9 w-full md:w-[200px]">
                <SelectValue placeholder="Entidade" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="todas">Todas as entidades</SelectItem>
                {KNOWN_TABLES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {getTableMeta(t).entidade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={tipoAcao}
              onValueChange={(v) =>
                set({ tipo_acao: v === "todas" ? "" : v, page: 1 })
              }
            >
              <SelectTrigger className="h-9 w-full md:w-[180px]">
                <SelectValue placeholder="Ação" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="todas">Todas as ações</SelectItem>
                {KNOWN_ACOES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={atorId}
              onValueChange={(v) =>
                set({ ator: v === "todos" ? "" : v, page: 1 })
              }
            >
              <SelectTrigger className="h-9 w-full md:w-[180px]">
                <SelectValue placeholder="Ator" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="todos">Todos os atores</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={targetUserId}
              onValueChange={(v) =>
                set({ alvo: v === "todos" ? "" : v, page: 1 })
              }
            >
              <SelectTrigger className="h-9 w-full md:w-[170px]">
                <SelectValue placeholder="Alvo" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="todos">Todos os alvos</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={criticidade}
              onValueChange={(v) =>
                set({ criticidade: v === "todas" ? "" : v, page: 1 })
              }
            >
              <SelectTrigger className="h-9 w-full md:w-[140px]">
                <SelectValue placeholder="Criticidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Toda criticidade</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>

            <Input
              value={ipAddress}
              onChange={(e) => set({ ip: e.target.value, page: 1 })}
              placeholder="IP"
              className="h-9 w-full md:w-[140px] font-mono text-xs"
            />
            <Input
              value={registroId}
              onChange={(e) => set({ registro: e.target.value, page: 1 })}
              placeholder="ID do registro"
              className="h-9 w-full md:w-[200px] font-mono text-xs col-span-2 md:col-span-1"
            />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => clear()}
              className="h-9 col-span-2 md:col-span-1"
            >
              Limpar filtros
            </Button>
          </div>
        }
        toolbarExtra={
          <div className="flex items-center gap-2">
            <PeriodFilter
              value={period}
              onChange={(p) => set({ periodo: p, page: 1 })}
              options={AUDIT_PERIODS}
            />
            {isFetching && !isLoading && (
              <span className="text-xs text-muted-foreground">Atualizando…</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportarExcel}
              disabled={exporting || visibleRows.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportarPdf}
              disabled={exporting || visibleRows.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
          </div>
        }
      >
        {truncated && (
          <div className="mb-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            Exibindo página {page} de {totalPages} ({rows.length} de {totalCount}{" "}
            eventos no período). Refine os filtros ou navegue pelas páginas.
          </div>
        )}

        <DataTable
          columns={columns}
          data={visibleRows}
          loading={isLoading}
          moduleKey="auditoria"
          mobileStatusKey="criticidade"
          mobileIdentifierKey="entidade"
          emptyTitle="Nenhum evento de auditoria encontrado"
          emptyDescription="Ajuste os filtros ou amplie o período consultado para ver os registros."
          onView={(r) => {
            setSelected(r);
            setDrawerOpen(true);
          }}
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-1">
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages} — {totalCount} registros
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => set({ page: Math.max(1, page - 1) })}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => set({ page: Math.min(totalPages, page + 1) })}
                disabled={page >= totalPages}
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </ModulePage>

      <ViewDrawerV2
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Evento de Auditoria"
        badge={
          selected ? <ActionBadge acao={selected.tipo_acao} /> : undefined
        }
      >
        {selected && selectedMeta && selectedCrit && (
          <div className="space-y-5">
            <ViewSection title="Identificação do Evento">
              <div className="grid grid-cols-2 gap-4">
                <ViewField label="Data/Hora">
                  {selected.created_at
                    ? new Date(selected.created_at).toLocaleString("pt-BR")
                    : "—"}
                </ViewField>
                <ViewField label="Origem">
                  {selected.origem ? (
                    <OrigemBadge
                      origem={
                        selected.origem as "permission_audit" | "auditoria_logs"
                      }
                    />
                  ) : (
                    "—"
                  )}
                </ViewField>
                <ViewField label="Criticidade">
                  <CriticalityBadge level={selectedCrit} />
                </ViewField>
                <ViewField label="Ação">
                  <ActionBadge acao={selected.tipo_acao} />
                </ViewField>
                <ViewField label="Módulo">
                  <Badge variant="secondary">{selectedMeta.modulo}</Badge>
                </ViewField>
                <ViewField label="Entidade">{selectedMeta.entidade}</ViewField>
                <ViewField label="Tabela Técnica">
                  <Badge variant="outline" className="font-mono text-xs">
                    {selected.entidade ?? "—"}
                  </Badge>
                </ViewField>
                <ViewField label="ID do Registro">
                  <span className="font-mono text-xs break-all">
                    {selected.entidade_id ?? "—"}
                  </span>
                </ViewField>
              </div>
            </ViewSection>

            <ViewSection title="Ator (quem fez)">
              <div className="grid grid-cols-2 gap-4">
                {selectedAtor ? (
                  <>
                    <ViewField label="Nome">{selectedAtor.nome}</ViewField>
                    {selectedAtor.email && (
                      <ViewField label="E-mail">{selectedAtor.email}</ViewField>
                    )}
                    {selectedAtor.cargo && (
                      <ViewField label="Cargo">{selectedAtor.cargo}</ViewField>
                    )}
                    <ViewField label="ID do Usuário">
                      <span className="font-mono text-xs break-all">
                        {selected.ator_id}
                      </span>
                    </ViewField>
                  </>
                ) : (
                  <ViewField label="ID do Ator" className="col-span-2">
                    <span className="font-mono text-xs break-all">
                      {selected.ator_id ?? "—"}
                    </span>
                  </ViewField>
                )}
              </div>
            </ViewSection>

            {(selected.target_user_id || selectedAlvo) && (
              <ViewSection title="Alvo (sobre quem)">
                <div className="grid grid-cols-2 gap-4">
                  {selectedAlvo ? (
                    <>
                      <ViewField label="Nome">{selectedAlvo.nome}</ViewField>
                      {selectedAlvo.email && (
                        <ViewField label="E-mail">{selectedAlvo.email}</ViewField>
                      )}
                    </>
                  ) : (
                    <ViewField label="ID do Alvo" className="col-span-2">
                      <span className="font-mono text-xs break-all">
                        {selected.target_user_id}
                      </span>
                    </ViewField>
                  )}
                </div>
              </ViewSection>
            )}

            {selected.motivo && (
              <ViewSection title="Motivo">
                <p className="text-sm whitespace-pre-wrap">{selected.motivo}</p>
              </ViewSection>
            )}

            <ViewSection title="Origem da Requisição">
              <div className="grid grid-cols-2 gap-4">
                <ViewField label="IP">
                  <span className="font-mono">{selected.ip_address ?? "—"}</span>
                </ViewField>
                <ViewField label="User-Agent">
                  <span title={selected.user_agent ?? undefined}>
                    {summarizeUserAgent(selected.user_agent)}
                  </span>
                </ViewField>
              </div>
            </ViewSection>

            <DiffViewer payload={selected.payload} acao={selected.tipo_acao} />
          </div>
        )}
      </ViewDrawerV2>
    </>
  );
}

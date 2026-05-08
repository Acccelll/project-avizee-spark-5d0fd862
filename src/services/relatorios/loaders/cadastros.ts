/**
 * Loaders para relatórios de cadastros:
 *  - cadastro_produtos (produtos + insumos)
 *  - cadastro_clientes
 *  - cadastro_fornecedores
 *  - cadastro_transportadoras (subset de fornecedores)
 */

import { supabase } from "@/integrations/supabase/client";
import {
  cadastroSituacaoStatusMap,
  resolveStatus,
} from "@/services/relatorios/lib/statusMap";
import type {
  FiltroRelatorio,
  RelatorioResultado,
} from "@/services/relatorios/lib/shared";
import { fetchAllPages } from "@/services/relatorios/lib/fetchAllPages";

const isLegacySku = (sku: string | null | undefined): boolean =>
  !!sku && /^0+[A-Z0-9]+$/i.test(sku);

function deriveSituacao(row: {
  ativo?: boolean | null;
  deleted_at?: string | null;
  descontinuado_em?: string | null;
}): string {
  if (row.descontinuado_em) return "descontinuado";
  if (row.deleted_at || row.ativo === false) return "inativo";
  return "ativo";
}

// ─── Produtos ───────────────────────────────────────────────────────────────
export async function loadCadastroProdutos(
  filtros: FiltroRelatorio,
): Promise<RelatorioResultado> {
  const data = await fetchAllPages<Record<string, unknown>>(() => {
    let q = supabase
      .from("produtos")
      .select(
        "id, sku, codigo_interno, nome, ncm, origem, unidade_medida, tipo_item, preco_custo, preco_venda, estoque_atual, estoque_minimo, ativo, deleted_at, descontinuado_em, grupo_id, grupos_produto(nome)",
      )
      .order("nome", { ascending: true });
    if (filtros.grupoProdutoIds?.length) q = q.in("grupo_id", filtros.grupoProdutoIds);
    return q;
  });

  const rows = data
    .filter((p) => !isLegacySku(p.sku as string | null))
    .map((p) => {
      const sit = deriveSituacao(p);
      const sitMeta = resolveStatus(cadastroSituacaoStatusMap, sit);
      const custo = Number(p.preco_custo || 0);
      const venda = Number(p.preco_venda || 0);
      const margem = venda > 0 ? ((venda - custo) / venda) * 100 : 0;
      return {
        produtoId: p.id as string,
        sku: p.sku ?? "-",
        codigo: p.codigo_interno ?? "-",
        produto: p.nome,
        grupo:
          (p.grupos_produto as { nome?: string } | null)?.nome ?? "—",
        unidade: p.unidade_medida ?? "-",
        tipo: (p.tipo_item as string) ?? "produto",
        ncm: p.ncm ?? "-",
        origem: p.origem ?? "-",
        custo,
        precoVenda: venda,
        margem,
        estoque: Number(p.estoque_atual || 0),
        estoqueMinimo: Number(p.estoque_minimo || 0),
        situacao: sit,
        situacaoKey: sitMeta.key,
        situacaoKind: sitMeta.kind,
      };
    });

  const ativos = rows.filter((r) => r.situacao === "ativo").length;
  const inativos = rows.filter((r) => r.situacao === "inativo").length;
  const descontinuados = rows.filter((r) => r.situacao === "descontinuado").length;
  const semCusto = rows.filter((r) => r.custo <= 0).length;
  const semPreco = rows.filter((r) => r.precoVenda <= 0).length;
  const semNcm = rows.filter((r) => r.ncm === "-" || !r.ncm).length;
  const semGrupo = rows.filter((r) => r.grupo === "—").length;

  return {
    title: "Cadastro de Produtos",
    subtitle: "Visão consolidada do cadastro de produtos e insumos.",
    rows,
    chartData: [
      { name: "Ativos", value: ativos },
      { name: "Inativos", value: inativos },
      { name: "Descontinuados", value: descontinuados },
    ],
    kpis: {
      total: rows.length,
      ativos,
      inativos,
      semCusto,
      semPreco,
      semNcm,
      semGrupo,
    },
    meta: {
      kind: "list",
      valueNature: "quantidade",
      drillDownReady: true,
    },
  };
}

// ─── Clientes ───────────────────────────────────────────────────────────────
export async function loadCadastroClientes(
  filtros: FiltroRelatorio,
): Promise<RelatorioResultado> {
  const data = await fetchAllPages<Record<string, unknown>>(() => {
    let q = supabase
      .from("clientes")
      .select(
        "id, tipo_pessoa, nome_razao_social, nome_fantasia, cpf_cnpj, email, telefone, celular, municipio_nome, uf, limite_credito, prazo_padrao, prazo_preferencial, forma_pagamento_padrao, ativo, deleted_at, grupo_economico_id, grupos_economicos(nome)",
      )
      .order("nome_razao_social", { ascending: true });
    if (filtros.clienteIds?.length) q = q.in("id", filtros.clienteIds);
    return q;
  });

  const rows = data.map((c) => {
    const sit = deriveSituacao(c);
    const sitMeta = resolveStatus(cadastroSituacaoStatusMap, sit);
    const telefone = c.telefone || c.celular || "-";
    return {
      clienteId: c.id as string,
      tipoPessoa: c.tipo_pessoa ?? "-",
      cliente: c.nome_razao_social,
      fantasia: c.nome_fantasia ?? "-",
      cpfCnpj: c.cpf_cnpj ?? "-",
      email: c.email ?? "-",
      telefone,
      municipio: c.municipio_nome ?? "-",
      uf: c.uf ?? "-",
      limiteCredito: Number(c.limite_credito || 0),
      prazo: Number(c.prazo_preferencial ?? c.prazo_padrao ?? 0),
      formaPagamento: c.forma_pagamento_padrao ?? "-",
      grupoEconomico:
        (c.grupos_economicos as { nome?: string } | null)?.nome ?? "—",
      situacao: sit,
      situacaoKey: sitMeta.key,
      situacaoKind: sitMeta.kind,
    };
  });

  const ativos = rows.filter((r) => r.situacao === "ativo").length;
  const inativos = rows.filter((r) => r.situacao === "inativo").length;
  const semEmail = rows.filter((r) => r.email === "-").length;
  const semTelefone = rows.filter((r) => r.telefone === "-").length;
  const semCpfCnpj = rows.filter((r) => r.cpfCnpj === "-").length;
  const comLimite = rows.filter((r) => r.limiteCredito > 0).length;

  return {
    title: "Cadastro de Clientes",
    subtitle: "Visão consolidada da base de clientes.",
    rows,
    chartData: [
      { name: "Ativos", value: ativos },
      { name: "Inativos", value: inativos },
    ],
    kpis: {
      total: rows.length,
      ativos,
      inativos,
      semEmail,
      semTelefone,
      semCpfCnpj,
      comLimite,
    },
    meta: {
      kind: "list",
      valueNature: "quantidade",
      drillDownReady: true,
    },
  };
}

// ─── Fornecedores ───────────────────────────────────────────────────────────
export async function loadCadastroFornecedores(
  filtros: FiltroRelatorio,
): Promise<RelatorioResultado> {
  const data = await fetchAllPages<Record<string, unknown>>(() => {
    let q = supabase
      .from("fornecedores")
      .select(
        "id, tipo_pessoa, nome_razao_social, nome_fantasia, cpf_cnpj, email, telefone, celular, municipio_nome, uf, prazo_padrao, origem, transportadora, ativo, deleted_at",
      )
      .order("nome_razao_social", { ascending: true });
    if (filtros.fornecedorIds?.length) q = q.in("id", filtros.fornecedorIds);
    return q;
  });

  const rows = data.map((f) => {
    const sit = deriveSituacao(f);
    const sitMeta = resolveStatus(cadastroSituacaoStatusMap, sit);
    const telefone = f.telefone || f.celular || "-";
    return {
      fornecedorId: f.id as string,
      tipoPessoa: f.tipo_pessoa ?? "-",
      fornecedor: f.nome_razao_social,
      fantasia: f.nome_fantasia ?? "-",
      cpfCnpj: f.cpf_cnpj ?? "-",
      email: f.email ?? "-",
      telefone,
      municipio: f.municipio_nome ?? "-",
      uf: f.uf ?? "-",
      prazo: Number(f.prazo_padrao || 0),
      origem: f.origem ?? "-",
      transportadora: f.transportadora ? "Sim" : "Não",
      situacao: sit,
      situacaoKey: sitMeta.key,
      situacaoKind: sitMeta.kind,
    };
  });

  const ativos = rows.filter((r) => r.situacao === "ativo").length;
  const inativos = rows.filter((r) => r.situacao === "inativo").length;
  const semCnpj = rows.filter((r) => r.cpfCnpj === "-").length;
  const semContato = rows.filter((r) => r.email === "-" && r.telefone === "-").length;
  const transportadoras = rows.filter((r) => r.transportadora === "Sim").length;

  return {
    title: "Cadastro de Fornecedores",
    subtitle: "Visão consolidada da base de fornecedores.",
    rows,
    chartData: [
      { name: "Ativos", value: ativos },
      { name: "Inativos", value: inativos },
    ],
    kpis: {
      total: rows.length,
      ativos,
      inativos,
      semCnpj,
      semContato,
      transportadoras,
    },
    meta: {
      kind: "list",
      valueNature: "quantidade",
      drillDownReady: true,
    },
  };
}

// ─── Transportadoras (fornecedores com flag) ────────────────────────────────
export async function loadCadastroTransportadoras(
  _filtros: FiltroRelatorio,
): Promise<RelatorioResultado> {
  const data = await fetchAllPages<Record<string, unknown>>(() =>
    supabase
      .from("fornecedores")
      .select(
        "id, nome_razao_social, cpf_cnpj, email, telefone, celular, municipio_nome, uf, ativo, deleted_at",
      )
      .eq("transportadora", true)
      .order("nome_razao_social", { ascending: true }),
  );

  const rows = data.map((f) => {
    const sit = deriveSituacao(f);
    const sitMeta = resolveStatus(cadastroSituacaoStatusMap, sit);
    const telefone = f.telefone || f.celular || "-";
    return {
      fornecedorId: f.id as string,
      transportadora: f.nome_razao_social,
      cpfCnpj: f.cpf_cnpj ?? "-",
      email: f.email ?? "-",
      telefone,
      municipio: f.municipio_nome ?? "-",
      uf: f.uf ?? "-",
      situacao: sit,
      situacaoKey: sitMeta.key,
      situacaoKind: sitMeta.kind,
    };
  });

  const ativos = rows.filter((r) => r.situacao === "ativo").length;
  const inativos = rows.filter((r) => r.situacao === "inativo").length;
  const semContato = rows.filter((r) => r.email === "-" && r.telefone === "-").length;

  return {
    title: "Cadastro de Transportadoras",
    subtitle: "Fornecedores marcados como transportadoras.",
    rows,
    chartData: [
      { name: "Ativos", value: ativos },
      { name: "Inativos", value: inativos },
    ],
    kpis: {
      total: rows.length,
      ativos,
      inativos,
      semContato,
    },
    meta: {
      kind: "list",
      valueNature: "quantidade",
      drillDownReady: true,
    },
  };
}
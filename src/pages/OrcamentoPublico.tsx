import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { CheckCircle, XCircle, Loader2, Mail, Phone, Globe, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type {
  OrcamentoPublicView,
  OrcamentoItemPublicView,
  ClienteSnapshot,
} from "@/types/database-views";

interface ItemRow {
  descricao_snapshot: string;
  codigo_snapshot: string;
  quantidade: number;
  unidade: string;
  valor_unitario: number;
  valor_total: number;
  variacao: string | null;
  peso_unitario: number | null;
  peso_total: number | null;
}

interface EmpresaPublic {
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  inscricao_estadual: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  site: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  logo_url: string | null;
  marca_texto: string | null;
}

interface OrcamentoPublicData {
  numero: string;
  data_orcamento: string;
  validade: string | null;
  valor_total: number;
  observacoes: string | null;
  status: string;
  prazo_entrega: string | null;
  prazo_pagamento: string | null;
  pagamento: string | null;
  frete_tipo: string | null;
  modalidade: string | null;
  servico_frete: string | null;
  desconto: number;
  imposto_st: number;
  imposto_ipi: number;
  frete_valor: number;
  outras_despesas: number;
  peso_total: number;
  quantidade_total: number;
  cliente_snapshot: ClienteSnapshot | null;
  itens: ItemRow[];
  empresa: EmpresaPublic | null;
}

// Paleta da marca AviZee
const INK = "#151514";
const WINE = "#690500";
const ORANGE = "#b2592c";
const CREAM = "#fffaed";
const BORDER = "#e8e1d2";

const paymentLabel: Record<string, string> = {
  a_vista: "À vista",
  a_prazo: "A prazo",
  boleto: "Boleto",
  cartao: "Cartão",
  pix: "PIX",
  transferencia: "Transferência",
};

export default function OrcamentoPublico() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<OrcamentoPublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionDone, setActionDone] = useState<"aprovado" | "rejeitado" | null>(null);
  const [dialogAcao, setDialogAcao] = useState<"aprovado" | "rejeitado" | null>(null);
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Token inválido ou ausente.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);

      // 1. Orçamento (view pública estendida)
      const orcRes = await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{
                data: (OrcamentoPublicView & {
                  desconto?: number | null;
                  imposto_st?: number | null;
                  imposto_ipi?: number | null;
                  frete_valor?: number | null;
                  outras_despesas?: number | null;
                  modalidade?: string | null;
                  servico_frete?: string | null;
                  peso_total?: number | null;
                  quantidade_total?: number | null;
                  pagamento?: string | null;
                }) | null;
                error: unknown;
              }>;
            };
          };
        };
      })
        .from("orcamentos_public_view")
        .select(
          "id, numero, data_orcamento, validade, valor_total, observacoes, status, prazo_entrega, prazo_pagamento, frete_tipo, cliente_snapshot, public_token, desconto, imposto_st, imposto_ipi, frete_valor, outras_despesas, modalidade, servico_frete, peso_total, quantidade_total, pagamento",
        )
        .eq("public_token", token)
        .maybeSingle();

      const orc = orcRes.data;
      if (orcRes.error || !orc) {
        setError("Orçamento não encontrado ou link expirado.");
        setLoading(false);
        return;
      }

      // 2. Itens
      const itensRes = await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => Promise<{
              data:
                | (OrcamentoItemPublicView & {
                    peso_unitario?: number | null;
                    peso_total?: number | null;
                  })[]
                | null;
              error: unknown;
            }>;
          };
        };
      })
        .from("orcamentos_itens_public_view")
        .select(
          "descricao_snapshot, codigo_snapshot, quantidade, unidade, valor_unitario, valor_total, variacao, peso_unitario, peso_total",
        )
        .eq("orcamento_id", orc.id);
      const itens = itensRes.data;

      // 3. Empresa (view pública institucional)
      const { data: empresa } = await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            maybeSingle: () => Promise<{ data: EmpresaPublic | null; error: unknown }>;
          };
        };
      })
        .from("empresa_config_public_view")
        .select(
          "razao_social, nome_fantasia, cnpj, inscricao_estadual, telefone, whatsapp, email, site, logradouro, numero, complemento, bairro, cidade, uf, cep, logo_url, marca_texto",
        )
        .maybeSingle();

      setData({
        numero: orc.numero,
        data_orcamento: orc.data_orcamento,
        validade: orc.validade,
        valor_total: Number(orc.valor_total || 0),
        observacoes: orc.observacoes,
        status: orc.status,
        prazo_entrega: orc.prazo_entrega,
        prazo_pagamento: orc.prazo_pagamento,
        pagamento: orc.pagamento ?? null,
        frete_tipo: orc.frete_tipo,
        modalidade: orc.modalidade ?? null,
        servico_frete: orc.servico_frete ?? null,
        desconto: Number(orc.desconto || 0),
        imposto_st: Number(orc.imposto_st || 0),
        imposto_ipi: Number(orc.imposto_ipi || 0),
        frete_valor: Number(orc.frete_valor || 0),
        outras_despesas: Number(orc.outras_despesas || 0),
        peso_total: Number(orc.peso_total || 0),
        quantidade_total: Number(orc.quantidade_total || 0),
        cliente_snapshot: orc.cliente_snapshot,
        itens: (itens ?? []).map((it) => ({
          descricao_snapshot: it.descricao_snapshot ?? "",
          codigo_snapshot: it.codigo_snapshot ?? "",
          quantidade: it.quantidade,
          unidade: it.unidade,
          valor_unitario: it.valor_unitario,
          valor_total: it.valor_total,
          variacao: it.variacao,
          peso_unitario: (it as { peso_unitario?: number | null }).peso_unitario ?? null,
          peso_total: (it as { peso_total?: number | null }).peso_total ?? null,
        })),
        empresa: empresa ?? null,
      });
      setLoading(false);
    };
    load();
  }, [token]);

  const cliente = data?.cliente_snapshot ?? null;
  const isExpired = useMemo(
    () => Boolean(data?.validade && new Date(data.validade) < new Date()),
    [data?.validade],
  );

  const totalProdutos = useMemo(
    () => (data?.itens ?? []).reduce((s, i) => s + (Number(i.valor_total) || 0), 0),
    [data?.itens],
  );

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: CREAM, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: WINE }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: CREAM, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <XCircle className="h-12 w-12" style={{ color: WINE }} />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: INK }}>{error || "Erro desconhecido"}</h1>
        <p style={{ fontSize: 14, color: "#7a6a48" }}>Verifique o link e tente novamente.</p>
      </div>
    );
  }

  const empresa = data.empresa;
  const empresaNome = empresa?.razao_social || empresa?.marca_texto || "AviZee";
  const enderecoLinha = [empresa?.logradouro, empresa?.numero, empresa?.complemento].filter(Boolean).join(", ");
  const cidadeLinha = `${[empresa?.bairro, empresa?.cidade].filter(Boolean).join(" · ")}${empresa?.uf ? `/${empresa.uf}` : ""}`;
  const cepLinha = empresa?.cep ? `CEP: ${empresa.cep}` : "";

  const handleAction = async (acao: "aprovado" | "rejeitado", comentarioInput?: string) => {
    if (!data || !token || actionLoading) return;
    // C-03: somente orçamentos enviados (status pendente) podem ser respondidos.
    if (data.status !== "pendente") {
      toast.error("Este orçamento não está mais disponível para resposta.");
      return;
    }
    const comentarioFinal = (comentarioInput ?? "").trim();
    if (acao === "rejeitado" && comentarioFinal.length < 3) {
      toast.error("Descreva o que você gostaria de ajustar (mín. 3 caracteres).");
      return;
    }
    setActionLoading(true);
    const { error: rpcErr } = await supabase.rpc("acao_cliente_orcamento" as never, {
      p_token: token,
      p_acao: acao,
      p_comentario: comentarioFinal || null,
    } as never);
    if (rpcErr) {
      toast.error("Erro ao registrar sua resposta. Tente novamente.");
      setActionLoading(false);
      return;
    } else {
      setActionDone(acao);
      setData((prev) => (prev ? { ...prev, status: acao } : prev));
      setDialogAcao(null);
      setComentario("");
      // Dispara notificação ao time (best-effort, não bloqueia UX).
      supabase.functions
        .invoke("notify-orcamento-resposta", { body: { token, acao } })
        .catch(() => {});
    }
    setActionLoading(false);
  };

  const statusBadge = (() => {
    const s = data.status;
    let bg = CREAM; let fg = WINE; let label = s.charAt(0).toUpperCase() + s.slice(1);
    if (s === "aprovado") { bg = "#dcfce7"; fg = "#166534"; label = "Aprovado"; }
    else if (s === "rejeitado" || s === "cancelado") { bg = "#fee2e2"; fg = "#991b1b"; label = s === "rejeitado" ? "Rejeitado" : "Cancelado"; }
    else if (s === "pendente") { bg = "#dbeafe"; fg = "#1e40af"; label = "Pendente"; }
    else if (s === "rascunho") { bg = "#f3f4f6"; fg = "#374151"; label = "Rascunho"; }
    return { bg, fg, label };
  })();

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: INK }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* CABEÇALHO INSTITUCIONAL */}
        <header style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, borderLeft: `6px solid ${ORANGE}`, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, padding: "20px 24px", alignItems: "center" }}>
            {/* Logo */}
            <div style={{ minWidth: 120, display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
              {empresa?.logo_url ? (
                <img src={empresa.logo_url} alt={empresaNome} style={{ maxHeight: 64, maxWidth: 160, objectFit: "contain", display: "block" }} />
              ) : (
                <div style={{ fontSize: 24, fontWeight: 800, color: WINE, letterSpacing: 0.5 }}>{empresaNome}</div>
              )}
            </div>
            {/* Empresa */}
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "#3d3d3a", textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 2 }}>{empresaNome}</div>
              {empresa?.cnpj && <div>CNPJ: {empresa.cnpj}{empresa.inscricao_estadual ? ` · IE: ${empresa.inscricao_estadual}` : ""}</div>}
              {(enderecoLinha || cidadeLinha) && <div>{[enderecoLinha, cidadeLinha].filter(Boolean).join(" · ")}</div>}
              {cepLinha && <div>{cepLinha}</div>}
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
                {empresa?.telefone && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Phone className="h-3 w-3" />{empresa.telefone}</span>}
                {empresa?.email && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Mail className="h-3 w-3" />{empresa.email}</span>}
                {empresa?.site && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Globe className="h-3 w-3" />{empresa.site}</span>}
              </div>
            </div>
          </div>

          {/* Faixa do número e status */}
          <div style={{ background: CREAM, borderTop: `1px solid ${BORDER}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 1.6, color: ORANGE, fontWeight: 700 }}>PROPOSTA COMERCIAL</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: WINE, lineHeight: 1.1, marginTop: 2 }}>Orçamento Nº {data.numero}</div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
              <div>
                <span style={{ color: "#7a6a48" }}>Emissão:</span>{" "}
                <strong>{formatDate(data.data_orcamento)}</strong>
              </div>
              {data.validade && (
                <div style={{ color: isExpired ? "#991b1b" : INK }}>
                  <span style={{ color: "#7a6a48" }}>Validade:</span>{" "}
                  <strong>{formatDate(data.validade)}</strong>
                  {isExpired && <span style={{ marginLeft: 4, fontWeight: 700 }}>(expirada)</span>}
                </div>
              )}
              <span style={{ background: statusBadge.bg, color: statusBadge.fg, fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {statusBadge.label}
              </span>
            </div>
          </div>
        </header>

        {/* CLIENTE */}
        {cliente && (
          <section style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${ORANGE}`, padding: "16px 20px" }}>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: ORANGE, fontWeight: 700, marginBottom: 6 }}>CLIENTE</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, fontSize: 13, lineHeight: 1.55 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{cliente.nome_razao_social || "—"}</div>
                {cliente.cpf_cnpj && <div style={{ color: "#3d3d3a" }}>CPF/CNPJ: {cliente.cpf_cnpj}</div>}
                {cliente.email && <div style={{ color: "#3d3d3a" }}>{cliente.email}</div>}
                {cliente.telefone && <div style={{ color: "#3d3d3a" }}>{cliente.telefone}</div>}
              </div>
              <div>
                {(cliente.logradouro || cliente.cidade || cliente.cep) && (
                  <>
                    <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#7a6a48", fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      <MapPin className="h-3 w-3" /> ENDEREÇO
                    </div>
                    {(cliente.logradouro || cliente.numero) && (
                      <div style={{ color: "#3d3d3a" }}>
                        {cliente.logradouro || ""}{cliente.numero ? `, ${cliente.numero}` : ""}{cliente.complemento ? ` · ${cliente.complemento}` : ""}
                      </div>
                    )}
                    {(cliente.bairro || cliente.cidade) && (
                      <div style={{ color: "#3d3d3a" }}>
                        {cliente.bairro ? `${cliente.bairro} · ` : ""}{cliente.cidade || ""}{cliente.uf ? `/${cliente.uf}` : ""}
                      </div>
                    )}
                    {cliente.cep && <div style={{ color: "#3d3d3a" }}>CEP: {cliente.cep}</div>}
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ITENS */}
        <section style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: WINE, fontWeight: 700 }}>ITENS DO ORÇAMENTO</div>
          </div>

          {/* Tabela desktop */}
          <div className="hidden md:block" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fff", borderBottom: `2px solid ${BORDER}`, color: WINE }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4 }}>#</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4 }}>CÓDIGO</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4 }}>DESCRIÇÃO</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4 }}>QTD</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4 }}>UN.</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4 }}>UNITÁRIO</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4 }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {data.itens.map((it, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? "#fff" : CREAM }}>
                    <td style={{ padding: "8px 12px", color: "#7a6a48", fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                    <td style={{ padding: "8px 12px", color: WINE, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{it.codigo_snapshot || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ fontWeight: 600 }}>{it.descricao_snapshot || "—"}</div>
                      {it.variacao && (
                        <span style={{ display: "inline-block", marginTop: 2, background: CREAM, color: ORANGE, fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>
                          {it.variacao}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{it.quantidade}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#3d3d3a" }}>{it.unidade}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#3d3d3a" }}>{formatCurrency(it.valor_unitario)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{formatCurrency(it.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards mobile */}
          <div className="md:hidden" style={{ display: "flex", flexDirection: "column" }}>
            {data.itens.map((it, i) => (
              <div key={i} style={{ padding: "12px 16px", borderBottom: i < data.itens.length - 1 ? `1px solid ${BORDER}` : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 11, color: WINE, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>#{i + 1} · {it.codigo_snapshot}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(it.valor_total)}</div>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{it.descricao_snapshot}</div>
                {it.variacao && (
                  <span style={{ display: "inline-block", marginTop: 4, background: CREAM, color: ORANGE, fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>
                    {it.variacao}
                  </span>
                )}
                <div style={{ marginTop: 6, fontSize: 12.5, color: "#3d3d3a", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span><strong style={{ color: INK }}>{it.quantidade}</strong> {it.unidade}</span>
                  <span>×</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(it.valor_unitario)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* TOTAIS + CONDIÇÕES */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }} className="md:grid-cols-2">
          {/* Condições */}
          <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "16px 20px" }}>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: WINE, fontWeight: 700, marginBottom: 10 }}>CONDIÇÕES COMERCIAIS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", fontSize: 13 }}>
              {data.pagamento && (
                <div><div style={{ color: "#7a6a48", fontSize: 11.5 }}>Pagamento</div><strong>{paymentLabel[data.pagamento] || data.pagamento}</strong></div>
              )}
              {data.prazo_pagamento && (
                <div><div style={{ color: "#7a6a48", fontSize: 11.5 }}>Prazo de pagamento</div><strong>{data.prazo_pagamento}</strong></div>
              )}
              {data.prazo_entrega && (
                <div><div style={{ color: "#7a6a48", fontSize: 11.5 }}>Prazo de entrega</div><strong>{data.prazo_entrega}</strong></div>
              )}
              {data.frete_tipo && (
                <div><div style={{ color: "#7a6a48", fontSize: 11.5 }}>Frete</div><strong>{data.frete_tipo}</strong></div>
              )}
              {data.modalidade && data.modalidade !== data.frete_tipo && (
                <div><div style={{ color: "#7a6a48", fontSize: 11.5 }}>Modalidade</div><strong>{data.modalidade}</strong></div>
              )}
              {data.servico_frete && (
                <div><div style={{ color: "#7a6a48", fontSize: 11.5 }}>Serviço</div><strong>{data.servico_frete}</strong></div>
              )}
              {(data.quantidade_total > 0 || data.peso_total > 0) && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ color: "#7a6a48", fontSize: 11.5 }}>Quantidade / Peso total</div>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{data.quantidade_total} un · {data.peso_total.toFixed(2)} kg</strong>
                </div>
              )}
            </div>
            {data.observacoes && (
              <>
                <div style={{ height: 1, background: BORDER, margin: "14px 0" }} />
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: WINE, fontWeight: 700, marginBottom: 6 }}>OBSERVAÇÕES</div>
                <div style={{ fontSize: 13, color: "#3d3d3a", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{data.observacoes}</div>
              </>
            )}
          </div>

          {/* Totais detalhados */}
          <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, borderTop: `4px solid ${ORANGE}`, padding: "16px 20px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: WINE, fontWeight: 700, marginBottom: 10 }}>RESUMO FINANCEIRO</div>
            <div style={{ fontSize: 13, lineHeight: 1.9 }}>
              <Row label="Subtotal produtos" value={formatCurrency(totalProdutos)} />
              {data.desconto > 0 && <Row label="(−) Desconto" value={formatCurrency(data.desconto)} />}
              {data.imposto_st > 0 && <Row label="(+) ICMS-ST" value={formatCurrency(data.imposto_st)} />}
              {data.imposto_ipi > 0 && <Row label="(+) IPI" value={formatCurrency(data.imposto_ipi)} />}
              {data.frete_valor > 0 && <Row label="(+) Frete" value={formatCurrency(data.frete_valor)} />}
              {data.outras_despesas > 0 && <Row label="(+) Outras despesas" value={formatCurrency(data.outras_despesas)} />}
            </div>
            <div style={{ background: CREAM, marginTop: 12, padding: "12px 14px", borderLeft: `4px solid ${WINE}`, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 11, letterSpacing: 1.5, color: WINE, fontWeight: 700 }}>VALOR TOTAL</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: WINE, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(data.valor_total)}</span>
            </div>
          </div>
        </section>

        {/* AÇÕES */}
        {!actionDone && !isExpired && !["aprovado", "rejeitado", "cancelado"].includes(data.status) && (
          <section style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, padding: "20px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 13.5, color: "#3d3d3a", marginBottom: 16 }}>
              Revise os itens acima e confirme sua resposta:
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Button
                size="lg"
                className="gap-2"
                style={{ background: "#16a34a", color: "#fff", minWidth: 220, minHeight: 44 }}
                disabled={actionLoading}
                onClick={() => { setComentario(""); setDialogAcao("aprovado"); }}
              >
                <CheckCircle className="h-5 w-5" />
                Aceitar este orçamento
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2"
                style={{ borderColor: WINE, color: WINE, minWidth: 220, minHeight: 44 }}
                disabled={actionLoading}
                onClick={() => { setComentario(""); setDialogAcao("rejeitado"); }}
              >
                <XCircle className="h-5 w-5" />
                Solicitar revisão
              </Button>
            </div>
          </section>
        )}

        {actionDone && (
          <section style={{
            background: "#fff",
            borderRadius: 12,
            border: `2px solid ${actionDone === "aprovado" ? "#86efac" : "#fdba74"}`,
            padding: "28px 24px",
            textAlign: "center",
          }}>
            {actionDone === "aprovado" ? (
              <>
                <CheckCircle className="h-12 w-12 mx-auto mb-3" style={{ color: "#16a34a" }} />
                <p style={{ fontSize: 17, fontWeight: 700, color: "#15803d", marginBottom: 6 }}>Orçamento aceito com sucesso!</p>
                <p style={{ fontSize: 13.5, color: "#3d3d3a" }}>Nossa equipe entrará em contato em breve para confirmar os próximos passos.</p>
              </>
            ) : (
              <>
                <XCircle className="h-12 w-12 mx-auto mb-3" style={{ color: "#ea580c" }} />
                <p style={{ fontSize: 17, fontWeight: 700, color: "#c2410c", marginBottom: 6 }}>Solicitação de revisão registrada.</p>
                <p style={{ fontSize: 13.5, color: "#3d3d3a" }}>Nossa equipe analisará suas considerações e enviará uma nova versão em breve.</p>
              </>
            )}
          </section>
        )}

        {/* Rodapé institucional */}
        <footer style={{ textAlign: "center", padding: "16px 8px 0", fontSize: 11.5, color: "#7a6a48", lineHeight: 1.6 }}>
          <div>{empresaNome}{empresa?.cnpj ? ` · CNPJ ${empresa.cnpj}` : ""}</div>
          <div>Documento gerado eletronicamente. Este orçamento é informativo e não tem valor fiscal.</div>
        </footer>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#7a6a48" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

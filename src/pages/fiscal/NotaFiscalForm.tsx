import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  FiscalSefazStatusBadge,
  FiscalInternalStatusBadge,
} from "@/components/fiscal/FiscalStatusBadges";
import { SefazAcoesPanel } from "@/pages/fiscal/components/SefazAcoesPanel";
import { PedidoCompraLinker } from "@/pages/fiscal/components/PedidoCompraLinker";
import {
  buildNFeDataFromDb,
  buildDanfeDataFromDb,
} from "@/services/fiscal/nfeBuilders.service";
import type { NotaFiscal } from "@/types/domain";
import { NfeFormBody } from "@/pages/fiscal/components/NfeFormBody";
import { useFiscalNotaForm } from "@/pages/fiscal/hooks/useFiscalNotaForm";

/**
 * Página de criação/edição de NF-e (Fase 4 do roadmap fiscal).
 *
 * Rotas:
 *   - /fiscal/novo            → criação (id === "novo")
 *   - /fiscal/:id/editar      → edição
 *
 * Read-only quando status_sefaz ∈ {autorizada, cancelada_sefaz, denegada}.
 */
const STATUS_SEFAZ_TRAVADOS = new Set([
  "autorizada",
  "cancelada_sefaz",
  "denegada",
]);

interface NotaFiscalRow {
  id: string;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  natureza_operacao: string | null;
  tipo: string;
  cliente_id: string | null;
  fornecedor_id: string | null;
  forma_pagamento: string | null;
  condicao_pagamento: string | null;
  frete_modalidade: string | null;
  frete_valor: number | null;
  desconto_valor: number | null;
  outras_despesas: number | null;
  observacoes: string | null;
  status: string | null;
  status_sefaz: string | null;
  pedido_compra_id: string | null;
  valor_total: number | null;
  data_vencimento: string | null;
  numero_parcelas: number | null;
  intervalo_parcelas_dias: number | null;
  parcelas: unknown;
  gera_financeiro: boolean | null;
}

function rowToFormDefaults(row: NotaFiscalRow): Partial<NFeFormData> {
  return {
    numero: row.numero ?? "",
    serie: row.serie ?? "1",
    dataEmissao: row.data_emissao ?? new Date().toISOString().split("T")[0],
    naturezaOperacao: row.natureza_operacao ?? "",
    tipoOperacao: (row.tipo as "entrada" | "saida") ?? "saida",
    clienteId: row.cliente_id ?? undefined,
    fornecedorId: row.fornecedor_id ?? undefined,
    formaPagamento: row.forma_pagamento ?? undefined,
    condicaoPagamento: row.condicao_pagamento ?? undefined,
    freteModalidade: (row.frete_modalidade as NFeFormData["freteModalidade"]) ?? "9",
    freteValor: Number(row.frete_valor || 0),
    descontoValor: Number(row.desconto_valor || 0),
    outrasDespesas: Number(row.outras_despesas || 0),
    observacoes: row.observacoes ?? "",
    itens: [],
    geraFinanceiro: row.gera_financeiro ?? true,
    dataVencimento: row.data_vencimento ?? undefined,
    numeroParcelas: Number(row.numero_parcelas || 1),
    intervaloParcelasDias: Number(row.intervalo_parcelas_dias ?? 30),
    parcelas: Array.isArray(row.parcelas)
      ? (row.parcelas as Array<{ numero: number; vencimento: string; valor: number }>)
      : undefined,
  };
}

export default function NotaFiscalFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isCreate = !id || id === "novo";

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState<Partial<NFeFormData> | undefined>(
    undefined,
  );
  const [statusSefaz, setStatusSefaz] = useState<string | null>(null);
  const [statusErp, setStatusErp] = useState<string | null>(null);
  const [nfRow, setNfRow] = useState<NotaFiscalRow | null>(null);

  useEffect(() => {
    if (isCreate) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select(
          "id, numero, serie, data_emissao, natureza_operacao, tipo, cliente_id, fornecedor_id, forma_pagamento, condicao_pagamento, frete_modalidade, frete_valor, desconto_valor, outras_despesas, observacoes, status, status_sefaz, pedido_compra_id, data_vencimento, numero_parcelas, intervalo_parcelas_dias, parcelas, gera_financeiro",
        )
        .eq("id", id!)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Nota fiscal não encontrada.");
        navigate("/fiscal");
        return;
      }
      const row = data as unknown as NotaFiscalRow;
      setDefaults(rowToFormDefaults(row));
      setStatusSefaz(row.status_sefaz);
      setStatusErp(row.status);
      setNfRow(row);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isCreate, navigate]);

  const readOnly =
    !isCreate && !!statusSefaz && STATUS_SEFAZ_TRAVADOS.has(statusSefaz);

  async function handleSubmit(formData: NFeFormData) {
    setSaving(true);
    try {
      // Persistência mínima: campos do header. Itens/parcelas seguem fluxo
      // existente em src/pages/Fiscal.tsx até a Fase 5 cobrir o pipeline completo.
      const payload = {
        numero: formData.numero || null,
        serie: formData.serie,
        data_emissao: formData.dataEmissao,
        natureza_operacao: formData.naturezaOperacao,
        tipo: formData.tipoOperacao,
        cliente_id: formData.clienteId || null,
        fornecedor_id: formData.fornecedorId || null,
        forma_pagamento: formData.formaPagamento || null,
        condicao_pagamento: formData.condicaoPagamento || null,
        frete_modalidade: formData.freteModalidade,
        frete_valor: formData.freteValor,
        desconto_valor: formData.descontoValor,
        outras_despesas: formData.outrasDespesas,
        observacoes: formData.observacoes || null,
        gera_financeiro: formData.geraFinanceiro ?? true,
        data_vencimento: formData.dataVencimento || null,
        numero_parcelas: formData.numeroParcelas ?? 1,
        intervalo_parcelas_dias: formData.intervaloParcelasDias ?? 30,
        parcelas: formData.parcelas && formData.parcelas.length > 0 ? formData.parcelas : null,
      };

      if (isCreate) {
        const { data, error } = await supabase
          .from("notas_fiscais")
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;
        toast.success("Nota fiscal criada.");
        navigate(`/fiscal/${(data as { id: string }).id}/editar`, {
          replace: true,
        });
      } else {
        const { error } = await supabase
          .from("notas_fiscais")
          .update(payload as never)
          .eq("id", id!);
        if (error) throw error;
        toast.success("Nota fiscal atualizada.");
      }
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/fiscal")}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {isCreate ? "Nova Nota Fiscal" : `NF-e ${defaults?.numero ?? ""}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isCreate
                ? "Preencha os dados da nota fiscal para emissão."
                : "Edite os dados da nota fiscal."}
            </p>
          </div>
        </div>
        {!isCreate && (
          <div className="flex items-center gap-2">
            {statusErp && <FiscalInternalStatusBadge status={statusErp} />}
            {statusSefaz && <FiscalSefazStatusBadge status={statusSefaz} />}
          </div>
        )}
      </div>

      {readOnly && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>Somente leitura</AlertTitle>
          <AlertDescription>
            Esta NF-e está{" "}
            <Badge variant="secondary" className="mx-1">
              {statusSefaz}
            </Badge>
            na SEFAZ. Para alterar, utilize Cancelar/Inutilizar pela tela de
            Fiscal e emita uma nova nota.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isCreate ? "Emissão" : "Edição"}</CardTitle>
        </CardHeader>
        <CardContent>
          {!isCreate && nfRow && (
            <div className="mb-4 rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ações SEFAZ
              </p>
              <SefazAcoesPanel
                nf={nfRow as unknown as NotaFiscal}
                buildNFeData={buildNFeDataFromDb}
                buildDanfeData={buildDanfeDataFromDb}
              />
              {nfRow.tipo === "entrada" && (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Pedido de Compra
                  </p>
                  <PedidoCompraLinker
                    notaFiscalId={nfRow.id}
                    fornecedorId={nfRow.fornecedor_id}
                    pedidoCompraIdAtual={nfRow.pedido_compra_id}
                    disabled={readOnly}
                    nfValorTotal={nfRow.valor_total}
                    nfDataEmissao={nfRow.data_emissao}
                  />
                </div>
              )}
            </div>
          )}
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <NFeForm
              defaultValues={defaults}
              disabled={readOnly || saving}
              onSubmit={handleSubmit}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
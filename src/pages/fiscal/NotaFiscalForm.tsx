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

export default function NotaFiscalFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isCreate = !id || id === "novo";
  const notaId = isCreate ? null : id!;

  const fnf = useFiscalNotaForm({
    notaId,
    onSaved: (savedId) => {
      if (isCreate) navigate(`/fiscal/${savedId}/editar`, { replace: true });
      else navigate("/fiscal");
    },
  });

  const [statusSefaz, setStatusSefaz] = useState<string | null>(null);
  const [statusErp, setStatusErp] = useState<string | null>(null);
  const [nfRow, setNfRow] = useState<NotaFiscal | null>(null);

  useEffect(() => {
    if (isCreate) return;
    (async () => {
      const { data } = await supabase
        .from("notas_fiscais")
        .select("*, fornecedores(nome_razao_social, cpf_cnpj), clientes(nome_razao_social)")
        .eq("id", id!)
        .maybeSingle();
      if (!data) return;
      setNfRow(data as unknown as NotaFiscal);
      setStatusSefaz((data as { status_sefaz?: string | null }).status_sefaz ?? null);
      setStatusErp((data as { status?: string | null }).status ?? null);
    })();
  }, [id, isCreate]);

  const readOnly =
    !isCreate && !!statusSefaz && STATUS_SEFAZ_TRAVADOS.has(statusSefaz);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    void fnf.submit();
  };

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
              {isCreate ? "Nova Nota Fiscal" : `NF-e ${fnf.form.numero ?? ""}`}
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
                nf={nfRow}
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
                    pedidoCompraIdAtual={(nfRow as { pedido_compra_id?: string | null }).pedido_compra_id ?? null}
                    disabled={readOnly}
                    nfValorTotal={nfRow.valor_total}
                    nfDataEmissao={nfRow.data_emissao}
                  />
                </div>
              )}
            </div>
          )}
          {fnf.loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <fieldset disabled={readOnly} className="space-y-5 disabled:opacity-70">
                <NfeFormBody
                  form={fnf.form as unknown as Record<string, string | number | boolean>}
                  setForm={(next) => fnf.setForm(next as never)}
                  items={fnf.items}
                  setItems={fnf.setItems}
                  itemContaContabil={fnf.itemContaContabil}
                  setItemContaContabil={fnf.setItemContaContabil}
                  parcelas={fnf.parcelas}
                  setParcelas={fnf.setParcelas}
                  primeiroVencimento={fnf.primeiroVencimento}
                  setPrimeiroVencimento={fnf.setPrimeiroVencimento}
                  intervaloDias={fnf.intervaloDias}
                  setIntervaloDias={fnf.setIntervaloDias}
                  parcelasPlano={fnf.parcelasPlano}
                  setParcelasPlano={fnf.setParcelasPlano}
                  fornecedores={fnf.fornecedores}
                  clientes={fnf.clientes}
                  produtos={fnf.produtos}
                  ordensVenda={fnf.ordensVenda}
                  contasContabeis={fnf.contasContabeis}
                  cartoes={fnf.cartoes}
                  valorProdutos={fnf.valorProdutos}
                  totalImpostos={fnf.totalImpostos}
                  totalNF={fnf.totalNF}
                  xmlOriginInfo={null}
                  traducaoLinhasCount={0}
                  onAbrirTraducao={() => {}}
                  onCriarProdutoQuick={() => {}}
                />
              </fieldset>
              {!readOnly && (
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => navigate("/fiscal")}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={fnf.saving}>
                    {fnf.saving ? "Salvando..." : "Salvar NF-e"}
                  </Button>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
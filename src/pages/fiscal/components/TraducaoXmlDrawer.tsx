/**
 * TraducaoXmlDrawer — Etapa explícita de "tradução" XML→Sistema na importação de NF-e.
 *
 * Doutrina (mem://features/traducao-xml-fiscal):
 *   • A coluna esquerda mostra o XML cru e é IMUTÁVEL — verdade fiscal.
 *   • A coluna direita é o mapeamento interno: produto, unidade do cadastro e
 *     fator de conversão. Convenção: qtd_interna = qCom × fator_conversao.
 *   • Drawer abre obrigatoriamente quando há QUALQUER pendência (item sem produto
 *     OU unidade XML diferente da unidade interna sem fator memorizado).
 *   • Em 100% OK abre apenas em modo somente-leitura via banner "Ver tradução".
 */
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, ArrowRight, CheckCircle2, PlusCircle } from "lucide-react";
import { AutocompleteSearch } from "@/components/ui/AutocompleteSearch";
import type { TraducaoLinha, ProdutoMatchRef } from "@/pages/fiscal/hooks/useNFeXmlImport";
import { parseVariacoes, formatVariacoesSuffix } from "@/utils/cadastros";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  open: boolean;
  readOnly?: boolean;
  fornecedorNome: string;
  fornecedorId: string;
  produtos: ProdutoMatchRef[];
  linhas: TraducaoLinha[];
  onCancel: () => void;
  onConfirm: (linhas: TraducaoLinha[]) => void;
  /**
   * Callback para "Cadastrar produto" a partir do nome do XML.
   * Recebe o índice da linha e o nome sugerido (xProd).
   */
  onCreateProduto?: (linhaIndex: number, sugestaoNome: string) => void;
}

const fmt = (n: number, dec = 4) =>
  Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: dec }) : "—";

export function TraducaoXmlDrawer({ open, readOnly = false, fornecedorNome, produtos, linhas, onCancel, onConfirm, onCreateProduto }: Props) {
  const [draft, setDraft] = useState<TraducaoLinha[]>(linhas);
  const isMobile = useIsMobile();

  useEffect(() => {
    setDraft(linhas);
  }, [linhas, open]);

  // Inclui SEMPRE a variação (ex.: "13 X 45") junto do nome para diferenciar
  // produtos homônimos. A doutrina (parseVariacoes) é a mesma do
  // OrcamentoItemsGrid e ItemsGrid.
  const produtoOptions = useMemo(
    () =>
      produtos.map((p) => {
        const variacoes = parseVariacoes(p.variacoes);
        const variSuffix = formatVariacoesSuffix(p.variacoes);
        const codePart = [p.sku, p.codigo_interno].filter(Boolean).join(" / ");
        return {
          id: p.id,
          label: `${p.nome}${variSuffix}`,
          sublabel: [codePart, p.unidade_medida].filter(Boolean).join(" · "),
          searchTerms: [p.sku, p.codigo_interno, ...variacoes].filter(Boolean) as string[],
        };
      }),
    [produtos],
  );

  const updateLinha = (idx: number, patch: Partial<TraducaoLinha>) => {
    setDraft((prev) => prev.map((l, i) => (i === idx ? recalcLinha({ ...l, ...patch }, produtos) : l)));
  };

  const pendentes = draft.filter((l) => l.pendente).length;
  const podeConfirmar = !readOnly && pendentes === 0 && draft.every((l) => l.produtoId && l.fatorConversao > 0);

  const ordenadas = useMemo(
    () => [...draft].sort((a, b) => Number(b.pendente) - Number(a.pendente) || a.index - b.index),
    [draft],
  );

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-[95vh] w-full p-0 flex flex-col"
            : "w-full sm:max-w-3xl overflow-y-auto"
        }
      >
        <SheetHeader className={isMobile ? "px-4 pt-4 pb-2 border-b" : ""}>
          <SheetTitle>Traduzir XML para o cadastro</SheetTitle>
          <SheetDescription className={isMobile ? "text-xs" : ""}>
            Os dados da esquerda vêm do XML do fornecedor <strong>{fornecedorNome || "—"}</strong> e são preservados como verdade fiscal.
            À direita, mapeie cada item ao produto do cadastro e informe o fator de conversão de unidades.
            <span className="block mt-1 text-xs">
              Convenção: <code>qtd_interna = qtd_xml × fator</code>. Ex.: 25 KG × 0,25 = 6,25 MT.
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className={`flex items-center gap-2 text-sm ${isMobile ? "px-4 pt-3" : "mt-4"}`}>
          {pendentes > 0 ? (
            <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> {pendentes} item(ns) pendente(s)</Badge>
          ) : (
            <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Todos os itens traduzidos</Badge>
          )}
          {readOnly && <Badge variant="outline">Somente leitura</Badge>}
        </div>

        <div className={`space-y-3 ${isMobile ? "px-4 mt-3 flex-1 overflow-y-auto pb-4" : "mt-4"}`}>
          {ordenadas.map((linha) => (
            <LinhaCard
              key={linha.index}
              linha={linha}
              readOnly={readOnly}
              produtoOptions={produtoOptions}
              onChange={(patch) => updateLinha(linha.index, patch)}
              onCreateProduto={onCreateProduto}
            />
          ))}
        </div>

        {!isMobile && <Separator className="my-4" />}
        <div
          className={
            isMobile
              ? "flex items-center justify-end gap-2 border-t bg-background px-4 py-3"
              : "flex items-center justify-end gap-2 sticky bottom-0 bg-background pt-2 pb-2"
          }
        >
          <Button variant="outline" onClick={onCancel} className={isMobile ? "min-h-11 flex-1" : undefined}>
            {readOnly ? "Fechar" : "Cancelar importação"}
          </Button>
          {!readOnly && (
            <Button
              onClick={() => onConfirm(draft)}
              disabled={!podeConfirmar}
              className={isMobile ? "min-h-11 flex-1" : undefined}
            >
              Confirmar tradução
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LinhaCard({
  linha,
  readOnly,
  produtoOptions,
  onChange,
  onCreateProduto,
}: {
  linha: TraducaoLinha;
  readOnly: boolean;
  produtoOptions: { id: string; label: string; sublabel: string }[];
  onChange: (patch: Partial<TraducaoLinha>) => void;
  onCreateProduto?: (linhaIndex: number, sugestaoNome: string) => void;
}) {
  const qtdInterna = linha.fatorConversao > 0 ? linha.xmlQuantidade * linha.fatorConversao : 0;
  const vUnInterno = qtdInterna > 0 ? linha.xmlValorTotal / qtdInterna : 0;
  const unidadesIguais =
    !!linha.unidadeInterna && linha.xmlUnidade.trim().toUpperCase() === linha.unidadeInterna.trim().toUpperCase();

  return (
    <div className={`rounded-lg border p-3 ${linha.pendente ? "border-destructive/50 bg-destructive/5" : "bg-card"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">Item #{linha.index + 1}</div>
        {linha.pendente ? (
          <Badge variant="destructive">PENDENTE</Badge>
        ) : linha.matchStatus === "auto" ? (
          <Badge variant="secondary">Memorizado</Badge>
        ) : linha.matchStatus === "direto" ? (
          <Badge variant="outline">Unidade igual</Badge>
        ) : (
          <Badge variant="default">Manual</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-start">
        {/* XML — verdade fiscal */}
        <div className="space-y-1 text-sm">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Do XML (fiscal — preservado)</div>
          <div><span className="text-muted-foreground">cProd:</span> <code>{linha.xmlCodigo || "—"}</code></div>
          <div className="line-clamp-2"><span className="text-muted-foreground">xProd:</span> {linha.xmlDescricao}</div>
          <div><span className="text-muted-foreground">uCom:</span> <strong>{linha.xmlUnidade || "—"}</strong> · <span className="text-muted-foreground">qCom:</span> {fmt(linha.xmlQuantidade)}</div>
          <div><span className="text-muted-foreground">vUnCom:</span> {fmt(linha.xmlValorUnitario)} · <span className="text-muted-foreground">vProd:</span> {fmt(linha.xmlValorTotal, 2)}</div>
        </div>

        <div className="hidden md:flex items-center justify-center pt-6 text-muted-foreground">
          <ArrowRight className="h-5 w-5" />
        </div>

        {/* Sistema — interno */}
        <div className="space-y-2 text-sm">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">No sistema</div>
          <div>
            <Label className="text-xs">Produto</Label>
            <AutocompleteSearch
              options={produtoOptions}
              value={linha.produtoId}
              onChange={(id) => {
                if (readOnly) return;
                onChange({ produtoId: id, matchStatus: "manual" });
              }}
              placeholder="Buscar produto..."
              onCreateNew={!readOnly && onCreateProduto ? () => onCreateProduto(linha.index, linha.xmlDescricao) : undefined}
              createNewLabel="Cadastrar este produto"
            />
            {!readOnly && !linha.produtoId && onCreateProduto && (
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                onClick={() => onCreateProduto(linha.index, linha.xmlDescricao)}
              >
                <PlusCircle className="h-3 w-3" /> Cadastrar &ldquo;{linha.xmlDescricao.slice(0, 32)}{linha.xmlDescricao.length > 32 ? "…" : ""}&rdquo;
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Unid. interna</Label>
              <Input value={linha.unidadeInterna || "—"} readOnly className="h-8" />
            </div>
            <div>
              <Label className={`text-xs ${!unidadesIguais && linha.fatorConversao === 1 ? "text-amber-600" : ""}`}>
                Fator {!unidadesIguais && "⚠"}
              </Label>
              <Input
                type="number"
                step="any"
                min={0}
                value={linha.fatorConversao}
                readOnly={readOnly}
                onChange={(e) => onChange({ fatorConversao: Number(e.target.value) || 0, matchStatus: "manual" })}
                className={`h-8 ${!unidadesIguais && linha.fatorConversao === 1 ? "border-amber-500" : ""}`}
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Qtd convertida: <strong className="text-foreground">{fmt(qtdInterna)} {linha.unidadeInterna || ""}</strong>
            {" · "}
            Custo unit.: <strong className="text-foreground">{fmt(vUnInterno, 4)}</strong>
          </div>
          {!readOnly && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={linha.salvarDePara}
                onCheckedChange={(v) => onChange({ salvarDePara: v === true })}
              />
              Salvar tradução para este fornecedor (próximas importações ficam automáticas)
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

function recalcLinha(l: TraducaoLinha, produtos: ProdutoMatchRef[]): TraducaoLinha {
  const matched = produtos.find((p) => p.id === l.produtoId);
  const unidadeInterna = matched?.unidade_medida ?? l.unidadeInterna ?? null;
  const xmlUni = (l.xmlUnidade || "").trim().toUpperCase();
  const intUni = (unidadeInterna || "").trim().toUpperCase();
  const unidadesIguais = !!intUni && xmlUni === intUni;
  const pendente = !l.produtoId || !(l.fatorConversao > 0) || (!unidadesIguais && l.fatorConversao === 1 && l.matchStatus !== "manual" && l.matchStatus !== "auto");
  return { ...l, unidadeInterna, pendente };
}
import { forwardRef, useImperativeHandle, useState } from "react";
import { DanfeViewer } from "@/components/DanfeViewer";
import {
  listNotaFiscalItensCompletos,
  getEmpresaConfigPrincipal,
} from "@/services/fiscal.service";
import type { NotaFiscal } from "@/types/domain";

interface NfItemRowMin {
  produtos?: { nome: string; sku?: string } | null;
  quantidade: number;
  valor_unitario: number;
  cfop?: string | null; cst?: string | null;
  icms_valor?: number | null; ipi_valor?: number | null;
  pis_valor?: number | null; cofins_valor?: number | null;
}

export interface FiscalDanfeViewerHandle {
  open: (nf: NotaFiscal) => Promise<void>;
  close: () => void;
}

/**
 * Encapsula o `DanfeViewer` + carga de dados (itens + empresa_config).
 * Exposto via ref imperativa: `viewerRef.current.open(nf)`.
 */
export const FiscalDanfeViewer = forwardRef<FiscalDanfeViewerHandle>((_, ref) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useImperativeHandle(ref, () => ({
    open: async (n: NotaFiscal) => {
      const [itens, empresa] = await Promise.all([
        listNotaFiscalItensCompletos(n.id).catch(() => []),
        getEmpresaConfigPrincipal().catch(() => null),
      ]);
      setData({
        numero: n.numero, serie: n.serie, chave_acesso: n.chave_acesso,
        data_emissao: n.data_emissao, tipo: n.tipo, status: n.status,
        emitente: n.tipo === "saida" && empresa
          ? { nome: empresa.razao_social, cnpj: empresa.cnpj, endereco: empresa.logradouro, cidade: empresa.cidade, uf: empresa.uf }
          : (n.fornecedores ? { nome: n.fornecedores.nome_razao_social, cnpj: n.fornecedores.cpf_cnpj } : undefined),
        destinatario: n.tipo === "saida" && n.clientes
          ? { nome: n.clientes.nome_razao_social }
          : (empresa ? { nome: empresa.razao_social, cnpj: empresa.cnpj } : undefined),
        itens: (itens as unknown as NfItemRowMin[]).map((i) => ({
          descricao: i.produtos?.nome || "",
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario,
          cfop: i.cfop, cst: i.cst,
          icms_valor: i.icms_valor, ipi_valor: i.ipi_valor,
          pis_valor: i.pis_valor, cofins_valor: i.cofins_valor,
        })),
        valor_total: n.valor_total, frete_valor: n.frete_valor, icms_valor: n.icms_valor,
        ipi_valor: n.ipi_valor, pis_valor: n.pis_valor, cofins_valor: n.cofins_valor,
        desconto_valor: n.desconto_valor, outras_despesas: n.outras_despesas,
        observacoes: n.observacoes, forma_pagamento: n.forma_pagamento,
        condicao_pagamento: n.condicao_pagamento,
      });
      setOpen(true);
    },
    close: () => setOpen(false),
  }), []);

  return (
    <DanfeViewer open={open} onClose={() => setOpen(false)} data={data as never} />
  );
});

FiscalDanfeViewer.displayName = "FiscalDanfeViewer";

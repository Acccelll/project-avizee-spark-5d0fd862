import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/utils/errorMessages";
import {
  autorizarNFe,
  consultarNFe,
  cancelarNFe,
  resolverUrlSefaz,
  type AmbienteSefaz,
  type AutorizacaoResult,
  type CancelamentoResult,
  type ConsultaResult,
  type NFeData,
} from "@/services/fiscal/sefaz";
import {
  cancelarNotaFiscalSefaz,
  registrarEventoFiscal,
  registrarRetornoSefaz,
} from "@/services/fiscal.service";
import { validarPreEmissao } from "@/services/fiscal/validadores/preEmissao.validator";
import type { NotaFiscal } from "@/types/domain";

/**
 * Hook orquestrador das ações SEFAZ usadas na UI Fiscal.
 *
 * Centraliza:
 *  - leitura de UF/ambiente da empresa (`empresa_config`)
 *  - resolução de endpoints (`resolverUrlSefaz`)
 *  - chamada do sefaz-proxy (modo Vault: certificado/senha server-side)
 *  - persistência do retorno em `notas_fiscais` (status, protocolo, motivo)
 *  - registro de eventos fiscais para a timeline
 *  - feedback ao usuário (toasts) e estado `pending`/`ultimoRetorno`
 */

interface SefazRetornoUI {
  protocolo?: string;
  status?: string;
  motivo?: string;
  xmlRetorno?: string;
  erros?: string[];
}

interface ConfigEmpresa {
  uf: string;
  ambiente: AmbienteSefaz;
  cnpj: string;
}

async function lerConfigEmpresa(): Promise<ConfigEmpresa> {
  const { data, error } = await supabase
    .from("empresa_config")
    .select("uf, ambiente_sefaz, ambiente_padrao, cnpj")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.uf) {
    throw new Error(
      "UF da empresa não configurada. Acesse Configuração Fiscal e informe a UF emitente.",
    );
  }
  if (!data.cnpj) {
    throw new Error("CNPJ da empresa não configurado em Configuração Fiscal.");
  }
  let ambiente: AmbienteSefaz = "2";
  if (data.ambiente_sefaz === "1" || data.ambiente_sefaz === "2") {
    ambiente = data.ambiente_sefaz;
  } else if (data.ambiente_padrao === "producao") {
    ambiente = "1";
  }
  return { uf: data.uf.toUpperCase(), ambiente, cnpj: data.cnpj };
}

export interface UseSefazAcoesReturn {
  pending: boolean;
  ultimoRetorno: SefazRetornoUI | null;
  modalAberto: boolean;
  fecharModal: () => void;
  transmitir: (nf: NotaFiscal, dadosNFe: NFeData) => Promise<AutorizacaoResult | null>;
  consultar: (nf: NotaFiscal) => Promise<ConsultaResult | null>;
  cancelar: (nf: NotaFiscal, justificativa: string) => Promise<CancelamentoResult | null>;
}

export function useSefazAcoes(): UseSefazAcoesReturn {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [ultimoRetorno, setUltimoRetorno] = useState<SefazRetornoUI | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const fecharModal = useCallback(() => setModalAberto(false), []);

  const transmitir = useCallback<UseSefazAcoesReturn["transmitir"]>(
    async (nf, dadosNFe) => {
      if (nf.status_sefaz === "autorizada") {
        toast.error("NF já autorizada pela SEFAZ.");
        return null;
      }
      // ── Garantir número e chave antes de qualquer pré-validação ──
      // Numeração atômica via SEQUENCE evita duplicidade em concorrência;
      // chave de 44 dígitos é gerada server-side com DV mod 11.
      let nfAtual = nf;
      let dadosAtuais = dadosNFe;
      try {
        if (!nfAtual.numero || nfAtual.numero === "0") {
          const { data: numData, error: numErr } = await supabase.rpc(
            "proximo_numero_nfe",
            { p_serie: nfAtual.serie ?? "1" },
          );
          if (numErr) throw numErr;
          const row = Array.isArray(numData) ? numData[0] : numData;
          const novoNumero = String(row?.numero ?? "");
          if (!novoNumero) throw new Error("RPC proximo_numero_nfe não retornou número.");
          await supabase
            .from("notas_fiscais")
            .update({ numero: novoNumero })
            .eq("id", nfAtual.id);
          nfAtual = { ...nfAtual, numero: novoNumero };
          dadosAtuais = { ...dadosAtuais, numero: novoNumero };
        }
        if (!nfAtual.chave_acesso || nfAtual.chave_acesso.length !== 44) {
          const { data: chaveData, error: chaveErr } = await supabase.rpc(
            "gerar_chave_acesso_nfe",
            { p_nf_id: nfAtual.id },
          );
          if (chaveErr) throw chaveErr;
          const novaChave = String(chaveData ?? "");
          if (novaChave.length !== 44) {
            throw new Error("RPC gerar_chave_acesso_nfe retornou chave inválida.");
          }
          await supabase
            .from("notas_fiscais")
            .update({ chave_acesso: novaChave })
            .eq("id", nfAtual.id);
          nfAtual = { ...nfAtual, chave_acesso: novaChave };
          dadosAtuais = { ...dadosAtuais, chave: novaChave };
        }
      } catch (e) {
        notifyError(e);
        return null;
      }
      // Pré-validação local antes de bater na SEFAZ — bloqueia rejeições
      // óbvias (NCM/CFOP/dados cadastrais) economizando uma chamada autenticada.
      const erros = validarPreEmissao(
        {
          cnpj_emitente: dadosAtuais?.emitente?.cnpj ?? null,
          destinatario_cnpj_cpf: dadosAtuais?.destinatario?.cpfCnpj ?? null,
          destinatario_nome: dadosAtuais?.destinatario?.razaoSocial ?? null,
        },
        (dadosAtuais?.itens ?? []).map((i) => ({
          ncm: (i as { ncm?: string | null }).ncm ?? null,
          cfop: (i as { cfop?: string | null }).cfop ?? null,
        })),
      );
      if (erros.length > 0) {
        setUltimoRetorno({
          motivo: `${erros.length} problema(s) de pré-emissão`,
          erros: erros.map((e) => `${e.campo}: ${e.mensagem}`),
        });
        setModalAberto(true);
        toast.error(`${erros.length} problema(s) antes da emissão`);
        return null;
      }
      setPending(true);
      try {
        const cfg = await lerConfigEmpresa();
        const url = resolverUrlSefaz(cfg.uf, cfg.ambiente, "autorizacao");
        const result = await autorizarNFe(
          { ...dadosAtuais, ambiente: cfg.ambiente },
          { tipo: "A1" },
          url,
        );
        const proxima_status = result.sucesso ? "autorizada" : "rejeitada";
        // Atômico: status_sefaz + evento na mesma transação (RPC).
        await registrarRetornoSefaz({
          nfId: nfAtual.id,
          statusSefaz: proxima_status,
          protocolo: result.protocolo ?? null,
          chaveAcesso: result.chave ?? nfAtual.chave_acesso ?? null,
          motivo: result.motivo ?? null,
          ambiente: cfg.ambiente === "1" ? "producao" : "homologacao",
          xmlRetorno: result.xmlAutorizado ?? null,
          payloadResumido: { protocolo: result.protocolo, status: result.status },
        });
        setUltimoRetorno({
          protocolo: result.protocolo,
          status: result.status,
          motivo: result.motivo,
          xmlRetorno: result.xmlAutorizado,
        });
        setModalAberto(true);
        if (result.sucesso) toast.success(`NF autorizada — protocolo ${result.protocolo}`);
        else toast.error(`SEFAZ rejeitou: ${result.motivo ?? "motivo desconhecido"}`);
        qc.invalidateQueries({ queryKey: ["notas_fiscais"] });
        return result;
      } catch (e) {
        notifyError(e);
        return null;
      } finally {
        setPending(false);
      }
    },
    [qc],
  );

  const consultar = useCallback<UseSefazAcoesReturn["consultar"]>(
    async (nf) => {
      if (!nf.chave_acesso) {
        toast.error("Esta NF não possui chave de acesso para consulta.");
        return null;
      }
      setPending(true);
      try {
        const cfg = await lerConfigEmpresa();
        const url = resolverUrlSefaz(cfg.uf, cfg.ambiente, "consulta");
        // Consulta de protocolo (NFeConsultaProtocolo4) usa mTLS sem XMLDSig.
        // Repassamos o ambiente real da empresa para que `tpAmb` no XML bata
        // com a URL resolvida pelo `resolverUrlSefaz`.
        const result = await consultarNFe(
          nf.chave_acesso,
          cfg.ambiente,
          url,
        );
        setUltimoRetorno({
          protocolo: result.protocolo,
          status: result.status,
          motivo: result.motivo,
        });
        setModalAberto(true);
        if (result.sucesso) toast.success(`SEFAZ respondeu: ${result.motivo ?? result.status}`);
        else toast.error(`Consulta falhou: ${result.motivo ?? "—"}`);
        return result;
      } catch (e) {
        notifyError(e);
        return null;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const cancelar = useCallback<UseSefazAcoesReturn["cancelar"]>(
    async (nf, justificativa) => {
      if (nf.status_sefaz !== "autorizada") {
        toast.error("Apenas NFs autorizadas podem ser canceladas via SEFAZ.");
        return null;
      }
      if (!nf.chave_acesso || !nf.protocolo_autorizacao) {
        toast.error("NF sem chave/protocolo de autorização — não é possível cancelar.");
        return null;
      }
      if (justificativa.trim().length < 15) {
        toast.error("Justificativa de cancelamento exige no mínimo 15 caracteres.");
        return null;
      }
      setPending(true);
      try {
        const cfg = await lerConfigEmpresa();
        const url = resolverUrlSefaz(cfg.uf, cfg.ambiente, "evento");
        const result = await cancelarNFe(
          nf.chave_acesso,
          nf.protocolo_autorizacao,
          justificativa,
          { tipo: "A1", conteudo: "", senha: "" },
          url,
          { cnpj: cfg.cnpj },
          cfg.ambiente,
        );
        if (result.sucesso && result.protocolo) {
          await cancelarNotaFiscalSefaz(nf.id, result.protocolo, justificativa);
        }
        await registrarEventoFiscal({
          nota_fiscal_id: nf.id,
          tipo_evento: "cancelamento_autorizada",
          status_anterior: nf.status_sefaz ?? null,
          status_novo: result.sucesso ? "cancelada_sefaz" : nf.status_sefaz ?? null,
          descricao: justificativa,
          payload_resumido: {
            protocolo_cancelamento: result.protocolo,
            motivo: result.motivo,
          },
        });
        setUltimoRetorno({
          protocolo: result.protocolo,
          status: result.sucesso ? "135" : undefined,
          motivo: result.motivo,
        });
        setModalAberto(true);
        if (result.sucesso) toast.success("Cancelamento homologado pela SEFAZ.");
        else toast.error(`Cancelamento rejeitado: ${result.motivo ?? "—"}`);
        qc.invalidateQueries({ queryKey: ["notas_fiscais"] });
        return result;
      } catch (e) {
        notifyError(e);
        return null;
      } finally {
        setPending(false);
      }
    },
    [qc],
  );

  return {
    pending,
    ultimoRetorno,
    modalAberto,
    fecharModal,
    transmitir,
    consultar,
    cancelar,
  };
}
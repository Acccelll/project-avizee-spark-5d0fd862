/**
 * Serviço de autorização de NF-e junto à SEFAZ.
 * A assinatura digital é realizada server-side na Edge Function sefaz-proxy.
 */

import { construirXMLNFe } from "./xmlBuilder.service";
import type { NFeData, CRT, AmbienteSefaz } from "./xmlBuilder.service";
import type { CertificadoDigital } from "./assinaturaDigital.service";
import { enviarParaSefaz } from "./httpClient.service";
import { supabase } from "@/integrations/supabase/client";

export interface AutorizacaoResult {
  sucesso: boolean;
  protocolo?: string;
  chave?: string;
  xmlAutorizado?: string;
  status?: string;
  motivo?: string;
}

/**
 * Lê `crt` e `ambiente_sefaz` da tabela `empresa_config`. Falha explicitamente
 * (lança Error) quando os dados obrigatórios não estão configurados — sem
 * defaults silenciosos para evitar transmissões em ambiente errado.
 *
 * Caller deve capturar e exibir mensagem orientando o usuário a abrir
 * /fiscal/configuracao antes de transmitir.
 */
export async function lerConfigFiscalEmpresa(): Promise<{
  crt: CRT;
  ambiente: AmbienteSefaz;
}> {
  const { data, error } = await supabase
    .from("empresa_config")
    .select("crt, ambiente_sefaz, ambiente_padrao")
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Falha ao ler configuração fiscal da empresa: ${error.message}`,
    );
  }
  if (!data) {
    throw new Error(
      "Configuração fiscal incompleta: cadastre a empresa em /fiscal/configuracao antes de transmitir.",
    );
  }

  const crtRaw = (data as { crt?: string | null }).crt;
  if (crtRaw !== "1" && crtRaw !== "2" && crtRaw !== "3") {
    throw new Error(
      "Configuração fiscal incompleta: defina o CRT (Regime Tributário) em /fiscal/configuracao antes de transmitir.",
    );
  }
  const crt = crtRaw as CRT;

  // Preferência: ambiente_sefaz (formato SEFAZ "1"/"2"); fallback derivado
  // de ambiente_padrao ("producao"|"homologacao") para retrocompatibilidade.
  const ambienteSefazRaw = (data as { ambiente_sefaz?: string | null }).ambiente_sefaz;
  let ambiente: AmbienteSefaz | null = null;
  if (ambienteSefazRaw === "1" || ambienteSefazRaw === "2") {
    ambiente = ambienteSefazRaw;
  } else if (data.ambiente_padrao === "producao") {
    ambiente = "1";
  } else if (data.ambiente_padrao === "homologacao") {
    ambiente = "2";
  }
  if (!ambiente) {
    throw new Error(
      "Configuração fiscal incompleta: defina o ambiente SEFAZ (homologação/produção) em /fiscal/configuracao antes de transmitir.",
    );
  }

  return { crt, ambiente };
}

/**
 * Autoriza uma NF-e junto à SEFAZ.
 * Orquestra: construção do XML → envio (com assinatura server-side) → parseamento do retorno.
 *
 * Se `dadosNFe.crt` ou `dadosNFe.ambiente` não vierem definidos, lê os
 * valores de `empresa_config` para garantir XML válido.
 */
export async function autorizarNFe(
  dadosNFe: NFeData,
  certificado: CertificadoDigital,
  urlSefaz: string,
): Promise<AutorizacaoResult> {
  if (certificado.tipo === "A3") {
    return {
      sucesso: false,
      motivo:
        "Certificado A3 requer middleware específico. Não suportado diretamente.",
    };
  }

  // Validação: certificado A1 deve vir do Vault (conteudo+senha undefined/null)
  // ou com ambos preenchidos. Strings vazias indicam preenchimento incompleto
  // pelo caller e devem ser rejeitadas antes de chegar ao proxy.
  const conteudoVazio = certificado.conteudo === "";
  const senhaVazia = certificado.senha === "";
  if (conteudoVazio || senhaVazia) {
    return {
      sucesso: false,
      motivo:
        "Certificado A1: conteúdo (.pfx) e senha são obrigatórios quando informados explicitamente.",
    };
  }
  // Sem credenciais explícitas (undefined) → modo Vault (padrão recomendado).
  // O sefaz-proxy lerá .pfx do Storage e a senha do secret server-side.

  // Garante que crt e ambiente reflitam a configuração da empresa quando
  // não vieram explicitamente em dadosNFe.
  let dadosCompletos = dadosNFe;
  if (!dadosNFe.crt || !dadosNFe.ambiente) {
    // Pode lançar — caller (UI) deve capturar e exibir orientação.
    const config = await lerConfigFiscalEmpresa();
    dadosCompletos = {
      ...dadosNFe,
      crt: dadosNFe.crt ?? config.crt,
      ambiente: dadosNFe.ambiente ?? config.ambiente,
    };
  }

  const xmlNFe = construirXMLNFe(dadosCompletos);

  // Assinatura + envio são feitos na Edge Function sefaz-proxy.
  // Padrão Vault: certificado e senha são lidos server-side (Storage privado +
  // secret CERTIFICADO_PFX_SENHA). Mantemos o objeto como fallback caso o
  // caller queira injetar credenciais explicitamente (não recomendado).
  const certBase64 = certificado.conteudo;
  const certSenha = certificado.senha;
  const useVault = !certBase64 || !certSenha;
  const resposta = await enviarParaSefaz(
    xmlNFe,
    urlSefaz,
    "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote",
    useVault
      ? null
      : {
          certificado_base64: certBase64,
          certificado_senha: certSenha,
        },
  );

  if (!resposta.sucesso) {
    return { sucesso: false, motivo: resposta.erro };
  }

  // Parsear protocolo e status do XML de retorno
  const xmlRetorno = resposta.xmlRetorno ?? "";
  const protocolo = xmlRetorno.match(/<nProt>(.*?)<\/nProt>/)?.[1];
  const status = xmlRetorno.match(/<cStat>(.*?)<\/cStat>/)?.[1];
  const motivo = xmlRetorno.match(/<xMotivo>(.*?)<\/xMotivo>/)?.[1];

  const autorizado = status === "100";

  return {
    sucesso: autorizado,
    protocolo,
    chave: dadosCompletos.chave,
    xmlAutorizado: autorizado ? xmlRetorno : undefined,
    status,
    motivo,
  };
}

---
name: fiscal-consulta-por-chave
description: Busca de NF-e por chave de acesso (44 dígitos) via DistDFe consChNFe com cache local
type: feature
---
# Consulta de NF-e por chave de acesso

- Botão "Buscar por chave" em /fiscal abre `BuscarPorChaveDialog`.
- Estratégia em 2 níveis:
  1. Local: `nfe_distribuicao.xml_nfe WHERE chave_acesso = ?` (cache + DistDFe cron).
  2. SEFAZ: edge `sefaz-distdfe` action `consultar-chave` monta `<distDFeInt>` com `<consChNFe><chNFe>` (consulta direta por chave, NÃO incremental por NSU).
- Após sucesso na SEFAZ, faz upsert em `nfe_distribuicao(chave_acesso, xml_nfe)` para cachear.
- Limitação SEFAZ (legal): NFeDistribuicaoDFe só devolve XMLs cuja NF é destinada ao CNPJ do certificado A1. cStat 137/138 = chave existe mas não é vinculada — UI exibe `xMotivo` real e orienta solicitar ao emissor.
- Reuso: `useNFeXmlImport.importXml` aceita `File | string`; handler em `Fiscal.tsx` é agnóstico à origem.
- Edge `sefaz-distdfe` aceita actions `consultar-nsu` (incremental) e `consultar-chave` (pontual).
- Transporte: o webservice `NFeDistribuicaoDFe.asmx` exige HTTP/1.1. O `Deno.createHttpClient` da edge function MUST ser criado com `{ http1: true, http2: false }` além de `cert`/`key`. Sem isso, o servidor responde `endpoint requires HTTP/1.1` e o Deno falha o request por ALPN h2.
- SOAP 1.2 (application/soap+xml) é o protocolo correto para `NFeDistribuicaoDFe.asmx`: envelope `xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"`, Content-Type `application/soap+xml; charset=utf-8; action="...nfeDistDFeInteresse"` (a action vai EMBUTIDA no Content-Type, não como header HTTP separado). Diferente dos serviços de Autorização/Consulta protocolo (que são 1.1 + SOAPAction).
- O WSDL do `NFeDistribuicaoDFe` NÃO declara `nfeCabecMsg` — apenas `nfeDadosMsg`. Enviar Header `nfeCabecMsg` (como nos outros serviços) faz o IIS do AN derrubar a conexão antes de gerar SOAP Fault — causa raiz do "connection reset by peer" recorrente em abr/2026. cUFAutor (UF do interessado) vai apenas no corpo `distDFeInt`, nunca no envelope.
- Cadeia ICP-Brasil do A1: `pfxToPem` em `sefaz-distdfe` agora extrai TODOS os `certBag` do PKCS#12, identifica o leaf (Subject que não é Issuer de outro do bundle) e concatena leaf + intermediários no PEM passado a `Deno.createHttpClient({ cert })`. rustls aceita o bundle e o servidor SEFAZ valida a cadeia sem depender do truststore do runtime. CNPJ continua extraído do leaf.
- URLs oficiais do AN (Portal Nacional NF-e): produção `https://www1.nfe.fazenda.gov.br/...`, homologação `https://hom1.nfe.fazenda.gov.br/...` (NÃO `hom.nfe.fazenda.gov.br`).
- `cUFAutor` é o código IBGE da UF do interessado (autor), lido de `empresa_config.uf`. Fallback `91` (AN) só quando UF não estiver configurada. Não é o código do AN.
- Throttle obrigatório no client: NT limita ~20 `consChNFe`/h por CNPJ; ao exceder, cStat 656 bloqueia o CNPJ por 1h. UI usa `localStorage` chave `fiscal:consChNFe:hits` com janela deslizante e teto de 18 (margem defensiva).
- Catálogo cStat traduzido pelo backend (campo `mensagemCstat`) cobre 108/109/137/138/214/215/217/236/238/239/252/280-286/402/404/472/473/489/490/589/593/614-619/632/640/641/653/654/656/999.
- Scanner de chave (abr/2026): `FiscalChaveScannerDialog` (`@zxing/browser`) lê CODE-128 do DANFE NF-e e QR Code do DANFE NFC-e via câmera (facingMode environment) ou upload de imagem. Parser `src/services/fiscal/chaveAcesso.parser.ts` (`extrairChaveDeTextoOuUrl`, `lerChaveDeEntrada`, `tipoDocumentoPelaChave`) extrai chave de URL NFC-e (`?p=<chave>|...`), URL portal NF-e (`chNFe`/`chave`/`chaveAcesso`/`chcte`), texto livre ou chave pura/formatada — sempre validando MOD11 via `validarChaveAcesso`. Botão "Ler QR/Código" no header de `Fiscal.tsx`. Scanner NÃO consulta SEFAZ nem importa XML: apenas obtém chave e oferece CTAs para `BuscarPorChaveDialog` (DistDFe) ou `Consultar SEFAZ` na lista (NFeConsultaProtocolo4). Chave é copiada para clipboard como ponte entre os dois modais (BuscarPorChaveDialog não aceita prop `chaveInicial` ainda).
- `sefazUrls.service.ts` agora expõe serviços `evento_an` (RecepcaoEvento AN para manifestação do destinatário) e `distdfe` (NFeDistribuicaoDFe AN), além do helper `resolverUrlSvcAn(amb, servico)` para contingência SVC-AN e `ufSuportada(uf)` para feedback antecipado na UI.

## Update abr/2026 — gate explícito do Worker mTLS

- Variável `SEFAZ_USE_MTLS_PROXY=1` é agora obrigatória para usar o Cloudflare Worker. Sem ela, a edge ignora `SEFAZ_MTLS_PROXY_URL/SECRET` e usa `Deno.createHttpClient({ cert, key })` diretamente contra a SEFAZ com o A1 (cadeia ICP-Brasil completa) do Vault.
- Motivo: Worker estava devolvendo 401 Unauthorized e bloqueando todas as consultas mesmo com PFX válido carregado.

# Plano de correção

## Diagnóstico confirmado
- O problema atual não é mais a senha do PFX.
- O problema atual também não é mais o Worker mTLS.
- Os logs mais recentes mostram que a edge `sefaz-distdfe` já está saindo em `transporte: "deno-mtls"` e abrindo o certificado corretamente.
- A falha real acontece no POST direto para o serviço `NFeDistribuicaoDFe` do Ambiente Nacional, que encerra a conexão com `Connection reset by peer` antes de devolver qualquer XML SOAP.
- Há duas inconsistências fortes no que foi implementado:
  1. a função `sefaz-distdfe` hoje envia a requisição em SOAP 1.1 (`text/xml` + `SOAPAction`), enquanto a documentação/memória do projeto e referências do serviço apontam que esse serviço aceita/espera binding SOAP 1.2 (`application/soap+xml` com `action` no `Content-Type`);
  2. a URL de homologação na edge está diferente da URL oficial já usada no cliente (`hom` vs `hom1`).

## O que vou corrigir
1. Ajustar `supabase/functions/sefaz-distdfe/index.ts` para montar e enviar o `NFeDistribuicaoDFe` no formato correto para esse serviço:
   - envelope SOAP 1.2;
   - `Content-Type: application/soap+xml; charset=utf-8; action="...nfeDistDFeInteresse"`;
   - sem depender de `SOAPAction` separado quando o binding escolhido for SOAP 1.2.
2. Corrigir o endpoint de homologação do DistDFe para o host oficial `hom1.nfe.fazenda.gov.br`, alinhando edge + cliente.
3. Melhorar a telemetria da edge para registrar, por tentativa:
   - variante de protocolo usada (`soap11`/`soap12`);
   - endpoint final;
   - status HTTP, content-type e preview do retorno quando existir;
   - categoria real do erro de transporte.
4. Se necessário para eliminar a incerteza de vez, adicionar fallback controlado somente no `sefaz-distdfe`:
   - tenta SOAP 1.2 primeiro;
   - se houver reset de conexão sem resposta, tenta uma única vez a variante alternativa;
   - retorna/loga claramente qual variante funcionou ou falhou.
5. Validar que o restante do fluxo permanece intacto:
   - senha do PFX continua vindo do cofre seguro;
   - leitura do `.pfx` do storage continua igual;
   - mTLS nativo por `Deno.createHttpClient` continua como padrão;
   - não alterar `sefaz-proxy` nem os outros serviços SEFAZ que já funcionam.
6. Depois da correção, testar a edge e revisar os logs para confirmar um destes resultados esperados:
   - resposta SOAP válida com `cStat` oficial; ou
   - erro fiscal oficial da SEFAZ (ex.: 137/640/etc.), que provará que o transporte foi normalizado.

## Resultado esperado
- Parar de receber `Connection reset by peer` no fluxo `consultar-chave`.
- Voltar a receber uma resposta oficial do Ambiente Nacional, mesmo quando a nota não puder ser baixada.
- Deixar o diagnóstico definitivo no código e nos logs, para evitar novas tentativas contraditórias.

## Detalhes técnicos
- Arquivo principal: `supabase/functions/sefaz-distdfe/index.ts`
- Ajustes secundários: documentação/memória do fluxo fiscal, se necessário, para refletir o protocolo definitivo usado.
- Não vou mexer no cliente gerado do backend nem reverter a leitura da senha via cofre seguro.

Aprova que eu implemente essa correção agora?
## Diagnóstico verificado nos logs atuais

Logs recentes da `sefaz-distdfe`:

```
transporte resolvido  proxyEnabled=false  usarProxy=false  transporte=deno-mtls   ✓ (gate ok)
preparado envio SEFAZ  soapVariant=soap12  envelopeBytes=803  certChainBytes=13064
falha de transporte SEFAZ  soapVariant=soap12  CONNECTION_RESET
preparado envio SEFAZ  soapVariant=soap11  envelopeBytes=791
falha de transporte SEFAZ  soapVariant=soap11  CONNECTION_RESET
```

O gate do proxy (fix anterior) está correto. O AN aceita a conexão TLS mas derruba o socket assim que recebe o envelope — em **ambas** as variantes SOAP. Isso é o sintoma exato registrado em `mem/features/fiscal-consulta-por-chave.md`:

> "O WSDL do NFeDistribuicaoDFe NÃO declara `nfeCabecMsg` — apenas `nfeDadosMsg`. Enviar Header `nfeCabecMsg` (como nos outros serviços) faz o IIS do AN derrubar a conexão antes de gerar SOAP Fault — causa raiz do 'connection reset by peer' recorrente."

Hoje `envelopeSoap()` (linhas 215–253) **monta e injeta** `<nfeCabecMsg>` em ambas as variantes, contradizendo a memória. Esse é o impeditivo.

## Correção (1 arquivo)

Em `supabase/functions/sefaz-distdfe/index.ts`, função `envelopeSoap`:

1. Remover bloco que monta `cabec` (linhas 217–228).
2. Remover `<soap12:Header>${cabec}</soap12:Header>` (linha 234) e `<soap:Header>${cabec}</soap:Header>` (linha 246).
3. Substituir o comentário antigo por uma nota de aviso explícita ("não reintroduzir nfeCabecMsg — viola WSDL e causa Connection reset").

`montarDistDFeInt` continua injetando `cUFAutor` no corpo `distDFeInt` — comportamento correto, sem mudanças.

## Validação pós-deploy

1. Deploy `sefaz-distdfe`.
2. Testar "Buscar por chave" com `35260460878527000145550010000072021978862931` (chave que falhou nos logs).
3. **Esperado:** HTTP 200 com `cStat` (oficial, qualquer um — `138` localizado, `137` nada localizado, `640` não destinada ao CNPJ, `593` CNPJ-base diverge etc.). Qualquer cStat oficial confirma que o transporte voltou.
4. Rodar também o cron `process-distdfe-cron` (action `consultar-nsu`) para garantir que o caminho NSU também responde.

## Hipóteses de fallback (caso o reset persista após a correção)

Em ordem de prioridade, sem mexer no código antes de validar:

1. **Cadeia ICP-Brasil incompleta no PFX novo** (`e-cnpj_AviZee_2026-2.pfx` foi enviado agora). Se o novo A1 tiver só o leaf, sem intermediários, rustls negocia TLS mas o AN fecha. Validação: ler `certBags.length` no log `preparado envio SEFAZ` (já existe `certChainBytes`) — comparar com o PFX antigo.
2. **CNPJ bloqueado por consumo (cStat 656)**: o AN bloqueia 1h após excesso de `consChNFe`. Aguardar e tentar de novo (o throttle do client em 18/h já protege novas requisições).
3. **Worker mTLS opcional**: se mesmo após (1) e (2) o reset persistir, ativar `SEFAZ_USE_MTLS_PROXY=1` com Worker Cloudflare configurado — o gate atual já suporta opt-in.

## Sobre o PFX enviado

O usuário enviou `e-cnpj_AviZee_2026-2.pfx`. O fluxo canônico de troca de A1 é via tela **Configuração Fiscal** (faz upload para `dbavizee/certificados/empresa.pfx` + grava senha em Vault `CERTIFICADO_PFX_SENHA`). Não vou copiar esse PFX para o repositório nem para storage diretamente — credenciais privadas não devem ser commitadas. Após o deploy do fix, o usuário pode (se quiser) substituir o A1 pelo novo via Configuração Fiscal e refazer o teste.

## Memória

Sem alterações — `mem/features/fiscal-consulta-por-chave.md` já documenta a regra. Esta correção só realinha o código à memória existente.

## Objetivo

Carregar em massa as 27 NF-es enviadas (13 entrada + 14 saída) no módulo Fiscal, extraindo todos os dados disponíveis do XML, vinculando aos cadastros existentes e gerando lançamentos financeiros corretos:

- **A prazo (com `<cobr>/<dup>`):** uma parcela por duplicata, com `nDup`, `dVenc` e `vDup` exatos, status `aberto`.
- **À vista (sem duplicatas):** 1 lançamento `condicao_pagamento='a_vista'`, status `aberto` (não dou baixa — sem comprovante).

A lógica de geração financeira já existe na RPC `confirmar_nota_fiscal` (lê `condicao_pagamento`, `parcelas` jsonb e cria os títulos), então o trabalho concentra-se em **persistir as NFs corretamente** e **acionar a confirmação**.

## Diagnóstico da carga

Inspecionei os 27 XMLs e o estado do banco:

- **25 chaves novas** (a importar) + **2 chaves já presentes** em `notas_fiscais` com `status=pendente`:
  - `35260406643570000186550010001462911962220876` (NF 146291 IABER, R$ 11.317,08, 3 duplicatas)
  - `35260460878527000145550010000072021978862931` (NF 7202 A.CURUCI, R$ 3.648,00, 2 duplicatas)
- **Fornecedores:** 4 dos 6 emitentes já cadastrados. Faltam:
  - `13756867000113` ELETRICA BICHUETTE LTDA
  - `55450241000124` A.FURLAN & FILHO COMERCIAL LTDA
- **Clientes:** 12 dos 13 destinatários já cadastrados. Falta:
  - `18911232629` Amanda Alves Pimenta (consumidor final, NFe ML 12/200)
- **Produtos:** 197 ativos no catálogo. Match será tentado por `codigo_interno`/`sku` == `cProd` do XML; itens não encontrados ficam **sem `produto_id`** (campo é nullable em `notas_fiscais_itens`) preservando descrição/código/qtd/valor do XML.

## O que será feito

### 1) Cadastros faltantes
Criar via INSERT (extraídos do próprio XML, bloco `<emit>/<dest>`):
- 2 fornecedores (ELETRICA BICHUETTE, A.FURLAN) — campos: razão social, CNPJ, IE, endereço, UF, município, CEP, telefone se houver.
- 1 cliente (Amanda Alves Pimenta — CPF, endereço completo).

### 2) Importação das 25 NF-es novas

Para cada XML, montar payload completo e chamar a RPC `salvar_nota_fiscal` (atomic header + itens), depois `confirmar_nota_fiscal`:

**Cabeçalho (`notas_fiscais`):**
- `tipo`: `entrada` (emitente ≠ Avizee) ou `saida`
- `chave_acesso`, `numero`, `serie`, `data_emissao` (de `dhEmi`/`dEmi`)
- `natureza_operacao`, `finalidade_nfe`, `modelo_documento` (55 / 65)
- `fornecedor_id` (entradas) ou `cliente_id` (saídas)
- `valor_total`, `valor_produtos`, `icms_valor`, `ipi_valor`, `pis_valor`, `cofins_valor`, `desconto_valor`, `frete_valor`, `outras_despesas` (de `<ICMSTot>`)
- `forma_pagamento`: traduzido de `tPag` (`15`→boleto, `03`→cartão crédito, `17`→pix, `99`→outros, `90`→sem pagamento)
- `condicao_pagamento`: `a_prazo` se houver `<dup>`; senão `a_vista`
- `parcelas` (jsonb): array `[{numero, vencimento, valor}]` extraído de `<dup>` (entradas com cobrança)
- `numero_parcelas`: contagem de duplicatas (default 1)
- `data_vencimento`: 1ª duplicata, ou `data_emissao` se à vista
- `status`: `pendente` (será confirmado em seguida)
- `status_sefaz`: `autorizada` (XML é procNFe com protocolo)
- `protocolo_autorizacao`: `<infProt>/nProt`
- `gera_financeiro`: `true` para todas (entrada e saída)
- `movimenta_estoque`: `true` (será refletido em `estoque_movimentos`)
- `origem`: `xml_importado`

**Itens (`notas_fiscais_itens`):** todos os `<det>` com `codigo_produto`, `descricao`, `ncm`, `cfop`, `cst`, `quantidade`, `unidade`, `valor_unitario`, `valor_total`, e impostos ICMS/IPI/PIS/COFINS por item. Campos `*_origem` preservam dados crus do XML para auditoria.

### 3) Tratar as 2 chaves já pendentes
Apenas chamar `confirmar_nota_fiscal` (gera financeiro/estoque idempotentemente). Se as `parcelas`/`condicao_pagamento` no banco estiverem vazias, antes faço UPDATE com os valores do XML.

### 4) Geração financeira (automática pela RPC)
A RPC `confirmar_nota_fiscal` já gera, sem código novo:
- À vista → 1 lançamento `status=pago` (atenção: o RPC marca como pago). **Conforme pedido do usuário (à vista “em aberto”), vou ajustar:** após confirmação à vista, faço UPDATE em `financeiro_lancamentos` zerando `data_pagamento`, `valor_pago=0`, `saldo_restante=valor`, `status='aberto'`. Aplica-se às NFs sem `<cobr>` (saídas com `tPag=99`, etc.).
- A prazo com `parcelas` jsonb → N lançamentos `aberto` com vencimentos exatos das duplicatas.
- Tipo: `pagar` para entrada, `receber` para saída. Vínculo automático com `fornecedor_id`/`cliente_id` e `nota_fiscal_id`.

### 5) Integrações colaterais (já automáticas)
- **Estoque:** `confirmar_nota_fiscal` insere em `estoque_movimentos` (entrada soma, saída subtrai) — só para itens com `produto_id` resolvido.
- **Triggers existentes** mantêm `estoque_atual`, recálculo de saldos e auditoria.

## Saídas esperadas

- 27 notas em `status=confirmada`, `status_sefaz=autorizada`.
- ~50+ lançamentos em `financeiro_lancamentos` (`origem_tipo=fiscal_nota`):
  - Entradas a prazo (IABER + A.CURUCI + HOPPNER): 3+3+3+1+3+2+3 = 18 a pagar com vencimentos das duplicatas.
  - Entradas à vista (BICHUETTE + 4× MARCIA + FURLAN): 6 a pagar em aberto.
  - Saídas: 14 a receber (13 com `tPag=99` + 1 ML com pix) — em aberto, vencimento = data emissão.
- Movimentos de estoque para itens com produto vinculado.
- Relatório final: arquivo CSV em `/mnt/documents/importacao-nfe-2026-04.csv` com chave, número, fornecedor/cliente, valor, # parcelas geradas, # itens vinculados/sem vínculo.

## Detalhes técnicos

```text
Pipeline (script Python local + psql para INSERTs):

XML → parse (ET) → resolve_pessoa(CNPJ) → resolve_produtos(cProd) →
build_payload(notas_fiscais) + build_itens + build_parcelas(jsonb) →
INSERT notas_fiscais → INSERT notas_fiscais_itens →
RPC confirmar_nota_fiscal(nf_id) → ajuste à vista (status='aberto')
```

- Idempotência: `chave_acesso` é única → re-execução do script não duplica (fará SKIP nas 25, e nas 2 já existentes só chama `confirmar_nota_fiscal` — que também é idempotente via guards `NOT EXISTS`).
- Não preciso de migrations: schema já suporta tudo.
- Não preciso editar código frontend: usuário verá as NFs e títulos imediatamente em `/fiscal` e `/financeiro`.

## Validações pós-carga (incluídas no script)

1. `count(*)` em `notas_fiscais` cresceu em 25 (2 já existiam).
2. Soma de `valor_total` confere com soma de `<vNF>` dos XMLs.
3. Para cada NF a prazo, soma de `valor` em `financeiro_lancamentos` == `valor_total` da NF.
4. Lista NFs com itens sem `produto_id` para revisão manual posterior.

## Riscos / observações

- Itens sem produto vinculado: descrição/código/qtd/valor são preservados; **não geram movimento de estoque**. Isso é o esperado e o usuário pode fazer o de-para depois.
- 1 saída de Avizee (NF 322 etc.) **não está no pacote** — não é problema, importo só o que veio.
- Tributação simples; não recalculo CFOP, uso o que veio no XML.

Após sua aprovação, executo a importação e devolvo um resumo com os números e o CSV de auditoria.
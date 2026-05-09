## Onda 27 — Drawer de Fornecedores (FornecedorView)

Refinos no `src/components/views/FornecedorView.tsx`. Sem migração de schema; correção de dados inconsistentes vira derivação na UI + aviso visual. Tudo se mantém na camada de apresentação.

### 1. Documento × tipo_pessoa derivados (alta)
Hoje exibe direto `selected.tipo_pessoa` e `selected.cpf_cnpj` cru. Trocar por:
- `cpfCnpjMask(selected.cpf_cnpj)` no header e na aba Geral.
- Tipo derivado: se o documento tem 14 dígitos → "Pessoa Jurídica (CNPJ)"; 11 → "Pessoa Física (CPF)"; senão usa `tipo_pessoa`.
- Quando o tipo cadastrado **diverge** do tamanho do documento, exibir um `Badge` `warning` ao lado: "Tipo divergente do CNPJ/CPF" com tooltip explicando — não altera o banco, só sinaliza para o usuário corrigir via "Editar".

### 2. Header com chips operacionais (média)
No `RecordIdentityCard.badges` atualmente só aparece `StatusBadge`. Acrescentar:
- `[Ativo|Inativo]` (já existe, mantém).
- `[PJ]` ou `[PF]` derivado (item 1).
- `[Transportadora]` quando `selected.tipo_fornecedor === "transportadora"`. Como `tipo_fornecedor` está fora do escopo desta onda (registrado na onda 25 como futuro), só renderizar se o campo existir e tiver valor — fallback silencioso.
- Documento na meta passa a usar `cpfCnpjMask`.

### 3. Botão fechar e faixa de ações (média/baixa)
- Botão de fechar é renderizado pelo `RelationalDrawerStack` — fora do escopo aqui. Deixar registrado, não mexer.
- Compactar a faixa publicada em `actions`:
  - Manter `Editar` como botão visível primário.
  - Mover `Excluir` (e `Excluir definitivamente` quando admin) para um menu **Mais ações** (`DropdownMenu`), ao lado de Editar.
  - `Mais ações` também recebe atalhos contextuais já viáveis hoje:
    - "Abrir compras do fornecedor" → `navigate("/compras?fornecedorId=" + id)` (verificar parâmetro real; se não houver suporte, abrir `/compras`).
    - "Abrir financeiro" → `navigate("/financeiro?fornecedorId=" + id)` com mesmo fallback.
  - Inativar/Vincular produto/Vincular transportadora ficam fora desta onda (precisam mutations próprias).

### 4. KPIs sem `—` ambíguo (alta)
Substituir o `—` por mensagens contextuais no `DrawerSummaryCard`:
- **Prazo Médio**: `prazoMedio` ausente → texto "Sem dados" e `hint` "sem lead time nem prazo padrão".
- **Última Compra**: `compras.length === 0` → "Sem compras".
- **Saldo Aberto** e **Vol. Compras**: já mostram R$ 0,00 — manter, mas adicionar `hint` quando 0 ("nenhum título em aberto" / "nenhuma compra registrada").

### 5. Aba Geral reorganizada (média)
Sem mudar o grid 2 colunas, apenas:
- Renomear "Dados Fiscais" → **Identificação fiscal** e mostrar `cpfCnpjMask` + tipo derivado (item 1).
- "Contato" → **Contato principal**, `phoneMask(telefone)` e `phoneMask(celular)`.
- "Condições" → mantém, com "Prazo padrão: Não definido" quando ausente (em vez de `—`).
- Bloco Endereço aplica `cepMask` no CEP; junta logradouro/número/complemento numa linha mais legível.

### 6. Máscaras (alta)
Importar `cpfCnpjMask`, `phoneMask`, `cepMask` de `@/utils/masks` e aplicar em **todos** os pontos onde hoje aparece o valor cru: header (meta + breadcrumb), aba Geral, aba Relacionamento.

### 7. Empty states com CTA (média)
- **Compras** vazia: `DetailEmpty` ganha `action` "Novo pedido de compra" → `navigate("/compras?fornecedorId=" + id&new=1)`. Se a página não suportar deep-link (verificar antes), apenas `navigate("/compras")`.
- **Financeiro** vazia: `action` "Abrir módulo Financeiro" → `navigate("/financeiro?fornecedorId=" + id)`.
- **Produtos** vazia: `action` "Vincular produto" → reaproveitar fluxo do `AddProdutoFornecedor` que já existe em `src/components/fornecedores/`. Se exigir contexto extra, fallback abre `openEdit` (drawer fecha + edição com aba Produtos).
- Verificar a API atual de `DetailEmpty` para confirmar se aceita slot `action`. Se não aceitar, estender o componente com prop opcional `action?: ReactNode`.

### 8. Aba "Relac." → "Relacionamento" + reordenar (média)
- Renomear `TabsTrigger` para "Relacion." (cabe melhor) ou "Relac." só no muito estreito; em `md+` usar "Relacionamento".
- Inverter ordem de exibição: primeiro **Contato principal** (sempre que houver algum dado), depois **Condições negociadas**, por último **Observações** (nunca esconder o título — quando vazio, mostra `DetailEmpty` curto "Nenhuma observação registrada"). Isso elimina a contradição "sem observações" + bloco de contato logo abaixo.

### 9. Indicadores nas abas (média)
Em cada `TabsTrigger`, anexar contagem entre parênteses **quando > 0**:
- `Compras (n)`, `Financ. (n)`, `Produtos (n)`.
- Manter `Geral` e `Relacionamento` sem contador.
- Quando algum dado crítico estiver faltando (ex.: produtos = 0 e fornecedor é de produto, prazo padrão ausente), exibir um `•` discreto colorido — fora desta onda; registrar como futuro, pois exige inferir o "papel" do fornecedor.

### Itens fora desta onda
- Campo `tipo_fornecedor` (Produto/Serviço/Transportadora) — registrado na Onda 25; chips ficam condicionais.
- Migração de dados para corrigir CNPJs com `tipo_pessoa = F` — apenas sinalizamos; correção em massa exige migration própria.
- Botão de fechar do drawer (`RelationalDrawerStack`).
- Inativar via menu (precisa mutation dedicada).

### Arquivos a editar
- `src/components/views/FornecedorView.tsx` — máscaras, KPIs com hint, header com chips derivados, faixa de ações com `DropdownMenu` "Mais ações", abas com contadores, reorganização da Relacionamento, CTAs nos empty states.
- `src/components/ui/DetailStates.tsx` — adicionar prop `action?: ReactNode` em `DetailEmpty` se ainda não existir.

### Critérios de verificação
- CNPJ com 14 dígitos exibe "Pessoa Jurídica (CNPJ)" mesmo quando `tipo_pessoa = F`, com badge warning visível.
- Telefone e CEP aparecem mascarados em todas as abas.
- Faixa de ações no header: 2 botões visíveis (`Editar` + `Mais ações`); `Excluir` migrou para o menu.
- KPIs nunca exibem `—` sozinho.
- Abas Compras/Financ./Produtos mostram contagem quando > 0.
- Empty states têm CTA navegável.
- Drawer abre, alterna abas e fecha sem regressão (testes existentes).

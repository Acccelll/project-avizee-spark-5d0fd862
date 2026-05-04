---
name: Busca padrão de cliente/fornecedor
description: Sempre usar AutocompleteSearch (+ ClientSelector lupa quando útil) para selecionar cliente/fornecedor; nunca <Select> com lista completa
type: preference
---

Para campos de seleção de **cliente** ou **fornecedor** em formulários, sempre usar:

- `AutocompleteSearch` (`src/components/ui/AutocompleteSearch.tsx`) com `options = [{id, label: nome_razao_social, sublabel: cpf_cnpj}]`.
- Opcionalmente, botão lateral `ClientSelector` (`src/components/ui/DataSelector.tsx`) como lupa para abrir lista completa em modal.
- Quando houver fluxo de cadastro rápido, passar `onCreateNew` + `createNewLabel`.

**Não usar** `<Select>` puro (`@/components/ui/select`) com `clientes.map(...)` ou `fornecedores.map(...)` — isso vira uma lista enorme sem busca por nome/CNPJ (anti-padrão visto na captura do usuário em maio/2026, corrigido em RemessaForm e FinanceiroLancamentoForm).

Referência canônica do padrão: `src/pages/OrcamentoForm.tsx` (linhas ~1110-1135).

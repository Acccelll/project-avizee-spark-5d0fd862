# Dashboard — Escopo Temporal por Bloco

O dashboard combina três tipos de escopo. O `ScopeBadge` no topo de cada
bloco torna explícito qual deles está sendo aplicado e o tooltip detalha o
comportamento.

## Tipos de escopo

- **`global-range`** — Aplica o período global do dashboard
  (`DashboardPeriodContext`) sobre o eixo indicado (ex.: `data_emissao`,
  `data_vencimento`). Reage a mudanças no seletor de período.
- **`fixed-window`** — Janela fixa, independente do período global. Usada
  quando o bloco precisa de uma referência estável (`hoje`, `mes-atual`,
  `próximos 7 dias`, etc.).
- **`snapshot`** — Posição atual (estoque, saldo bancário). Não tem eixo
  temporal.

## Mapa atual

| Bloco        | Escopo            | Observação                                  |
| ------------ | ----------------- | ------------------------------------------- |
| Financeiro   | `global-range`    | Eixo `data_vencimento`.                     |
| Comercial    | `global-range`    | Eixo `data_emissao` (orçamentos/pedidos).   |
| Estoque      | `snapshot`        | Posição atual; ignora período.              |
| Logística    | `global-range`    | Eixo `data_emissao` da remessa.             |
| Fiscal       | `fixed-window`    | Janela `mes-atual` (alinhado a apuração).   |

## Quando alterar

1. Atualizar `useDashboardData` com o novo eixo / janela.
2. Ajustar o `ScopeBadge` correspondente em `Index.tsx` para refletir o
   novo `scope` (e o tooltip se necessário).
3. Atualizar esta tabela no mesmo PR.

Regra: não introduzir blocos sem `ScopeBadge`. A ausência do badge é um
sinal de que o usuário não saberá qual período está sendo aplicado.
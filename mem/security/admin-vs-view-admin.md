---
name: useIsAdmin estrito vs useCanViewAdmin
description: Separação entre admin real (estrito) e permissão de visualizar área admin
type: preference
---
- `useIsAdmin()` → estrito: apenas `hasRole('admin')`. Use para ações sensíveis (escrita em ContasBancarias, MigracaoDados, ações financeiras, etc.).
- `useCanViewAdmin()` → admin OU `administracao:visualizar`. Use apenas para gates de navegação/rota (AdminRoute, sidebar).
- `useCanHardDelete()` continua estrito como `useIsAdmin` para destrutivos.
- AdminRoute usa `useCanViewAdmin`; ações dentro de /admin sensíveis devem reverificar com `useIsAdmin`.

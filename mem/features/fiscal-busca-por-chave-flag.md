---
name: Fiscal — Kill-switch da busca por chave
description: Flag VITE_FEATURE_BUSCA_CHAVE controla visibilidade dos botões "Buscar por chave" e "Ler QR/Código" na toolbar de /fiscal
type: feature
---

# Busca por chave — kill-switch

A busca por chave (consultadanfe-proxy) é a via OFICIAL e segue habilitada por padrão.
Para desativar (custo/SLA/incidente), build com `VITE_FEATURE_BUSCA_CHAVE=false`.

Aplicado em `src/pages/fiscal/components/FiscalToolbarActions.tsx`. Quando false, os
botões "Buscar por chave" e "Ler QR/Código" somem da toolbar; "Importar XML" segue.

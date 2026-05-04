---
name: Etiqueta Simples (Logística)
description: Geração de PDF A4 4-up com remetente/destinatário a partir de remessas; sem persistência, sem Correios
type: feature
---

Funcionalidade puramente operacional para impressão física de volumes.

- **Service:** `src/services/logistica/etiquetasSimples.service.ts` (`prepararEtiquetasSimples`, `gerarPdfEtiquetasSimplesA4`, `montarItensEtiqueta`, `validarEtiquetas`).
- **Preview:** `src/components/logistica/EtiquetaSimplesPreviewDialog.tsx` — abre Dialog com iframe do PDF (mesmo padrão de pré-visualização do orçamento) e botões Baixar/Imprimir.
- **UI:** Aba Remessas em `/logistica` — coluna "Etiqueta simples" por linha, ação no ViewDrawerV2 e botão em lote (`selectable` ativo) na barra de filtros.
- **Remetente:** `empresa_config` (logo via `logo_url` embarcada no PDF como dataURL).
- **Destinatário:** `clientes` via `remessas.cliente_id` (endereço do cadastro).
- **Validação bloqueante:** nome, logradouro, cidade, UF (2 chars), CEP (8 dígitos) em remetente e destinatário; inválidas listadas no banner do dialog.
- **NÃO faz:** Correios, rastreio, `remessa_etiquetas`, Storage, mudança de status/financeiro/fiscal/estoque.
- **PDF:** jsPDF, A4 retrato, grade 2x2, ~93×135mm por etiqueta, 1 etiqueta por remessa (sem numeração de volumes nesta versão).
- **Permissão:** gate por `useCan("logistica","editar")`.
- **Pendências futuras:** endereço de entrega alternativo, "1 etiqueta por volume" com numeração, remetente padrão de logística separado do fiscal, histórico de geração.
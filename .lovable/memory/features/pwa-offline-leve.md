---
name: PWA / offline-first leve
description: vite-plugin-pwa com SW prompt, manifest AviZee, runtime cache SWR para listas (clientes/fornecedores/produtos) e UI de install/update/offline
type: feature
---

# PWA / offline-first leve

## Stack

- `vite-plugin-pwa@1` + `workbox-window@7`. Plugin configurado em `vite.config.ts`.
- `registerType: "prompt"` + `injectRegister: false` — registramos manualmente
  em `src/lib/pwa.ts` para controlar quando mostrar o toast de update.
- `devOptions.enabled = false`: SW só ativa em build de produção (evita
  conflitos com HMR e com o iframe do preview do Lovable).
- `src/lib/pwa.ts → registerPwa()` é chamado no fim de `src/main.tsx`. Ele
  **não registra** quando: estiver em DEV, dentro de iframe (`self !== top`),
  ou sem `serviceWorker` no navegador.

## Cache strategies (workbox)

- **Precache** (build-time): `**/*.{js,css,html,svg,png,ico,woff2}` até 5MB
  por arquivo.
- **Google Fonts** (`fonts.googleapis.com`/`fonts.gstatic.com`): `CacheFirst`,
  válidos por 1 ano. Cobre o flash de fontes em segundas visitas.
- **Listas Supabase** (`/rest/v1/(clientes|fornecedores|produtos|app_configuracoes)`):
  `StaleWhileRevalidate`, expira em 5 min. Apenas GET — Workbox ignora
  POST/PATCH/DELETE por padrão, então **mutations nunca ficam servidas do cache**.
- `navigateFallbackDenylist`: `/api/`, `/functions/v1/`, `/auth/v1/`, `/realtime/`
  para garantir que o app não responda navegações com cache para essas rotas.

**Não cacheamos** notas fiscais, financeiro, pedidos, orçamentos — domínios
sensíveis que mudam de estado constantemente devem sempre ir à rede.

## Manifest

- `name: "Sistema AviZee"`, `short_name: "AviZee"`.
- Cores oficiais da marca: `theme_color: "#b2592c"` (primária),
  `background_color: "#690500"` (secundária — splash screen).
  **Atenção:** manifest fields são "pinados" no momento da instalação.
  Quem já tem o app instalado precisa reinstalar para ver novas cores.
- Ícones em `public/images/`: `pwa-192.png`, `pwa-512.png`, `pwa-512-maskable.png`
  (com padding extra para safe zone do Android).
- `display: standalone`, `start_url: "/"`, `lang: pt-BR`.
- `index.html` carrega o manifest, `apple-touch-icon` (incluindo 180×180
  para iOS) e meta tags `apple-mobile-web-app-*` para iOS Safari.
  `apple-mobile-web-app-status-bar-style: black-translucent` integra
  a status bar com o tom escuro da marca.

## UI components

- `OfflineBanner` (já existia, montado em `App.tsx`): barra amber sticky no
  topo quando `navigator.onLine === false`. Compensa `safe-area-inset-top`.
- `PwaUpdatePrompt`: escuta `pwa:update-ready` (evento custom disparado por
  `src/lib/pwa.ts` quando o SW novo entra em `waiting`). Mostra toast Sonner
  persistente com botão "Atualizar" → `applyPwaUpdate()` chama
  `wb.messageSkipWaiting()` e recarrega.
- `InstallPwaButton` (variant `floating` por padrão): captura
  `beforeinstallprompt`, renderiza card flutuante no canto inferior direito.
  Variante `inline` disponível para reuso em headers/configurações.
  Persistência da decisão "Agora não" em `localStorage[avizee.pwa.install.dismissed]`.
  **iOS Safari**: como não dispara `beforeinstallprompt`, detectamos iOS
  + `!standalone` e renderizamos o mesmo card com botão "Ver como" que
  abre um Dialog guiado (Compartilhar → Adicionar à Tela de Início →
  Adicionar). Em outros browsers no iPhone (Chrome iOS) o guia ainda
  aparece mas instrui o usuário a abrir o link no Safari.

Tudo montado em `src/App.tsx`. Não há acoplamento com auth — o prompt
aparece independentemente de login (instalar a shell antes de logar é OK).

## Trade-offs

- Sem **Background Sync** ou conflito de mutations offline: o usuário vê
  banner offline e desabilita ações; quando volta online, recarrega manualmente.
  Decisão consciente para esta primeira versão (escopo "leve").
- **iOS Safari**: agora há guia in-app dedicado (Dialog com 3 passos
  ilustrados via ícones lucide `Share`/`Plus`). Acionado pelo próprio
  `InstallPwaButton`.
- **Update flow**: `registerType: "prompt"` evita updates silenciosos.
  O usuário decide quando recarregar — preserva trabalho em forms abertos.
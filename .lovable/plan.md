# Instalação iOS (Safari) e cores da marca no PWA

Hoje o `InstallPwaButton` só aparece quando o navegador dispara `beforeinstallprompt` (Chrome/Edge/Android). iOS Safari não suporta esse evento, então o usuário de iPhone nunca vê o convite. As cores do manifest também estão em `#0F766E` (teal antigo), em vez das cores da marca AviZee `#b2592c` / `#690500`.

## Mudanças

### 1. Cores da marca no app instalado

**`vite.config.ts`** — manifest do PWA:
- `theme_color: "#b2592c"` (cor primária — barra de status no Android, header em alguns browsers)
- `background_color: "#690500"` (cor secundária — splash screen de boot do app instalado)

**`index.html`**:
- `<meta name="theme-color" content="#b2592c">` (substitui o teal atual)
- Adicionar `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` para integrar com o tom escuro da marca no iOS (já existe a tag, ajustar valor de `default` para `black-translucent`).
- Adicionar `<link rel="apple-touch-icon" sizes="180x180" href="/images/pwa-192.png">` (iOS prefere 180×180; o 192 é renderizado bem).

> Observação: manifest fields (`theme_color`, `background_color`, ícones) são "pinados" no momento da instalação. Quem já tem o app instalado precisa reinstalar para ver as novas cores. Avisaremos isso na resposta final.

### 2. Convite de instalação para iPhone/Safari

**`src/components/InstallPwaButton.tsx`** — adicionar fluxo iOS paralelo ao atual:
- Detectar iOS Safari: `/iPhone|iPad|iPod/.test(navigator.userAgent)` + não estar em standalone (`window.matchMedia('(display-mode: standalone)').matches === false` e `navigator.standalone !== true`).
- Quando for iOS e não houver `beforeinstallprompt`, renderizar o mesmo card flutuante com texto adaptado: "Instalar AviZee no iPhone" + botão "Ver como instalar" que abre um pequeno modal/sheet com os passos ilustrados:
  1. Toque no ícone **Compartilhar** (quadrado com seta para cima) na barra do Safari.
  2. Role e toque em **Adicionar à Tela de Início**.
  3. Confirme em **Adicionar**.
- Reaproveitar `localStorage[avizee.pwa.install.dismissed]` (já existente) para o "Agora não".
- Manter a variante `inline` funcionando para iOS também (botão "Como instalar no iPhone" em Configurações).

Ícones usados no modal: `Share` e `Plus` do `lucide-react` (já no projeto).

### 3. Memória do projeto

Atualizar `mem://features/pwa-offline-leve.md`:
- Registrar cores oficiais (`#b2592c` / `#690500`) no manifest.
- Documentar que iOS Safari agora tem fluxo guiado próprio (não usa `beforeinstallprompt`).
- Lembrar a regra "manifest é pinado na instalação" — usuários com app antigo precisam reinstalar para ver as cores novas.

## Arquivos editados

- `vite.config.ts` (manifest do VitePWA)
- `index.html` (metas iOS + theme-color)
- `src/components/InstallPwaButton.tsx` (fluxo iOS)
- `.lovable/memory/features/pwa-offline-leve.md` (atualização)

## Validação

- Build de produção (preview ou publicado), abrir no Safari do iPhone → card "Instalar AviZee no iPhone" deve aparecer com as instruções.
- Em Android/Chrome, comportamento atual (`beforeinstallprompt`) preservado.
- Após instalar no iPhone, splash screen e ícone na home devem refletir as cores da marca.
